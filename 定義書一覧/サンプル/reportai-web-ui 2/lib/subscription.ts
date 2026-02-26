import "server-only"

import { createClient } from "@/lib/supabase/server"

export interface SubscriptionStatus {
  plan_id: string
  status: string
  monthly_limit: number
  current_period_end: string | null
  executions_this_month: number
  remaining_executions: number
  credit_balance: number
  can_execute: boolean
}

export async function getSubscriptionStatus(): Promise<SubscriptionStatus | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  // サブスクリプション情報取得
  const { data: subscription } = await supabase.from("subscriptions").select("*").eq("user_id", user.id).single()

  // クレジット残高取得
  const { data: credits } = await supabase.from("credits").select("balance").eq("user_id", user.id).single()

  // 今月の実行回数取得
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const { count: executionsThisMonth } = await supabase
    .from("executions")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", startOfMonth.toISOString())
    .eq("status", "completed")

  const monthlyLimit = subscription?.monthly_limit || 1
  const creditBalance = credits?.balance || 0
  const executions = executionsThisMonth || 0
  const remaining = Math.max(0, monthlyLimit - executions)

  return {
    plan_id: subscription?.plan_id || "free",
    status: subscription?.status || "active",
    monthly_limit: monthlyLimit,
    current_period_end: subscription?.current_period_end || null,
    executions_this_month: executions,
    remaining_executions: remaining,
    credit_balance: creditBalance,
    can_execute: remaining > 0 || creditBalance > 0,
  }
}

export async function canExecuteWorkflow(): Promise<{ can_execute: boolean; reason?: string }> {
  const status = await getSubscriptionStatus()

  if (!status) {
    return { can_execute: false, reason: "認証が必要です" }
  }

  if (status.remaining_executions > 0) {
    return { can_execute: true }
  }

  if (status.credit_balance > 0) {
    return { can_execute: true }
  }

  return {
    can_execute: false,
    reason: "月間上限に達しました。クレジットを購入するか、次の更新日をお待ちください。",
  }
}

export async function useExecutionCredit(): Promise<{ success: boolean; used_credit: boolean }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, used_credit: false }
  }

  const status = await getSubscriptionStatus()
  if (!status) {
    return { success: false, used_credit: false }
  }

  // 月間上限内の場合
  if (status.remaining_executions > 0) {
    return { success: true, used_credit: false }
  }

  // クレジットを使用
  if (status.credit_balance > 0) {
    const { error } = await supabase
      .from("credits")
      .update({
        balance: status.credit_balance - 1,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)

    if (error) {
      console.error("[v0] クレジット減算エラー:", error)
      return { success: false, used_credit: false }
    }

    return { success: true, used_credit: true }
  }

  return { success: false, used_credit: false }
}
