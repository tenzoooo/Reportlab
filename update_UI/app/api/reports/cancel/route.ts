import { NextRequest, NextResponse } from "next/server"

import { logError, logRequest } from "@/lib/server/logger"
import { createClient, createServiceClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Body = { reportId?: string }

export async function POST(request: NextRequest) {
  logRequest(request, "reports:cancel")

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: "JSON の形式が正しくありません" }, { status: 400 })
  }

  const reportId = typeof body.reportId === "string" ? body.reportId : ""
  if (!reportId) {
    return NextResponse.json({ error: "reportId is required" }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 })
  }

  const admin = createServiceClient()
  try {
    await admin
      .from("reports")
      .update({ status: "draft", updated_at: new Date().toISOString() })
      .eq("id", reportId)
      .eq("user_id", user.id)
    return NextResponse.json({ success: true })
  } catch (error) {
    logError("reports:cancel", error)
    return NextResponse.json({ error: "キャンセルに失敗しました" }, { status: 500 })
  }
}

