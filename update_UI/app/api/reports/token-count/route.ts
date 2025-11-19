import { Buffer } from "node:buffer"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { logError, logInfo, logRequest } from "@/lib/server/logger"
import { pdfBufferToTokenCount } from "@/lib/server/pdf-tokenizer"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const BUCKET_NAME = "experiment-files"

const requestSchema = z.object({
  reportId: z.string().uuid(),
  model: z.string().optional(),
})

const sanitizeStoragePath = (value: string | null | undefined) => (value || "").trim().replace(/^\/+/, "")

const getUploadTimestamp = (value: string | null | undefined) => {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

export async function POST(req: NextRequest) {
  logRequest(req, "reports:token-count:start")
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    logInfo("reports:token-count:unauthorized")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    logInfo("reports:token-count:bad-request", { body: await req.text().catch(() => undefined) })
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const { reportId, model } = parsed.data

  try {
    const { data: report, error: reportError } = await supabase
      .from("reports")
      .select("id")
      .eq("id", reportId)
      .eq("user_id", user.id)
      .maybeSingle()

    if (reportError) {
      logError("reports:token-count:report-error", reportError)
      return NextResponse.json({ error: reportError.message }, { status: 500 })
    }
    if (!report) {
      logInfo("reports:token-count:not-found", { reportId })
      return NextResponse.json({ error: "Report not found" }, { status: 404 })
    }

    const { data: files, error: filesError } = await supabase
      .from("experiment_data")
      .select("file_name, file_type, file_url, uploaded_at")
      .eq("report_id", reportId)

    if (filesError) {
      logError("reports:token-count:files-error", filesError)
      return NextResponse.json({ error: filesError.message }, { status: 500 })
    }

    const docs = (files ?? [])
      .filter((f) => f.file_type === "word" || /\.pdf$/i.test(f.file_name || ""))
      .sort((a, b) => getUploadTimestamp(b.uploaded_at) - getUploadTimestamp(a.uploaded_at))

    const pdf = docs[0]
    if (!pdf) {
      logInfo("reports:token-count:no-docs", { count: files?.length || 0 })
      return NextResponse.json({ error: "No PDF found for the report" }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceKey) {
      logInfo("reports:token-count:missing-service-creds")
      return NextResponse.json({ error: "Missing Supabase service credentials" }, { status: 500 })
    }

    const admin = createAdminClient(supabaseUrl, serviceKey)
    const objectPath = sanitizeStoragePath(pdf.file_url)
    if (!objectPath) {
      logInfo("reports:token-count:invalid-path", { file: pdf.file_name })
      return NextResponse.json({ error: "Invalid PDF path" }, { status: 400 })
    }

    const { data: download, error: downloadError } = await admin.storage.from(BUCKET_NAME).download(objectPath)
    if (downloadError || !download) {
      logError("reports:token-count:download-error", downloadError, { objectPath })
      return NextResponse.json({ error: downloadError?.message || "Failed to download PDF" }, { status: 500 })
    }

    const buffer = Buffer.from(await download.arrayBuffer())
    const tokenResult = await pdfBufferToTokenCount(buffer, model)

    logInfo("reports:token-count:success", {
      reportId,
      tokens: tokenResult.tokens,
      model: tokenResult.model,
    })

    return NextResponse.json({
      reportId,
      fileName: pdf.file_name ?? null,
      ...tokenResult,
      bytes: buffer.byteLength,
    })
  } catch (error) {
    logError("reports:token-count:exception", error)
    return NextResponse.json(
      { error: "Failed to calculate token count", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
