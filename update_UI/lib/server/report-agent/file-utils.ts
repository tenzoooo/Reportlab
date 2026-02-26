import path from "node:path"
import type { ExperimentDataRow } from "./types"

const EXCEL_SHEET_META_MARKER = "::sheet="

export const XLSX_EXTENSIONS = new Set([".xlsx", ".xlsm", ".xltx", ".xltm"])

export const sortByUploadedAtAsc = (rows: ExperimentDataRow[]) => {
  return [...rows].sort((a, b) => {
    const ta = a.uploaded_at ? Date.parse(a.uploaded_at) : 0
    const tb = b.uploaded_at ? Date.parse(b.uploaded_at) : 0
    return ta - tb
  })
}

const isPdfUrlLike = (value: unknown) => {
  return typeof value === "string" ? value.toLowerCase().endsWith(".pdf") : false
}

const isDocUrlLike = (value: unknown) => {
  if (typeof value !== "string") return false
  const lower = value.toLowerCase()
  return lower.endsWith(".docx") || lower.endsWith(".doc")
}

export const pickPrimaryDocument = (rows: ExperimentDataRow[]) => {
  const ordered = sortByUploadedAtAsc(rows)
  const byTypePdf = ordered.find((f) => (f.file_type || "").toLowerCase() === "pdf" && f.file_url)
  if (byTypePdf) return byTypePdf
  const byPdfExt = ordered.find((f) => isPdfUrlLike(f.file_url) || isPdfUrlLike(f.file_name))
  if (byPdfExt) return byPdfExt
  const byDocExt = ordered.find((f) => isDocUrlLike(f.file_url) || isDocUrlLike(f.file_name))
  if (byDocExt) return byDocExt
  return null
}

export const normalizeStoragePath = (pathValue: string) => pathValue.replace(/^\/+/, "")

export const guessMimeType = (filename: string) => {
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

export const stripExcelMetaFromFilename = (filename: string) => {
  const raw = filename || ""
  const idx = raw.indexOf(EXCEL_SHEET_META_MARKER)
  return idx === -1 ? raw : raw.slice(0, idx)
}

export const parseExcelSheetNameFromFilename = (filename: string) => {
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

export const safeFilename = (name: string) => {
  const cleaned = (name || "")
    .replace(/[\/\\\0]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
  return cleaned || "file"
}

export const stripQueryFragment = (value: string) => {
  const raw = value || ""
  const noQuery = raw.split("?")[0]
  return noQuery.split("#")[0]
}

const extractExcelExtension = (value: string) => {
  const stripped = stripQueryFragment(value || "")
  const lower = stripped.toLowerCase()
  if (lower.endsWith(".xlsx")) return ".xlsx"
  if (lower.endsWith(".xlsm")) return ".xlsm"
  return ""
}

export const normalizeExcelFilename = (filename?: string | null, fileUrl?: string | null) => {
  const nameCandidate = stripQueryFragment(filename || "")
  const ext = extractExcelExtension(nameCandidate) || extractExcelExtension(fileUrl || "")
  if (!ext) return "workbook.xlsx"
  if (nameCandidate && extractExcelExtension(nameCandidate)) {
    return safeFilename(nameCandidate)
  }
  return `workbook${ext}`
}

export const fileStem = (filename: string) => {
  const base = path.basename(filename || "")
  const ext = path.extname(base)
  return ext ? base.slice(0, -ext.length) : base
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
