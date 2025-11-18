import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import type { Json } from "@/lib/supabase/types"
import { getDifyClient } from "@/lib/dify/client"

const requestSchema = z.object({
  reportId: z.string().uuid(),
})

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const json = await request.json().catch(() => null)
  const parsed = requestSchema.safeParse(json)

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const { reportId } = parsed.data

  const { data: report, error: reportError } = await supabase
    .from("reports")
    .select("id, status")
    .eq("id", reportId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (reportError) {
    return NextResponse.json({ error: reportError.message }, { status: 500 })
  }

  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 })
  }

  const { data: experimentFiles, error: filesError } = await supabase
    .from("experiment_data")
    .select("file_name, file_type, file_url")
    .eq("report_id", reportId)

  if (filesError) {
    return NextResponse.json({ error: filesError.message }, { status: 500 })
  }

  try {
    const difyResponse = await getDifyClient().runWorkflow({
      experiment_data: experimentFiles ?? [],
    })

    const { data: inserted, error: insertError } = await supabase
      .from("analysis_results")
      .insert([
        {
          report_id: reportId,
          dify_response: difyResponse as unknown as Json,
        },
      ])
      .select("id")
      .single()

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    await supabase
      .from("reports")
      .update({
        status: "processing",
      })
      .eq("id", reportId)

    return NextResponse.json({
      success: true,
      analysisId: inserted.id,
    })
  } catch (error) {
    console.error("Failed to process Dify workflow:", error)

    await supabase
      .from("reports")
      .update({
        status: "error",
      })
      .eq("id", reportId)

    return NextResponse.json({ error: "Failed to run analysis" }, { status: 500 })
  }
}
