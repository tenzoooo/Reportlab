import type { NextRequest } from "next/server"

import { createClient, createServiceClient } from "@/lib/supabase/server"

type ServiceClient = ReturnType<typeof createServiceClient>

type ReportOwnership = {
  user_id: string | null
}

const ensureUserIdInSelect = (select: string) => {
  const columns = select
    .split(",")
    .map((column) => column.trim())
    .filter(Boolean)

  if (columns.includes("user_id")) return select
  return columns.length > 0 ? `${select}, user_id` : "user_id"
}

export const getUserIdFromRequest = async (request: NextRequest): Promise<string | null> => {
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

export const loadOwnedReport = async <T extends ReportOwnership>(params: {
  admin: ServiceClient
  reportId: string
  userId: string
  select: string
}): Promise<{ report: T | null; errorMessage: string | null }> => {
  const { admin, reportId, userId, select } = params

  const { data, error } = await admin
    .from("reports")
    .select(ensureUserIdInSelect(select))
    .eq("id", reportId)
    .maybeSingle()

  if (error) {
    return { report: null, errorMessage: error.message }
  }

  const report = (data ?? null) as T | null
  if (!report || report.user_id !== userId) {
    return { report: null, errorMessage: null }
  }

  return { report, errorMessage: null }
}
