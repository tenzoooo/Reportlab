import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { randomUUID } from "node:crypto"
import { Buffer } from "node:buffer"
import { createClient } from "@/lib/supabase/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { generateReport } from "@/lib/docx/generator"
import type { DocTemplateFigureImage } from "@/lib/docx/template-data"
import { buildDocTemplateData } from "@/lib/docx/template-data"
import { logError, logInfo } from "@/lib/server/logger"
import { ENABLE_IMAGE_GROUPING_WITH_METHOD_CONTEXT } from "@/lib/config/feature-flags"
import { analyzeImage } from "@/lib/caption-generation/image-service"

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
    admin: ReturnType<typeof createAdminClient>,
    files: ExperimentFileRecord[],
    imageOrder?: string[]
): Promise<DocTemplateFigureImage[]> => {
    const images = files
        .filter((file) => file.file_type === "image")
        .sort((a, b) => getUploadTimestamp(a.uploaded_at) - getUploadTimestamp(b.uploaded_at))

    if (images.length === 0) {
        return []
    }

    // Reorder images if imageOrder is provided
    let orderedImages = images
    if (imageOrder && imageOrder.length > 0) {
        const orderMap = new Map(imageOrder.map((name, index) => [name, index]))
        orderedImages = images.sort((a, b) => {
            const indexA = orderMap.get(a.file_name || "") ?? Number.MAX_SAFE_INTEGER
            const indexB = orderMap.get(b.file_name || "") ?? Number.MAX_SAFE_INTEGER
            return indexA - indexB
        })
    }

    const results: DocTemplateFigureImage[] = []
    for (const file of orderedImages) {
        const objectPath = sanitizeStoragePath(file.file_url)
        if (!objectPath) {
            continue
        }
        try {
            const { data, error } = await admin.storage.from(BUCKET_NAME).download(objectPath)
            if (error || !data) {
                logInfo("reports/regenerate-json:figure-download-failed", {
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
                logInfo("reports/regenerate-json:figure-metadata-failed", {
                    file: file.file_name,
                    error: metadataError instanceof Error ? metadataError.message : metadataError,
                })
            }
            results.push({
                buffer,
                width: size.width,
                height: size.height,
                file_name: file.file_name ?? undefined,
            })
        } catch (error) {
            logInfo("reports/regenerate-json:figure-processing-error", {
                file: file.file_name,
                error: error instanceof Error ? error.message : String(error),
            })
        }
    }

    return results
}

const downloadTableRows = async (
    admin: ReturnType<typeof createAdminClient>,
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
                logInfo("reports/regenerate-json:table-download-failed", { objectPath, error: error?.message })
                continue
            }
            const text = await data.text()
            const json = JSON.parse(text)
            if (json && Array.isArray(json.rows)) {
                results.push({ rows: json.rows })
            }
        } catch (tableError) {
            logInfo("reports/regenerate-json:table-processing-error", {
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

const getExperimentsFromDify = (source: unknown) => {
    const root = typeof source === "object" && source !== null ? (source as any) : {}
    const candidates =
        root.experiments ||
        root?.result_json?.experiments ||
        root?.output?.result_json?.experiments ||
        root?.outputs?.result_json?.experiments ||
        []

    if (!Array.isArray(candidates)) return []
    return candidates
        .map((exp) => ({
            idx: typeof exp?.idx === "number" ? exp.idx : Number(exp?.idx) || undefined,
            name: typeof exp?.name === "string" ? exp.name : "",
            description_brief: typeof exp?.description_brief === "string" ? exp.description_brief : "",
        }))
        .filter((exp) => Number.isFinite(exp.idx) && exp.name)
}

const getMethodTextFromDify = (source: unknown): string | undefined => {
    const root = typeof source === "object" && source !== null ? (source as any) : {}
    const candidates = [
        root?.method_text,
        root?.result_json?.method_text,
        root?.output?.result_json?.method_text,
        root?.outputs?.result_json?.method_text,
    ]
    return candidates.find((v) => typeof v === "string" && v.trim()) as string | undefined
}

const assignImagesToExperiments = async (
    images: DocTemplateFigureImage[],
    difyOutput: unknown,
    methodText: string | undefined
): Promise<DocTemplateFigureImage[]> => {
    if (!images.length) return images
    const experiments = getExperimentsFromDify(difyOutput)
    if (!experiments.length) return images

    const nameToIdx = (name: string) => {
        const lowered = name.toLowerCase()
        const found = experiments.find((exp) => exp.name.toLowerCase().includes(lowered))
        return found?.idx
    }

    const assigned: DocTemplateFigureImage[] = []
    for (const img of images) {
        const result = await analyzeImage(img.buffer, { methodText, experiments })
        const hint = result?.experiment_hint
        let targetIdx: number | undefined
        if (hint?.experiment_idx !== undefined && hint?.experiment_idx !== null) {
            targetIdx = hint.experiment_idx
        } else if (hint?.experiment_name) {
            targetIdx = nameToIdx(hint.experiment_name)
        }

        assigned.push({
            ...img,
            target_idx: targetIdx,
            confidence: hint?.confidence,
        })
    }
    return assigned
}

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
    if (ENABLE_IMAGE_GROUPING_WITH_METHOD_CONTEXT) {
        logInfo("reports/regenerate-json:feature-flag:image-grouping-method-context", { enabled: true })
    }
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

        // Fetch latest analysis result
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
            return NextResponse.json({ error: "No previous analysis data found. Please regenerate with AI first." }, { status: 404 })
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

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!supabaseUrl || !serviceKey) {
            logInfo("reports/regenerate-json:missing-service-creds")
            await supabase.from("reports").update({ status: "error" }).eq("id", reportId)
            return NextResponse.json({ error: "Missing Supabase service credentials" }, { status: 500 })
        }

        const admin = createAdminClient(supabaseUrl, serviceKey)
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
                // keep string
            }
        }

        const imageOrder = (difyOutput as any)?.image_order as string[] | undefined
        let figureImages = await downloadFigureImages(admin as any, experimentFiles ?? [], imageOrder)
        const tableRows = await downloadTableRows(admin as any, experimentFiles ?? [])

        const firstDoc = docs[0]

        const difyWithTables = applyTablesToDify(difyOutput, tableRows)

        if (ENABLE_IMAGE_GROUPING_WITH_METHOD_CONTEXT) {
            const methodText = getMethodTextFromDify(difyWithTables)
            try {
                figureImages = await assignImagesToExperiments(figureImages, difyWithTables, methodText)
            } catch (assignError) {
                logError("reports/regenerate-json:image-assignment-failed", assignError)
            }
        }

        // Validate template structure (optional preview)
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

        await supabase.from("reports").update({ status: "completed", file_url: storagePath }).eq("id", reportId)

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
            { status: 500 },
        )
    }
}
