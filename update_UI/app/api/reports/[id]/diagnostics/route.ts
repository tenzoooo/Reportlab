import { NextRequest, NextResponse } from "next/server"

import { getUserIdFromRequest, loadOwnedReport } from "@/app/api/reports/_shared/access"
import { createServiceClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const normalizeStoragePath = (value: string) => value.replace(/^\/+/, "")

const getAgentBaseUrl = () => {
  const explicit = process.env.REPORT_AGENT_URL
  if (explicit && explicit !== "mock") return explicit
  return "http://127.0.0.1:8000"
}

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

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: reportId } = await context.params
  const userId = await getUserIdFromRequest(request)
  if (!userId) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 })

  const admin = createServiceClient()
  const { errorMessage: reportError, report } = await loadOwnedReport<{
    id: string
    user_id: string | null
    status: string | null
    job_id: string | null
    file_url: string | null
    updated_at: string | null
  }>({
    admin,
    reportId,
    userId,
    select: "id, user_id, status, job_id, file_url, updated_at",
  })
  if (reportError) return NextResponse.json({ error: reportError }, { status: 500 })
  if (!report) return NextResponse.json({ error: "レポートが見つかりません" }, { status: 404 })

  const { data: files, error: filesError } = await admin
    .from("experiment_data")
    .select("file_name, file_type, file_url, uploaded_at")
    .eq("report_id", reportId)
    .order("uploaded_at", { ascending: true })
  if (filesError) return NextResponse.json({ error: filesError.message }, { status: 500 })

  const inputFiles = (files || []).map((f) => ({
    file_name: f.file_name || "",
    file_type: f.file_type || "",
    file_url: f.file_url || "",
    uploaded_at: f.uploaded_at || null,
  }))

  const typeCounts = inputFiles.reduce<Record<string, number>>((acc, f) => {
    const key = f.file_type || "unknown"
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

  const { data: logs, error: logsError } = await admin
    .from("job_logs")
    .select("job_id, event_type, payload_json, created_at")
    .eq("report_id", reportId)
    .order("created_at", { ascending: false })
    .limit(80)
  if (logsError) return NextResponse.json({ error: logsError.message }, { status: 500 })

  const agentBaseUrl = getAgentBaseUrl()
  const jobId = typeof report.job_id === "string" ? report.job_id : ""

  let tracing: unknown = null
  try {
    tracing = await fetchJson(`${agentBaseUrl}/debug/tracing`)
  } catch (e) {
    tracing = { ok: false, error: e instanceof Error ? e.message : String(e) }
  }

  let agentJob: unknown = null
  let agentIntermediate: unknown = null
  if (jobId) {
    try {
      agentJob = await fetchJson(`${agentBaseUrl}/jobs/${jobId}`)
    } catch (e) {
      agentJob = { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
    try {
      agentIntermediate = await fetchJson(`${agentBaseUrl}/jobs/${jobId}/intermediate`)
    } catch (e) {
      agentIntermediate = { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  const progressKey = `${userId}/${reportId}/agent/progress.json`
  let progressExists = false
  try {
    const { data, error } = await admin.storage.from("experiment-files").download(normalizeStoragePath(progressKey))
    progressExists = Boolean(!error && data)
  } catch {
    progressExists = false
  }

  return NextResponse.json({
    report: {
      id: report.id,
      status: report.status,
      job_id: report.job_id || "",
      file_url: report.file_url || "",
      updated_at: report.updated_at || null,
    },
    inputs: {
      total: inputFiles.length,
      by_type: typeCounts,
      files: inputFiles,
      with_missing_url: inputFiles.filter((f) => !f.file_url),
    },
    job_logs: logs || [],
    progress: {
      storage_key: progressKey,
      exists: progressExists,
    },
    agent: {
      base_url: agentBaseUrl,
      job: agentJob,
      intermediate: agentIntermediate,
    },
    langsmith: tracing,
  })
}
