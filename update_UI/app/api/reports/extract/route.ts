import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { randomUUID } from "node:crypto"
import { Buffer } from "node:buffer"
import { logRequest, logInfo, logError } from "@/lib/server/logger"
import { analyzeDocument } from "@/lib/analysis/service"
import { execFile } from "node:child_process"
import { writeFile, unlink } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const BUCKET_NAME = "experiment-files"

type RowsTable = { rows: string[][] }

const requestSchema = z.object({
    reportId: z.string().uuid(),
    workflowType: z.enum(["conventional", "optimized", "past_report"]).optional(),
    referenceReportName: z.string().optional(),
    // Legacy support
    useOptimizedWorkflow: z.boolean().optional(),
})

type ExperimentFileRecord = {
    file_name?: string | null
    file_type?: string | null
    file_url?: string | null
    uploaded_at?: string | null
}

const sanitizeStoragePath = (value: string | null | undefined) => (value || "").trim().replace(/^\/+/, "")

const getUploadTimestamp = (value: string | null | undefined) => {
    if (!value) {
        return 0
    }
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? 0 : parsed
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
                logInfo("reports/extract:table-download-failed", { objectPath, error: error?.message })
                continue
            }
            const text = await data.text()
            const json = JSON.parse(text)
            if (json && Array.isArray(json.rows)) {
                results.push({ rows: json.rows })
            }
        } catch (tableError) {
            logInfo("reports/extract:table-processing-error", {
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

// Allow overriding the Python executable (for environments where `python3` is not available)
const PYTHON_BIN = process.env.PYTHON_BIN || "python3"
const USE_REMOTE_PYTHON = process.env.VERCEL === "1" || process.env.USE_REMOTE_PYTHON === "true"

const PROTECTION_BYPASS_TOKEN =
    process.env.VERCEL_PROTECTION_BYPASS_TOKEN ||
    process.env.VERCEL_DEPLOYMENT_PROTECTION_BYPASS_TOKEN ||
    process.env.VERCEL_BYPASS_TOKEN ||
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET

const getBaseUrl = () => {
    if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL.replace(/\/+$/, "")
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`.replace(/\/+$/, "")
    return "http://localhost:3000"
}

const callPythonApi = async <T>(pathname: string, payload: any): Promise<T> => {
    const baseUrl = getBaseUrl()
    const url = `${baseUrl}${pathname.startsWith("/") ? pathname : `/${pathname}`}`
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (PROTECTION_BYPASS_TOKEN) {
        headers["x-vercel-protection-bypass"] = PROTECTION_BYPASS_TOKEN
    }
    const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
    })
    if (!res.ok) {
        const errorText = await res.text()
        throw new Error(`Python function failed: ${res.status} ${res.statusText} - ${errorText}`)
    }
    return (await res.json()) as T
}

export async function POST(req: NextRequest) {
    logRequest(req, "reports/extract:start")
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        logInfo("reports/extract:unauthorized")
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json().catch(() => null)
    const parsed = requestSchema.safeParse(body)
    if (!parsed.success) {
        logInfo("reports/extract:bad-request", { body: await req.text().catch(() => undefined) })
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const { reportId, useOptimizedWorkflow, workflowType: rawWorkflowType, referenceReportName } = parsed.data

    // Normalize workflowType (support legacy useOptimizedWorkflow)
    const workflowType = rawWorkflowType || (useOptimizedWorkflow ? "optimized" : "conventional")

    // Verify report ownership
    const { data: report, error: reportError } = await supabase
        .from("reports")
        .select("id")
        .eq("id", reportId)
        .eq("user_id", user.id)
        .maybeSingle()

    if (reportError) {
        logError("reports/extract:report-error", reportError)
        return NextResponse.json({ error: reportError.message }, { status: 500 })
    }
    if (!report) {
        logInfo("reports/extract:not-found", { reportId })
        return NextResponse.json({ error: "Report not found" }, { status: 404 })
    }

    // Check and deduct credits
    const REQUIRED_CREDITS = 100
    const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("credits, plan, grade, full_name")
        .eq("id", user.id)
        .single()

    if (profileError || !profile) {
        logError("reports/extract:profile-error", profileError)
        return NextResponse.json({ error: "Failed to fetch user profile" }, { status: 500 })
    }

    // Check plan restrictions
    if (workflowType !== "conventional" && profile.plan !== "premium" && profile.plan !== "standard") {
        logInfo("reports/extract:plan-restriction", { userId: user.id, plan: profile.plan, workflowType })
        return NextResponse.json(
            { error: "This workflow is available for Paid Plan (Standard/Premium) users only." },
            { status: 403 }
        )
    }

    if ((profile.credits ?? 0) < REQUIRED_CREDITS) {
        logInfo("reports/extract:insufficient-credits", { userId: user.id, credits: profile.credits })
        return NextResponse.json(
            { error: `Insufficient credits. You need ${REQUIRED_CREDITS} credits to generate a report.` },
            { status: 402 }
        )
    }

    const { error: updateError } = await supabase
        .from("profiles")
        .update({ credits: (profile.credits ?? 0) - REQUIRED_CREDITS })
        .eq("id", user.id)

    if (updateError) {
        logError("reports/extract:credit-deduction-failed", updateError)
        return NextResponse.json({ error: "Failed to deduct credits" }, { status: 500 })
    }

    await supabase.from("reports").update({ status: "processing" }).eq("id", reportId)

    // Fetch experiment files
    const { data: experimentFiles, error: filesError } = await supabase
        .from("experiment_data")
        .select("file_name, file_type, file_url, uploaded_at")
        .eq("report_id", reportId)

    if (filesError) {
        logError("reports/extract:files-error", filesError)
        await supabase.from("reports").update({ status: "error" }).eq("id", reportId)
        return NextResponse.json({ error: filesError.message }, { status: 500 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceKey) {
        logInfo("reports/extract:missing-service-creds")
        await supabase.from("reports").update({ status: "error" }).eq("id", reportId)
        return NextResponse.json({ error: "Missing Supabase service credentials" }, { status: 500 })
    }

    const admin = createAdminClient(supabaseUrl, serviceKey)
    const docs = (experimentFiles ?? []).filter(
        (f) => f.file_type === "word" || /\.pdf$/i.test(f.file_name || "")
    )

    if (docs.length === 0) {
        logInfo("reports/extract:no-docs", { count: experimentFiles?.length || 0 })
        await supabase.from("reports").update({ status: "error" }).eq("id", reportId)
        return NextResponse.json({ error: "No document (PDF) found for the report" }, { status: 400 })
    }

    const tableRows = await downloadTableRows(admin as any, experimentFiles ?? [])

    // Download the primary document (PDF or Word)
    const firstDoc = docs[0]
    const objectPath = sanitizeStoragePath(firstDoc.file_url)
    const ext = (firstDoc.file_name || "").toLowerCase().endsWith(".docx") ? ".docx" : ".pdf"

    let docBuffer: Buffer
    try {
        const { data, error } = await admin.storage.from(BUCKET_NAME).download(objectPath)
        if (error || !data) {
            logError("reports/extract:pdf-download-failed", error, { objectPath })
            await supabase.from("reports").update({ status: "error" }).eq("id", reportId)
            return NextResponse.json({ error: error?.message || "Failed to download PDF" }, { status: 500 })
        }
        const arrayBuffer = await data.arrayBuffer()
        docBuffer = Buffer.from(arrayBuffer)
    } catch (downloadError) {
        logError("reports/extract:pdf-download-exception", downloadError)
        await supabase.from("reports").update({ status: "error" }).eq("id", reportId)
        return NextResponse.json({ error: "Failed to download PDF" }, { status: 500 })
    }

    try {
        let analysisResult: any
        let structureHint: any = null

        // STEP 1: If past_report workflow, extract structure hint first
        if (workflowType === "past_report" && referenceReportName) {
            logInfo("reports/extract:extracting-hint", { referenceReportName })

            // Find the reference DOCX file
            const referenceFile = (experimentFiles ?? []).find(
                (f) => f.file_name === referenceReportName && f.file_type === "word"
            )

            if (!referenceFile) {
                logError("reports/extract:reference-not-found", { referenceReportName })
                await supabase.from("reports").update({ status: "error" }).eq("id", reportId)
                return NextResponse.json(
                    { error: `Reference report "${referenceReportName}" not found` },
                    { status: 400 }
                )
            }

            const refObjectPath = sanitizeStoragePath(referenceFile.file_url)

            try {
                if (USE_REMOTE_PYTHON) {
                    // Generate signed URL for the reference file
                    const { data: signedUrlData, error: signedUrlError } = await admin.storage
                        .from(BUCKET_NAME)
                        .createSignedUrl(refObjectPath, 60) // 60 seconds validity

                    if (signedUrlError || !signedUrlData) {
                        throw new Error(signedUrlError?.message || "Failed to create signed URL for reference report")
                    }

                    structureHint = await callPythonApi("/api/past_report_workflow", {
                        file_url: signedUrlData.signedUrl,
                        filename: referenceFile.file_name || "reference.docx",
                    })
                } else {
                    // Local execution: Download and save to temp file
                    let refBuffer: Buffer
                    try {
                        const { data, error } = await admin.storage.from(BUCKET_NAME).download(refObjectPath)
                        if (error || !data) {
                            throw new Error(error?.message || "Failed to download reference report")
                        }
                        const arrayBuffer = await data.arrayBuffer()
                        refBuffer = Buffer.from(arrayBuffer)
                    } catch (downloadError) {
                        logError("reports/extract:reference-download-failed", downloadError)
                        await supabase.from("reports").update({ status: "error" }).eq("id", reportId)
                        return NextResponse.json({ error: "Failed to download reference report" }, { status: 500 })
                    }

                    const tempRefPath = path.join("/tmp", `reference-${randomUUID()}.docx`)
                    await writeFile(tempRefPath, refBuffer)

                    try {
                        const scriptPath = path.join(process.cwd(), "lib/python/past_report_workflow.py")
                        const { stdout, stderr } = await execFileAsync(PYTHON_BIN, [scriptPath, tempRefPath], {
                            env: { ...process.env },
                            maxBuffer: 1024 * 1024 * 5, // 5MB buffer
                        })

                        if (stderr) {
                            logInfo("reports/extract:hint-extraction-stderr", { stderr })
                        }

                        structureHint = JSON.parse(stdout)
                        if (structureHint.error) {
                            throw new Error(structureHint.error)
                        }
                        logInfo("reports/extract:hint-extracted", { sections: structureHint.sections?.length })
                    } finally {
                        await unlink(tempRefPath).catch(() => { })
                    }
                }
            } catch (hintError: any) {
                // If Python is missing in the environment, skip hint extraction instead of failing the whole flow
                if (hintError && hintError.code === "ENOENT") {
                    logError("reports/extract:python-not-found-hint", hintError, { pythonBin: PYTHON_BIN })
                    structureHint = null
                } else {
                    throw hintError
                }
            }
        }

        // STEP 2: Analyze the experiment PDF (using optimized or conventional workflow)
        if (workflowType === "optimized" || workflowType === "past_report") {
            logInfo("reports/extract:start-optimized-analysis", { file: firstDoc.file_name, workflowType })

            try {
                if (USE_REMOTE_PYTHON) {
                    // Generate signed URL for the experiment file
                    const { data: signedUrlData, error: signedUrlError } = await admin.storage
                        .from(BUCKET_NAME)
                        .createSignedUrl(objectPath, 60) // 60 seconds validity

                    if (signedUrlError || !signedUrlData) {
                        throw new Error(signedUrlError?.message || "Failed to create signed URL for experiment file")
                    }

                    analysisResult = await callPythonApi("/api/optimized_workflow", {
                        file_url: signedUrlData.signedUrl,
                        filename: firstDoc.file_name || `upload${ext}`,
                    })
                } else {
                    // Local execution: Save buffer to a temp file
                    const tempDocPath = path.join("/tmp", `upload-${randomUUID()}${ext}`)
                    await writeFile(tempDocPath, docBuffer)

                    try {
                        // Execute Python script
                        const scriptPath = path.join(process.cwd(), "lib/python/optimized_workflow.py")
                        const { stdout, stderr } = await execFileAsync(PYTHON_BIN, [scriptPath, tempDocPath], {
                            env: { ...process.env },
                            maxBuffer: 1024 * 1024 * 10, // 10MB buffer
                        })

                        if (stderr) {
                            logInfo("reports/extract:python-stderr", { stderr })
                        }

                        analysisResult = JSON.parse(stdout)
                        if (analysisResult.error) {
                            throw new Error(analysisResult.error)
                        }
                    } finally {
                        // Clean up temp file
                        await unlink(tempDocPath).catch(() => { })
                    }
                }
            } catch (pythonError: any) {
                // If Python is not available, fall back to legacy analysis
                if (pythonError && pythonError.code === "ENOENT") {
                    logError("reports/extract:python-not-found", pythonError, { pythonBin: PYTHON_BIN })
                    logInfo("reports/extract:fallback-legacy-analysis", { file: firstDoc.file_name })
                    analysisResult = await analyzeDocument(docBuffer)
                } else {
                    throw pythonError
                }
            }

        } else {
            // Analyze the document locally (Legacy/Default)
            logInfo("reports/extract:start-analysis", { file: firstDoc.file_name })
            analysisResult = await analyzeDocument(docBuffer)
        }

        // Apply tables to the analysis result
        const difyWithTables = applyTablesToDify(analysisResult, tableRows)

        // Save analysis result
        const { data: inserted, error: insertErr } = await supabase
            .from("analysis_results")
            .insert([{ report_id: reportId, dify_response: difyWithTables }])
            .select("id")
            .single()

        if (insertErr) {
            logError("reports/extract:insert-analysis-failed", insertErr)
            throw new Error("Failed to save analysis result")
        }

        // Update report status to 'draft' (or keep as 'processing' if we consider editing as part of processing, 
        // but 'draft' makes sense as it waits for user input. 
        // However, the existing flow uses 'processing' until 'completed'. 
        // Let's use 'processing' to indicate it's not done yet, or maybe introduce a new status 'editing'?
        // For now, let's keep it 'processing' or revert to 'draft' so it shows up in the list but maybe with a different indicator?
        // Actually, if we set it to 'draft', the user can see it in the list.
        // But we want to redirect to the editor.
        // Let's keep it as 'processing' or just don't change it from what it was set earlier.
        // But we need to indicate that extraction is done.
        // The frontend will redirect to /edit based on the success response.

        // Let's update the title if possible
        const experimentName = (firstDoc.file_name || "report").replace(/\.[^/.]+$/, "")
        let reportTitle = experimentName
        if (profile) {
            const studentId = profile.grade || ""
            const name = profile.full_name || ""
            if (studentId && name) {
                reportTitle = `${studentId}_${name}_${experimentName}`
            }
        }
        await supabase.from("reports").update({ title: reportTitle }).eq("id", reportId)

        logInfo("reports/extract:success", { reportId, analysisId: inserted.id })
        return NextResponse.json({ success: true, reportId, analysisId: inserted.id })

    } catch (error) {
        logError("reports/extract:exception", error)

        // Refund credits on failure
        const REQUIRED_CREDITS = 100
        const { data: currentProfile } = await supabase
            .from("profiles")
            .select("credits")
            .eq("id", user.id)
            .single()

        if (currentProfile) {
            const { error: refundError } = await supabase
                .from("profiles")
                .update({ credits: (currentProfile.credits ?? 0) + REQUIRED_CREDITS })
                .eq("id", user.id)

            if (refundError) {
                logError("reports/extract:refund-failed", refundError)
            } else {
                logInfo("reports/extract:refunded", { userId: user.id, amount: REQUIRED_CREDITS })
            }
        }

        await supabase.from("reports").update({ status: "error" }).eq("id", reportId)
        return NextResponse.json(
            {
                error: "Failed to extract report data",
                detail: error instanceof Error ? error.message : String(error),
            },
            { status: 500 },
        )
    }
}
