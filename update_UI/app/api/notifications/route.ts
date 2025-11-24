import { NextRequest, NextResponse } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"

import { logError, logRequest } from "@/lib/server/logger"
import { createClient } from "@/lib/supabase/server"
import type { Database } from "@/legacy/lib/supabase/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const ensureAdminClient = () => {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase admin credentials are not configured")
  }
  return createAdminClient<Database>(supabaseUrl, serviceRoleKey)
}

const formatRelativeTime = (timestamp: string | null) => {
  if (!timestamp) return ""

  const now = Date.now()
  const value = new Date(timestamp).getTime()
  const diffMs = now - value
  if (Number.isNaN(diffMs) || diffMs < 0) {
    return new Date(timestamp).toLocaleString("ja-JP")
  }

  const minutes = Math.floor(diffMs / (1000 * 60))
  if (minutes < 1) return "たった今"
  if (minutes < 60) return `${minutes}分前`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}時間前`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}日前`

  const weeks = Math.floor(days / 7)
  if (weeks < 4) return `${weeks}週前`

  return new Date(timestamp).toLocaleDateString("ja-JP")
}

export async function GET(request: NextRequest) {
  logRequest(request, "notifications:list")

  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 })
  }

  const admin = ensureAdminClient()

  try {
    const { data, error } = await admin
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100)
    if (error) {
      throw error
    }

    const notifications = (data || []).map((notification) => ({
      id: notification.id,
      category: notification.category,
      title: notification.title,
      message: notification.message,
      link: notification.link ?? undefined,
      read: notification.read ?? false,
      createdAt: notification.created_at,
      time: formatRelativeTime(notification.created_at),
    }))

    return NextResponse.json({ notifications })
  } catch (error) {
    logError("notifications:list", error)
    return NextResponse.json({ error: "通知の取得に失敗しました" }, { status: 500 })
  }
}
