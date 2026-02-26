import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CreditCard, Calendar, Download, ExternalLink } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import type { Subscription } from "@/lib/types"
import { cancelSubscription } from "@/app/actions/stripe"
import { SubscriptionStatus } from "@/components/subscription-status"
import Link from "next/link"

export default async function BillingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let subscription: Subscription | null = null

  if (user) {
    const { data: subData } = await supabase.from("subscriptions").select("*").eq("user_id", user.id).single()
    subscription = subData
  }

  // Mock invoice data
  const invoices = [
    {
      id: "inv_001",
      date: "2025-01-15",
      amount: 900,
      status: "paid",
      description: "ベーシックプラン - 1月",
    },
    {
      id: "inv_002",
      date: "2024-12-15",
      amount: 900,
      status: "paid",
      description: "ベーシックプラン - 12月",
    },
  ]

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <Header />

      {/* Organic blob shapes */}
      <div className="blob-pink w-[400px] h-[400px] top-0 left-0 -translate-x-1/4 -translate-y-1/4" />
      <div className="blob-purple w-[350px] h-[350px] bottom-0 right-0 translate-x-1/4 translate-y-1/4" />

      {/* Floating dots */}
      <div className="floating-dot bg-pink-400 top-1/4 right-1/4" style={{ animationDelay: "0s" }} />
      <div className="floating-dot bg-purple-600 top-1/3 left-1/4" style={{ animationDelay: "1s" }} />
      <div className="floating-dot bg-yellow-400 bottom-1/3 right-1/3" style={{ animationDelay: "2s" }} />

      <main className="container mx-auto px-4 py-12 relative z-10">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="text-center">
            <h1 className="text-5xl font-bold mb-4 text-balance">
              決済・
              <span className="relative inline-block">
                <span className="text-pink-600">請求</span>
                <svg
                  className="absolute -bottom-2 left-0 w-full"
                  height="12"
                  viewBox="0 0 200 12"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M2 10C50 2 150 2 198 10" stroke="hsl(330 81% 60%)" strokeWidth="4" strokeLinecap="round" />
                </svg>
              </span>
            </h1>
            <p className="text-xl text-muted-foreground">サブスクリプションと請求情報を管理</p>
          </div>

          {/* Current Subscription Status */}
          <SubscriptionStatus />

          {/* Current Subscription */}
          <Card className="rounded-3xl shadow-2xl border-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-2xl">現在のプラン</CardTitle>
                  <CardDescription className="text-base mt-2">
                    {subscription?.plan_id === "free" ? "Freeプラン" : "ベーシックプラン"}
                  </CardDescription>
                </div>
                <Badge
                  variant={subscription?.status === "active" ? "default" : "secondary"}
                  className="rounded-full px-4 py-2"
                >
                  {subscription?.status === "active" ? "有効" : "キャンセル済み"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">月額料金</p>
                  <p className="text-3xl font-bold">
                    ¥{subscription?.plan_id === "free" ? "0" : "900"}
                    <span className="text-base font-normal text-muted-foreground ml-2">/ 月</span>
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">月間上限</p>
                  <p className="text-3xl font-bold">{subscription?.monthly_limit}件</p>
                </div>
              </div>

              {subscription?.plan_id === "free" ? (
                <Button className="w-full rounded-xl py-6" size="lg" asChild>
                  <Link href="/pricing?checkout=basic">ベーシックプランにアップグレード</Link>
                </Button>
              ) : (
                <div className="flex gap-4">
                  <Button variant="outline" className="flex-1 rounded-xl py-6 bg-transparent" asChild>
                    <Link href="/pricing">プランを変更</Link>
                  </Button>
                  <form action={cancelSubscription}>
                    <Button type="submit" variant="destructive" className="flex-1 rounded-xl py-6">
                      サブスクリプションをキャンセル
                    </Button>
                  </form>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payment Method */}
          <Card className="rounded-3xl shadow-2xl border-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-2xl">支払い方法</CardTitle>
                <Button variant="outline" size="sm" className="rounded-xl bg-transparent">
                  変更
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {subscription?.plan_id === "free" ? (
                <p className="text-muted-foreground text-center py-8">支払い方法が登録されていません</p>
              ) : (
                <div className="flex items-center gap-4 p-4 bg-accent rounded-2xl">
                  <div className="w-12 h-12 bg-purple-600 rounded-xl flex items-center justify-center">
                    <CreditCard className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">•••• •••• •••• 4242</p>
                    <p className="text-sm text-muted-foreground">有効期限: 12/2027</p>
                  </div>
                  <Badge variant="secondary" className="rounded-full">
                    デフォルト
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Billing History */}
          <Card className="rounded-3xl shadow-2xl border-2">
            <CardHeader>
              <CardTitle className="text-2xl">請求履歴</CardTitle>
            </CardHeader>
            <CardContent>
              {subscription?.plan_id === "free" ? (
                <p className="text-muted-foreground text-center py-8">請求履歴がありません</p>
              ) : (
                <div className="space-y-3">
                  {invoices.map((invoice) => (
                    <div
                      key={invoice.id}
                      className="flex items-center justify-between p-4 border-2 rounded-2xl hover:bg-accent transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-pink-100 rounded-xl flex items-center justify-center">
                          <Calendar className="h-5 w-5 text-pink-600" />
                        </div>
                        <div>
                          <p className="font-medium">{invoice.description}</p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(invoice.date).toLocaleDateString("ja-JP")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="font-bold">¥{invoice.amount.toLocaleString()}</p>
                          <Badge variant="secondary" className="rounded-full">
                            {invoice.status === "paid" ? "支払い済み" : "未払い"}
                          </Badge>
                        </div>
                        <Button size="sm" variant="outline" className="rounded-xl bg-transparent">
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Stripe Portal Link */}
          <Card className="rounded-3xl shadow-2xl border-2 bg-gradient-to-br from-purple-50 to-pink-50">
            <CardHeader>
              <CardTitle className="text-2xl">Stripe カスタマーポータル</CardTitle>
              <CardDescription className="text-base">
                Stripeのカスタマーポータルで、支払い方法や請求書を管理できます
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full rounded-xl py-6 bg-transparent" size="lg">
                <ExternalLink className="h-5 w-5 mr-2" />
                Stripeポータルを開く
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
