import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { randomUUID } from "node:crypto"
import { Buffer } from "node:buffer"
import { createClient } from "@/lib/supabase/server"
import { createClient as createAdminClient, SupabaseClient } from "@supabase/supabase-js"
import { generateReport } from "@/lib/docx/generator"
import type { DocTemplateFigureImage } from "@/lib/docx/template-data"
import { buildDocTemplateData } from "@/lib/docx/template-data"
import { logError, logInfo } from "@/lib/server/logger"
import { analyzeDocument } from "@/lib/analysis/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const BUCKET_NAME = "experiment-files"
const FIGURE_IMAGE_MAX_WIDTH = 520
const FIGURE_IMAGE_MAX_HEIGHT = 380
const FIGURE_IMAGE_DEFAULT_WIDTH = 480
const FIGURE_IMAGE_DEFAULT_HEIGHT = 320

type ExperimentFileRecord = {
  file_name?: string | null
  file_type?: string | null
  file_url?: string | null
  uploaded_at?: string | null
}

type RowsTable = { rows: string[][] }

const requestSchema = z.object({
  reportId: z.string().uuid(),
})

const sanitizeStoragePath = (value: string | null | undefined) => (value || "").trim().replace(/^\/+/, "")

const getUploadTimestamp = (value: string | null | undefined) => {
  if (!value) {
    return 0
  }
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

const fitFigureImageSize = (width?: number | null, height?: number | null) => {
  if (!width || !height) {
    return {
      width: FIGURE_IMAGE_DEFAULT_WIDTH,
      height: FIGURE_IMAGE_DEFAULT_HEIGHT,
    }
  }

  const scale = Math.min(FIGURE_IMAGE_MAX_WIDTH / width, FIGURE_IMAGE_MAX_HEIGHT / height, 1)
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

const downloadFigureImages = async (
  admin: SupabaseClient,
  files: ExperimentFileRecord[]
): Promise<DocTemplateFigureImage[]> => {
  const images = files
    .filter((file) => file.file_type === "image")
    .sort((a, b) => getUploadTimestamp(a.uploaded_at) - getUploadTimestamp(b.uploaded_at))

  if (images.length === 0) {
    return []
  }

  const results: DocTemplateFigureImage[] = []
  for (const file of images) {
    const objectPath = sanitizeStoragePath(file.file_url)
    if (!objectPath) {
      continue
    }
    try {
      const { data, error } = await admin.storage.from(BUCKET_NAME).download(objectPath)
      if (error || !data) {
        logInfo("reports/regenerate-cache:figure-download-failed", {
          objectPath,
          error: error?.message,
        })
        continue
      }
      const arrayBuffer = await data.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      let size = fitFigureImageSize()
      try {
        const { default: sharp } = await import("sharp")
        const metadata = await sharp(buffer).metadata()
        size = fitFigureImageSize(metadata.width ?? undefined, metadata.height ?? undefined)
      } catch (metadataError) {
        logInfo("reports/regenerate-cache:figure-metadata-failed", {
          file: file.file_name,
          error: metadataError instanceof Error ? metadataError.message : metadataError,
        })
      }
      results.push({
        buffer,
        width: size.width,
        height: size.height,
      })
    } catch (error) {
      logInfo("reports/regenerate-cache:figure-processing-error", {
        file: file.file_name,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return results
}

const downloadTableRows = async (
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
        logInfo("reports/regenerate-cache:table-download-failed", { objectPath, error: error?.message })
        continue
      }
      const text = await data.text()
      const json = JSON.parse(text)
      if (json && Array.isArray(json.rows)) {
        results.push({ rows: json.rows })
      }
    } catch (tableError) {
      logInfo("reports/regenerate-cache:table-processing-error", {
        file: file.file_name,
        error: tableError instanceof Error ? tableError.message : String(tableError),
      })
    }
  }

  return results
}

const applyTablesToDify = (source: unknown, tables: RowsTable[]): unknown => {
  if (!tables || tables.length === 0) return source
  try {
    const cloned = typeof source === "object" && source !== null ? JSON.parse(JSON.stringify(source)) : {}
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

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    logInfo("reports/regenerate-cache:unauthorized")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    logInfo("reports/regenerate-cache:bad-request", { body: await req.text().catch(() => undefined) })
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const { reportId } = parsed.data

  try {
    const { data: report, error: reportError } = await supabase
      .from("reports")
      .select("id, title, status, file_url")
      .eq("id", reportId)
      .eq("user_id", user.id)
      .maybeSingle()

    if (reportError) {
      logError("reports/regenerate-cache:report-error", reportError)
      return NextResponse.json({ error: reportError.message }, { status: 500 })
    }
    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 })
    }

    await supabase.from("reports").update({ status: "processing" }).eq("id", reportId)

    const { data: experimentFiles, error: filesError } = await supabase
      .from("experiment_data")
      .select("file_name, file_type, file_url, uploaded_at")
      .eq("report_id", reportId)

    if (filesError) {
      logError("reports/regenerate-cache:files-error", filesError)
      await supabase.from("reports").update({ status: "error" }).eq("id", reportId)
      return NextResponse.json({ error: filesError.message }, { status: 500 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceKey) {
      logInfo("reports/regenerate-cache:missing-service-creds")
      await supabase.from("reports").update({ status: "error" }).eq("id", reportId)
      return NextResponse.json({ error: "Missing Supabase service credentials" }, { status: 500 })
    }

    const admin = createAdminClient(supabaseUrl, serviceKey)
    const docs = (experimentFiles ?? []).filter(
      (f) => f.file_type === "word" || /\.pdf$/i.test(f.file_name || "")
    )

    if (docs.length === 0) {
      logInfo("reports/regenerate-cache:no-docs", { count: experimentFiles?.length || 0 })
      await supabase.from("reports").update({ status: "error" }).eq("id", reportId)
      return NextResponse.json({ error: "No document (PDF) found for the report" }, { status: 400 })
    }

    const figureImages = await downloadFigureImages(admin, experimentFiles ?? [])
    const tableRows = await downloadTableRows(admin, experimentFiles ?? [])

    const firstDoc = docs[0]
    const objectPath = sanitizeStoragePath(firstDoc.file_url || "")
    if (!objectPath) {
      logError("reports/regenerate-cache:missing-object-path", { fileUrl: firstDoc.file_url })
      await supabase.from("reports").update({ status: "error" }).eq("id", reportId)
      return NextResponse.json({ error: "Document path is missing" }, { status: 400 })
    }

    // Download PDF as Buffer for local analysis
    let pdfBuffer: Buffer
    try {
      const { data, error } = await admin.storage.from(BUCKET_NAME).download(objectPath)
      if (error || !data) {
        logError("reports/regenerate-cache:pdf-download-failed", error, { objectPath })
        await supabase.from("reports").update({ status: "error" }).eq("id", reportId)
        return NextResponse.json({ error: error?.message || "Failed to download PDF" }, { status: 500 })
      }
      const arrayBuffer = await data.arrayBuffer()
      pdfBuffer = Buffer.from(arrayBuffer)
    } catch (downloadError) {
      logError("reports/regenerate-cache:pdf-download-exception", downloadError)
      await supabase.from("reports").update({ status: "error" }).eq("id", reportId)
      return NextResponse.json({ error: "Failed to download PDF" }, { status: 500 })
    }

    // Analyze document locally
    logInfo("reports/regenerate-cache:start-analysis", { file: firstDoc.file_name })
    const analysisResult = await analyzeDocument(pdfBuffer)

    // Save analysis result
    const { error: insertErr } = await supabase
      .from("analysis_results")
      .insert([{ report_id: reportId, dify_response: analysisResult }])
      .select("id")
      .single()

    if (insertErr) {
      logError("reports/regenerate-cache:insert-analysis-failed", insertErr)
      // Continue even if save fails
    }

    const difyOutput = analysisResult
    const difyWithTables = applyTablesToDify(difyOutput, tableRows)

    // Validate template structure (optional preview)
    try {
      buildDocTemplateData(difyWithTables)
    } catch (normalizeError) {
      logError("reports/regenerate-cache:template-data-failed", normalizeError)
      throw new Error("Failed to normalize analysis result for DOCX template")
    }

    const buffer = await generateReport({
      title: firstDoc.file_name || "report",
      difyOutput: difyWithTables,
      figureImages,
    })

    const storagePath = `${user.id}/${reportId}/regenerated-${randomUUID()}.docx`
    const { error: uploadError } = await admin.storage
      .from(BUCKET_NAME)
      .upload(storagePath, buffer, {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: true,
      })
    if (uploadError) {
      logError("reports/regenerate-cache:upload-docx-failed", uploadError, { storagePath })
      throw new Error(uploadError.message)
    }

    await supabase.from("reports").update({ status: "completed", file_url: storagePath }).eq("id", reportId)

    logInfo("reports/regenerate-cache:success", { reportId, fileUrl: storagePath })
    return NextResponse.json({ success: true, fileUrl: storagePath })
  } catch (error) {
    logError("reports/regenerate-cache:exception", error)
    await supabase.from("reports").update({ status: "error" }).eq("id", reportId)
    return NextResponse.json(
      {
        error: "Failed to regenerate report",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
