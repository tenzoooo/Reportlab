"use client"

import { useEffect, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { User, CreditCard, Bell, Shield, Check, AlertTriangle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Progress } from "@/components/ui/progress"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"

const CREDITS_PER_PACK = Number(process.env.NEXT_PUBLIC_CREDITS_PER_UNIT ?? 100)
const MAX_CREDIT_PACKS = 20

export default function SettingsPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const tabParam = searchParams.get("tab") || "profile"
  const [activeTab, setActiveTab] = useState<string>(tabParam)
  const [showCancelDialog, setShowCancelDialog] = useState(false)

  // State for real data
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState({ name: "", email: "", university: "", department: "", credits: 0, plan: "free" })
  const [subscription, setSubscription] = useState<any>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [creditQuantity, setCreditQuantity] = useState(1)

  useEffect(() => {
    setActiveTab(tabParam)

    // Check for success/canceled params from Stripe redirect
    const successParam = searchParams.get("success")
    const canceledParam = searchParams.get("canceled")

    if (successParam === "credits") {
      toast.success("クレジットの購入が完了しました")
      router.replace("/dashboard/settings?tab=subscription")
    } else if (successParam) {
      toast.success("サブスクリプションが更新されました")
      router.replace("/dashboard/settings?tab=subscription")
    }
    if (canceledParam === "credits") {
      toast.info("クレジットの購入をキャンセルしました")
      router.replace("/dashboard/settings?tab=subscription")
    } else if (canceledParam) {
      toast.info("決済がキャンセルされました")
      router.replace("/dashboard/settings?tab=subscription")
    }
    const legacyState = searchParams.get("state")
    if (!successParam && legacyState === "success") {
      toast.success("サブスクリプションが更新されました")
      router.replace("/dashboard/settings?tab=subscription")
    }
    if (!canceledParam && legacyState === "cancelled") {
      toast.info("決済がキャンセルされました")
      router.replace("/dashboard/settings?tab=subscription")
    }

    const loadData = async () => {
      setLoading(true)
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) return

        // Fetch profile
        const { data: profileData } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single()

        setProfile({
          name: user.user_metadata?.name || "",
          email: user.email || "",
          university: user.user_metadata?.university || "",
          department: user.user_metadata?.department || "",
          credits: profileData?.credits || 0,
          plan: profileData?.plan || "free"
        })

        // Fetch subscription
        const { data: subData } = await supabase
          .from("subscriptions")
          .select("*")
          .eq("user_id", user.id)
          .in("status", ["active", "trialing", "past_due"])
          .order("created_at", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()

        setSubscription(subData)

      } catch (error) {
        console.error("Error loading data:", error)
        toast.error("データの読み込みに失敗しました")
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [searchParams, tabParam, router])

  const handleSaveProfile = async () => {
    setIsProcessing(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({
        data: {
          name: profile.name,
          university: profile.university,
          department: profile.department,
        },
      })
      if (error) throw error
      toast.success("プロフィールを保存しました")
    } catch (err) {
      toast.error("プロフィールの保存に失敗しました")
    } finally {
      setIsProcessing(false)
    }
  }

  const handleCheckout = async (priceId: string) => {
    setIsProcessing(true)
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      })
      const data = await res.json()
      if (data.error) {
        throw new Error(data.error)
      }
      if (data.url) {
        window.location.href = data.url
      } else {
        throw new Error("No URL returned")
      }
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : "決済の開始に失敗しました")
      setIsProcessing(false)
    }
  }

  const updateCreditQuantity = (value: number) => {
    const safeValue = Number.isFinite(value) ? value : 1
    const clamped = Math.min(Math.max(Math.round(safeValue), 1), MAX_CREDIT_PACKS)
    setCreditQuantity(clamped)
  }

  const handleCreditCheckout = async () => {
    setIsProcessing(true)
    try {
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: creditQuantity }),
      })
      const data = await res.json()
      if (data.error) {
        throw new Error(data.error)
      }
      if (data.url) {
        window.location.href = data.url
        return
      }
      throw new Error("No URL returned")
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : "クレジットの購入に失敗しました")
      setIsProcessing(false)
    }
  }

  const handlePortal = async () => {
    setIsProcessing(true)
    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        throw new Error("No URL returned")
      }
    } catch (error) {
      console.error(error)
      toast.error("ポータルの読み込みに失敗しました")
      setIsProcessing(false)
    }
  }

  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, staggerChildren: 0.1 } },
  }
  const itemVariants = { hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  // Determine current plan name
  // This logic depends on your Price IDs. 
  // Ideally, store plan name in DB or map price_id to name.
  // For now, simple check:
  // Determine current plan name from profile if available, otherwise fallback or default to Free
  // The user explicitly wants to manage status via profiles table.
  let planName = "Free"
  if (profile.plan === "premium") {
    planName = "Premium"
  } else if (profile.plan === "credit_only") {
    planName = "Credit Only"
  } else if (subscription) {
    // Fallback to subscription table check if profile plan is not set (legacy/safety)
    if (subscription.price_id === process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_PREMIUM) {
      planName = "Premium"
    } else if (subscription.price_id === process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_CREDITS) {
      planName = "Credit Only"
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <motion.div
        initial="hidden"
        animate="visible"
        variants={containerVariants}
        className="max-w-6xl mx-auto p-4 sm:p-6 space-y-8"
      >
        <motion.div variants={itemVariants}>
          <h1 className="text-3xl font-bold text-foreground">設定</h1>
          <p className="text-muted-foreground mt-2">アカウントとプランの管理</p>
        </motion.div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 gap-1">
            <TabsTrigger value="profile" className="gap-1 sm:gap-2 px-2 sm:px-4">
              <User className="h-4 w-4 shrink-0" />
              <span className="text-xs sm:text-sm truncate">プロフィール</span>
            </TabsTrigger>
            <TabsTrigger value="subscription" className="gap-1 sm:gap-2 px-2 sm:px-4">
              <CreditCard className="h-4 w-4 shrink-0" />
              <span className="text-xs sm:text-sm truncate">サブスク</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-1 sm:gap-2 px-2 sm:px-4">
              <Bell className="h-4 w-4 shrink-0" />
              <span className="text-xs sm:text-sm truncate">通知</span>
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-1 sm:gap-2 px-2 sm:px-4">
              <Shield className="h-4 w-4 shrink-0" />
              <span className="text-xs sm:text-sm truncate">セキュリティ</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-6">
            <motion.div variants={itemVariants} initial="hidden" animate="visible">
              <Card>
                <CardHeader>
                  <CardTitle>プロフィール情報</CardTitle>
                  <CardDescription>アカウントの基本情報を管理します</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center gap-6">
                    <div className="h-20 w-20 rounded-full bg-primary flex items-center justify-center">
                      <User className="h-10 w-10 text-primary-foreground" />
                    </div>
                    <div className="space-y-2">
                      <Button variant="outline" size="sm">
                        画像を変更
                      </Button>
                      <p className="text-xs text-muted-foreground">JPG、PNG、最大2MB</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">名前</Label>
                      <Input
                        id="name"
                        placeholder="山田 太郎"
                        value={profile.name}
                        onChange={(e) => setProfile((prev) => ({ ...prev, name: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">メールアドレス</Label>
                      <Input id="email" type="email" value={profile.email} disabled />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="university">大学名（オプション）</Label>
                      <Input
                        id="university"
                        placeholder="〇〇大学"
                        value={profile.university}
                        onChange={(e) => setProfile((prev) => ({ ...prev, university: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="department">学部・学科（オプション）</Label>
                      <Input
                        id="department"
                        placeholder="工学部 電気電子工学科"
                        value={profile.department}
                        onChange={(e) => setProfile((prev) => ({ ...prev, department: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={handleSaveProfile} disabled={isProcessing}>
                      {isProcessing ? "保存中..." : "変更を保存"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>

          <TabsContent value="subscription" className="space-y-6">
            <motion.div variants={itemVariants} initial="hidden" animate="visible" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>現在のプラン</CardTitle>
                  <CardDescription>使用状況とプランの詳細</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                    <div>
                      <h3 className="text-xl font-bold text-foreground">
                        {planName} プラン
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {planName === "Premium"
                          ? "すべての機能をご利用いただけます"
                          : planName === "Credit Only"
                            ? "クレジット定期購入プラン"
                            : "基本機能をご利用いただけます"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-foreground">
                        {planName === "Premium" ? "¥980" : planName === "Credit Only" ? "¥500" : "¥0"}
                      </p>
                      <p className="text-sm text-muted-foreground">/月</p>
                    </div>
                  </div>

                  {/* Credit Display */}
                  <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold text-primary">保有クレジット</h4>
                      <p className="text-sm text-muted-foreground">レポート作成に使用できます</p>
                    </div>
                    <div className="text-3xl font-bold text-primary">{profile.credits}</div>
                  </div>

                  {subscription && (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-3">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                        <div className="flex-1">
                          <h4 className="font-semibold text-amber-900">プランの管理</h4>
                          <p className="text-sm text-amber-700 mt-1">
                            お支払い方法の変更や解約はカスタマーポータルから行えます。
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        className="w-full border-amber-300 text-amber-900 hover:bg-amber-100 bg-transparent"
                        onClick={handlePortal}
                        disabled={isProcessing}
                      >
                        {isProcessing ? "読み込み中..." : "サブスクリプションを管理"}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>クレジットを追加購入</CardTitle>
                  <CardDescription>100クレジット単位で必要な分だけチャージできます</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">購入セット数</h4>
                      <p className="text-xs text-muted-foreground">
                        1セット = {CREDITS_PER_PACK}クレジット（最大{MAX_CREDIT_PACKS}セット）
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => updateCreditQuantity(creditQuantity - 1)}
                        disabled={creditQuantity <= 1 || isProcessing}
                      >
                        -
                      </Button>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={MAX_CREDIT_PACKS}
                        step={1}
                        value={creditQuantity}
                        onChange={(e) => updateCreditQuantity(Number(e.target.value))}
                        className="w-20 text-center"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => updateCreditQuantity(creditQuantity + 1)}
                        disabled={creditQuantity >= MAX_CREDIT_PACKS || isProcessing}
                      >
                        +
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 rounded-lg border bg-muted/50 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">購入予定クレジット</p>
                      <p className="text-2xl font-bold text-primary">
                        {creditQuantity * CREDITS_PER_PACK} クレジット
                      </p>
                    </div>
                    <Button
                      className="w-full sm:w-auto"
                      onClick={handleCreditCheckout}
                      disabled={isProcessing}
                    >
                      {isProcessing ? "処理中..." : "Stripeで購入"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    決済完了後すぐにクレジットが付与されます。Stripeの決済ページへ遷移します。
                  </p>
                </CardContent>
              </Card>

              <motion.div variants={itemVariants}>
                <h3 className="text-xl font-semibold text-foreground mb-4">プラン比較</h3>
                <div className="grid md:grid-cols-3 gap-6">
                  {/* Free Plan */}
                  <Card className={`border-2 ${planName === "Free" ? "border-primary" : "border-border"}`}>
                    <CardHeader>
                      <CardTitle>Free</CardTitle>
                      <div className="mt-4">
                        <span className="text-4xl font-bold text-foreground">¥0</span>
                        <span className="text-muted-foreground">/月</span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <ul className="space-y-3">
                        <li className="flex items-center gap-2">
                          <Check className="h-5 w-5 text-primary" />
                          <span className="text-foreground text-sm">レポート作成 5件/月</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="h-5 w-5 text-primary" />
                          <span className="text-foreground text-sm">ストレージ 100MB</span>
                        </li>
                      </ul>
                      <Button
                        variant="outline"
                        className="w-full bg-transparent"
                        disabled={planName === "Free"}
                      >
                        {planName === "Free" ? "現在のプラン" : "選択不可"}
                      </Button>
                    </CardContent>
                  </Card>

                  {/* Credit Only Plan */}
                  <Card className={`border-2 ${planName === "Credit Only" ? "border-primary" : "border-border"}`}>
                    <CardHeader>
                      <CardTitle>Credit Only</CardTitle>
                      <div className="mt-4">
                        <span className="text-4xl font-bold text-foreground">¥500</span>
                        <span className="text-muted-foreground">/月</span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <ul className="space-y-3">
                        <li className="flex items-center gap-2">
                          <Check className="h-5 w-5 text-primary" />
                          <span className="text-foreground text-sm">毎月400クレジット</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="h-5 w-5 text-primary" />
                          <span className="text-foreground text-sm">ストレージ 500MB</span>
                        </li>
                      </ul>
                      <Button
                        className="w-full"
                        disabled={planName === "Credit Only" || isProcessing}
                        onClick={() => handleCheckout(process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_CREDITS!)}
                      >
                        {planName === "Credit Only" ? "現在のプラン" : "アップグレード"}
                      </Button>
                    </CardContent>
                  </Card>

                  {/* Premium Plan */}
                  <Card
                    className={`border-2 ${planName === "Premium" ? "border-primary" : "border-border"} shadow-lg relative overflow-hidden`}
                  >
                    <div className="absolute top-0 right-0 bg-primary text-primary-foreground px-3 py-1 text-xs font-semibold rounded-bl-lg">
                      おすすめ
                    </div>
                    <CardHeader>
                      <CardTitle>Premium</CardTitle>
                      <div className="mt-4">
                        <span className="text-4xl font-bold text-foreground">¥980</span>
                        <span className="text-muted-foreground">/月</span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <ul className="space-y-3">
                        <li className="flex items-center gap-2">
                          <Check className="h-5 w-5 text-primary" />
                          <span className="text-foreground text-sm">毎月400クレジット</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="h-5 w-5 text-primary" />
                          <span className="text-foreground text-sm">ストレージ 1GB</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="h-5 w-5 text-primary" />
                          <span className="text-foreground text-sm">高度なAI分析</span>
                        </li>
                      </ul>
                      <Button
                        className={`w-full ${planName === "Premium"
                          ? ""
                          : "bg-gradient-to-r from-pink-500 via-yellow-500 to-pink-500 bg-[length:200%_100%] animate-gradient-x text-white font-semibold shadow-lg hover:shadow-xl transition-shadow"
                          }`}
                        disabled={planName === "Premium" || isProcessing}
                        onClick={() => handleCheckout(process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_PREMIUM!)}
                      >
                        {planName === "Premium" ? "現在のプラン" : "アップグレード"}
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </motion.div>
            </motion.div>
          </TabsContent>

          <TabsContent value="notifications" className="space-y-6">
            {/* Notification settings content (unchanged) */}
            <motion.div variants={itemVariants} initial="hidden" animate="visible">
              <Card>
                <CardHeader>
                  <CardTitle>通知設定</CardTitle>
                  <CardDescription>通知の受け取り方法を管理します</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label htmlFor="email-notifications">メール通知</Label>
                        <p className="text-sm text-muted-foreground">レポート完成時にメールを受け取る</p>
                      </div>
                      <Switch id="email-notifications" defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label htmlFor="report-complete">レポート完了通知</Label>
                        <p className="text-sm text-muted-foreground">生成が完了したら通知</p>
                      </div>
                      <Switch id="report-complete" defaultChecked />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>

          <TabsContent value="security" className="space-y-6">
            {/* Security settings content (unchanged) */}
            <motion.div variants={itemVariants} initial="hidden" animate="visible">
              <Card>
                <CardHeader>
                  <CardTitle>セキュリティ設定</CardTitle>
                  <CardDescription>アカウントのセキュリティを管理します</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="pt-6 border-t space-y-4">
                    <h3 className="text-lg font-semibold text-destructive">アカウント削除</h3>
                    <p className="text-sm text-muted-foreground">
                      アカウントを削除すると、全てのデータが完全に削除されます。この操作は取り消せません。
                    </p>
                    <Button variant="destructive">アカウントを削除</Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  )
}
