import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import type { Database } from "@/lib/supabase/types"

type ReportRow = Database["public"]["Tables"]["reports"]["Row"]

const statusValues: ReportRow["status"][] = ["draft", "processing", "completed", "error"]

const createReportSchema = z.object({
  title: z
    .string()
    .min(1, "タイトルを入力してください。")
    .max(120, "タイトルは120文字以内で入力してください。"),
})

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(request.url)
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"))
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? "10")))
  const statusParam = url.searchParams.get("status") as ReportRow["status"] | null
  const searchParam = url.searchParams.get("q") ?? ""

  let countQuery = supabase
    .from("reports")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)

  let dataQuery = supabase
    .from("reports")
    .select("id, title, status, created_at, updated_at, file_url")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  if (statusParam && statusValues.includes(statusParam)) {
    countQuery = countQuery.eq("status", statusParam)
    dataQuery = dataQuery.eq("status", statusParam)
  }

  if (searchParam) {
    countQuery = countQuery.ilike("title", `%${searchParam}%`)
    dataQuery = dataQuery.ilike("title", `%${searchParam}%`)
  }

  const { count = 0, error: countError } = await countQuery

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 })
  }

  const start = (page - 1) * limit
  const end = start + limit - 1

  const { data: reports = [], error: reportsError } = await dataQuery.range(start, end)

  if (reportsError) {
    return NextResponse.json({ error: reportsError.message }, { status: 500 })
  }

  return NextResponse.json({
    reports,
    total: count,
    page,
    limit,
  })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const payload = await request.json().catch(() => null)

  const parsed = createReportSchema.safeParse(payload)
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "入力が正しくありません。"
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("reports")
    .insert([
      {
        title: parsed.data.title,
        user_id: user.id,
        status: "draft" as ReportRow["status"],
      },
    ])
    .select("id, title, status, created_at, updated_at, user_id")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(
    {
      report: data,
    },
    { status: 201 }
  )
}
