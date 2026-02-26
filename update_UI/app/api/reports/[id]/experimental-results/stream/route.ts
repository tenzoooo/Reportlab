import { NextRequest, NextResponse } from "next/server"

import { getUserIdFromRequest, loadOwnedReport } from "@/app/api/reports/_shared/access"
import { logError, logRequest } from "@/lib/server/logger"
import { createServiceClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const EXPERIMENT_BUCKET = "experiment-files"

const analysisStorageKey = (userId: string, reportId: string) => {
  return `${userId}/${reportId}/analysis/analysis.json`
}

const normalizeStoragePath = (value: string) => value.replace(/^\/+/, "")

const getReportAgentUrl = () => {
  const explicit = process.env.REPORT_AGENT_URL
  if (explicit) return explicit.replace(/\/$/, "")
  return "http://127.0.0.1:8000"
}

const buildPayloadFromAnalysis = (analysis: any) => {
  const chapter = typeof analysis?.chapter === "number" ? analysis.chapter : null
  const experiments = Array.isArray(analysis?.experiments) ? analysis.experiments : []
  return {
    chapter,
    experiments: experiments.map((exp: any) => {
      const expKey = typeof exp?.source_idx === "string" && exp.source_idx ? exp.source_idx : String(exp?.idx ?? "")
      const name = typeof exp?.name === "string" ? exp.name : ""
      const figures = Array.isArray(exp?.figures) ? exp.figures : []
      const tables = Array.isArray(exp?.tables) ? exp.tables : []
      return {
        exp_key: expKey,
        name,
        figures: figures
          .map((f: any) => ({
            label: typeof f?.label === "string" ? f.label : "",
            caption: typeof f?.caption === "string" ? f.caption : "",
            quant_comment: typeof f?.quant_comment === "string" ? f.quant_comment : "",
          }))
          .filter((f: any) => f.label || f.caption || f.quant_comment),
        tables: tables
          .map((t: any) => ({
            label: typeof t?.label === "string" ? t.label : "",
            caption: typeof t?.caption === "string" ? t.caption : "",
            quant_comment: typeof t?.quant_comment === "string" ? t.quant_comment : "",
          }))
          .filter((t: any) => t.label || t.caption || t.quant_comment),
      }
    }),
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: reportId } = await context.params
  logRequest(request, "reports:experimental-results:stream", { reportId })

  const userId = await getUserIdFromRequest(request)
  if (!userId) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 })

  const admin = createServiceClient()
  const { errorMessage: reportError, report } = await loadOwnedReport<{ id: string; user_id: string | null }>({
    admin,
    reportId,
    userId,
    select: "id, user_id",
  })
  if (reportError) return NextResponse.json({ error: reportError }, { status: 500 })
  if (!report) return NextResponse.json({ error: "レポートが見つかりません" }, { status: 404 })

  const key = analysisStorageKey(userId, reportId)
  let analysis: any
  try {
    const { data, error } = await admin.storage.from(EXPERIMENT_BUCKET).download(normalizeStoragePath(key))
    if (error || !data) throw new Error(error?.message || "Missing analysis")
    analysis = JSON.parse(await data.text())
  } catch (err) {
    logError("reports:experimental-results:stream:load-analysis", err)
    return NextResponse.json({ error: "分析JSONが見つかりません。先に抽出を実行してください。" }, { status: 400 })
  }

  const payload = buildPayloadFromAnalysis(analysis)

  try {
    const upstream = await fetch(`${getReportAgentUrl()}/experimental-results/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => "")
      return NextResponse.json({ error: text || `upstream error: ${upstream.status}` }, { status: 502 })
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    })
  } catch (err) {
    logError("reports:experimental-results:stream", err)
    return NextResponse.json({ error: "ストリーミングの開始に失敗しました" }, { status: 500 })
  }
}
