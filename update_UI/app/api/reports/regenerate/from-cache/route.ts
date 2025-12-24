import { NextRequest, NextResponse } from "next/server"

import { logError, logRequest } from "@/lib/server/logger"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { ReportAlreadyProcessingError, runReportAgentFromSupabaseReport } from "@/lib/server/report-agent"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Body = { reportId?: string }

export async function POST(request: NextRequest) {
  logRequest(request, "reports:regenerate:from-cache")

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: "JSON の形式が正しくありません" }, { status: 400 })
  }

  const reportId = typeof body.reportId === "string" ? body.reportId : ""
  if (!reportId) {
    return NextResponse.json({ error: "reportId is required" }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 })
  }

  const admin = createServiceClient()

  try {
    const result = await runReportAgentFromSupabaseReport({ reportId, userId: user.id })
    return NextResponse.json({ success: true, reportId, jobId: result.jobId, fileUrl: result.artifactKey })
  } catch (error) {
    if (error instanceof ReportAlreadyProcessingError) {
      return NextResponse.json({ error: "このレポートは現在処理中です" }, { status: 409 })
    }
    logError("reports:regenerate:from-cache", error)
    await admin
      .from("reports")
      .update({ status: "error", updated_at: new Date().toISOString() })
      .eq("id", reportId)
      .eq("user_id", user.id)
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
