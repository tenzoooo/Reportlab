import { NextRequest, NextResponse } from "next/server"

import { logError, logRequest } from "@/lib/server/logger"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { prepareReportAgentFromSupabaseReport, ReportAlreadyProcessingError, ReportUserError } from "@/lib/server/report-agent"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Body = {
  reportId?: string
}

const getUserId = async (request: NextRequest) => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) return user.id

  const auth = request.headers.get("authorization") || ""
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : ""
  if (!token) return null

  const admin = createServiceClient()
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) return null
  return data.user.id
}

export async function POST(request: NextRequest) {
  logRequest(request, "reports:prepare")

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

  const userId = await getUserId(request)
  if (!userId) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 })
  }

  const admin = createServiceClient()
  try {
    const result = await prepareReportAgentFromSupabaseReport({ reportId, userId })
    return NextResponse.json({ success: true, reportId, jobId: result.jobId })
  } catch (error) {
    if (error instanceof ReportAlreadyProcessingError) {
      return NextResponse.json({ error: "このレポートは現在処理中です" }, { status: 409 })
    }
    if (error instanceof ReportUserError) {
      await admin
        .from("reports")
        .update({ status: "draft", updated_at: new Date().toISOString() })
        .eq("id", reportId)
        .eq("user_id", userId)
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    logError("reports:prepare", error)
    await admin
      .from("reports")
      .update({ status: "error", updated_at: new Date().toISOString() })
      .eq("id", reportId)
      .eq("user_id", userId)
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
