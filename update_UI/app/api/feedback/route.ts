import { NextRequest, NextResponse } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"

import { logError, logRequest } from "@/lib/server/logger"
import { createClient } from "@/lib/supabase/server"
import type { Database } from "@/legacy/lib/supabase/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const CATEGORY_VALUES = ["新機能改善", "不具合", "その他"] as const

type CategoryValue = (typeof CATEGORY_VALUES)[number]

type FeedbackPayload = {
  name: string
  email: string
  status: CategoryValue
  feedback: string
  rating: number | null
  user_id: string
}

const ensureAdminClient = () => {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase admin credentials are not configured")
  }
  return createAdminClient<Database>(supabaseUrl, serviceRoleKey)
}

const isValidCategory = (value: unknown): value is CategoryValue =>
  typeof value === "string" && (CATEGORY_VALUES as readonly string[]).includes(value)

const normalizeRating = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null
  const num = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(num)) return null
  const rounded = Math.round(num)
  if (rounded < 1 || rounded > 5) return null
  return rounded
}

const normalizeString = (value: unknown) => (typeof value === "string" ? value.trim() : "")

export async function POST(request: NextRequest) {
  logRequest(request, "feedback:submit")

  let json: Record<string, unknown>
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON の形式が正しくありません" }, { status: 400 })
  }

  const name = normalizeString(json.name)
  const email = normalizeString(json.email)
  const feedback = normalizeString(json.feedback)
  const status = json.status
  const rating = normalizeRating(json.rating)

  if (!name || !email || !feedback || !isValidCategory(status)) {
    return NextResponse.json({ error: "必須項目が不足しています" }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 })
  }

  const payload: FeedbackPayload = {
    name,
    email,
    feedback,
    status,
    rating,
    user_id: user.id,
  }

  const admin = ensureAdminClient()

  try {
    const { error } = await admin.from("feedback").insert([payload])
    if (error) {
      throw error
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    logError("feedback:submit", error)
    return NextResponse.json({ error: "フィードバックの送信に失敗しました" }, { status: 500 })
  }
}
