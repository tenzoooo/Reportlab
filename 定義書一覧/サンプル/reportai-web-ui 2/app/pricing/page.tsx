import Link from "next/link"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Check, Sparkles } from "lucide-react"
import { getSubscriptionPlans } from "@/lib/products"
import { createClient } from "@/lib/supabase/server"
import { Checkout } from "@/components/checkout"

export default async function PricingPage() {
  const plans = getSubscriptionPlans()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const searchParams = new URLSearchParams(window.location.search)
  const checkoutProductId = searchParams.get("checkout")

  if (checkoutProductId && user) {
    return (
      <div className="min-h-screen bg-background relative overflow-hidden">
        <Header />
        <main className="container mx-auto px-4 py-12 relative z-10">
          <div className="max-w-2xl mx-auto">
            <Checkout productId={checkoutProductId} />
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <Header />

      {/* Organic blob shapes */}
      <div className="blob-purple w-[500px] h-[500px] top-0 right-0 translate-x-1/3 -translate-y-1/3" />
      <div className="blob-pink w-[400px] h-[400px] bottom-0 left-0 -translate-x-1/3 translate-y-1/3" />
      <div className="blob-yellow w-[350px] h-[350px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />

      {/* Floating dots */}
      <div className="floating-dot bg-purple-600 top-1/4 left-1/4" style={{ animationDelay: "0s" }} />
      <div className="floating-dot bg-pink-400 top-1/3 right-1/4" style={{ animationDelay: "1s" }} />
      <div className="floating-dot bg-yellow-400 bottom-1/3 left-1/3" style={{ animationDelay: "2s" }} />
      <div className="floating-dot bg-green-500 top-1/2 right-1/3" style={{ animationDelay: "1.5s" }} />

      <main className="container mx-auto px-4 py-12 relative z-10">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-5xl font-bold mb-4 text-balance">
              シンプルで明確な
              <span className="relative inline-block ml-3">
                <span className="text-purple-600">料金プラン</span>
                <svg
                  className="absolute -bottom-2 left-0 w-full"
                  height="12"
                  viewBox="0 0 200 12"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M2 10C50 2 150 2 198 10" stroke="hsl(239 84% 67%)" strokeWidth="4" strokeLinecap="round" />
                </svg>
              </span>
            </h1>
            <p className="text-xl text-muted-foreground text-pretty">
              研究活動に合わせて選べる2つのプラン。上限を超えた場合はクレジットで追加可能です。
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-12">
            {plans.map((plan) => (
              <Card
                key={plan.id}
                className={`rounded-3xl shadow-xl border-2 transition-all hover:shadow-2xl hover:-translate-y-1 ${
                  plan.id === "basic" ? "border-purple-600" : ""
                }`}
              >
                {plan.id === "basic" && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-purple-600 rounded-full px-4 py-1">
                    おすすめ
                  </Badge>
                )}
                <CardHeader>
                  <CardTitle className="text-3xl">{plan.name}</CardTitle>
                  <CardDescription className="text-base">{plan.description}</CardDescription>
                  <div className="mt-4">
                    <span className="text-5xl font-bold">¥{(plan.priceInCents / 100).toLocaleString()}</span>
                    {plan.interval && <span className="text-muted-foreground ml-2 text-lg">/ 月</span>}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-3">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-start gap-3">
                        <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                          <Check className="h-4 w-4 text-green-600" />
                        </div>
                        <span className="leading-relaxed">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {user ? (
                    <Link href={plan.id === "free" ? "/" : `/pricing?checkout=${plan.id}`}>
                      <Button className="w-full rounded-xl py-6" variant={plan.id === "basic" ? "default" : "outline"}>
                        {plan.id === "free" ? "現在のプラン" : "アップグレード"}
                      </Button>
                    </Link>
                  ) : (
                    <Link href="/auth/signup">
                      <Button className="w-full rounded-xl py-6" variant={plan.id === "basic" ? "default" : "outline"}>
                        {plan.id === "free" ? (
                          <>
                            <Sparkles className="h-4 w-4 mr-2" />
                            今すぐ体験
                          </>
                        ) : (
                          "今すぐ始める"
                        )}
                      </Button>
                    </Link>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* クレジット購入セクション */}
          <Card className="bg-gradient-to-br from-orange-50 to-yellow-50 border-2 border-orange-200 rounded-3xl shadow-xl">
            <CardHeader>
              <CardTitle className="text-3xl">追加クレジット</CardTitle>
              <CardDescription className="text-base">
                月間上限を超えた場合でも、クレジットを購入して継続利用できます
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-4xl font-bold">¥300</p>
                  <p className="text-muted-foreground text-lg">1クレジット = 1レポート生成</p>
                </div>
              </div>

              <ul className="space-y-3">
                <li className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center shrink-0">
                    <Check className="h-4 w-4 text-green-600" />
                  </div>
                  <span>有効期限なし</span>
                </li>
                <li className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center shrink-0">
                    <Check className="h-4 w-4 text-green-600" />
                  </div>
                  <span>月間上限に関係なく使用可能</span>
                </li>
                <li className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center shrink-0">
                    <Check className="h-4 w-4 text-green-600" />
                  </div>
                  <span>すべての機能が利用可能</span>
                </li>
              </ul>

              {user ? (
                <Link href="/pricing?checkout=credit-1">
                  <Button className="w-full rounded-xl py-6" variant="default">
                    クレジットを購入
                  </Button>
                </Link>
              ) : (
                <Link href="/auth/signup">
                  <Button className="w-full rounded-xl py-6" variant="default">
                    登録してクレジットを購入
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
