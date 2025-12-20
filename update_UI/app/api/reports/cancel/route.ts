import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { logError, logInfo, logRequest } from "@/lib/server/logger"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const requestSchema = z.object({
  reportId: z.string().uuid(),
})

export async function POST(req: NextRequest) {
  logRequest(req, "reports/cancel:start")
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    logInfo("reports/cancel:unauthorized")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    logInfo("reports/cancel:bad-request", { body: await req.text().catch(() => undefined) })
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const { reportId } = parsed.data

  try {
    const { data: report, error: reportError } = await supabase
      .from("reports")
      .select("id, status")
      .eq("id", reportId)
      .eq("user_id", user.id)
      .maybeSingle()

    if (reportError) {
      logError("reports/cancel:report-error", reportError)
      return NextResponse.json({ error: reportError.message }, { status: 500 })
    }
    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 })
    }

    if (report.status !== "processing") {
      logInfo("reports/cancel:not-processing", { reportId, status: report.status })
      return NextResponse.json({ success: true, alreadyStopped: true })
    }

    const { error: updateError } = await supabase
      .from("reports")
      .update({ status: "draft" })
      .eq("id", reportId)
      .eq("user_id", user.id)

    if (updateError) {
      logError("reports/cancel:update-failed", updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    logInfo("reports/cancel:success", { reportId })
    return NextResponse.json({ success: true })
  } catch (error) {
    logError("reports/cancel:exception", error)
    return NextResponse.json({ error: "Failed to cancel report" }, { status: 500 })
  }
}

