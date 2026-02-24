import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { randomUUID } from "node:crypto"
import { createClient } from "@/lib/supabase/server"
import { generateReport } from "@/lib/docx/generator"
import { buildDocTemplateData } from "@/lib/docx/template-data"
import { logError, logInfo } from "@/lib/server/logger"
import {
  BUCKET_NAME,
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

const extractResultJson = (response: any): unknown => {
  if (!response || typeof response !== "object") return undefined
  if (Object.prototype.hasOwnProperty.call(response, "result_json")) {
    return (response as any).result_json
  }
  if (response.output && typeof response.output === "object") {
    const maybe = (response.output as any).result_json
    if (maybe !== undefined) return maybe
  }
  if (response.outputs && typeof response.outputs === "object") {
    const maybe = (response.outputs as any).result_json
    if (maybe !== undefined) return maybe
  }
  if (response.data && typeof response.data === "object") {
    const data = response.data as any
    if (data.output && typeof data.output === "object") {
      const maybe = (data.output as any).result_json
      if (maybe !== undefined) return maybe
    }
    if (data.outputs && typeof data.outputs === "object") {
      const maybe = (data.outputs as any).result_json
      if (maybe !== undefined) return maybe
    }
  }
  return undefined
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    logInfo("reports/regenerate-json:unauthorized")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    logInfo("reports/regenerate-json:bad-request", { body: await req.text().catch(() => undefined) })
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
      logError("reports/regenerate-json:report-error", reportError)
      return NextResponse.json({ error: reportError.message }, { status: 500 })
    }
    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 })
    }

    await supabase.from("reports").update({ status: "processing" }).eq("id", reportId)

    const { data: analysisResult, error: analysisError } = await supabase
      .from("analysis_results")
      .select("dify_response")
      .eq("report_id", reportId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (analysisError) {
      logError("reports/regenerate-json:analysis-error", analysisError)
      await supabase.from("reports").update({ status: "error" }).eq("id", reportId)
      return NextResponse.json({ error: analysisError.message }, { status: 500 })
    }

    if (!analysisResult || !analysisResult.dify_response) {
      logInfo("reports/regenerate-json:no-analysis-found", { reportId })
      await supabase.from("reports").update({ status: "error" }).eq("id", reportId)
      return NextResponse.json(
        { error: "No previous analysis data found. Please regenerate with AI first." },
        { status: 404 }
      )
    }

    const { data: experimentFiles, error: filesError } = await supabase
      .from("experiment_data")
      .select("file_name, file_type, file_url, uploaded_at")
      .eq("report_id", reportId)

    if (filesError) {
      logError("reports/regenerate-json:files-error", filesError)
      await supabase.from("reports").update({ status: "error" }).eq("id", reportId)
      return NextResponse.json({ error: filesError.message }, { status: 500 })
    }

    let admin: ReturnType<typeof createAdminSupabaseClient>
    try {
      admin = createAdminSupabaseClient()
    } catch {
      logInfo("reports/regenerate-json:missing-service-creds")
      await supabase.from("reports").update({ status: "error" }).eq("id", reportId)
      return NextResponse.json({ error: "Missing Supabase service credentials" }, { status: 500 })
    }

    const docs = (experimentFiles ?? []).filter(
      (f) => f.file_type === "word" || /\.pdf$/i.test(f.file_name || "")
    )

    if (docs.length === 0) {
      logInfo("reports/regenerate-json:no-docs", { count: experimentFiles?.length || 0 })
      await supabase.from("reports").update({ status: "error" }).eq("id", reportId)
      return NextResponse.json({ error: "No document (PDF) found for the report" }, { status: 400 })
    }

    let difyOutput: unknown = extractResultJson(analysisResult.dify_response)
    if (typeof difyOutput === "string") {
      try {
        difyOutput = JSON.parse(difyOutput)
      } catch {
        // keep as string
      }
    }

    const imageOrder = (difyOutput as any)?.image_order as string[] | undefined
    const figureImages = await downloadFigureImages(admin, experimentFiles ?? [], imageOrder)
    const tableRows = await downloadTableRows(admin, experimentFiles ?? [])

    const firstDoc = docs[0]
    const difyWithTables = applyTablesToDify(difyOutput, tableRows)

    try {
      buildDocTemplateData(difyWithTables)
    } catch (normalizeError) {
      logError("reports/regenerate-json:template-data-failed", normalizeError)
      throw new Error("Failed to normalize Dify result_json for DOCX template")
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
      logError("reports/regenerate-json:upload-docx-failed", uploadError, { storagePath })
      throw new Error(uploadError.message)
    }

    await supabase
      .from("reports")
      .update({ status: "completed", file_url: storagePath })
      .eq("id", reportId)

    logInfo("reports/regenerate-json:success", { reportId, fileUrl: storagePath })
    return NextResponse.json({ success: true, fileUrl: storagePath })
  } catch (error) {
    logError("reports/regenerate-json:exception", error)
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
