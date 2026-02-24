import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { randomUUID } from "node:crypto"
import { writeFile, unlink } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import { execFile } from "node:child_process"
import { buildDocTemplateData, generateReport } from "@/lib/docx/generator"
import { logRequest, logInfo, logError } from "@/lib/server/logger"
import { analyzeDocument } from "@/lib/analysis/service"
import {
  BUCKET_NAME,
  sanitizeStoragePath,
  downloadFigureImages,
  downloadTableRows,
  applyTablesToDify,
  createAdminSupabaseClient,
} from "@/lib/reports/storage"

const execFileAsync = promisify(execFile)

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const REQUIRED_CREDITS = 100

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

const ENABLE_DIFY_DEBUG_LOG = process.env.ENABLE_DIFY_DEBUG_LOG === "true"

const requestSchema = z.object({
  reportId: z.string().uuid(),
  workflowType: z.enum(["conventional", "optimized", "past_report"]).optional(),
  referenceReportName: z.string().optional(),
  // Legacy support
  useOptimizedWorkflow: z.boolean().optional(),
})

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

const toPreviewString = (value: unknown, limit = 4000) => {
  try {
    const raw = typeof value === "string" ? value : JSON.stringify(value)
    return raw.length > limit ? `${raw.slice(0, limit)}…(truncated)` : raw
  } catch {
    return String(value)
  }
}

const logDifyDebug = (label: string, payload: unknown) => {
  if (!ENABLE_DIFY_DEBUG_LOG) return
  logInfo(label, { preview: toPreviewString(payload) })
}

export async function POST(req: NextRequest) {
  logRequest(req, "reports/generate:start")
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    logInfo("reports/generate:unauthorized")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    logInfo("reports/generate:bad-request", { body: await req.text().catch(() => undefined) })
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
    logError("reports/generate:report-error", reportError)
    return NextResponse.json({ error: reportError.message }, { status: 500 })
  }
  if (!report) {
    logInfo("reports/generate:not-found", { reportId })
    return NextResponse.json({ error: "Report not found" }, { status: 404 })
  }

  // Check and deduct credits
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("credits, plan")
    .eq("id", user.id)
    .single()

  if (profileError || !profile) {
    logError("reports/generate:profile-error", profileError)
    return NextResponse.json({ error: "Failed to fetch user profile" }, { status: 500 })
  }

  // Check plan restrictions
  if (workflowType !== "conventional" && profile.plan !== "premium" && profile.plan !== "standard") {
    logInfo("reports/generate:plan-restriction", { userId: user.id, plan: profile.plan, workflowType })
    return NextResponse.json(
      { error: "This workflow is available for Paid Plan (Standard/Premium) users only." },
      { status: 403 }
    )
  }

  if ((profile.credits ?? 0) < REQUIRED_CREDITS) {
    logInfo("reports/generate:insufficient-credits", { userId: user.id, credits: profile.credits })
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
    logError("reports/generate:credit-deduction-failed", updateError)
    return NextResponse.json({ error: "Failed to deduct credits" }, { status: 500 })
  }

  await supabase.from("reports").update({ status: "processing" }).eq("id", reportId)

  // Fetch experiment files
  const { data: experimentFiles, error: filesError } = await supabase
    .from("experiment_data")
    .select("file_name, file_type, file_url, uploaded_at")
    .eq("report_id", reportId)

  if (filesError) {
    logError("reports/generate:files-error", filesError)
    await supabase.from("reports").update({ status: "error" }).eq("id", reportId)
    return NextResponse.json({ error: filesError.message }, { status: 500 })
  }

  let admin: ReturnType<typeof createAdminSupabaseClient>
  try {
    admin = createAdminSupabaseClient()
  } catch {
    logInfo("reports/generate:missing-service-creds")
    await supabase.from("reports").update({ status: "error" }).eq("id", reportId)
    return NextResponse.json({ error: "Missing Supabase service credentials" }, { status: 500 })
  }

  const docs = (experimentFiles ?? []).filter(
    (f) => f.file_type === "word" || /\.pdf$/i.test(f.file_name || "")
  )

  if (docs.length === 0) {
    logInfo("reports/generate:no-docs", { count: experimentFiles?.length || 0 })
    await supabase.from("reports").update({ status: "error" }).eq("id", reportId)
    return NextResponse.json({ error: "No document (PDF) found for the report" }, { status: 400 })
  }

  const figureImages = await downloadFigureImages(admin, experimentFiles ?? [])
  const tableRows = await downloadTableRows(admin, experimentFiles ?? [])

  // Download the primary document (PDF or Word)
  const firstDoc = docs[0]
  const objectPath = sanitizeStoragePath(firstDoc.file_url)
  const ext = (firstDoc.file_name || "").toLowerCase().endsWith(".docx") ? ".docx" : ".pdf"

  let docBuffer: Buffer
  try {
    const { data, error } = await admin.storage.from(BUCKET_NAME).download(objectPath)
    if (error || !data) {
      logError("reports/generate:pdf-download-failed", error, { objectPath })
      await supabase.from("reports").update({ status: "error" }).eq("id", reportId)
      return NextResponse.json({ error: error?.message || "Failed to download PDF" }, { status: 500 })
    }
    const arrayBuffer = await data.arrayBuffer()
    docBuffer = Buffer.from(arrayBuffer)
  } catch (downloadError) {
    logError("reports/generate:pdf-download-exception", downloadError)
    await supabase.from("reports").update({ status: "error" }).eq("id", reportId)
    return NextResponse.json({ error: "Failed to download PDF" }, { status: 500 })
  }

  try {
    let analysisResult: any
    let structureHint: any = null

    // STEP 1: If past_report workflow, extract structure hint first
    if (workflowType === "past_report" && referenceReportName) {
      logInfo("reports/generate:extracting-hint", { referenceReportName })

      const referenceFile = (experimentFiles ?? []).find(
        (f) => f.file_name === referenceReportName && f.file_type === "word"
      )

      if (!referenceFile) {
        logError("reports/generate:reference-not-found", { referenceReportName })
        await supabase.from("reports").update({ status: "error" }).eq("id", reportId)
        return NextResponse.json(
          { error: `Reference report "${referenceReportName}" not found` },
          { status: 400 }
        )
      }

      const refObjectPath = sanitizeStoragePath(referenceFile.file_url)

      try {
        if (USE_REMOTE_PYTHON) {
          const { data: signedUrlData, error: signedUrlError } = await admin.storage
            .from(BUCKET_NAME)
            .createSignedUrl(refObjectPath, 60)

          if (signedUrlError || !signedUrlData) {
            throw new Error(signedUrlError?.message || "Failed to create signed URL for reference report")
          }

          structureHint = await callPythonApi("/api/past_report_workflow", {
            file_url: signedUrlData.signedUrl,
            filename: referenceFile.file_name || "reference.docx",
          })
        } else {
          const { data, error } = await admin.storage.from(BUCKET_NAME).download(refObjectPath)
          if (error || !data) {
            throw new Error(error?.message || "Failed to download reference report")
          }
          const refBuffer = Buffer.from(await data.arrayBuffer())

          const tempRefPath = path.join("/tmp", `reference-${randomUUID()}.docx`)
          await writeFile(tempRefPath, refBuffer)

          try {
            const scriptPath = path.join(process.cwd(), "lib/python/past_report_workflow.py")
            const { stdout, stderr } = await execFileAsync(PYTHON_BIN, [scriptPath, tempRefPath], {
              env: { ...process.env },
              maxBuffer: 1024 * 1024 * 5,
            })

            if (stderr) {
              logInfo("reports/generate:hint-extraction-stderr", { stderr })
            }

            structureHint = JSON.parse(stdout)
            if (structureHint.error) {
              throw new Error(structureHint.error)
            }
            logInfo("reports/generate:hint-extracted", { sections: structureHint.sections?.length })
          } finally {
            await unlink(tempRefPath).catch(() => {})
          }
        }
      } catch (hintError: any) {
        if (hintError && hintError.code === "ENOENT") {
          logError("reports/generate:python-not-found-hint", hintError, { pythonBin: PYTHON_BIN })
          structureHint = null
        } else {
          throw hintError
        }
      }
    }

    // STEP 2: Analyze the experiment document
    if (workflowType === "optimized" || workflowType === "past_report") {
      logInfo("reports/generate:start-optimized-analysis", { file: firstDoc.file_name, workflowType })

      try {
        if (USE_REMOTE_PYTHON) {
          const { data: signedUrlData, error: signedUrlError } = await admin.storage
            .from(BUCKET_NAME)
            .createSignedUrl(objectPath, 60)

          if (signedUrlError || !signedUrlData) {
            throw new Error(signedUrlError?.message || "Failed to create signed URL for experiment file")
          }

          analysisResult = await callPythonApi("/api/optimized_workflow", {
            file_url: signedUrlData.signedUrl,
            filename: firstDoc.file_name || `upload${ext}`,
          })
        } else {
          const tempDocPath = path.join("/tmp", `upload-${randomUUID()}${ext}`)
          await writeFile(tempDocPath, docBuffer)

          try {
            const scriptPath = path.join(process.cwd(), "lib/python/optimized_workflow.py")
            const { stdout, stderr } = await execFileAsync(PYTHON_BIN, [scriptPath, tempDocPath], {
              env: { ...process.env },
              maxBuffer: 1024 * 1024 * 10,
            })

            if (stderr) {
              logInfo("reports/generate:python-stderr", { stderr })
            }

            analysisResult = JSON.parse(stdout)
            if (analysisResult.error) {
              throw new Error(analysisResult.error)
            }
          } finally {
            await unlink(tempDocPath).catch(() => {})
          }
        }
      } catch (pythonError: any) {
        if (pythonError && pythonError.code === "ENOENT") {
          logError("reports/generate:python-not-found", pythonError, { pythonBin: PYTHON_BIN })
          logInfo("reports/generate:fallback-legacy-analysis", { file: firstDoc.file_name })
          analysisResult = await analyzeDocument(docBuffer)
        } else {
          throw pythonError
        }
      }
    } else {
      logInfo("reports/generate:start-analysis", { file: firstDoc.file_name })
      const isPremium = profile.plan === "premium"
      analysisResult = await analyzeDocument(docBuffer, isPremium)
    }

    // Save analysis result
    const { data: inserted, error: insertErr } = await supabase
      .from("analysis_results")
      .insert([{ report_id: reportId, dify_response: analysisResult }])
      .select("id")
      .single()

    if (insertErr) {
      logError("reports/generate:insert-analysis-failed", insertErr)
    }

    const difyWithTables = applyTablesToDify(analysisResult, tableRows)

    let templatePreview: unknown
    try {
      templatePreview = buildDocTemplateData(difyWithTables)
      logDifyDebug("reports/generate:template-data", templatePreview)
    } catch (normalizeError) {
      logError("reports/generate:template-data-failed", normalizeError)
      throw new Error("Failed to normalize Dify result_json for DOCX template")
    }

    // Fetch user profile for naming
    const { data: namingProfile } = await supabase
      .from("profiles")
      .select("grade, full_name")
      .eq("id", user.id)
      .single()

    const experimentName = (firstDoc.file_name || "report").replace(/\.[^/.]+$/, "")
    let reportTitle = experimentName

    if (namingProfile) {
      const studentId = namingProfile.grade || ""
      const name = namingProfile.full_name || ""
      if (studentId && name) {
        reportTitle = `${studentId}_${name}_${experimentName}`
      }
    }

    // Generate DOCX
    const buffer = await generateReport({ title: reportTitle, difyOutput: difyWithTables, figureImages })

    // Upload generated file
    const storagePath = `${user.id}/${reportId}/generated-${randomUUID()}.docx`
    const { error: uploadError } = await admin.storage
      .from(BUCKET_NAME)
      .upload(storagePath, buffer, {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: true,
      })
    if (uploadError) {
      logError("reports/generate:upload-docx-failed", uploadError, { storagePath })
      throw new Error(uploadError.message)
    }

    await supabase
      .from("reports")
      .update({ status: "completed", file_url: storagePath, title: reportTitle })
      .eq("id", reportId)

    logInfo("reports/generate:success", { reportId, fileUrl: storagePath, title: reportTitle })
    return NextResponse.json({ success: true, analysisId: inserted?.id, fileUrl: storagePath })
  } catch (error) {
    logError("reports/generate:exception", error)

    // Refund credits on failure
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
        logError("reports/generate:refund-failed", refundError)
      } else {
        logInfo("reports/generate:refunded", { userId: user.id, amount: REQUIRED_CREDITS })
      }
    }

    await supabase.from("reports").update({ status: "error" }).eq("id", reportId)
    return NextResponse.json(
      {
        error: "Failed to generate report",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
