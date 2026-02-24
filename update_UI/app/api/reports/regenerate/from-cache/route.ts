import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { randomUUID } from "node:crypto"
import { createClient } from "@/lib/supabase/server"
import { generateReport } from "@/lib/docx/generator"
import { buildDocTemplateData } from "@/lib/docx/template-data"
import { logError, logInfo } from "@/lib/server/logger"
import { analyzeDocument } from "@/lib/analysis/service"
import {
  BUCKET_NAME,
  sanitizeStoragePath,
  downloadFigureImages,
  downloadTableRows,
  applyTablesToDify,
  createAdminSupabaseClient,
} from "@/lib/reports/storage"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const requestSchema = z.object({
  reportId: z.string().uuid(),
})

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

    let admin: ReturnType<typeof createAdminSupabaseClient>
    try {
      admin = createAdminSupabaseClient()
    } catch {
      logInfo("reports/regenerate-cache:missing-service-creds")
      await supabase.from("reports").update({ status: "error" }).eq("id", reportId)
      return NextResponse.json({ error: "Missing Supabase service credentials" }, { status: 500 })
    }

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

    let pdfBuffer: Buffer
    try {
      const { data, error } = await admin.storage.from(BUCKET_NAME).download(objectPath)
      if (error || !data) {
        logError("reports/regenerate-cache:pdf-download-failed", error, { objectPath })
        await supabase.from("reports").update({ status: "error" }).eq("id", reportId)
        return NextResponse.json({ error: error?.message || "Failed to download PDF" }, { status: 500 })
      }
      pdfBuffer = Buffer.from(await data.arrayBuffer())
    } catch (downloadError) {
      logError("reports/regenerate-cache:pdf-download-exception", downloadError)
      await supabase.from("reports").update({ status: "error" }).eq("id", reportId)
      return NextResponse.json({ error: "Failed to download PDF" }, { status: 500 })
    }

    logInfo("reports/regenerate-cache:start-analysis", { file: firstDoc.file_name })
    const analysisResult = await analyzeDocument(pdfBuffer)

    const { error: insertErr } = await supabase
      .from("analysis_results")
      .insert([{ report_id: reportId, dify_response: analysisResult }])
      .select("id")
      .single()

    if (insertErr) {
      logError("reports/regenerate-cache:insert-analysis-failed", insertErr)
    }

    const difyWithTables = applyTablesToDify(analysisResult, tableRows)

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

    await supabase
      .from("reports")
      .update({ status: "completed", file_url: storagePath })
      .eq("id", reportId)

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
      { status: 500 }
    )
  }
}
