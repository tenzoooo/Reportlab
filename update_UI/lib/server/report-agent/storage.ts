import { createServiceClient } from "@/lib/supabase/server"
import { EXPERIMENT_BUCKET } from "./constants"
import { ReportAlreadyProcessingError } from "./errors"
import { normalizeStoragePath } from "./file-utils"

export const downloadStorageBytes = async (pathValue: string) => {
  const admin = createServiceClient()
  const { data, error } = await admin.storage.from(EXPERIMENT_BUCKET).download(normalizeStoragePath(pathValue))
  if (error || !data) throw new Error(error?.message || "Failed to download file from storage")
  const arrayBuffer = await data.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

export const analysisStorageKey = (userId: string, reportId: string) => {
  return `${userId}/${reportId}/analysis/analysis.json`
}

const agentProgressStorageKey = (userId: string, reportId: string) => {
  return `${userId}/${reportId}/agent/progress.json`
}

export const uploadAgentProgress = async (params: { userId: string; reportId: string; payload: unknown }) => {
  const admin = createServiceClient()
  const { userId, reportId, payload } = params
  const key = agentProgressStorageKey(userId, reportId)
  await admin.storage.from(EXPERIMENT_BUCKET).upload(key, JSON.stringify(payload, null, 2), {
    contentType: "application/json",
    upsert: true,
  })
  return key
}

export const uploadDocxToStorage = async (userId: string, reportId: string, bytes: Uint8Array) => {
  const admin = createServiceClient()
  const key = `${userId}/${reportId}/artifact/report_${Date.now()}.docx`
  const { error } = await admin.storage.from(EXPERIMENT_BUCKET).upload(key, bytes, {
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    upsert: true,
  })
  if (error) throw new Error(error.message)
  return key
}

export const persistReportJobId = async (params: {
  admin: ReturnType<typeof createServiceClient>
  reportId: string
  userId: string
  jobId: string
}) => {
  const { admin, reportId, userId, jobId } = params
  const { error } = await admin
    .from("reports")
    .update({ job_id: jobId, updated_at: new Date().toISOString() })
    .eq("id", reportId)
    .eq("user_id", userId)
  if (error) throw new Error(error.message)
}

export const logJobEvent = async (params: {
  admin: ReturnType<typeof createServiceClient>
  reportId: string
  jobId: string
  eventType: string
  payload?: Record<string, unknown> | null
}) => {
  const { admin, reportId, jobId, eventType, payload } = params
  try {
    await admin.from("job_logs").insert([
      {
        report_id: reportId,
        job_id: jobId,
        event_type: eventType,
        payload_json: payload ?? null,
      },
    ])
  } catch {
    // Best-effort: logging should not block report generation.
  }
}

export const acquireProcessingLock = async (params: { reportId: string; userId: string }) => {
  const admin = createServiceClient()
  const { reportId, userId } = params

  const { data, error } = await admin
    .from("reports")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", reportId)
    .eq("user_id", userId)
    .neq("status", "processing")
    .select("id")

  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new ReportAlreadyProcessingError(reportId)
}
