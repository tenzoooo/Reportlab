import { createServiceClient } from "@/lib/supabase/server"
import { createHash } from "node:crypto"
import { execFile as execFileCb } from "node:child_process"
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import PizZip from "pizzip"
import { Agent } from "undici"
import { promisify } from "node:util"
import * as XLSX from "xlsx"

export class ReportAlreadyProcessingError extends Error {
  constructor(reportId: string) {
    super(`This report is already processing (reportId=${reportId}).`)
    this.name = "ReportAlreadyProcessingError"
  }
}

class ReportAgentHttpError extends Error {
  url: string
  status: number
  body: string

  constructor(params: { url: string; status: number; body: string }) {
    const msg = params.body ? `${params.body}` : ""
    super(`Report agent error (${params.status})${msg ? `: ${msg}` : ""}`)
    this.name = "ReportAgentHttpError"
    this.url = params.url
    this.status = params.status
    this.body = params.body
  }
}

type ExperimentDataRow = {
  file_name: string | null
  file_type: string | null
  file_url: string | null
  uploaded_at?: string | null
}

const EXPERIMENT_BUCKET = "experiment-files"

const REPORT_AGENT_HTTP_AGENT = new Agent({
  connectTimeout: 30_000,
  headersTimeout: 30 * 60_000,
  bodyTimeout: 30 * 60_000,
})

const isMockMode = () => {
  return process.env.REPORT_GENERATION_MODE === "mock" || process.env.REPORT_AGENT_URL === "mock"
}

const getAgentBaseUrl = () => {
  if (isMockMode()) return "mock://local"
  const explicit = process.env.REPORT_AGENT_URL
  if (explicit) return explicit

  const isHosted = process.env.VERCEL === "1" || process.env.NODE_ENV === "production"
  if (isHosted) {
    throw new Error("REPORT_AGENT_URL is not set. Set it to the Report Agent (FastAPI) base URL.")
  }

  return "http://127.0.0.1:8000"
}

const normalizeStoragePath = (path: string) => path.replace(/^\/+/, "")

const guessMimeType = (filename: string) => {
  const lower = filename.toLowerCase()
  if (lower.endsWith(".png")) return "image/png"
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg"
  if (lower.endsWith(".webp")) return "image/webp"
  if (lower.endsWith(".gif")) return "image/gif"
  if (lower.endsWith(".bmp")) return "image/bmp"
  if (lower.endsWith(".tif") || lower.endsWith(".tiff")) return "image/tiff"
  if (lower.endsWith(".heic")) return "image/heic"
  if (lower.endsWith(".pdf")) return "application/pdf"
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  }
  if (lower.endsWith(".json")) return "application/json"
  if (lower.endsWith(".csv")) return "text/csv"
  if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  }
  return "application/octet-stream"
}

const XLSX_EXTENSIONS = new Set([".xlsx", ".xlsm", ".xltx", ".xltm"])
const EXCEL_SHEET_META_MARKER = "::sheet="

const stripExcelMetaFromFilename = (filename: string) => {
  const raw = filename || ""
  const idx = raw.indexOf(EXCEL_SHEET_META_MARKER)
  return idx === -1 ? raw : raw.slice(0, idx)
}

const parseExcelSheetNameFromFilename = (filename: string) => {
  const raw = filename || ""
  const idx = raw.indexOf(EXCEL_SHEET_META_MARKER)
  if (idx === -1) return ""
  const encoded = raw.slice(idx + EXCEL_SHEET_META_MARKER.length)
  try {
    return decodeURIComponent(encoded).trim()
  } catch {
    return encoded.trim()
  }
}

const safeFilename = (name: string) => {
  const cleaned = (name || "")
    .replace(/[\/\\\0]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
  return cleaned || "file"
}

const fileStem = (filename: string) => {
  const base = path.basename(filename || "")
  const ext = path.extname(base)
  return ext ? base.slice(0, -ext.length) : base
}

type ExtractedZipImage = {
  zipPath: string
  bytes: Buffer
}

const normalizeZipPath = (zipPath: string) => zipPath.replace(/\\/g, "/").replace(/^\/+/, "")

const isLikelyImagePath = (zipPath: string) => {
  const normalized = normalizeZipPath(zipPath).toLowerCase()
  const m = normalized.match(/\.([a-z0-9]+)$/)
  const ext = (m?.[1] || "").toLowerCase()
  if (!ext) return false
  return ["png", "jpg", "jpeg", "gif", "bmp", "webp", "tif", "tiff", "svg", "emf", "wmf"].includes(ext)
}

const execFile = promisify(execFileCb)

const hasExcelCharts = (xlsxBytes: Buffer) => {
  try {
    const zip = new PizZip(xlsxBytes)
    const files = zip.files || {}
    for (const zipPath of Object.keys(files)) {
      const normalized = normalizeZipPath(zipPath).toLowerCase()
      if (normalized.startsWith("xl/charts/")) return true
    }
    return false
  } catch {
    return false
  }
}

type LibreOfficeConvertedImage = {
  filename: string
  bytes: Buffer
}

const convertSpreadsheetToPngsWithLibreOffice = async (params: {
  xlsxBytes: Buffer
  originalFilename: string
  timeoutMs?: number
}) => {
  const { xlsxBytes, originalFilename } = params
  const timeoutMs = params.timeoutMs ?? Number(process.env.EXCEL_LIBREOFFICE_TIMEOUT_MS || 120_000)

  const bin = (process.env.LIBREOFFICE_BIN || process.env.SOFFICE_PATH || "soffice").trim() || "soffice"
  const tmpBase = await mkdtemp(path.join(os.tmpdir(), "reportlab-xlsx-"))
  const outDir = path.join(tmpBase, "out")
  try {
    await mkdir(outDir, { recursive: true })
    const inputName = safeFilename(originalFilename || "workbook.xlsx")
    const inputPath = path.join(tmpBase, inputName)
    await writeFile(inputPath, xlsxBytes)
    await execFile(
      bin,
      [
        "--headless",
        "--nologo",
        "--nolockcheck",
        "--nodefault",
        "--norestore",
        "--invisible",
        "--convert-to",
        "png",
        "--outdir",
        outDir,
        inputPath,
      ],
      { timeout: timeoutMs }
    )

    const files = await readdir(outDir).catch(() => [])
    const pngNames = files.filter((f) => f.toLowerCase().endsWith(".png")).sort((a, b) => a.localeCompare(b))
    const maxPngs = Number(process.env.EXCEL_LIBREOFFICE_MAX_PNGS || 24)
    const selected = pngNames.slice(0, maxPngs)
    const images: LibreOfficeConvertedImage[] = []
    for (const name of selected) {
      // eslint-disable-next-line no-await-in-loop
      const bytes = await readFile(path.join(outDir, name))
      if (!bytes || bytes.length === 0) continue
      images.push({ filename: name, bytes })
    }
    return images
  } finally {
    await rm(tmpBase, { recursive: true, force: true }).catch(() => {})
  }
}

type ExtractedTable = {
  name: string
  csv: string
}

const isNonEmptyCell = (value: unknown) => {
  if (value === null || value === undefined) return false
  const s = typeof value === "string" ? value : String(value)
  return s.trim().length > 0
}

const detectTablesFromGrid = (grid: string[][]) => {
  const maxRows = Number(process.env.EXCEL_TABLE_EXTRACT_MAX_ROWS || 1200)
  const maxCols = Number(process.env.EXCEL_TABLE_EXTRACT_MAX_COLS || 200)
  const minNonEmptyCells = Number(process.env.EXCEL_TABLE_EXTRACT_MIN_NONEMPTY || 10)
  const maxCells = Number(process.env.EXCEL_TABLE_EXTRACT_MAX_CELLS || 200_000)

  const rowCount = Math.min(grid.length, maxRows)
  let colCount = 0
  for (let r = 0; r < rowCount; r += 1) colCount = Math.max(colCount, grid[r]?.length || 0)
  colCount = Math.min(colCount, maxCols)
  if (rowCount * colCount > maxCells) {
    const scale = Math.sqrt(maxCells / (rowCount * colCount))
    const scaledRows = Math.max(1, Math.floor(rowCount * scale))
    const scaledCols = Math.max(1, Math.floor(colCount * scale))
    return detectTablesFromGrid(grid.slice(0, scaledRows).map((row) => (row || []).slice(0, scaledCols)))
  }

  const visited: boolean[][] = Array.from({ length: rowCount }, () => Array(colCount).fill(false))
  const nonEmpty = (r: number, c: number) => {
    const v = grid[r]?.[c]
    return isNonEmptyCell(v)
  }

  type Box = { top: number; left: number; bottom: number; right: number; cells: number }
  const boxes: Box[] = []
  const q: Array<[number, number]> = []

  for (let r = 0; r < rowCount; r += 1) {
    for (let c = 0; c < colCount; c += 1) {
      if (visited[r][c] || !nonEmpty(r, c)) continue
      let top = r
      let left = c
      let bottom = r
      let right = c
      let cells = 0
      visited[r][c] = true
      q.length = 0
      q.push([r, c])
      while (q.length) {
        const [cr, cc] = q.pop() as [number, number]
        cells += 1
        if (cr < top) top = cr
        if (cc < left) left = cc
        if (cr > bottom) bottom = cr
        if (cc > right) right = cc
        const neighbors: Array<[number, number]> = [
          [cr - 1, cc],
          [cr + 1, cc],
          [cr, cc - 1],
          [cr, cc + 1],
        ]
        for (const [nr, nc] of neighbors) {
          if (nr < 0 || nc < 0 || nr >= rowCount || nc >= colCount) continue
          if (visited[nr][nc] || !nonEmpty(nr, nc)) continue
          visited[nr][nc] = true
          q.push([nr, nc])
        }
      }
      if (cells >= minNonEmptyCells) {
        boxes.push({ top, left, bottom, right, cells })
      }
    }
  }

  const isRowEmpty = (r: number, left: number, right: number) => {
    for (let c = left; c <= right; c += 1) if (nonEmpty(r, c)) return false
    return true
  }
  const isColEmpty = (c: number, top: number, bottom: number) => {
    for (let r = top; r <= bottom; r += 1) if (nonEmpty(r, c)) return false
    return true
  }

  const trimmed = boxes
    .map((b) => {
      let top = b.top
      let left = b.left
      let bottom = b.bottom
      let right = b.right
      while (top <= bottom && isRowEmpty(top, left, right)) top += 1
      while (top <= bottom && isRowEmpty(bottom, left, right)) bottom -= 1
      while (left <= right && isColEmpty(left, top, bottom)) left += 1
      while (left <= right && isColEmpty(right, top, bottom)) right -= 1
      return { ...b, top, left, bottom, right }
    })
    .filter((b) => b.top <= b.bottom && b.left <= b.right)
    .sort((a, b) => (a.top !== b.top ? a.top - b.top : a.left - b.left))

  return trimmed
}

const extractTablesFromXlsxBytes = (params: { xlsxBytes: Buffer; workbookName: string; sheetName: string }) => {
  const { xlsxBytes, workbookName } = params
  const requestedSheet = (params.sheetName || "").trim()
  const maxTables = Number(process.env.EXCEL_TABLE_EXTRACT_MAX_TABLES || 8)

  const workbook = XLSX.read(xlsxBytes, { type: "buffer", cellText: true, cellDates: false })
  const sheetNames = workbook.SheetNames || []
  if (sheetNames.length === 0) return { sheetName: "", tables: [] as ExtractedTable[] }
  const resolvedSheetName = requestedSheet && sheetNames.includes(requestedSheet) ? requestedSheet : sheetNames[0]
  const ws = workbook.Sheets[resolvedSheetName]
  if (!ws) return { sheetName: resolvedSheetName, tables: [] as ExtractedTable[] }

  const gridRaw = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "", blankrows: false }) as any[][]
  const grid: string[][] = gridRaw.map((row) => (Array.isArray(row) ? row.map((v) => (v === null || v === undefined ? "" : String(v))) : []))

  const boxes = detectTablesFromGrid(grid).slice(0, maxTables)
  const safeBook = safeFilename(fileStem(workbookName || "excel")).slice(0, 60)
  const safeSheet = safeFilename(resolvedSheetName).slice(0, 60)
  const tables: ExtractedTable[] = []
  for (let i = 0; i < boxes.length; i += 1) {
    const b = boxes[i]
    const rows: string[][] = []
    for (let r = b.top; r <= b.bottom; r += 1) {
      const row: string[] = []
      for (let c = b.left; c <= b.right; c += 1) {
        row.push((grid[r]?.[c] ?? "").toString())
      }
      rows.push(row)
    }
    const csv = rowsToCsv(rows)
    if (!csv.trim()) continue
    const name = `${safeBook}__${safeSheet}__table-${i + 1}.csv`
    tables.push({ name, csv })
  }
  return { sheetName: resolvedSheetName, tables }
}

const extractImagesFromXlsxBytes = (xlsxBytes: Buffer): ExtractedZipImage[] => {
  try {
    const zip = new PizZip(xlsxBytes)
    const files = zip.files || {}
    const out: ExtractedZipImage[] = []
    for (const [zipPath, entry] of Object.entries(files)) {
      const normalized = normalizeZipPath(zipPath).toLowerCase()
      const isMedia = normalized.startsWith("xl/media/")
      const isEmbeddingImage = normalized.startsWith("xl/embeddings/") && isLikelyImagePath(normalized)
      if (!isMedia && !isEmbeddingImage) continue
      if ((entry as any).dir) continue
      const file = entry as any
      const bytes: Buffer | null =
        typeof file.asNodeBuffer === "function"
          ? (file.asNodeBuffer() as Buffer)
          : typeof file.asUint8Array === "function"
            ? Buffer.from(file.asUint8Array() as Uint8Array)
            : null
      if (!bytes || bytes.length === 0) continue
      out.push({ zipPath: normalizeZipPath(zipPath), bytes })
    }
    out.sort((a, b) => a.zipPath.localeCompare(b.zipPath))
    return out
  } catch {
    return []
  }
}

const excelExtractedImageStorageKey = (params: {
  userId: string
  reportId: string
  excelStoragePath: string
  imageBytes: Buffer
  imageExt: string
}) => {
  const { userId, reportId, excelStoragePath, imageBytes, imageExt } = params
  const excelSlug = path.basename(excelStoragePath, path.extname(excelStoragePath)) || "excel"
  const hash = createHash("sha256").update(imageBytes).digest("hex").slice(0, 40)
  const ext = (imageExt || "").toLowerCase().startsWith(".") ? imageExt.toLowerCase() : imageExt ? `.${imageExt}` : ".bin"
  return `${userId}/${reportId}/experiment-data/excel-images/${excelSlug}/${hash}${ext}`
}

const ensureExcelImagesExtracted = async (params: {
  admin: ReturnType<typeof createServiceClient>
  reportId: string
  userId: string
  files: ExperimentDataRow[]
}) => {
  const { admin, reportId, userId, files } = params

  const existingUrls = new Set(
    files
      .map((f) => (typeof f.file_url === "string" ? f.file_url : ""))
      .filter((u) => u)
  )

  const excelFiles = files
    .filter((f) => f.file_type === "excel" && f.file_url)
    .map((f) => ({ ...f, file_url: f.file_url as string }))
    .filter((f) => XLSX_EXTENSIONS.has(path.extname(f.file_url).toLowerCase()))

  const maxImagesPerWorkbook = Number(process.env.EXCEL_IMAGE_EXTRACT_MAX_PER_WORKBOOK || 50)
  const maxImageBytes = Number(process.env.EXCEL_IMAGE_EXTRACT_MAX_BYTES || 25 * 1024 * 1024)
  const enableLibreOfficeCharts =
    ({ "1": true, true: true, yes: true, y: true, on: true } as Record<string, boolean | undefined>)[
      (process.env.EXCEL_CHART_EXTRACT_WITH_LIBREOFFICE || "").trim().toLowerCase()
    ] === true

  let insertedAny = false
  for (const excel of excelFiles) {
    try {
      const excelBytes = await downloadStorageBytes(excel.file_url)
      let extracted = extractImagesFromXlsxBytes(excelBytes).slice(0, maxImagesPerWorkbook)
      if (extracted.length === 0 && enableLibreOfficeCharts && hasExcelCharts(excelBytes)) {
        try {
          const converted = await convertSpreadsheetToPngsWithLibreOffice({
            xlsxBytes: excelBytes,
            originalFilename: stripExcelMetaFromFilename(excel.file_name || "") || path.basename(excel.file_url) || "workbook.xlsx",
          })
          extracted = converted
            .map((c) => ({ zipPath: `libreoffice/${c.filename}`, bytes: c.bytes }))
            .slice(0, maxImagesPerWorkbook)
        } catch {
          // ignore (best-effort)
        }
      }
      if (extracted.length === 0) continue

      const excelNameStem = safeFilename(fileStem(stripExcelMetaFromFilename(excel.file_name || "") || "excel"))
      const usedNames = new Set<string>()
      const baseMs = excel.uploaded_at ? Date.parse(excel.uploaded_at) : Date.now()
      const baseTimestampMs = Number.isFinite(baseMs) ? baseMs : Date.now()

      for (let i = 0; i < extracted.length; i += 1) {
        const item = extracted[i]
        if (item.bytes.length > maxImageBytes) continue

        const zipBase = path.basename(item.zipPath) || `image-${i + 1}.bin`
        const rawName = `${excelNameStem}-${zipBase}`
        let fileName = safeFilename(rawName)
        if (!path.extname(fileName)) fileName += path.extname(zipBase) || ".bin"
        while (usedNames.has(fileName)) {
          const ext = path.extname(fileName) || ".bin"
          const stem = fileStem(fileName)
          fileName = `${stem}-${usedNames.size + 1}${ext}`
        }
        usedNames.add(fileName)

        const storageKey = excelExtractedImageStorageKey({
          userId,
          reportId,
          excelStoragePath: excel.file_url,
          imageBytes: item.bytes,
          imageExt: path.extname(fileName) || path.extname(zipBase) || ".bin",
        })

        if (existingUrls.has(storageKey)) continue

        const { error: uploadError } = await admin.storage.from(EXPERIMENT_BUCKET).upload(normalizeStoragePath(storageKey), item.bytes, {
          contentType: guessMimeType(fileName),
          upsert: true,
        })
        if (uploadError) continue

        const uploadedAt = new Date(baseTimestampMs + 100 + i).toISOString()
        const { error: insertError } = await admin.from("experiment_data").insert([
          {
            report_id: reportId,
            file_name: fileName,
            file_type: "image",
            file_url: storageKey,
            uploaded_at: uploadedAt,
          },
        ])

        if (insertError) continue
        existingUrls.add(storageKey)
        insertedAny = true
      }
    } catch {
      // Best-effort: Excel parsing/extraction should not block report generation.
      continue
    }
  }

  return { insertedAny }
}

const escapeCsvCell = (value: string) => {
  const needsQuotes = /[",\n\r]/.test(value)
  const escaped = value.replace(/"/g, '""')
  return needsQuotes ? `"${escaped}"` : escaped
}

export const rowsToCsv = (rows: string[][]) => {
  return rows
    .map((row) => row.map((cell) => escapeCsvCell((cell ?? "").toString())).join(","))
    .join("\n")
}

const downloadStorageBytes = async (path: string) => {
  const admin = createServiceClient()
  const { data, error } = await admin.storage.from(EXPERIMENT_BUCKET).download(normalizeStoragePath(path))
  if (error || !data) throw new Error(error?.message || "Failed to download file from storage")
  const arrayBuffer = await data.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

const analysisStorageKey = (userId: string, reportId: string) => {
  return `${userId}/${reportId}/analysis/analysis.json`
}

const agentProgressStorageKey = (userId: string, reportId: string) => {
  return `${userId}/${reportId}/agent/progress.json`
}

const safePreview = (value: unknown, maxLen: number) => {
  const s = typeof value === "string" ? value : ""
  if (!s) return ""
  if (s.length <= maxLen) return s
  return s.slice(0, maxLen) + "…"
}

const buildAgentProgressPayload = (intermediate: any, jobId: string) => {
  const status = typeof intermediate?.status === "string" ? intermediate.status : ""
  const snapshots = Array.isArray(intermediate?.snapshots) ? intermediate.snapshots : []
  const lastStep = snapshots.length > 0 ? snapshots[snapshots.length - 1]?.step : ""

  const pdf = intermediate?.pdf || {}
  const experiments = Array.isArray(intermediate?.experiments) ? intermediate.experiments : []
  const methodTree = Array.isArray(intermediate?.method_tree) ? intermediate.method_tree : []
  const assetsImages = Array.isArray(intermediate?.assets_images) ? intermediate.assets_images : []
  const assetsTables = Array.isArray(intermediate?.assets_tables) ? intermediate.assets_tables : []
  const prompts = Array.isArray(pdf?.consideration_prompts) ? pdf.consideration_prompts : []

  return {
    version: 1,
    job_id: jobId,
    status,
    updated_at: new Date().toISOString(),
    last_step: typeof lastStep === "string" ? lastStep : "",
    snapshots: snapshots
      .map((s: any) => ({
        step: typeof s?.step === "string" ? s.step : "",
        storage_key: typeof s?.storage_key === "string" ? s.storage_key : "",
      }))
      .filter((s: any) => s.step),
    stats: {
      pdf_pages: typeof pdf?.pages === "number" ? pdf.pages : null,
      method_tree_count: methodTree.length,
      experiments_count: experiments.length,
      images_count: assetsImages.length,
      tables_count: assetsTables.length,
      prompts_count: prompts.length,
    },
    previews: {
      method_text: safePreview(pdf?.method_text, 1500),
      discussion_text: safePreview(pdf?.discussion_text, 1500),
      prompts: prompts.slice(0, 5).map((p: any) => safePreview(p, 200)).filter(Boolean),
      method_tree: methodTree
        .slice(0, 5)
        .map((m: any) => {
          const expKey = typeof m?.exp_key === "string" ? m.exp_key : ""
          const title = typeof m?.title === "string" ? m.title : ""
          return expKey && title ? `${expKey} ${title}` : expKey || title
        })
        .filter(Boolean),
    },
  }
}

const uploadAgentProgress = async (params: { userId: string; reportId: string; payload: unknown }) => {
  const admin = createServiceClient()
  const { userId, reportId, payload } = params
  const key = agentProgressStorageKey(userId, reportId)
  await admin.storage.from(EXPERIMENT_BUCKET).upload(key, JSON.stringify(payload, null, 2), {
    contentType: "application/json",
    upsert: true,
  })
  return key
}

const uploadDocxToStorage = async (userId: string, reportId: string, bytes: Uint8Array) => {
  const admin = createServiceClient()
  const key = `${userId}/${reportId}/artifact/report_${Date.now()}.docx`
  const { error } = await admin.storage.from(EXPERIMENT_BUCKET).upload(key, bytes, {
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    upsert: true,
  })
  if (error) throw new Error(error.message)
  return key
}

const loadMockDocxBytes = async () => {
  const explicit = process.env.REPORT_MOCK_TEMPLATE_PATH
  const candidate = explicit
    ? path.resolve(process.cwd(), explicit)
    : path.resolve(process.cwd(), "templates", "chapter_fixed.docx")
  return await readFile(candidate)
}

const agentFetch = async (path: string, init: RequestInit) => {
  if (isMockMode()) {
    throw new Error("Mock mode enabled (REPORT_GENERATION_MODE=mock), skipping report agent fetch")
  }
  const url = `${getAgentBaseUrl()}${path}`
  const controller = new AbortController()
  const defaultTimeoutMs =
    process.env.VERCEL === "1" || process.env.NODE_ENV === "production" ? 55_000 : 30 * 60_000
  const timeoutMs = Number(process.env.REPORT_AGENT_TIMEOUT_MS || defaultTimeoutMs)
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
    throw new Error(
      `Failed to reach report agent: ${url}${causeMessage ? ` (${causeMessage})` : ""}${errMessage ? ` [${errMessage}]` : ""}`
    )
  } finally {
    clearTimeout(timeout)
  }
}

const createJob = async (pdfBytes: Uint8Array, filename: string) => {
  const form = new FormData()
  form.append("pdf", new Blob([Buffer.from(pdfBytes)], { type: "application/pdf" }), filename || "manual.pdf")
  const res = await agentFetch("/jobs", { method: "POST", body: form })
  const json = (await res.json()) as { job_id: string }
  if (!json.job_id) throw new Error("Report agent returned empty job_id")
  return json.job_id
}

const addImage = async (jobId: string, imageBytes: Uint8Array, filename: string) => {
  const form = new FormData()
  form.append("image", new Blob([Buffer.from(imageBytes)], { type: guessMimeType(filename) }), filename || "image.png")
  await agentFetch(`/jobs/${jobId}/images`, { method: "POST", body: form })
}

const addTable = async (jobId: string, rawCsv: string, filename?: string) => {
  await agentFetch(`/jobs/${jobId}/tables`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw_csv: rawCsv, filename }),
  })
}

const runJob = async (jobId: string, mode: "full" | "prepare" = "full") => {
  const qs = mode === "prepare" ? "?mode=prepare" : ""
  const res = await agentFetch(`/jobs/${jobId}/run${qs}`, { method: "POST" })
  return (await res.json()) as {
    status: string
    artifact_docx_key?: string | null
    errors?: Array<{ code: string; message: string; target?: string | null }>
    warnings?: Array<{ code: string; message: string; target?: string | null }>
  }
}

const getIntermediate = async (jobId: string) => {
  const res = await agentFetch(`/jobs/${jobId}/intermediate`, { method: "GET" })
  return (await res.json()) as any
}

const downloadArtifact = async (jobId: string) => {
  const res = await agentFetch(`/jobs/${jobId}/artifact`, { method: "GET" })
  const arrayBuffer = await res.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

const acquireProcessingLock = async (params: { reportId: string; userId: string }) => {
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

  if (isMockMode()) {
    const bytes = await loadMockDocxBytes()
    const artifactKey = await uploadDocxToStorage(userId, reportId, bytes)
    await admin
      .from("reports")
      .update({ status: "completed", file_url: artifactKey, updated_at: new Date().toISOString() })
      .eq("id", reportId)
      .eq("user_id", userId)
    return { jobId: "mock", artifactKey }
  }

  const { data: files, error: filesError } = await admin
    .from("experiment_data")
    .select("file_name, file_type, file_url, uploaded_at")
    .eq("report_id", reportId)
  if (filesError) throw new Error(filesError.message)

  let normalizedFiles = (files || []) as ExperimentDataRow[]
  const pdfFile = normalizedFiles.find((f) => (f.file_url || "").toLowerCase().endsWith(".pdf"))
  if (!pdfFile?.file_url) throw new Error("実験書PDFが見つかりません（PDFのアップロードが必要です）")

  const { insertedAny: insertedExcelImages } = await ensureExcelImagesExtracted({ admin, reportId, userId, files: normalizedFiles })
  if (insertedExcelImages) {
    const { data: reloaded, error } = await admin
      .from("experiment_data")
      .select("file_name, file_type, file_url, uploaded_at")
      .eq("report_id", reportId)
    if (!error) normalizedFiles = (reloaded || []) as ExperimentDataRow[]
  }

  const pdfBytes = await downloadStorageBytes(pdfFile.file_url)
  const jobId = await createJob(pdfBytes, pdfFile.file_name || "manual.pdf")

  // Persist agent progress while the job is running, so the UI can show "how it was built".
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
  try {
    const intermediate = await getIntermediate(jobId)
    const payload = buildAgentProgressPayload(intermediate, jobId)
    await uploadAgentProgress({ userId, reportId, payload })
  } catch {
    // ignore
  }

  const imageFiles = normalizedFiles
    .filter((f) => f.file_type === "image" && f.file_url)
    .sort((a, b) => {
      const ta = a.uploaded_at ? Date.parse(a.uploaded_at) : 0
      const tb = b.uploaded_at ? Date.parse(b.uploaded_at) : 0
      return ta - tb
    })
  for (const img of imageFiles) {
    const bytes = await downloadStorageBytes(img.file_url as string)
    await addImage(jobId, bytes, img.file_name || "image.png")
  }

  const tableFiles = normalizedFiles.filter((f) => f.file_type === "excel" && f.file_url)
  for (const tbl of tableFiles) {
    const fileUrl = tbl.file_url as string
    const lower = fileUrl.toLowerCase()
    if (lower.endsWith(".json")) {
      const bytes = await downloadStorageBytes(fileUrl)
      const parsed = JSON.parse(bytes.toString("utf-8")) as { rows?: unknown }
      const rows = Array.isArray(parsed.rows) ? (parsed.rows as string[][]) : []
      if (rows.length > 0) {
        await addTable(jobId, rowsToCsv(rows), tbl.file_name || "table.json")
      }
      continue
    }
    if (lower.endsWith(".csv")) {
      const bytes = await downloadStorageBytes(fileUrl)
      await addTable(jobId, bytes.toString("utf-8"), tbl.file_name || "table.csv")
      continue
    }
    if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) {
      const bytes = await downloadStorageBytes(fileUrl)
      const desiredSheet = parseExcelSheetNameFromFilename(tbl.file_name || "")
      const baseName = stripExcelMetaFromFilename(tbl.file_name || "") || path.basename(fileUrl) || "workbook.xlsx"
      const { tables } = extractTablesFromXlsxBytes({ xlsxBytes: bytes, workbookName: baseName, sheetName: desiredSheet })
      for (const t of tables) {
        // eslint-disable-next-line no-await-in-loop
        await addTable(jobId, t.csv, t.name)
      }
      continue
    }
  }

  let run: Awaited<ReturnType<typeof runJob>>
  try {
    run = await runJob(jobId, "full")
  } finally {
    stopProgress = true
    clearInterval(progressTimer)
  }

  // Final progress snapshot (best-effort).
  try {
    const intermediate = await getIntermediate(jobId)
    const payload = buildAgentProgressPayload(intermediate, jobId)
    await uploadAgentProgress({ userId, reportId, payload })
  } catch {
    // ignore
  }

  if (!run || !run.status) throw new Error("Report agent returned invalid run response")
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
    const assetsImages = Array.isArray(intermediate?.assets_images) ? intermediate.assets_images : []
    const minimalAssetsImages = assetsImages
      .map((img: any) => ({
        image_id: typeof img?.image_id === "string" ? img.image_id : "",
        filename: typeof img?.filename === "string" ? img.filename : "",
        upload_index: typeof img?.upload_index === "number" ? img.upload_index : 0,
      }))
      .filter((img: any) => img.image_id && img.filename)
      .sort((a: any, b: any) => (a.upload_index || 0) - (b.upload_index || 0))

    if (templateContext && typeof templateContext === "object") {
      const analysis = {
        ...templateContext,
        __assets_images: minimalAssetsImages,
        image_order: minimalAssetsImages.map((i: any) => i.filename),
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
  if (!report) throw new Error("レポートが見つかりません")
  if (report.user_id !== userId) throw new Error("権限がありません")

  await acquireProcessingLock({ reportId, userId })

  if (isMockMode()) {
    // Mock: create a minimal analysis JSON so the editor/chat can start.
    const key = analysisStorageKey(userId, reportId)
    const analysis = { experiments: [], __hitl: { mode: "prepare", prepared_at: new Date().toISOString() } }
    await admin.storage.from(EXPERIMENT_BUCKET).upload(key, JSON.stringify(analysis, null, 2), {
      contentType: "application/json",
      upsert: true,
    })
    await admin
      .from("reports")
      .update({ status: "draft", updated_at: new Date().toISOString() })
      .eq("id", reportId)
      .eq("user_id", userId)
    return { jobId: "mock" }
  }

  const { data: files, error: filesError } = await admin
    .from("experiment_data")
    .select("file_name, file_type, file_url, uploaded_at")
    .eq("report_id", reportId)
  if (filesError) throw new Error(filesError.message)

  let normalizedFiles = (files || []) as ExperimentDataRow[]
  const pdfFile = normalizedFiles.find((f) => (f.file_url || "").toLowerCase().endsWith(".pdf"))
  if (!pdfFile?.file_url) throw new Error("実験書PDFが見つかりません（PDFのアップロードが必要です）")

  const { insertedAny: insertedExcelImages } = await ensureExcelImagesExtracted({ admin, reportId, userId, files: normalizedFiles })
  if (insertedExcelImages) {
    const { data: reloaded, error } = await admin
      .from("experiment_data")
      .select("file_name, file_type, file_url, uploaded_at")
      .eq("report_id", reportId)
    if (!error) normalizedFiles = (reloaded || []) as ExperimentDataRow[]
  }

  const pdfBytes = await downloadStorageBytes(pdfFile.file_url)
  const jobId = await createJob(pdfBytes, pdfFile.file_name || "manual.pdf")

  // Persist agent progress while the job is running, so the UI can show "how it was built".
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
      // Best-effort; never fail because of progress logging.
    } finally {
      progressInFlight = false
    }
  }, progressIntervalMs)
  try {
    const intermediate = await getIntermediate(jobId)
    const payload = buildAgentProgressPayload(intermediate, jobId)
    await uploadAgentProgress({ userId, reportId, payload })
  } catch {
    // ignore
  }

  const imageFiles = normalizedFiles
    .filter((f) => f.file_type === "image" && f.file_url)
    .sort((a, b) => {
      const ta = a.uploaded_at ? Date.parse(a.uploaded_at) : 0
      const tb = b.uploaded_at ? Date.parse(b.uploaded_at) : 0
      return ta - tb
    })
  for (const img of imageFiles) {
    // eslint-disable-next-line no-await-in-loop
    const bytes = await downloadStorageBytes(img.file_url as string)
    // eslint-disable-next-line no-await-in-loop
    await addImage(jobId, bytes, img.file_name || "image.png")
  }

  const tableFiles = normalizedFiles.filter((f) => f.file_type === "excel" && f.file_url)
  for (const tbl of tableFiles) {
    const fileUrl = tbl.file_url as string
    const lower = fileUrl.toLowerCase()
    if (lower.endsWith(".json")) {
      // eslint-disable-next-line no-await-in-loop
      const bytes = await downloadStorageBytes(fileUrl)
      const parsed = JSON.parse(bytes.toString("utf-8")) as { rows?: unknown }
      const rows = Array.isArray(parsed.rows) ? (parsed.rows as string[][]) : []
      if (rows.length > 0) {
        // eslint-disable-next-line no-await-in-loop
        await addTable(jobId, rowsToCsv(rows), tbl.file_name || "table.json")
      }
      continue
    }
    if (lower.endsWith(".csv")) {
      // eslint-disable-next-line no-await-in-loop
      const bytes = await downloadStorageBytes(fileUrl)
      // eslint-disable-next-line no-await-in-loop
      await addTable(jobId, bytes.toString("utf-8"), tbl.file_name || "table.csv")
      continue
    }
    if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) {
      // eslint-disable-next-line no-await-in-loop
      const bytes = await downloadStorageBytes(fileUrl)
      const desiredSheet = parseExcelSheetNameFromFilename(tbl.file_name || "")
      const baseName = stripExcelMetaFromFilename(tbl.file_name || "") || path.basename(fileUrl) || "workbook.xlsx"
      const { tables } = extractTablesFromXlsxBytes({ xlsxBytes: bytes, workbookName: baseName, sheetName: desiredSheet })
      for (const t of tables) {
        // eslint-disable-next-line no-await-in-loop
        await addTable(jobId, t.csv, t.name)
      }
      continue
    }
  }

  let run: Awaited<ReturnType<typeof runJob>>
  try {
    run = await runJob(jobId, "prepare")
  } finally {
    stopProgress = true
    clearInterval(progressTimer)
  }

  // Final progress snapshot (best-effort).
  try {
    const intermediate = await getIntermediate(jobId)
    const payload = buildAgentProgressPayload(intermediate, jobId)
    await uploadAgentProgress({ userId, reportId, payload })
  } catch {
    // ignore
  }

  if (!run || !run.status) throw new Error("Report agent returned invalid run response")

  // Save TemplateContext into Supabase for the editor/chat UI.
  const intermediate = await getIntermediate(jobId)
  const templateContext = intermediate?.template_context
  const assetsImages = Array.isArray(intermediate?.assets_images) ? intermediate.assets_images : []
  const minimalAssetsImages = assetsImages
    .map((img: any) => ({
      image_id: typeof img?.image_id === "string" ? img.image_id : "",
      filename: typeof img?.filename === "string" ? img.filename : "",
      upload_index: typeof img?.upload_index === "number" ? img.upload_index : 0,
    }))
    .filter((img: any) => img.image_id && img.filename)
    .sort((a: any, b: any) => (a.upload_index || 0) - (b.upload_index || 0))

  if (!templateContext || typeof templateContext !== "object") {
    const firstError = run.errors?.[0]?.message
    throw new Error(
      `分析結果が生成されませんでした（status=${run.status}${firstError ? ` / ${firstError}` : ""}）。agentの中間JSONは ${getAgentBaseUrl()}/jobs/${jobId}/intermediate で確認できます。`
    )
  }

  const analysis = {
    ...templateContext,
    __assets_images: minimalAssetsImages,
    image_order: minimalAssetsImages.map((i: any) => i.filename),
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

const applyEditsToBlocks = (analysis: any) => {
  const experiments = Array.isArray(analysis?.experiments) ? analysis.experiments : []
  for (const exp of experiments) {
    const figures = Array.isArray(exp?.figures) ? exp.figures : []
    const tables = Array.isArray(exp?.tables) ? exp.tables : []
    const blocks = Array.isArray(exp?.blocks) ? exp.blocks : []

    const figCaptionByLabel = new Map<string, string>()
    for (const fig of figures) {
      if (!fig || typeof fig !== "object") continue
      const label = typeof fig.label === "string" ? fig.label : ""
      const caption = typeof fig.caption === "string" ? fig.caption : ""
      if (label) figCaptionByLabel.set(label, caption)
    }

    const tableCaptionByLabel = new Map<string, string>()
    for (const tbl of tables) {
      if (!tbl || typeof tbl !== "object") continue
      const label = typeof tbl.label === "string" ? tbl.label : ""
      const caption = typeof tbl.caption === "string" ? tbl.caption : ""
      if (label) tableCaptionByLabel.set(label, caption)
    }

    for (const block of blocks) {
      if (!block || typeof block !== "object") continue
      if (block.type === "figure" && block.figure && typeof block.figure === "object") {
        const label = typeof block.figure.label === "string" ? block.figure.label : ""
        const caption = figCaptionByLabel.get(label)
        if (typeof caption === "string") block.figure.caption = caption
      }
      if (block.type === "table" && block.table && typeof block.table === "object") {
        const label = typeof block.table.label === "string" ? block.table.label : ""
        const caption = tableCaptionByLabel.get(label)
        if (typeof caption === "string") block.table.caption = caption
      }
    }
  }
}

const applyImageOrderToBlocks = (analysis: any) => {
  const order = Array.isArray(analysis?.image_order) ? analysis.image_order : []
  const assets = Array.isArray(analysis?.__assets_images) ? analysis.__assets_images : []
  if (order.length === 0 || assets.length === 0) return

  const idsByFilename = new Map<string, string[]>()
  for (const a of assets) {
    if (!a || typeof a !== "object") continue
    const imageId = typeof a.image_id === "string" ? a.image_id : ""
    const filename = typeof a.filename === "string" ? a.filename : ""
    if (!imageId || !filename) continue
    const list = idsByFilename.get(filename) || []
    list.push(imageId)
    idsByFilename.set(filename, list)
  }

  const figureBlocks: any[] = []
  const experiments = Array.isArray(analysis?.experiments) ? analysis.experiments : []
  for (const exp of experiments) {
    const blocks = Array.isArray(exp?.blocks) ? exp.blocks : []
    for (const b of blocks) {
      if (b && typeof b === "object" && b.type === "figure" && b.figure) figureBlocks.push(b)
    }
  }

  const n = Math.min(order.length, figureBlocks.length)
  for (let i = 0; i < n; i += 1) {
    const filename = order[i]
    const list = idsByFilename.get(filename) || []
    const imageId = list.shift()
    idsByFilename.set(filename, list)
    if (!imageId) continue
    const block = figureBlocks[i]
    if (block?.figure && typeof block.figure === "object") {
      block.figure.figure_image_id = imageId
    }
  }
}

const relabelBlocksInAnalysis = (analysis: any) => {
  const chapter = typeof analysis?.chapter === "number" ? analysis.chapter : Number(analysis?.chapter) || 4
  const experiments = Array.isArray(analysis?.experiments) ? analysis.experiments : []

  for (const exp of experiments) {
    const idx = typeof exp?.idx === "string" ? exp.idx : exp?.idx != null ? String(exp.idx) : ""
    const subidx = typeof exp?.subidx === "string" ? exp.subidx : exp?.subidx != null ? String(exp.subidx) : ""
    const parts = [String(chapter).trim(), idx.trim(), subidx.trim()].filter((p) => p)
    const path = parts.join(".")

    let figSeq = 1
    let tblSeq = 1
    const blocks = Array.isArray(exp?.blocks) ? exp.blocks : []
    for (const block of blocks) {
      if (!block || typeof block !== "object") continue
      if (block.type === "figure" && block.figure && typeof block.figure === "object") {
        block.figure.label = `図 ${path}.${figSeq}`
        figSeq += 1
      } else if (block.type === "table" && block.table && typeof block.table === "object") {
        block.table.label = `表 ${path}.${tblSeq}`
        tblSeq += 1
      }
    }

    exp.figures = blocks.filter((b: any) => b?.type === "figure").map((b: any) => b.figure)
    exp.tables = blocks.filter((b: any) => b?.type === "table").map((b: any) => b.table)
  }
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

  const form = new FormData()
  form.append("context_json", JSON.stringify(analysis))

  for (const imageId of neededImageIds) {
    const filename = filenameByImageId.get(imageId) || ""
    const storagePath = filename ? storagePathByFilename.get(filename) : undefined
    if (!storagePath) continue
    // eslint-disable-next-line no-await-in-loop
    const bytes = await downloadStorageBytes(storagePath)
    form.append("images", new Blob([Buffer.from(bytes)], { type: guessMimeType(filename) }), imageId)
  }

  const res = await agentFetch("/render", { method: "POST", body: form })
  const arrayBuffer = await res.arrayBuffer()
  const artifactBytes = Buffer.from(arrayBuffer)

  const artifactKey = await uploadDocxToStorage(userId, reportId, artifactBytes)
  await admin
    .from("reports")
    .update({ status: "completed", file_url: artifactKey, updated_at: new Date().toISOString() })
    .eq("id", reportId)
    .eq("user_id", userId)

  return { artifactKey }
}
