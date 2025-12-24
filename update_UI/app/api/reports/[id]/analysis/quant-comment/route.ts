import { NextRequest, NextResponse } from "next/server"

import { logError, logRequest } from "@/lib/server/logger"
import { createClient, createServiceClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const EXPERIMENT_BUCKET = "experiment-files"

const analysisStorageKey = (userId: string, reportId: string) => {
  return `${userId}/${reportId}/analysis/analysis.json`
}

const normalizeStoragePath = (value: string) => value.replace(/^\/+/, "")

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

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: reportId } = await context.params
  logRequest(request, "reports:analysis:quant-comment", { reportId })

  const userId = await getUserId(request)
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
  const { data: report } = await admin.from("reports").select("id, user_id").eq("id", reportId).maybeSingle()
  if (!report || report.user_id !== userId) return NextResponse.json({ error: "レポートが見つかりません" }, { status: 404 })

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

