import { NextResponse, type NextRequest } from "next/server"
import { randomUUID } from "node:crypto"
import { Buffer } from "buffer"

import { createClient, createServiceClient } from "@/lib/supabase/server"
import { generateReport } from "@/lib/docx/generator"
import { MOCK_DIFY_OUTPUT } from "@/lib/mock/sample"
import { debugError, debugLog, isReportDebugEnabled } from "@/lib/utils/debug"

export const runtime = "nodejs"

const BUCKET_NAME = "experiment-files"

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const reportId = typeof body?.reportId === "string" ? body.reportId : undefined
  if (!reportId) {
    return NextResponse.json({ error: "Invalid reportId" }, { status: 400 })
  }

  const { data: report, error: reportError } = await supabase
    .from("reports")
    .select("id, title")
    .eq("id", reportId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (reportError) {
    return NextResponse.json({ error: reportError.message }, { status: 500 })
  }
  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 })
  }

  await supabase.from("reports").update({ status: "processing" }).eq("id", reportId)

  const adminSupabase = createServiceClient()

  try {
    debugLog("Mock: generating report using embedded sample", { reportId })

    const buffer = await generateReport({
      title: report.title,
      difyOutput: MOCK_DIFY_OUTPUT,
    })

    const storagePath = `${user.id}/${reportId}/generated-mock-${randomUUID()}.docx`

    const { error: uploadError } = await adminSupabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, Buffer.from(buffer), {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: true,
      })

    if (uploadError) {
      debugError("Mock: upload failed", uploadError)
      throw new Error(uploadError.message)
    }

    const { data: analysis, error: analysisInsertError } = await supabase
      .from("analysis_results")
      .insert([
        {
          report_id: reportId,
          dify_response: { output: { result_json: MOCK_DIFY_OUTPUT } },
          statistics: null,
          graphs: null,
        },
      ])
      .select("id")
      .single()

    if (analysisInsertError) {
      debugError("Mock: analysis insert failed", analysisInsertError)
      throw new Error(analysisInsertError.message)
    }

    await supabase
      .from("reports")
      .update({ status: "completed", file_url: storagePath })
      .eq("id", reportId)

    debugLog("Mock: report generation completed", { storagePath })

    return NextResponse.json({ success: true, fileUrl: storagePath, analysisId: analysis.id })
  } catch (error) {
    debugError("Mock: failed to generate report", error)
    await supabase.from("reports").update({ status: "error" }).eq("id", reportId)

    if (isReportDebugEnabled) {
      return NextResponse.json(
        {
          error: "Mock report generation failed",
          debug: {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          },
        },
        { status: 500 }
      )
    }

    return NextResponse.json({ error: "Mock report generation failed" }, { status: 500 })
  }
}

