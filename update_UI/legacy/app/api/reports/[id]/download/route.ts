import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import path from "node:path"
import { createClient, createServiceClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const paramsSchema = z.object({
  id: z.string().uuid(),
})

const BUCKET_NAME = "experiment-files"

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const resolvedParams = await context.params
  const parseParams = paramsSchema.safeParse(resolvedParams)
  if (!parseParams.success) {
    return NextResponse.json({ error: "Invalid report id" }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const reportId = parseParams.data.id

  const { data: report, error } = await supabase
    .from("reports")
    .select("id, title, status, file_url")
    .eq("id", reportId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 })
  }

  if (!report.file_url || report.status !== "completed") {
    return NextResponse.json({ error: "Report file is not available" }, { status: 400 })
  }

  const admin = createServiceClient()
  const { data: fileData, error: downloadError } = await admin.storage
    .from(BUCKET_NAME)
    .download(report.file_url)

  if (downloadError || !fileData) {
    return NextResponse.json({ error: downloadError?.message ?? "Failed to download file" }, { status: 500 })
  }

  const arrayBuffer = await fileData.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const fallbackName = `${report.title || "report"}.docx`
  const fileName = path.basename(report.file_url) || fallbackName

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
      "Content-Length": String(buffer.byteLength),
      "Cache-Control": "no-store",
    },
  })
}
