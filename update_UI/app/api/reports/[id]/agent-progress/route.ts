import { NextRequest, NextResponse } from "next/server"

import { getUserIdFromRequest, loadOwnedReport } from "@/app/api/reports/_shared/access"
import { logError, logRequest } from "@/lib/server/logger"
import { createServiceClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const EXPERIMENT_BUCKET = "experiment-files"

const normalizeStoragePath = (value: string) => value.replace(/^\/+/, "")

const progressStorageKey = (userId: string, reportId: string) => {
  return `${userId}/${reportId}/agent/progress.json`
}

const getAgentBaseUrl = () => {
  const explicit = process.env.REPORT_AGENT_URL
  if (explicit && explicit !== "mock") return explicit
  return "http://127.0.0.1:8000"
}

const STALE_PROGRESS_MS = 15_000

const fetchJson = async (url: string) => {
  const res = await fetch(url, { method: "GET", cache: "no-store" })
  const text = await res.text().catch(() => "")
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  return { ok: res.ok, status: res.status, body: json }
}

const isStaleProgress = (progress: any) => {
  const updatedAt = typeof progress?.updated_at === "string" ? progress.updated_at : ""
  if (!updatedAt) return false
  const ts = Date.parse(updatedAt)
  if (!Number.isFinite(ts)) return false
  return Date.now() - ts > STALE_PROGRESS_MS
}

const enrichProgressShape = (progress: any) => {
  const snapshots = Array.isArray(progress?.snapshots) ? progress.snapshots : []
  const lastStep = snapshots.length > 0 ? snapshots[snapshots.length - 1]?.step : ""
  const reachedLByStep = snapshots.some((s: any) => {
    const step = typeof s?.step === "string" ? s.step : ""
    return step === "l_emit_outputs" || step === "l_render_docx"
  })
  return {
    ...progress,
    last_step: typeof progress?.last_step === "string" ? progress.last_step : (typeof lastStep === "string" ? lastStep : ""),
    reached_l_layer: Boolean(progress?.reached_l_layer) || reachedLByStep,
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: reportId } = await context.params
  logRequest(request, "reports:agent-progress:get", { reportId })

  const userId = await getUserIdFromRequest(request)
  if (!userId) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 })

  const admin = createServiceClient()
  const { errorMessage: reportError, report } = await loadOwnedReport<{ id: string; user_id: string | null; job_id: string | null }>({
    admin,
    reportId,
    userId,
    select: "id, user_id, job_id",
  })
  if (reportError) return NextResponse.json({ error: reportError }, { status: 500 })
  if (!report) return NextResponse.json({ error: "レポートが見つかりません" }, { status: 404 })

  const key = progressStorageKey(userId, reportId)
  try {
    const { data, error } = await admin.storage.from(EXPERIMENT_BUCKET).download(normalizeStoragePath(key))
    if (error || !data) {
      // Local dev: the agent writes progress to /jobs/{job_id}/intermediate (LocalStorage backend).
      // Fall back to agent intermediate so UI can visualize progress step-by-step.
      const jobId = typeof report.job_id === "string" ? report.job_id : ""
      if (!jobId) return NextResponse.json({ available: false })
      const agentBaseUrl = getAgentBaseUrl()
      const intermediate = await fetchJson(`${agentBaseUrl}/jobs/${jobId}/intermediate`)
      if (!intermediate.ok || !intermediate.body || typeof intermediate.body !== "object") {
        return NextResponse.json({ available: false })
      }
      return NextResponse.json({ available: true, progress: enrichProgressShape(intermediate.body) })
    }
    const text = await data.text()
    const parsed = JSON.parse(text)
    // If progress.json exists but is stale, fall back to agent intermediate to avoid "Aで止まる" 表示。
    if (isStaleProgress(parsed)) {
      const jobId = typeof report.job_id === "string" ? report.job_id : ""
      if (jobId) {
        const agentBaseUrl = getAgentBaseUrl()
        const intermediate = await fetchJson(`${agentBaseUrl}/jobs/${jobId}/intermediate`)
        if (intermediate.ok && intermediate.body && typeof intermediate.body === "object") {
          return NextResponse.json({ available: true, progress: enrichProgressShape(intermediate.body) })
        }
      }
    }
    return NextResponse.json({ available: true, progress: enrichProgressShape(parsed) })
  } catch (error) {
    logError("reports:agent-progress:get", error)
    return NextResponse.json({ available: false })
  }
}
