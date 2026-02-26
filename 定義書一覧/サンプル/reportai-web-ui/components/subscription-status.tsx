import { getSubscriptionStatus } from "@/lib/subscription"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Sparkles, CreditCard, Calendar } from "lucide-react"

export async function SubscriptionStatus() {
  const status = await getSubscriptionStatus()

  if (!status) {
    return (
      <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50">
        <CardContent className="p-4">
          <p className="text-sm text-gray-600">ログインしてサブスクリプション状態を確認</p>
        </CardContent>
      </Card>
    )
  }

  const planName = status.plan_id === "free" ? "Free プラン" : "ベーシックプラン"
  const statusColor = status.status === "active" ? "bg-green-500" : "bg-gray-500"

  return (
    <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            {planName}
          </CardTitle>
          <Badge className={`${statusColor} text-white`}>{status.status}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">今月の実行回数</span>
          <span className="font-bold text-purple-600">
            {status.executions_this_month} / {status.monthly_limit}
          </span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600 flex items-center gap-1">
            <CreditCard className="h-4 w-4" />
            クレジット残高
          </span>
          <span className="font-bold text-green-600">{status.credit_balance} 件</span>
        </div>

        {status.current_period_end && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600 flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              次回更新日
            </span>
            <span className="text-gray-700">{new Date(status.current_period_end).toLocaleDateString("ja-JP")}</span>
          </div>
        )}

        {!status.can_execute && (
          <div className="pt-2 border-t border-purple-200">
            <p className="text-sm text-orange-600 mb-2">月間上限に達しました</p>
            <Button asChild size="sm" className="w-full bg-gradient-to-r from-purple-600 to-pink-600">
              <Link href="/credits">クレジットを購入</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
