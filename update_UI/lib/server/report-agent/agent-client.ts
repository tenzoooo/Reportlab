import { Agent } from "undici"
import { ReportAgentHttpError } from "./errors"
import { guessMimeType } from "./file-utils"

const REPORT_AGENT_HTTP_AGENT = new Agent({
  connectTimeout: 30_000,
  headersTimeout: 30 * 60_000,
  bodyTimeout: 30 * 60_000,
})

const isMockMode = () => {
  return process.env.REPORT_GENERATION_MODE === "mock" || process.env.REPORT_AGENT_URL === "mock"
}

export const assertMockModeDisabled = () => {
  if (!isMockMode()) return
  throw new Error("Mock mode is disabled. Remove REPORT_GENERATION_MODE=mock / REPORT_AGENT_URL=mock and run the real agent.")
}

export const getAgentBaseUrl = () => {
  assertMockModeDisabled()
  const explicit = process.env.REPORT_AGENT_URL
  if (explicit) return explicit

  const isHosted = process.env.VERCEL === "1" || process.env.NODE_ENV === "production"
  if (isHosted) {
    throw new Error("REPORT_AGENT_URL is not set. Set it to the Report Agent (FastAPI) base URL.")
  }

  return "http://127.0.0.1:8000"
}

const agentFetch = async (path: string, init: RequestInit) => {
  assertMockModeDisabled()
  const url = `${getAgentBaseUrl()}${path}`
  const controller = new AbortController()
  const isRunRequest = path.includes("/run")
  const isProductionRuntime = process.env.VERCEL === "1" || process.env.NODE_ENV === "production"
  const defaultTimeoutMs = isRunRequest
    ? isProductionRuntime
      ? 270_000
      : 30 * 60_000
    : isProductionRuntime
      ? 55_000
      : 30 * 60_000
  const timeoutEnv = isRunRequest ? process.env.REPORT_AGENT_RUN_TIMEOUT_MS : process.env.REPORT_AGENT_TIMEOUT_MS
  const timeoutMs = Number(timeoutEnv || process.env.REPORT_AGENT_TIMEOUT_MS || defaultTimeoutMs)
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, dispatcher: REPORT_AGENT_HTTP_AGENT } as any)
    if (!res.ok) {
      const msg = await res.text().catch(() => "")
      throw new ReportAgentHttpError({ url, status: res.status, body: msg || "" })
    }
    return res
  } catch (err) {
    if (err instanceof ReportAgentHttpError) throw err
    const errMessage = err instanceof Error ? err.message : String(err)
    const cause = err instanceof Error && "cause" in err ? (err as any).cause : undefined
    const causeMessage = cause instanceof Error ? cause.message : cause ? String(cause) : ""
    throw new Error(`Failed to reach report agent: ${url}${causeMessage ? ` (${causeMessage})` : ""}${errMessage ? ` [${errMessage}]` : ""}`)
  } finally {
    clearTimeout(timeout)
  }
}

export const createJob = async (pdfBytes: Uint8Array, filename: string) => {
  const form = new FormData()
  form.append("pdf", new Blob([Buffer.from(pdfBytes)], { type: "application/pdf" }), filename || "manual.pdf")
  const res = await agentFetch("/jobs", { method: "POST", body: form })
  const json = (await res.json()) as { job_id: string }
  if (!json.job_id) throw new Error("Report agent returned empty job_id")
  return json.job_id
}

export const addImage = async (jobId: string, imageBytes: Uint8Array, filename: string) => {
  const form = new FormData()
  form.append("image", new Blob([Buffer.from(imageBytes)], { type: guessMimeType(filename) }), filename || "image.png")
  await agentFetch(`/jobs/${jobId}/images`, { method: "POST", body: form })
}

export const addExcel = async (jobId: string, excelBytes: Uint8Array, filename: string) => {
  const form = new FormData()
  form.append("excel", new Blob([Buffer.from(excelBytes)], { type: guessMimeType(filename) }), filename || "workbook.xlsx")
  await agentFetch(`/jobs/${jobId}/excel`, { method: "POST", body: form })
}

export const addPastReport = async (jobId: string, reportBytes: Uint8Array, filename: string) => {
  const form = new FormData()
  form.append("report", new Blob([Buffer.from(reportBytes)], { type: guessMimeType(filename) }), filename || "past_report.pdf")
  await agentFetch(`/jobs/${jobId}/past-report`, { method: "POST", body: form })
}

export const addTable = async (jobId: string, rawCsv: string, filename?: string) => {
  await agentFetch(`/jobs/${jobId}/tables`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw_csv: rawCsv, filename }),
  })
}

export const runJob = async (jobId: string, mode: "full" | "prepare" | "update_mvp" = "full") => {
  const qs = mode === "prepare" ? "?mode=prepare" : mode === "update_mvp" ? "?mode=update_mvp" : ""
  const res = await agentFetch(`/jobs/${jobId}/run${qs}`, { method: "POST" })
  return (await res.json()) as {
    status: string
    artifact_docx_key?: string | null
    errors?: Array<{ code: string; message: string; target?: string | null }>
    warnings?: Array<{ code: string; message: string; target?: string | null }>
  }
}

export const getIntermediate = async (jobId: string) => {
  const res = await agentFetch(`/jobs/${jobId}/intermediate`, { method: "GET" })
  return (await res.json()) as any
}

export const downloadArtifact = async (jobId: string) => {
  const res = await agentFetch(`/jobs/${jobId}/artifact`, { method: "GET" })
  const arrayBuffer = await res.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

export const renderArtifact = async (contextJson: unknown, images: Array<{ imageId: string; filename: string; bytes: Buffer }>) => {
  const form = new FormData()
  form.append("context_json", JSON.stringify(contextJson))
  for (const image of images) {
    form.append("images", new Blob([Buffer.from(image.bytes)], { type: guessMimeType(image.filename) }), image.imageId)
  }

  const res = await agentFetch("/render", { method: "POST", body: form })
  const arrayBuffer = await res.arrayBuffer()
  return Buffer.from(arrayBuffer)
}
