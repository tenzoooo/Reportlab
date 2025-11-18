import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { randomUUID } from "crypto"
import { Buffer } from "buffer"
import sharp from "sharp"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import type { Json } from "@/lib/supabase/types"
import { getDifyClient } from "@/lib/dify/client"
import { generateReport } from "@/lib/docx/generator"
import type { DocTemplateFigureImage } from "@/lib/docx/template-data"
import { debugError, debugLog, debugWarn, isReportDebugEnabled } from "@/lib/utils/debug"

const requestSchema = z.object({
  reportId: z.string().uuid(),
})

const BUCKET_NAME = "experiment-files"
const FIGURE_IMAGE_MAX_WIDTH = 520
const FIGURE_IMAGE_MAX_HEIGHT = 380
const FIGURE_IMAGE_DEFAULT_WIDTH = 480
const FIGURE_IMAGE_DEFAULT_HEIGHT = 320

const extractResultJson = (response: unknown): unknown => {
  if (!response || typeof response !== "object") return undefined
  const record = response as Record<string, unknown>

  if (record.output && typeof record.output === "object") {
    const maybe = (record.output as Record<string, unknown>).result_json
    if (maybe !== undefined) return maybe
  }

  if (record.outputs && typeof record.outputs === "object") {
    const maybe = (record.outputs as Record<string, unknown>).result_json
    if (maybe !== undefined) return maybe
  }

  if (record.data && typeof record.data === "object") {
    const data = record.data as Record<string, unknown>
    if (data.output && typeof data.output === "object") {
      const maybe = (data.output as Record<string, unknown>).result_json
      if (maybe !== undefined) return maybe
    }
    if (data.outputs && typeof data.outputs === "object") {
      const maybe = (data.outputs as Record<string, unknown>).result_json
      if (maybe !== undefined) return maybe
    }
  }

  return undefined
}

type ExperimentFileRecord = {
  file_name: string
  file_type: string
  file_url: string
  uploaded_at: string | null
}

const getUploadTimestamp = (value: string | null | undefined): number => {
  if (!value) return 0
  const time = Date.parse(value)
  return Number.isNaN(time) ? 0 : time
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
  adminSupabase: ReturnType<typeof createServiceClient>,
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
    try {
      const { data, error } = await adminSupabase.storage.from(BUCKET_NAME).download(file.file_url)
      if (error || !data) {
        debugWarn("Skipping figure image due to download failure", {
          path: file.file_url,
          error: error?.message,
        })
        continue
      }

      const arrayBuffer = await data.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      let size = fitFigureImageSize()

      try {
        const metadata = await sharp(buffer).metadata()
        size = fitFigureImageSize(metadata.width ?? undefined, metadata.height ?? undefined)
      } catch (metadataError) {
        debugWarn("Failed to read figure image metadata, using fallback size", {
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
      debugWarn("Unexpected figure image processing error", {
        file: file.file_name,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return results
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = requestSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const { reportId } = parsed.data
  debugLog("Report generation request received", { reportId, userId: user.id })

  const { data: report, error: reportError } = await supabase
    .from("reports")
    .select("id, title, status")
    .eq("id", reportId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (reportError) {
    return NextResponse.json({ error: reportError.message }, { status: 500 })
  }

  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 })
  }

  await supabase
    .from("reports")
    .update({ status: "processing" })
    .eq("id", reportId)

  const { data: experimentFiles, error: experimentError } = await supabase
    .from("experiment_data")
    .select("file_name, file_type, file_url, uploaded_at")
    .eq("report_id", reportId)

  if (experimentError) {
    debugError("Failed to fetch experiment files", experimentError)
    await supabase.from("reports").update({ status: "error" }).eq("id", reportId)
    return NextResponse.json({ error: experimentError.message }, { status: 500 })
  }

  const adminSupabase = createServiceClient()

  try {
    const figureImages = await downloadFigureImages(adminSupabase, experimentFiles ?? [])

    // Dify には PDF のリモートURLを渡す。
    // 互換のため、既存の file_type === "word"（PDF を document 扱いで保存しているケース）も許容しつつ、
    // 拡張子が .pdf のファイルを優先的に選別する。
    const documentFiles = (experimentFiles ?? []).filter(
      (file) => file.file_type === "word" || /\.pdf$/i.test(file.file_name || "")
    )
    debugLog("Document files selected for Dify payload", {
      totalFiles: experimentFiles?.length ?? 0,
      documentCount: documentFiles.length,
      documents: documentFiles,
    })

    if (documentFiles.length === 0) {
      throw new Error("No document files available for Dify workflow.")
    }

    const signedDocuments = (
      await Promise.all(
        documentFiles.map(async (file) => {
          const objectPath = file.file_url.trim().replace(/^\/+/, "")

          const { data: signedData, error: signedError } = await adminSupabase.storage
            .from(BUCKET_NAME)
            .createSignedUrl(objectPath, 60 * 60, { download: file.file_name })

          let accessibleUrl = signedData?.signedUrl
          const looksSigned =
            accessibleUrl && (accessibleUrl.includes("/sign/") || accessibleUrl.includes("token=")) ? true : false

          if ((!looksSigned || !accessibleUrl) && !signedError) {
            const { data: publicData } = adminSupabase.storage.from(BUCKET_NAME).getPublicUrl(objectPath)
            if (publicData?.publicUrl) {
              accessibleUrl = publicData.publicUrl
            }
          }

          if (signedError || !accessibleUrl) {
            const reason = signedError?.message ?? "Unknown storage error"
            const normalizedReason = reason.toLowerCase()
            debugWarn("Skipping document due to signed/public URL failure", {
              path: objectPath,
              error: reason,
            })

            if (normalizedReason.includes("not found")) {
              return null
            }

            throw new Error(
              signedError?.message ?? `Failed to create signed/public URL for experiment file: ${file.file_url}`
            )
          }

          debugLog("Signed/public URL created successfully", { path: objectPath, fileName: file.file_name })

          return {
            type: "document" as const,
            transfer_method: "remote_url" as const,
            name: file.file_name,
            url: accessibleUrl,
          }
        })
      )
    ).filter(
      (item): item is { type: "document"; transfer_method: "remote_url"; name: string; url: string } => item !== null
    )

    debugLog("Accessible signed documents", {
      signedCount: signedDocuments.length,
      documents: signedDocuments.map((doc) => ({ name: doc.name, url: doc.url })),
    })

    if (signedDocuments.length === 0) {
      throw new Error("No accessible document files available for Dify workflow.")
    }

    // Build inputs for Dify. The workflow expects a single required document `pdf_manual` (PDF URL).
    const difyInputs: Record<string, unknown> = {
      report_title: report.title,
    }
    // Choose the first document if multiple are present and warn in debug logs.
    const selectedDoc = signedDocuments[0]
    if (signedDocuments.length > 1) {
      debugWarn("Multiple documents found; using the first for pdf_manual", {
        used: { name: selectedDoc.name },
        discarded: signedDocuments.slice(1).map((d) => d.name),
      })
    }
    difyInputs.pdf_manual = selectedDoc

    debugLog("Invoking Dify workflow", {
      inputs: difyInputs,
      userId: user.id,
    })

    const difyResponse = await getDifyClient().runWorkflow(difyInputs, { userId: user.id })

    debugLog("Dify workflow response received", {
      id: difyResponse.id,
      status: difyResponse.status,
      hasOutput: Boolean(difyResponse.output),
      outputKeys: difyResponse.output ? Object.keys(difyResponse.output) : [],
    })

    const rawResult = extractResultJson(difyResponse)

    let parsedResult: unknown = {}

    if (typeof rawResult === "string") {
      try {
        parsedResult = JSON.parse(rawResult)
      } catch (parseError) {
        debugError("Failed to parse result_json", parseError)
      }
    } else if (rawResult && typeof rawResult === "object") {
      parsedResult = rawResult
    }

    debugLog("Parsed Dify result", parsedResult)

    const { data: analysis, error: analysisInsertError } = await supabase
      .from("analysis_results")
      .insert([
        {
          report_id: reportId,
          dify_response: difyResponse as unknown as Json,
          statistics: (difyResponse.output?.statistics ?? null) as Json | null,
          graphs: (difyResponse.output?.graphs ?? null) as Json | null,
        },
      ])
      .select("id")
      .single()

    if (analysisInsertError) {
      debugError("Failed to insert analysis result", analysisInsertError)
      throw new Error(analysisInsertError.message)
    }

    const buffer = await generateReport({
      title: report.title,
      difyOutput: parsedResult,
      figureImages,
    })

    debugLog("DOCX report generated", { bufferLength: buffer.byteLength })

    const storagePath = `${user.id}/${reportId}/generated-${randomUUID()}.docx`

    const { error: uploadError } = await adminSupabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, Buffer.from(buffer), {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: true,
      })

    if (uploadError) {
      debugError("Failed to upload generated report", uploadError)
      throw new Error(uploadError.message)
    }

    await supabase
      .from("reports")
      .update({
        status: "completed",
        file_url: storagePath,
      })
      .eq("id", reportId)

    debugLog("Report generation completed", { storagePath })

    return NextResponse.json({
      success: true,
      fileUrl: storagePath,
      analysisId: analysis.id,
    })
  } catch (error) {
    debugError("Failed to generate report", error)

    await supabase
      .from("reports")
      .update({
        status: "error",
      })
      .eq("id", reportId)

    if (isReportDebugEnabled) {
      return NextResponse.json(
        {
          error: "Report generation failed",
          debug: {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          },
        },
        { status: 500 }
      )
    }

    return NextResponse.json({ error: "Report generation failed" }, { status: 500 })
  }
}
