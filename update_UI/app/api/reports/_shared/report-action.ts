import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { getUserIdFromRequest } from "@/app/api/reports/_shared/access"
import { logError, logRequest } from "@/lib/server/logger"
import { ReportAlreadyProcessingError } from "@/lib/server/report-agent"
import { createServiceClient } from "@/lib/supabase/server"

type RequestBody = {
  reportId?: string
}

type RunContext = {
  reportId: string
  userId: string
}

export const runReportActionRoute = async <T>(params: {
  request: NextRequest
  actionLabel: string
  run: (context: RunContext) => Promise<T>
  buildSuccessBody: (result: T, context: RunContext) => Record<string, unknown>
}) => {
  const { request, actionLabel, run, buildSuccessBody } = params

  logRequest(request, actionLabel)

  let body: RequestBody
  try {
    body = (await request.json()) as RequestBody
  } catch {
    return NextResponse.json({ error: "JSON の形式が正しくありません" }, { status: 400 })
  }

  const reportId = typeof body.reportId === "string" ? body.reportId : ""
  if (!reportId) {
    return NextResponse.json({ error: "reportId is required" }, { status: 400 })
  }

  const userId = await getUserIdFromRequest(request)
  if (!userId) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 })
  }

  const admin = createServiceClient()
  const context: RunContext = { reportId, userId }

  try {
    const result = await run(context)
    return NextResponse.json({
      success: true,
      reportId,
      ...buildSuccessBody(result, context),
    })
  } catch (error) {
    if (error instanceof ReportAlreadyProcessingError) {
      return NextResponse.json({ error: "このレポートは現在処理中です" }, { status: 409 })
    }

    logError(actionLabel, error)
    await admin
      .from("reports")
      .update({ status: "error", updated_at: new Date().toISOString() })
      .eq("id", reportId)
      .eq("user_id", userId)

    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
