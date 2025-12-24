import { NextRequest, NextResponse } from "next/server"

import { logError, logRequest } from "@/lib/server/logger"
import { createClient, createServiceClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const EXPERIMENT_BUCKET = "experiment-files"

const normalizeStoragePath = (value: string) => value.replace(/^\/+/, "")

const progressStorageKey = (userId: string, reportId: string) => {
  return `${userId}/${reportId}/agent/progress.json`
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

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: reportId } = await context.params
  logRequest(request, "reports:agent-progress:get", { reportId })

  const userId = await getUserId(request)
  if (!userId) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 })

  const admin = createServiceClient()
  const { data: report, error: reportError } = await admin
    .from("reports")
    .select("id, user_id")
    .eq("id", reportId)
    .maybeSingle()
  if (reportError) return NextResponse.json({ error: reportError.message }, { status: 500 })
  if (!report || report.user_id !== userId) return NextResponse.json({ error: "レポートが見つかりません" }, { status: 404 })

  const key = progressStorageKey(userId, reportId)
  try {
    const { data, error } = await admin.storage.from(EXPERIMENT_BUCKET).download(normalizeStoragePath(key))
    if (error || !data) {
      return NextResponse.json({ available: false })
    }
    const text = await data.text()
    const parsed = JSON.parse(text)
    return NextResponse.json({ available: true, progress: parsed })
  } catch (error) {
    logError("reports:agent-progress:get", error)
    return NextResponse.json({ available: false })
  }
}

