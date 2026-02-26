"use client"

import { useState } from "react"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Coins, Sparkles, Check } from "lucide-react"
import { createClient } from "@/lib/supabase/server"

export default async function CreditsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let creditBalance = 0
  if (user) {
    const { data: credits } = await supabase.from("credits").select("balance").eq("user_id", user.id).single()
    creditBalance = credits?.balance || 0
  }

  const [selectedAmount, setSelectedAmount] = useState(1)

  const creditPackages = [
    { amount: 1, price: 300, popular: false, productId: "credit-1" },
    { amount: 5, price: 1400, popular: true, discount: "7% OFF", productId: "credit-5" },
    { amount: 10, price: 2700, popular: false, discount: "10% OFF", productId: "credit-10" },
    { amount: 20, price: 5200, popular: false, discount: "13% OFF", productId: "credit-20" },
  ]

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <Header />

      {/* Organic blob shapes */}
      <div className="blob-yellow w-[500px] h-[500px] top-0 right-0 translate-x-1/3 -translate-y-1/3" />
      <div className="blob-purple w-[400px] h-[400px] bottom-0 left-0 -translate-x-1/3 translate-y-1/3" />

      {/* Floating dots */}
      <div className="floating-dot bg-yellow-400 top-1/4 left-1/4" style={{ animationDelay: "0s" }} />
      <div className="floating-dot bg-purple-600 top-1/3 right-1/4" style={{ animationDelay: "1s" }} />
      <div className="floating-dot bg-pink-400 bottom-1/3 left-1/3" style={{ animationDelay: "2s" }} />

      <main className="container mx-auto px-4 py-12 relative z-10">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-3xl flex items-center justify-center shadow-2xl">
                <Coins className="h-10 w-10 text-white" />
              </div>
            </div>
            <h1 className="text-5xl font-bold mb-4 text-balance">
              クレジットを
              <span className="relative inline-block ml-3">
                <span className="text-yellow-600">購入</span>
                <svg
                  className="absolute -bottom-2 left-0 w-full"
                  height="12"
                  viewBox="0 0 200 12"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M2 10C50 2 150 2 198 10" stroke="hsl(43 100% 50%)" strokeWidth="4" strokeLinecap="round" />
                </svg>
              </span>
            </h1>
            <p className="text-xl text-muted-foreground text-pretty">
              月間上限を超えても、クレジットを購入して継続利用できます
            </p>
          </div>

          {/* Current Balance */}
          <Card className="rounded-3xl shadow-2xl border-2 mb-8 bg-gradient-to-br from-yellow-50 to-orange-50">
            <CardHeader>
              <CardTitle className="text-2xl">現在の残高</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-5xl font-bold">{creditBalance}</p>
                  <p className="text-muted-foreground mt-2">クレジット</p>
                </div>
                <Coins className="h-16 w-16 text-yellow-600 opacity-50" />
              </div>
            </CardContent>
          </Card>

          {/* Credit Packages */}
          <div className="space-y-6 mb-8">
            <h2 className="text-2xl font-bold text-center">パッケージを選択</h2>
            <div className="grid md:grid-cols-2 gap-6">
              {creditPackages.map((pkg) => (
                <Card
                  key={pkg.amount}
                  className={`rounded-3xl shadow-xl border-2 cursor-pointer transition-all hover:shadow-2xl hover:-translate-y-1 ${
                    selectedAmount === pkg.amount ? "border-yellow-600 bg-yellow-50" : ""
                  } ${pkg.popular ? "border-yellow-600" : ""}`}
                  onClick={() => setSelectedAmount(pkg.amount)}
                >
                  {pkg.popular && (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-yellow-600 rounded-full px-4 py-1">
                      人気
                    </Badge>
                  )}
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-3xl">{pkg.amount} クレジット</CardTitle>
                      {pkg.discount && (
                        <Badge variant="secondary" className="rounded-full">
                          {pkg.discount}
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="text-2xl font-bold mt-2">¥{pkg.price.toLocaleString()}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      <li className="flex items-center gap-2">
                        <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center shrink-0">
                          <Check className="h-3 w-3 text-green-600" />
                        </div>
                        <span className="text-sm">{pkg.amount}レポート生成可能</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center shrink-0">
                          <Check className="h-3 w-3 text-green-600" />
                        </div>
                        <span className="text-sm">有効期限なし</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center shrink-0">
                          <Check className="h-3 w-3 text-green-600" />
                        </div>
                        <span className="text-sm">すべての機能利用可能</span>
                      </li>
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Purchase Summary */}
          <Card className="rounded-3xl shadow-2xl border-2 bg-gradient-to-br from-purple-50 to-pink-50">
            <CardHeader>
              <CardTitle className="text-2xl">購入内容</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between text-lg">
                <span>クレジット数</span>
                <span className="font-bold">{selectedAmount} クレジット</span>
              </div>
              <div className="flex items-center justify-between text-lg">
                <span>合計金額</span>
                <span className="text-3xl font-bold">
                  ¥{creditPackages.find((p) => p.amount === selectedAmount)?.price.toLocaleString()}
                </span>
              </div>
              <Button className="w-full rounded-xl py-6 text-lg" size="lg">
                <Sparkles className="h-5 w-5 mr-2" />
                購入する
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                購入後、クレジットは即座にアカウントに追加されます
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
