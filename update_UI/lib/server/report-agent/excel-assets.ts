import { createHash } from "node:crypto"
import { execFile as execFileCb } from "node:child_process"
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import PizZip from "pizzip"
import * as XLSX from "xlsx"
import { createServiceClient } from "@/lib/supabase/server"
import { EXPERIMENT_BUCKET } from "./constants"
import { fileStem, guessMimeType, normalizeStoragePath, rowsToCsv, safeFilename, stripExcelMetaFromFilename, XLSX_EXTENSIONS } from "./file-utils"
import { downloadStorageBytes } from "./storage"
import type { ExperimentDataRow } from "./types"

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

export const extractTablesFromXlsxBytes = (params: { xlsxBytes: Buffer; workbookName: string; sheetName: string }) => {
  const { xlsxBytes, workbookName } = params
  const requestedSheet = (params.sheetName || "").trim()
  const maxTables = Number(process.env.EXCEL_TABLE_EXTRACT_MAX_TABLES || 8)

  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(xlsxBytes, { type: "buffer", cellText: true, cellDates: false })
  } catch {
    return { sheetName: requestedSheet || "", tables: [] as ExtractedTable[] }
  }
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

export const ensureExcelImagesExtracted = async (params: {
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
