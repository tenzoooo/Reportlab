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

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: reportId } = await context.params
  logRequest(request, "reports:analysis:quant-comment", { reportId })

  const userId = await getUserIdFromRequest(request)
  if (!userId) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 })

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON の形式が正しくありません" }, { status: 400 })
  }
  const expIndex = Number(body?.experiment_index)
  if (!Number.isFinite(expIndex) || expIndex < 0) {
    return NextResponse.json({ error: "experiment_index is required" }, { status: 400 })
  }

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
  try {
    const { data, error } = await admin.storage.from(EXPERIMENT_BUCKET).download(normalizeStoragePath(key))
    if (error || !data) throw new Error(error?.message || "Missing analysis")
    const parsed = JSON.parse(await data.text())

    const experiments = Array.isArray(parsed?.experiments) ? parsed.experiments : []
    if (experiments[expIndex]) {
      experiments[expIndex] = {
        ...experiments[expIndex],
        quant_comment: "（モック）定量的コメントは未実装です。",
      }
    }

    const updated = { ...parsed, experiments }
    await admin.storage.from(EXPERIMENT_BUCKET).upload(normalizeStoragePath(key), JSON.stringify(updated, null, 2), {
      contentType: "application/json",
      upsert: true,
    })

    return NextResponse.json({ result_json: updated })
  } catch (error) {
    logError("reports:analysis:quant-comment", error)
    return NextResponse.json({ error: "定量的コメントの生成に失敗しました" }, { status: 500 })
  }
}
