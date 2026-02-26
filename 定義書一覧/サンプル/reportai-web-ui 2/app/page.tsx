import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { FileText, Zap, Shield, Clock, CheckCircle2, XCircle, Loader2, Sparkles } from "lucide-react"
import type { Subscription, Credit, Execution } from "@/lib/types"
import { SubscriptionStatus } from "@/components/subscription-status"
import { CreditBalance } from "@/components/credit-balance"

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let subscription: Subscription | null = null
  let credit: Credit | null = null
  let recentExecutions: Execution[] = []
  let monthlyUsage = 0

  if (user) {
    const { data: subData } = await supabase.from("subscriptions").select("*").eq("user_id", user.id).single()
    subscription = subData

    const { data: creditData } = await supabase.from("credits").select("*").eq("user_id", user.id).single()
    credit = creditData

    const { data: execData } = await supabase
      .from("executions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5)
    recentExecutions = execData || []

    // 今月の使用回数を計算
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const { count } = await supabase
      .from("executions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("used_credit", false)
      .gte("created_at", startOfMonth.toISOString())

    monthlyUsage = count || 0
  }

  const statusIcons = {
    pending: <Clock className="h-4 w-4 text-yellow-600" />,
    processing: <Loader2 className="h-4 w-4 text-purple-600 animate-spin" />,
    completed: <CheckCircle2 className="h-4 w-4 text-green-500" />,
    failed: <XCircle className="h-4 w-4 text-red-600" />,
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <Header />

      <main className="container mx-auto px-4 py-12 relative z-10">
        {!user ? (
          <div className="max-w-6xl mx-auto">
            {/* Organic blob shapes */}
            <div className="blob-purple w-[500px] h-[500px] top-0 left-0 -translate-x-1/4 -translate-y-1/4" />
            <div className="blob-pink w-[400px] h-[400px] top-20 right-0 translate-x-1/4" />
            <div className="blob-yellow w-[350px] h-[350px] bottom-0 left-1/3" />

            {/* Floating dots */}
            <div className="floating-dot bg-purple-600 top-1/4 left-1/4" style={{ animationDelay: "0s" }} />
            <div className="floating-dot bg-pink-400 top-1/3 right-1/4" style={{ animationDelay: "1s" }} />
            <div className="floating-dot bg-yellow-400 bottom-1/3 left-1/2" style={{ animationDelay: "2s" }} />
            <div className="floating-dot bg-green-500 top-1/2 right-1/3" style={{ animationDelay: "1.5s" }} />

            {/* Hero section */}
            <div className="grid lg:grid-cols-2 gap-12 items-center relative">
              <div className="space-y-8 text-center lg:text-left">
                <div className="space-y-4">
                  <h1 className="text-6xl lg:text-7xl font-bold text-balance leading-tight">
                    レポート作成を
                    <br />
                    <span className="relative inline-block">
                      <span className="text-purple-600">もっと楽に</span>
                      <svg
                        className="absolute -bottom-2 left-0 w-full"
                        height="12"
                        viewBox="0 0 200 12"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M2 10C50 2 150 2 198 10"
                          stroke="hsl(239 84% 67%)"
                          strokeWidth="4"
                          strokeLinecap="round"
                        />
                      </svg>
                    </span>
                    <span className="text-purple-600">.</span>
                  </h1>
                  <p className="text-xl text-muted-foreground text-pretty max-w-xl mx-auto lg:mx-0">
                    PDFと図表画像から要約・OCR・定量コメントを自動生成。研究者の時間を節約し、創造的な研究に集中できます。
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
                  <Link href="/auth/signup">
                    <Button
                      size="lg"
                      className="text-lg px-8 py-6 rounded-2xl shadow-lg hover:shadow-xl transition-all"
                    >
                      <Sparkles className="h-5 w-5 mr-2" />
                      今すぐ体験
                    </Button>
                  </Link>
                  <Link href="/pricing">
                    <Button
                      size="lg"
                      variant="outline"
                      className="text-lg px-8 py-6 rounded-2xl bg-white hover:bg-gray-50 transition-all"
                    >
                      料金を見る
                    </Button>
                  </Link>
                </div>

                <div className="flex items-center justify-center lg:justify-start gap-6 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span>クレジットカード不要</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span>即座に開始</span>
                  </div>
                </div>
              </div>

              {/* 3D illustration placeholder */}
              <div className="relative hidden lg:block">
                <div className="relative w-full aspect-square">
                  {/* Main illustration placeholder */}
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-600 to-purple-800 rounded-[3rem] shadow-2xl transform rotate-3 hover:rotate-6 transition-transform duration-500">
                    <div className="absolute inset-8 bg-white rounded-[2rem] p-8 flex flex-col gap-4">
                      {/* Mock UI elements */}
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full bg-red-400" />
                        <div className="w-3 h-3 rounded-full bg-yellow-400" />
                        <div className="w-3 h-3 rounded-full bg-green-500" />
                      </div>
                      <div className="space-y-3">
                        <div className="h-4 bg-gray-200 rounded-full w-3/4" />
                        <div className="h-4 bg-gray-200 rounded-full w-1/2" />
                      </div>
                      <div className="flex-1 bg-purple-600 rounded-2xl p-6 flex items-center justify-center">
                        <FileText className="h-20 w-20 text-white" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="h-12 bg-pink-400 rounded-xl" />
                        <div className="h-12 bg-yellow-400 rounded-xl" />
                      </div>
                    </div>
                  </div>

                  {/* Floating card 1 */}
                  <div className="absolute -left-8 top-1/4 bg-white rounded-2xl shadow-xl p-4 transform -rotate-6 hover:rotate-0 transition-transform duration-300">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-green-500 rounded-xl flex items-center justify-center">
                        <CheckCircle2 className="h-6 w-6 text-white" />
                      </div>
                      <div className="space-y-1">
                        <div className="h-2 bg-gray-200 rounded-full w-16" />
                        <div className="h-2 bg-gray-200 rounded-full w-12" />
                      </div>
                    </div>
                  </div>

                  {/* Floating card 2 */}
                  <div className="absolute -right-8 bottom-1/4 bg-white rounded-2xl shadow-xl p-4 transform rotate-6 hover:rotate-0 transition-transform duration-300">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-pink-400 rounded-xl flex items-center justify-center">
                        <Zap className="h-6 w-6 text-white" />
                      </div>
                      <div className="space-y-1">
                        <div className="h-2 bg-gray-200 rounded-full w-16" />
                        <div className="h-2 bg-gray-200 rounded-full w-12" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* USP section with updated styling */}
            <div className="grid md:grid-cols-3 gap-6 mt-24 relative">
              <Card className="border-2 hover:border-purple-600 transition-all hover:shadow-xl rounded-2xl">
                <CardHeader>
                  <div className="w-16 h-16 bg-purple-600 rounded-2xl flex items-center justify-center mb-4">
                    <Zap className="h-8 w-8 text-white" />
                  </div>
                  <CardTitle className="text-2xl">高速処理</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed">
                    AIによる高速な要約・OCR処理で、数分でレポートを生成
                  </p>
                </CardContent>
              </Card>

              <Card className="border-2 hover:border-green-500 transition-all hover:shadow-xl rounded-2xl">
                <CardHeader>
                  <div className="w-16 h-16 bg-green-500 rounded-2xl flex items-center justify-center mb-4">
                    <Shield className="h-8 w-8 text-white" />
                  </div>
                  <CardTitle className="text-2xl">高精度</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed">
                    最新のAI技術により、正確な要約と定量コメントを提供
                  </p>
                </CardContent>
              </Card>

              <Card className="border-2 hover:border-pink-400 transition-all hover:shadow-xl rounded-2xl">
                <CardHeader>
                  <div className="w-16 h-16 bg-pink-400 rounded-2xl flex items-center justify-center mb-4">
                    <FileText className="h-8 w-8 text-white" />
                  </div>
                  <CardTitle className="text-2xl">簡単出力</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed">
                    DOCXテンプレートへ自動差し込み、すぐに使えるレポート
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          // 認証済みユーザー向けダッシュボード
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold">ダッシュボード</h1>
                <p className="text-muted-foreground mt-1">ようこそ、{user.email}</p>
              </div>
              <Link href="/workflow">
                <Button size="lg" className="rounded-2xl shadow-lg">
                  <FileText className="h-5 w-5 mr-2" />
                  新規レポート作成
                </Button>
              </Link>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <SubscriptionStatus />
              <CreditBalance />
            </div>

            {/* 最近の実行履歴 */}
            <Card className="rounded-2xl shadow-lg border-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>最近の実行</CardTitle>
                  <Link href="/history">
                    <Button variant="ghost" size="sm" className="rounded-xl">
                      すべて見る
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {recentExecutions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>まだ実行履歴がありません</p>
                    <Link href="/workflow" className="inline-block mt-4">
                      <Button size="sm" className="rounded-xl">
                        最初のレポートを作成
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recentExecutions.map((execution) => (
                      <div
                        key={execution.id}
                        className="flex items-center justify-between p-4 border-2 rounded-2xl hover:bg-accent transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {statusIcons[execution.status]}
                          <div>
                            <p className="font-medium">{execution.template_name || "レポート"}</p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(execution.created_at).toLocaleString("ja-JP")}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {execution.used_credit && (
                            <Badge variant="outline" className="rounded-full">
                              クレジット使用
                            </Badge>
                          )}
                          <Badge
                            variant={
                              execution.status === "completed"
                                ? "default"
                                : execution.status === "failed"
                                  ? "destructive"
                                  : "secondary"
                            }
                            className="rounded-full"
                          >
                            {execution.status === "completed"
                              ? "完了"
                              : execution.status === "failed"
                                ? "失敗"
                                : execution.status === "processing"
                                  ? "処理中"
                                  : "待機中"}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  )
}
