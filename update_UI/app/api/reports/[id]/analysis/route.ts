import { NextRequest, NextResponse } from "next/server"

import { logError, logRequest } from "@/lib/server/logger"
import { createClient, createServiceClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type ExperimentDataRow = {
  file_name: string | null
  file_type: string | null
  file_url: string | null
  uploaded_at: string | null
}

type ImageFile = {
  file_name: string
  file_url: string
  uploaded_at: string
}

const EXPERIMENT_BUCKET = "experiment-files"

const analysisStorageKey = (userId: string, reportId: string) => {
  return `${userId}/${reportId}/analysis/analysis.json`
}

const normalizeStoragePath = (value: string) => value.replace(/^\/+/, "")

const resolveStorageUrl = async (
  admin: ReturnType<typeof createServiceClient>,
  objectPath: string,
  downloadName?: string
) => {
  const normalized = normalizeStoragePath(objectPath)

  const { data, error } = await admin.storage
    .from(EXPERIMENT_BUCKET)
    .createSignedUrl(normalized, 60 * 60, downloadName ? { download: downloadName } : {})

  const signedUrl = data?.signedUrl
  const isTrulySigned = Boolean(signedUrl && (signedUrl.includes("/sign/") || signedUrl.includes("token=")))
  if (!error && isTrulySigned && signedUrl) return signedUrl

  const publicUrl = admin.storage.from(EXPERIMENT_BUCKET).getPublicUrl(normalized).data.publicUrl
  if (publicUrl) {
    if (downloadName) {
      const separator = publicUrl.includes("?") ? "&" : "?"
      return `${publicUrl}${separator}download=${encodeURIComponent(downloadName)}`
    }
    return publicUrl
  }

  throw error ?? new Error("署名付きURLの作成に失敗しました")
}

const getUserId = async (request: NextRequest) => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) return user.id

  const auth = request.headers.get("authorization") || ""
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : ""
  if (!token) return null

  const admin = createServiceClient()
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) return null
  return data.user.id
}

const buildDefaultAnalysis = (images: ImageFile[], tables: ExperimentDataRow[]) => {
  const figures = images.map((img, i) => ({
    label: `図 1-${i + 1}`,
    caption: "",
    figure_image: { file_name: img.file_name },
  }))
  const tableList = tables.map((t, i) => ({
    label: `表 1-${i + 1}`,
    caption: t.file_name || "",
  }))
  return {
    experiments: [
      {
        name: "実験",
        description_brief: "",
        figures,
        tables: tableList,
      },
    ],
    image_order: images.map((i) => i.file_name),
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: reportId } = await context.params
  logRequest(request, "reports:analysis:get", { reportId })

  const userId = await getUserId(request)
  if (!userId) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 })

  const admin = createServiceClient()
  const { data: report, error: reportError } = await admin
    .from("reports")
    .select("id, user_id")
    .eq("id", reportId)
    .maybeSingle()
  if (reportError) return NextResponse.json({ error: reportError.message }, { status: 500 })
  if (!report || report.user_id !== userId) return NextResponse.json({ error: "レポートが見つかりません" }, { status: 404 })

  const { data: files, error: filesError } = await admin
    .from("experiment_data")
    .select("file_name, file_type, file_url, uploaded_at")
    .eq("report_id", reportId)
  if (filesError) return NextResponse.json({ error: filesError.message }, { status: 500 })

  const rows = (files || []) as ExperimentDataRow[]
  const imagesRaw = rows
    .filter((r) => r.file_type === "image" && r.file_url)
    .map((r) => ({
      file_name: r.file_name || "image",
      file_url: r.file_url || "",
      uploaded_at: r.uploaded_at || new Date().toISOString(),
    }))

  const images: ImageFile[] = await Promise.all(
    imagesRaw.map(async (img) => ({
      ...img,
      file_url: await resolveStorageUrl(admin, img.file_url, img.file_name),
    }))
  )

  const tables = rows.filter((r) => r.file_type === "excel" && r.file_url)

  const key = analysisStorageKey(userId, reportId)

  try {
    const { data, error } = await admin.storage.from(EXPERIMENT_BUCKET).download(normalizeStoragePath(key))
    if (error || !data) throw new Error(error?.message || "Missing analysis")
    const text = await data.text()
    const parsed = JSON.parse(text)
    return NextResponse.json({ analysis: { dify_response: parsed }, images })
  } catch {
    const defaultAnalysis = buildDefaultAnalysis(images, tables)
    try {
      await admin.storage.from(EXPERIMENT_BUCKET).upload(normalizeStoragePath(key), JSON.stringify(defaultAnalysis, null, 2), {
        contentType: "application/json",
        upsert: true,
      })
    } catch (e) {
      logError("reports:analysis:get:save-default", e)
    }
    return NextResponse.json({ analysis: { dify_response: defaultAnalysis }, images })
  }
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: reportId } = await context.params
  logRequest(request, "reports:analysis:put", { reportId })

  const userId = await getUserId(request)
  if (!userId) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 })

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON の形式が正しくありません" }, { status: 400 })
  }

  const difyResponse = body?.dify_response
  if (!difyResponse) return NextResponse.json({ error: "dify_response is required" }, { status: 400 })

  const admin = createServiceClient()
  const { data: report } = await admin.from("reports").select("id, user_id").eq("id", reportId).maybeSingle()
  if (!report || report.user_id !== userId) return NextResponse.json({ error: "レポートが見つかりません" }, { status: 404 })

  const key = analysisStorageKey(userId, reportId)
  try {
    await admin.storage.from(EXPERIMENT_BUCKET).upload(normalizeStoragePath(key), JSON.stringify(difyResponse, null, 2), {
      contentType: "application/json",
      upsert: true,
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    logError("reports:analysis:put", error)
    return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 })
  }
}
