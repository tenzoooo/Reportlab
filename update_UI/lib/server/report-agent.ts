import { createServiceClient } from "@/lib/supabase/server"
import {
  addExcel,
  addImage,
  addPastReport,
  addTable,
  assertMockModeDisabled,
  createJob,
  downloadArtifact,
  getAgentBaseUrl,
  getIntermediate,
  renderArtifact,
  runJob,
} from "./report-agent/agent-client"
import {
  applyEditsToBlocks,
  applyImageOrderToBlocks,
  buildAgentProgressPayload,
  buildFallbackAnalysisFromIntermediate,
  hasReachedLLayer,
  relabelBlocksInAnalysis,
} from "./report-agent/analysis"
import { EXPERIMENT_BUCKET } from "./report-agent/constants"
import { ensureExcelImagesExtracted } from "./report-agent/excel-assets"
import { ReportAlreadyProcessingError, ReportUserError } from "./report-agent/errors"
import { normalizeExcelFilename, normalizeStoragePath, pickPrimaryDocument, rowsToCsv, sortByUploadedAtAsc, stripQueryFragment } from "./report-agent/file-utils"
import { acquireProcessingLock, analysisStorageKey, downloadStorageBytes, logJobEvent, persistReportJobId, uploadAgentProgress, uploadDocxToStorage } from "./report-agent/storage"
import type { ExperimentDataRow } from "./report-agent/types"

export { ReportAlreadyProcessingError, ReportUserError, rowsToCsv }

const loadExperimentFiles = async (params: {
  admin: ReturnType<typeof createServiceClient>
  reportId: string
}) => {
  const { admin, reportId } = params
  const { data: files, error: filesError } = await admin
    .from("experiment_data")
    .select("file_name, file_type, file_url, uploaded_at")
    .eq("report_id", reportId)
  if (filesError) throw new Error(filesError.message)
  return sortByUploadedAtAsc((files || []) as ExperimentDataRow[])
}

const resolveInputFiles = async (params: {
  admin: ReturnType<typeof createServiceClient>
  reportId: string
  userId: string
  missingDocumentError: () => Error
}) => {
  const { admin, reportId, userId, missingDocumentError } = params

  let normalizedFiles = await loadExperimentFiles({ admin, reportId })
  let pdfFile = pickPrimaryDocument(normalizedFiles)
  if (!pdfFile?.file_url) throw missingDocumentError()

  const { insertedAny: insertedExcelImages } = await ensureExcelImagesExtracted({ admin, reportId, userId, files: normalizedFiles })
  if (insertedExcelImages) {
    normalizedFiles = await loadExperimentFiles({ admin, reportId })
    pdfFile = pickPrimaryDocument(normalizedFiles)
  }
  if (!pdfFile?.file_url) throw missingDocumentError()

  return { normalizedFiles, pdfFile }
}

const uploadProgressSnapshot = async (params: { jobId: string; userId: string; reportId: string }) => {
  const { jobId, userId, reportId } = params
  try {
    const intermediate = await getIntermediate(jobId)
    const payload = buildAgentProgressPayload(intermediate, jobId)
    await uploadAgentProgress({ userId, reportId, payload })
  } catch {
    // Best-effort; never fail generation because of progress logging.
  }
}

const startProgressPolling = (params: { jobId: string; userId: string; reportId: string }) => {
  const { jobId, userId, reportId } = params
  let stopProgress = false
  let progressInFlight = false
  const progressIntervalMs = 2500

  const progressTimer = setInterval(async () => {
    if (stopProgress || progressInFlight) return
    progressInFlight = true
    try {
      const intermediate = await getIntermediate(jobId)
      const payload = buildAgentProgressPayload(intermediate, jobId)
      await uploadAgentProgress({ userId, reportId, payload })
    } catch {
      // Best-effort; never fail generation because of progress logging.
    } finally {
      progressInFlight = false
    }
  }, progressIntervalMs)

  return () => {
    stopProgress = true
    clearInterval(progressTimer)
  }
}

const minimalAssetsImages = (intermediate: any) => {
  const assetsImages = Array.isArray(intermediate?.assets_images) ? intermediate.assets_images : []
  return assetsImages
    .map((img: any) => ({
      image_id: typeof img?.image_id === "string" ? img.image_id : "",
      filename: typeof img?.filename === "string" ? img.filename : "",
      upload_index: typeof img?.upload_index === "number" ? img.upload_index : 0,
    }))
    .filter((img: any) => img.image_id && img.filename)
    .sort((a: any, b: any) => (a.upload_index || 0) - (b.upload_index || 0))
}

export async function runReportAgentFromSupabaseReport(params: { reportId: string; userId: string }) {
  const admin = createServiceClient()
  const { reportId, userId } = params

  const { data: report, error: reportError } = await admin
    .from("reports")
    .select("id, user_id")
    .eq("id", reportId)
    .maybeSingle()
  if (reportError) throw new Error(reportError.message)
  if (!report) throw new Error("レポートが見つかりません")
  if (report.user_id !== userId) throw new Error("権限がありません")

  await acquireProcessingLock({ reportId, userId })

  assertMockModeDisabled()

  const { normalizedFiles, pdfFile } = await resolveInputFiles({
    admin,
    reportId,
    userId,
    missingDocumentError: () => new Error("実験書 (PDF/Word) が見つかりません（ファイルのアップロードが必要です）"),
  })

  const pdfBytes = await downloadStorageBytes(pdfFile.file_url as string)
  const jobId = await createJob(pdfBytes, pdfFile.file_name || "manual.pdf")
  await persistReportJobId({ admin, reportId, userId, jobId })
  await logJobEvent({ admin, reportId, jobId, eventType: "job_created" })
  await logJobEvent({
    admin,
    reportId,
    jobId,
    eventType: "input_files_selected",
    payload: {
      total: normalizedFiles.length,
      primary: {
        file_name: pdfFile.file_name || "",
        file_type: pdfFile.file_type || "",
        file_url: pdfFile.file_url || "",
      },
      images: normalizedFiles.filter((f) => f.file_type === "image" && f.file_url).length,
      tables: normalizedFiles.filter((f) => f.file_type === "excel" && f.file_url).length,
      past_reports: normalizedFiles.filter((f) => f.file_type === "word" && f.file_url && f.file_url !== pdfFile.file_url).length,
    },
  })

  await uploadProgressSnapshot({ jobId, userId, reportId })
  const stopProgress = startProgressPolling({ jobId, userId, reportId })

  const imageFiles = normalizedFiles.filter((f) => f.file_type === "image" && f.file_url)
  let imageUploadSuccess = 0
  let imageUploadFailed = 0
  for (const img of imageFiles) {
    try {
      const bytes = await downloadStorageBytes(img.file_url as string)
      await addImage(jobId, bytes, img.file_name || "image.png")
      imageUploadSuccess += 1
    } catch {
      imageUploadFailed += 1
    }
  }

  let pastReportUploadSuccess = 0
  let pastReportUploadFailed = 0
  for (const reportFile of normalizedFiles.filter(
    (f) => f.file_type === "word" && f.file_url && f.file_url !== pdfFile.file_url
  )) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const bytes = await downloadStorageBytes(reportFile.file_url as string)
      // eslint-disable-next-line no-await-in-loop
      await addPastReport(jobId, bytes, reportFile.file_name || "past_report.pdf")
      pastReportUploadSuccess += 1
    } catch {
      pastReportUploadFailed += 1
      continue
    }
  }

  const tableFiles = normalizedFiles.filter((f) => f.file_type === "excel" && f.file_url)
  let tableUploadSuccess = 0
  let tableUploadFailed = 0
  for (const tbl of tableFiles) {
    try {
      const fileUrl = tbl.file_url as string
      const normalizedUrl = stripQueryFragment(fileUrl)
      const lower = normalizedUrl.toLowerCase()
      if (lower.endsWith(".json")) {
        const bytes = await downloadStorageBytes(fileUrl)
        const parsed = JSON.parse(bytes.toString("utf-8")) as { rows?: unknown }
        const rows = Array.isArray(parsed.rows) ? (parsed.rows as string[][]) : []
        if (rows.length > 0) {
          await addTable(jobId, rowsToCsv(rows), tbl.file_name || "table.json")
          tableUploadSuccess += 1
        } else {
          tableUploadFailed += 1
        }
        continue
      }
      if (lower.endsWith(".csv")) {
        const bytes = await downloadStorageBytes(fileUrl)
        await addTable(jobId, bytes.toString("utf-8"), tbl.file_name || "table.csv")
        tableUploadSuccess += 1
        continue
      }
      if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) {
        const bytes = await downloadStorageBytes(fileUrl)
        await addExcel(jobId, bytes, normalizeExcelFilename(tbl.file_name, fileUrl))
        tableUploadSuccess += 1
        continue
      }
      tableUploadFailed += 1
    } catch {
      tableUploadFailed += 1
    }
  }
  await logJobEvent({
    admin,
    reportId,
    jobId,
    eventType: "agent_inputs_uploaded",
    payload: {
      images: { expected: imageFiles.length, success: imageUploadSuccess, failed: imageUploadFailed },
      tables: { expected: tableFiles.length, success: tableUploadSuccess, failed: tableUploadFailed },
      past_reports: {
        expected: normalizedFiles.filter((f) => f.file_type === "word" && f.file_url && f.file_url !== pdfFile.file_url).length,
        success: pastReportUploadSuccess,
        failed: pastReportUploadFailed,
      },
    },
  })

  let run: Awaited<ReturnType<typeof runJob>>
  try {
    run = await runJob(jobId, "update_mvp")
  } finally {
    stopProgress()
  }
  await logJobEvent({
    admin,
    reportId,
    jobId,
    eventType: "job_run_finished",
    payload: {
      status: run?.status || "unknown",
      errors: run?.errors?.length || 0,
      warnings: run?.warnings?.length || 0,
    },
  })

  await uploadProgressSnapshot({ jobId, userId, reportId })

  if (!run || !run.status) throw new Error("Report agent returned invalid run response")
  const intermediateForCompletion = await getIntermediate(jobId).catch(() => null)
  if (!hasReachedLLayer(intermediateForCompletion)) {
    throw new Error(
      `Lレイヤー未到達のため完了扱いにできません（status=${run.status}）。agentの中間JSONは ${getAgentBaseUrl()}/jobs/${jobId}/intermediate で確認できます。`
    )
  }
  if (!run.artifact_docx_key) {
    const firstError = run.errors?.[0]?.message
    throw new Error(
      `docxが生成されませんでした（status=${run.status}${firstError ? ` / ${firstError}` : ""}）。agentの中間JSONは ${getAgentBaseUrl()}/jobs/${jobId}/intermediate で確認できます。`
    )
  }

  // Save TemplateContext into Supabase for the editor UI (best-effort).
  try {
    const intermediate = await getIntermediate(jobId)
    const templateContext = intermediate?.template_context
    const assetsImages = minimalAssetsImages(intermediate)
    if (templateContext && typeof templateContext === "object") {
      const analysis = {
        ...templateContext,
        __assets_images: assetsImages,
        image_order: assetsImages.map((i: any) => i.filename),
      }
      const key = analysisStorageKey(userId, reportId)
      await admin.storage.from(EXPERIMENT_BUCKET).upload(key, JSON.stringify(analysis, null, 2), {
        contentType: "application/json",
        upsert: true,
      })
    }
  } catch {
    // Non-fatal: the docx is still generated and uploaded.
  }

  const artifactBytes = await downloadArtifact(jobId)
  const artifactKey = await uploadDocxToStorage(userId, reportId, artifactBytes)

  await admin
    .from("reports")
    .update({ status: "completed", file_url: artifactKey, updated_at: new Date().toISOString() })
    .eq("id", reportId)
    .eq("user_id", userId)

  return { jobId, artifactKey }
}

export async function prepareReportAgentFromSupabaseReport(params: { reportId: string; userId: string }) {
  const admin = createServiceClient()
  const { reportId, userId } = params

  const { data: report, error: reportError } = await admin
    .from("reports")
    .select("id, user_id")
    .eq("id", reportId)
    .maybeSingle()
  if (reportError) throw new Error(reportError.message)
  if (!report) throw new ReportUserError(404, "レポートが見つかりません")
  if (report.user_id !== userId) throw new ReportUserError(403, "権限がありません")

  await acquireProcessingLock({ reportId, userId })

  assertMockModeDisabled()

  const { normalizedFiles, pdfFile } = await resolveInputFiles({
    admin,
    reportId,
    userId,
    missingDocumentError: () => new ReportUserError(400, "実験書PDF/Wordが見つかりません（実験書のアップロードが必要です）"),
  })

  const pdfBytes = await downloadStorageBytes(pdfFile.file_url as string)
  const jobId = await createJob(pdfBytes, pdfFile.file_name || "manual.pdf")
  await persistReportJobId({ admin, reportId, userId, jobId })
  await logJobEvent({ admin, reportId, jobId, eventType: "job_created" })
  await logJobEvent({
    admin,
    reportId,
    jobId,
    eventType: "input_files_selected",
    payload: {
      total: normalizedFiles.length,
      primary: {
        file_name: pdfFile.file_name || "",
        file_type: pdfFile.file_type || "",
        file_url: pdfFile.file_url || "",
      },
      images: normalizedFiles.filter((f) => f.file_type === "image" && f.file_url).length,
      tables: normalizedFiles.filter((f) => f.file_type === "excel" && f.file_url).length,
      past_reports: normalizedFiles.filter((f) => f.file_type === "word" && f.file_url && f.file_url !== pdfFile.file_url).length,
    },
  })

  await uploadProgressSnapshot({ jobId, userId, reportId })
  const stopProgress = startProgressPolling({ jobId, userId, reportId })

  const imageFiles = normalizedFiles.filter((f) => f.file_type === "image" && f.file_url)
  let imageUploadSuccess = 0
  let imageUploadFailed = 0
  for (const img of imageFiles) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const bytes = await downloadStorageBytes(img.file_url as string)
      // eslint-disable-next-line no-await-in-loop
      await addImage(jobId, bytes, img.file_name || "image.png")
      imageUploadSuccess += 1
    } catch {
      imageUploadFailed += 1
      // Best-effort: invalid or missing images shouldn't block preparing the editor JSON.
      continue
    }
  }

  const tableFiles = normalizedFiles.filter((f) => f.file_type === "excel" && f.file_url)
  let tableUploadSuccess = 0
  let tableUploadFailed = 0
  for (const tbl of tableFiles) {
    try {
      const fileUrl = tbl.file_url as string
      const normalizedUrl = stripQueryFragment(fileUrl)
      const lower = normalizedUrl.toLowerCase()
      if (lower.endsWith(".json")) {
        // eslint-disable-next-line no-await-in-loop
        const bytes = await downloadStorageBytes(fileUrl)
        let parsed: { rows?: unknown } | null = null
        try {
          parsed = JSON.parse(bytes.toString("utf-8")) as { rows?: unknown }
        } catch {
          parsed = null
        }
        const rows = parsed && Array.isArray(parsed.rows) ? (parsed.rows as string[][]) : []
        if (rows.length > 0) {
          // eslint-disable-next-line no-await-in-loop
          await addTable(jobId, rowsToCsv(rows), tbl.file_name || "table.json")
          tableUploadSuccess += 1
        } else {
          tableUploadFailed += 1
        }
        continue
      }
      if (lower.endsWith(".csv")) {
        // eslint-disable-next-line no-await-in-loop
        const bytes = await downloadStorageBytes(fileUrl)
        // eslint-disable-next-line no-await-in-loop
        await addTable(jobId, bytes.toString("utf-8"), tbl.file_name || "table.csv")
        tableUploadSuccess += 1
        continue
      }
      if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) {
        // eslint-disable-next-line no-await-in-loop
        const bytes = await downloadStorageBytes(fileUrl)
        // eslint-disable-next-line no-await-in-loop
        await addExcel(jobId, bytes, normalizeExcelFilename(tbl.file_name, fileUrl))
        tableUploadSuccess += 1
        continue
      }
      tableUploadFailed += 1
    } catch {
      tableUploadFailed += 1
      // Best-effort: invalid or missing tables shouldn't block preparing the editor JSON.
      continue
    }
  }
  await logJobEvent({
    admin,
    reportId,
    jobId,
    eventType: "agent_inputs_uploaded",
    payload: {
      images: { expected: imageFiles.length, success: imageUploadSuccess, failed: imageUploadFailed },
      tables: { expected: tableFiles.length, success: tableUploadSuccess, failed: tableUploadFailed },
      past_reports: { expected: 0, success: 0, failed: 0 },
    },
  })

  let run: Awaited<ReturnType<typeof runJob>>
  try {
    run = await runJob(jobId, "prepare")
  } finally {
    stopProgress()
  }
  await logJobEvent({
    admin,
    reportId,
    jobId,
    eventType: "job_run_finished",
    payload: {
      status: run?.status || "unknown",
      errors: run?.errors?.length || 0,
      warnings: run?.warnings?.length || 0,
    },
  })

  await uploadProgressSnapshot({ jobId, userId, reportId })

  if (!run || !run.status) throw new Error("Report agent returned invalid run response")

  // Save TemplateContext into Supabase for the editor/chat UI.
  const intermediate = await getIntermediate(jobId)
  const templateContext = intermediate?.template_context
  const assetsImages = minimalAssetsImages(intermediate)

  if (!templateContext || typeof templateContext !== "object") {
    const analysis = buildFallbackAnalysisFromIntermediate({
      intermediate,
      reportId,
      jobId,
      assetsImages,
      tableFiles,
      run,
    })
    const key = analysisStorageKey(userId, reportId)
    await admin.storage.from(EXPERIMENT_BUCKET).upload(key, JSON.stringify(analysis, null, 2), {
      contentType: "application/json",
      upsert: true,
    })

    await admin
      .from("reports")
      .update({ status: "draft", updated_at: new Date().toISOString() })
      .eq("id", reportId)
      .eq("user_id", userId)

    return { jobId }
  }

  const analysis = {
    ...templateContext,
    __assets_images: assetsImages,
    image_order: assetsImages.map((i: any) => i.filename),
    __hitl: { mode: "prepare", prepared_at: new Date().toISOString(), step: 0 },
  }
  const key = analysisStorageKey(userId, reportId)
  await admin.storage.from(EXPERIMENT_BUCKET).upload(key, JSON.stringify(analysis, null, 2), {
    contentType: "application/json",
    upsert: true,
  })

  // Return to draft so the user can edit/iterate, and generate later from JSON.
  await admin
    .from("reports")
    .update({ status: "draft", updated_at: new Date().toISOString() })
    .eq("id", reportId)
    .eq("user_id", userId)

  return { jobId }
}

export async function renderReportFromSupabaseAnalysis(params: { reportId: string; userId: string }) {
  const admin = createServiceClient()
  const { reportId, userId } = params

  const { data: report, error: reportError } = await admin
    .from("reports")
    .select("id, user_id")
    .eq("id", reportId)
    .maybeSingle()
  if (reportError) throw new Error(reportError.message)
  if (!report) throw new Error("レポートが見つかりません")
  if (report.user_id !== userId) throw new Error("権限がありません")

  await acquireProcessingLock({ reportId, userId })

  // Load saved analysis JSON (TemplateContext + extras).
  const key = analysisStorageKey(userId, reportId)
  const { data, error } = await admin.storage.from(EXPERIMENT_BUCKET).download(normalizeStoragePath(key))
  if (error || !data) throw new Error("分析JSONが見つかりません。先に一度レポート生成を実行してください。")
  const analysis = JSON.parse(await data.text())

  // Apply UI edits (figures/tables captions) into blocks (used by docxtpl template).
  applyEditsToBlocks(analysis)
  // Apply global image order (drag & drop) into figure blocks.
  applyImageOrderToBlocks(analysis)
  // Re-label blocks after any HITL reassignment.
  relabelBlocksInAnalysis(analysis)

  // Build image bytes by image_id (UploadFile.filename == image_id).
  const assetsImages = Array.isArray(analysis?.__assets_images) ? analysis.__assets_images : []
  const filenameByImageId = new Map<string, string>()
  for (const a of assetsImages) {
    const imageId = typeof a?.image_id === "string" ? a.image_id : ""
    const filename = typeof a?.filename === "string" ? a.filename : ""
    if (imageId && filename) filenameByImageId.set(imageId, filename)
  }

  const { data: files, error: filesError } = await admin
    .from("experiment_data")
    .select("file_name, file_type, file_url, uploaded_at")
    .eq("report_id", reportId)
  if (filesError) throw new Error(filesError.message)

  const normalizedFiles = (files || []) as ExperimentDataRow[]
  const imageFiles = normalizedFiles.filter((f) => f.file_type === "image" && f.file_url && f.file_name)
  const storagePathByFilename = new Map<string, string>()
  for (const img of imageFiles) {
    storagePathByFilename.set(img.file_name as string, img.file_url as string)
  }

  const neededImageIds = new Set<string>()
  const experiments = Array.isArray(analysis?.experiments) ? analysis.experiments : []
  for (const exp of experiments) {
    const blocks = Array.isArray(exp?.blocks) ? exp.blocks : []
    for (const block of blocks) {
      if (block?.type === "figure") {
        const imageId = block?.figure?.figure_image_id
        if (typeof imageId === "string" && imageId) neededImageIds.add(imageId)
      }
    }
  }

  const renderImages: Array<{ imageId: string; filename: string; bytes: Buffer }> = []
  for (const imageId of neededImageIds) {
    const filename = filenameByImageId.get(imageId) || ""
    const storagePath = filename ? storagePathByFilename.get(filename) : undefined
    if (!storagePath) continue
    // eslint-disable-next-line no-await-in-loop
    const bytes = await downloadStorageBytes(storagePath)
    renderImages.push({ imageId, filename, bytes })
  }

  const artifactBytes = await renderArtifact(analysis, renderImages)

  const artifactKey = await uploadDocxToStorage(userId, reportId, artifactBytes)
  await admin
    .from("reports")
    .update({ status: "completed", file_url: artifactKey, updated_at: new Date().toISOString() })
    .eq("id", reportId)
    .eq("user_id", userId)

  return { artifactKey }
}
