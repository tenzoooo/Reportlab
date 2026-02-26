import { Header } from "@/components/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FileText, Clock, CheckCircle2, XCircle, Loader2, Download, Search, Calendar } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import type { Execution } from "@/lib/types"

export default async function HistoryPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let executions: Execution[] = []
  let totalExecutions = 0
  let completedExecutions = 0
  let failedExecutions = 0

  if (user) {
    const { data: execData } = await supabase
      .from("executions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
    executions = execData || []

    totalExecutions = executions.length
    completedExecutions = executions.filter((e) => e.status === "completed").length
    failedExecutions = executions.filter((e) => e.status === "failed").length
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

      {/* Organic blob shapes */}
      <div className="blob-green w-[400px] h-[400px] top-0 left-0 -translate-x-1/4 -translate-y-1/4" />
      <div className="blob-purple w-[350px] h-[350px] bottom-0 right-0 translate-x-1/4 translate-y-1/4" />

      {/* Floating dots */}
      <div className="floating-dot bg-green-500 top-1/4 right-1/4" style={{ animationDelay: "0s" }} />
      <div className="floating-dot bg-purple-600 top-1/3 left-1/4" style={{ animationDelay: "1s" }} />
      <div className="floating-dot bg-pink-400 bottom-1/3 left-1/3" style={{ animationDelay: "2s" }} />

      <main className="container mx-auto px-4 py-4 relative z-10">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="text-center">
            <h1 className="text-4xl font-bold mb-2 text-balance">
              実行
              <span className="relative inline-block ml-3">
                <span className="text-green-500">履歴</span>
                <svg
                  className="absolute -bottom-2 left-0 w-full"
                  height="12"
                  viewBox="0 0 200 12"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M2 10C50 2 150 2 198 10" stroke="hsl(142 76% 36%)" strokeWidth="4" strokeLinecap="round" />
                </svg>
              </span>
            </h1>
            <p className="text-lg text-muted-foreground">過去のレポート生成履歴を確認できます</p>
          </div>

          {/* KPI Cards */}
          <div className="grid md:grid-cols-3 gap-4">
            <Card className="rounded-2xl shadow-lg border-2 hover:shadow-xl transition-all">
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4 text-purple-600" />
                  総実行回数
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-bold">{totalExecutions}</p>
              </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-lg border-2 hover:shadow-xl transition-all">
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  成功
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-bold text-green-600">{completedExecutions}</p>
              </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-lg border-2 hover:shadow-xl transition-all">
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-600" />
                  失敗
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-bold text-red-600">{failedExecutions}</p>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card className="rounded-2xl shadow-lg border-2">
            <CardHeader>
              <CardTitle>フィルター</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="テンプレート名で検索" className="pl-10 rounded-xl" />
                </div>
                <Select>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="ステータス" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべて</SelectItem>
                    <SelectItem value="completed">完了</SelectItem>
                    <SelectItem value="failed">失敗</SelectItem>
                    <SelectItem value="processing">処理中</SelectItem>
                  </SelectContent>
                </Select>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input type="date" className="pl-10 rounded-xl" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Execution List */}
          <Card className="rounded-2xl shadow-lg border-2">
            <CardHeader>
              <CardTitle>実行履歴</CardTitle>
            </CardHeader>
            <CardContent>
              {executions.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg">まだ実行履歴がありません</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {executions.map((execution) => (
                    <div
                      key={execution.id}
                      className="flex items-center justify-between p-4 border-2 rounded-2xl hover:bg-accent transition-colors"
                    >
                      <div className="flex items-center gap-4 flex-1">
                        {statusIcons[execution.status]}
                        <div className="flex-1">
                          <p className="font-medium">{execution.template_name || "レポート"}</p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(execution.created_at).toLocaleString("ja-JP")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
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
                        {execution.status === "completed" && execution.output_url && (
                          <Button size="sm" variant="outline" className="rounded-xl bg-transparent">
                            <Download className="h-4 w-4 mr-2" />
                            ダウンロード
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
