/**
 * Shared storage utilities for report generation routes.
 *
 * These helpers were previously duplicated across:
 *   - app/api/reports/generate/route.ts
 *   - app/api/reports/regenerate/from-cache/route.ts
 *   - app/api/reports/regenerate/from-json/route.ts
 */

import { Buffer } from "node:buffer"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { DocTemplateFigureImage } from "@/lib/docx/template-data"
import { logInfo } from "@/lib/server/logger"

export const BUCKET_NAME = "experiment-files"

const FIGURE_IMAGE_MAX_WIDTH = 520
const FIGURE_IMAGE_MAX_HEIGHT = 380
const FIGURE_IMAGE_DEFAULT_WIDTH = 480
const FIGURE_IMAGE_DEFAULT_HEIGHT = 320

export type ExperimentFileRecord = {
  file_name?: string | null
  file_type?: string | null
  file_url?: string | null
  uploaded_at?: string | null
}

export type RowsTable = { rows: string[][] }

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

export const sanitizeStoragePath = (value: string | null | undefined) =>
  (value || "").trim().replace(/^\/+/, "")

export const getUploadTimestamp = (value: string | null | undefined): number => {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

// ---------------------------------------------------------------------------
// Image sizing
// ---------------------------------------------------------------------------

export const fitFigureImageSize = (width?: number | null, height?: number | null) => {
  if (!width || !height) {
    return { width: FIGURE_IMAGE_DEFAULT_WIDTH, height: FIGURE_IMAGE_DEFAULT_HEIGHT }
  }
  const scale = Math.min(FIGURE_IMAGE_MAX_WIDTH / width, FIGURE_IMAGE_MAX_HEIGHT / height, 1)
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

// ---------------------------------------------------------------------------
// File downloaders
// ---------------------------------------------------------------------------

export const downloadFigureImages = async (
  admin: SupabaseClient,
  files: ExperimentFileRecord[],
  imageOrder?: string[]
): Promise<DocTemplateFigureImage[]> => {
  let images = files
    .filter((file) => file.file_type === "image")
    .sort((a, b) => getUploadTimestamp(a.uploaded_at) - getUploadTimestamp(b.uploaded_at))

  if (images.length === 0) return []

  if (imageOrder && imageOrder.length > 0) {
    const orderMap = new Map(imageOrder.map((name, index) => [name, index]))
    images = images.sort((a, b) => {
      const indexA = orderMap.get(a.file_name || "") ?? Number.MAX_SAFE_INTEGER
      const indexB = orderMap.get(b.file_name || "") ?? Number.MAX_SAFE_INTEGER
      return indexA - indexB
    })
  }

  const results: DocTemplateFigureImage[] = []
  for (const file of images) {
    const objectPath = sanitizeStoragePath(file.file_url)
    if (!objectPath) continue
    try {
      const { data, error } = await admin.storage.from(BUCKET_NAME).download(objectPath)
      if (error || !data) {
        logInfo("storage:figure-download-failed", { objectPath, error: error?.message })
        continue
      }
      const buffer = Buffer.from(await data.arrayBuffer())
      let size = fitFigureImageSize()
      try {
        const { default: sharp } = await import("sharp")
        const metadata = await sharp(buffer).metadata()
        size = fitFigureImageSize(metadata.width ?? undefined, metadata.height ?? undefined)
      } catch (metadataError) {
        logInfo("storage:figure-metadata-failed", {
          file: file.file_name,
          error: metadataError instanceof Error ? metadataError.message : metadataError,
        })
      }
      results.push({ buffer, width: size.width, height: size.height })
    } catch (error) {
      logInfo("storage:figure-processing-error", {
        file: file.file_name,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return results
}

export const downloadTableRows = async (
  admin: SupabaseClient,
  files: ExperimentFileRecord[]
): Promise<RowsTable[]> => {
  const tables = files
    .filter((file) => file.file_type === "excel")
    .sort((a, b) => getUploadTimestamp(a.uploaded_at) - getUploadTimestamp(b.uploaded_at))

  if (tables.length === 0) return []

  const results: RowsTable[] = []
  for (const file of tables) {
    const objectPath = sanitizeStoragePath(file.file_url)
    if (!objectPath) continue
    try {
      const { data, error } = await admin.storage.from(BUCKET_NAME).download(objectPath)
      if (error || !data) {
        logInfo("storage:table-download-failed", { objectPath, error: error?.message })
        continue
      }
      const json = JSON.parse(await data.text())
      if (json && Array.isArray(json.rows)) {
        results.push({ rows: json.rows })
      }
    } catch (tableError) {
      logInfo("storage:table-processing-error", {
        file: file.file_name,
        error: tableError instanceof Error ? tableError.message : String(tableError),
      })
    }
  }

  return results
}

// ---------------------------------------------------------------------------
// Data merging
// ---------------------------------------------------------------------------

export const applyTablesToDify = (source: unknown, tables: RowsTable[]): unknown => {
  if (!tables || tables.length === 0) return source
  try {
    const cloned =
      typeof source === "object" && source !== null ? JSON.parse(JSON.stringify(source)) : {}
    const root = cloned as Record<string, any>

    let experiments: any[] | null = null
    if (Array.isArray(root.experiments)) {
      experiments = root.experiments as any[]
    } else if (root.experiment && Array.isArray(root.experiment.experiments)) {
      experiments = root.experiment.experiments as any[]
    }
    if (!experiments) return source

    let cursor = 0
    experiments.forEach((exp: any, idx: number) => {
      if (cursor >= tables.length) return
      const chapter = typeof root.chapter === "number" ? root.chapter : idx + 1
      const expTables = Array.isArray(exp.tables) ? [...exp.tables] : []
      if (expTables.length > 0) {
        expTables[0] = { ...expTables[0], rows: tables[cursor].rows }
      } else {
        expTables.push({
          label: expTables[0]?.label ?? `表${chapter}.${idx + 1}`,
          caption: expTables[0]?.caption ?? "貼り付けテーブル",
          rows: tables[cursor].rows,
        })
      }
      exp.tables = expTables
      cursor += 1
    })

    return cloned
  } catch {
    return source
  }
}

// ---------------------------------------------------------------------------
// Admin Supabase client factory
// ---------------------------------------------------------------------------

export const createAdminSupabaseClient = (): SupabaseClient => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing Supabase service credentials")
  }
  return createAdminClient(supabaseUrl, serviceKey)
}
