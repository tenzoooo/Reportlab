import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import type { Database } from "@/lib/supabase/types"

const BUCKET_NAME = "experiment-files"

type ReportRow = Database["public"]["Tables"]["reports"]["Row"]

const reportIdParamSchema = z.object({
  id: z.string().uuid(),
})

const updateReportSchema = z
  .object({
    title: z
      .string()
      .min(1, "タイトルを入力してください。")
      .max(120, "タイトルは120文字以内で入力してください。")
      .optional(),
    status: z.enum(["draft", "processing", "completed", "error"]).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "更新する項目がありません。",
  })

const normalizeStoragePath = (value: string | null | undefined) => {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.replace(/^\/+/, "")
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const parseResult = reportIdParamSchema.safeParse({ id })

  if (!parseResult.success) {
    return NextResponse.json({ error: "Invalid report id" }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: report, error: reportError } = await supabase
    .from("reports")
    .select("id, title, status, file_url, template_data, created_at, updated_at")
    .eq("id", parseResult.data.id)
    .eq("user_id", user.id)
    .maybeSingle()

  if (reportError) {
    return NextResponse.json({ error: reportError.message }, { status: 500 })
  }

  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 })
  }

  const { data: experimentData = [], error: experimentError } = await supabase
    .from("experiment_data")
    .select("id, file_name, file_type, file_url, uploaded_at")
    .eq("report_id", report.id)
    .order("uploaded_at", { ascending: true })

  if (experimentError) {
    return NextResponse.json({ error: experimentError.message }, { status: 500 })
  }

  const { data: analysisResult, error: analysisError } = await supabase
    .from("analysis_results")
    .select("id, dify_response, statistics, graphs, created_at")
    .eq("report_id", report.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (analysisError) {
    return NextResponse.json({ error: analysisError.message }, { status: 500 })
  }

  return NextResponse.json({
    report,
    experimentData,
    analysisResult: analysisResult ?? null,
  })
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const parseResult = reportIdParamSchema.safeParse({ id })

  if (!parseResult.success) {
    return NextResponse.json({ error: "Invalid report id" }, { status: 400 })
  }

  const payload = await request.json().catch(() => null)
  const parsedBody = updateReportSchema.safeParse(payload ?? {})

  if (!parsedBody.success) {
    const message = parsedBody.error.issues[0]?.message ?? "Invalid request body"
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const updates: Partial<ReportRow> = {}
  if (parsedBody.data.title !== undefined) {
    updates.title = parsedBody.data.title
  }
  if (parsedBody.data.status !== undefined) {
    updates.status = parsedBody.data.status
  }

  const { data: updated, error } = await supabase
    .from("reports")
    .update(updates)
    .eq("id", parseResult.data.id)
    .eq("user_id", user.id)
    .select("id, title, status, file_url, template_data, created_at, updated_at")
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!updated) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 })
  }

  return NextResponse.json({ report: updated })
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const parseResult = reportIdParamSchema.safeParse({ id })

  if (!parseResult.success) {
    return NextResponse.json({ error: "Invalid report id" }, { status: 400 })
  }

  const supabase = await createClient()
  const adminSupabase = createServiceClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: report, error: reportError } = await supabase
    .from("reports")
    .select("id, file_url")
    .eq("id", parseResult.data.id)
    .eq("user_id", user.id)
    .maybeSingle()

  if (reportError) {
    return NextResponse.json({ error: reportError.message }, { status: 500 })
  }

  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 })
  }

  const { data: experimentFilesData, error: filesError } = await adminSupabase
    .from("experiment_data")
    .select("file_url")
    .eq("report_id", report.id)

  if (filesError) {
    return NextResponse.json({ error: filesError.message }, { status: 500 })
  }

  const experimentFiles = experimentFilesData ?? []

  const storagePaths = [
    ...experimentFiles
      .map((file) => normalizeStoragePath(file.file_url))
      .filter((path): path is string => Boolean(path)),
  ]

  const generatedPath = normalizeStoragePath(report.file_url)
  if (generatedPath) {
    storagePaths.push(generatedPath)
  }

  if (storagePaths.length > 0) {
    const { error: removeError } = await adminSupabase.storage.from(BUCKET_NAME).remove(storagePaths)
    if (removeError) {
      return NextResponse.json({ error: removeError.message }, { status: 500 })
    }
  }

  const { error: deleteError } = await adminSupabase
    .from("reports")
    .delete()
    .eq("id", report.id)
    .eq("user_id", user.id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
