"use client"

import { useEffect, useRef, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { User, CreditCard, Bell, Shield, Check, AlertTriangle, Loader2, Settings, Sun, Moon, Monitor } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
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
import DashboardPageShell from "@/components/dashboard-page-shell"
import { cn } from "@/lib/utils"

const CREDITS_PER_PACK = Number(process.env.NEXT_PUBLIC_CREDITS_PER_UNIT ?? 100)
const MAX_CREDIT_PACKS = 20
const MONTHLY_CREDITS_STANDARD = 1200
const MONTHLY_CREDITS_PREMIUM = 3000
const DISPLAY_PLAN_PRICE: Record<"Free" | "Standard" | "Premium", string> = {
  Free: "¥0",
  Standard: "¥980",
  Premium: "¥2,000",
}

const PREMIUM_PRICE_IDS: ReadonlyArray<string> = [
  process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_PREMIUM ?? "",
  process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_PREMIUM_LEGACY ?? "",
].filter(Boolean)

type ThemeChoice = "system" | "dark" | "light"

interface UserProfile {
  name: string
  email: string
  university: string
  department: string
  credits: number
  plan: string
  theme: ThemeChoice
}

interface Subscription {
  id: string
  user_id: string
  status: string
  price_id: string
  cancel_at_period_end: boolean
  created_at: string
  current_period_end: string
}

const formatYmdJa = (iso: string | null | undefined): string | null => {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" }).format(d)
}

export default function SettingsPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { setTheme, theme } = useTheme()
  const tabParam = searchParams.get("tab") || "profile"
  const [activeTab, setActiveTab] = useState<string>(tabParam)
  const creditsSyncStartedRef = useRef(false)
  
  // Dialog States
  const [showCancelSubDialog, setShowCancelSubDialog] = useState(false)
  const [showDeleteAccountDialog, setShowDeleteAccountDialog] = useState(false)
  
  // Loading States
  const [loading, setLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isCancellingSub, setIsCancellingSub] = useState(false)
  const [isResuming, setIsResuming] = useState(false)
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Data States
  const [profile, setProfile] = useState<UserProfile>({ 
    name: "", 
    email: "", 
    university: "", 
    department: "", 
    credits: 0, 
    plan: "free",
    theme: "system",
  })
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [creditQuantity, setCreditQuantity] = useState(1)
  
  // Notification States
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [reportNotifications, setReportNotifications] = useState(true)

  useEffect(() => {
    setMounted(true)
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

    const loadData = async (): Promise<void> => {
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

        const resolvedTheme = (profileData?.theme ?? "system") as ThemeChoice

        const creditsValue = typeof profileData?.credits === "number" ? profileData.credits : Number(profileData?.credits ?? 0)
        setProfile({
          name: user.user_metadata?.name || "",
          email: user.email || "",
          university: user.user_metadata?.university || "",
          department: user.user_metadata?.department || "",
          credits: Number.isFinite(creditsValue) ? creditsValue : 0,
          plan: profileData?.plan || "free",
          theme: resolvedTheme,
        })
        setTheme(resolvedTheme)

        // Fetch subscription
        const { data: subData } = await supabase
          .from("subscriptions")
          .select("*")
          .eq("user_id", user.id)
          .in("status", ["active", "trialing", "past_due"])
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

    const syncCreditsAfterCheckout = async (): Promise<void> => {
      if (creditsSyncStartedRef.current) return
      if (successParam !== "credits") return
      creditsSyncStartedRef.current = true

      // The Stripe redirect happens before the webhook finishes sometimes.
      // Poll briefly to avoid "purchase succeeded but credits didn't change" UX.
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: first } = await supabase.from("profiles").select("credits").eq("id", user.id).single()
        const baseline = typeof first?.credits === "number" ? first.credits : Number(first?.credits ?? 0)

        const maxAttempts = 15
        const sleepMs = 2000
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          await new Promise((r) => setTimeout(r, sleepMs))
          const { data: latest } = await supabase.from("profiles").select("credits").eq("id", user.id).single()
          const latestCredits = typeof latest?.credits === "number" ? latest.credits : Number(latest?.credits ?? NaN)
          if (Number.isFinite(latestCredits) && latestCredits > baseline) {
            setProfile((prev) => ({ ...prev, credits: latestCredits }))
            toast.success("クレジットを反映しました")
            return
          }
        }
        toast.info("クレジット反映待ちです。数分後に再読み込みしてください。")
      } catch (err) {
        console.error("Failed to sync credits after checkout", err)
      }
    }
    void syncCreditsAfterCheckout()
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

  const handleThemeChange = async (nextTheme: ThemeChoice) => {
    setTheme(nextTheme)
    setProfile((prev) => ({ ...prev, theme: nextTheme }))
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { error } = await supabase.from("profiles").update({ theme: nextTheme }).eq("id", user.id)
      if (error) throw error
      toast.success("外観設定を保存しました")
    } catch (err) {
      toast.error("外観設定の保存に失敗しました")
    }
  }

  const handleCheckout = async (priceId: string) => {
    setIsProcessing(true)
    try {
      if (!priceId) {
        toast.error("価格IDが設定されていません。環境変数 NEXT_PUBLIC_STRIPE_PRICE_ID_* を確認してください。")
        setIsProcessing(false)
        return
      }
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

  const handleCancelSubscription = async () => {
    setIsCancellingSub(true)
    try {
      const res = await fetch("/api/stripe/cancel-subscription", {
        method: "POST",
      })
      const data = await res.json()
      if (data.error) {
        throw new Error(data.error)
      }
      toast.success("サブスクリプションを解約しました。期間終了時まで利用できます。")
      setShowCancelSubDialog(false)
      // Reload data to reflect the change
      window.location.reload()
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : "解約に失敗しました")
    } finally {
      setIsCancellingSub(false)
    }
  }

  const handleResumeSubscription = async () => {
    setIsResuming(true)
    try {
      const res = await fetch("/api/stripe/resume-subscription", {
        method: "POST",
      })
      const data = await res.json().catch(() => ({}))
      const errorMessage = (data && data.error) || (!res.ok ? "サブスクリプションの再開に失敗しました" : null)
      if (errorMessage) {
        toast.error(errorMessage)
        return
      }
      toast.success("サブスクリプションを再開しました")
      // Reload data to reflect the change
      window.location.reload()
    } catch (error) {
      console.error(error)
      toast.error("再開に失敗しました")
    } finally {
      setIsResuming(false)
    }
  }

  const handleNotificationChange = (type: 'email' | 'report', checked: boolean) => {
    if (type === 'email') setEmailNotifications(checked)
    if (type === 'report') setReportNotifications(checked)
    
    // Mock save
    toast.success("通知設定を保存しました")
  }

  const handleDeleteAccount = async () => {
    setIsDeletingAccount(true)
    try {
      // Mock API call
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      // In a real app, you would call supabase.auth.admin.deleteUser or similar API
      toast.error("現在、アカウントの自動削除はサポートされていません。サポートまでお問い合わせください。")
    } catch (error) {
      toast.error("アカウント削除処理に失敗しました")
    } finally {
      setIsDeletingAccount(false)
      setShowDeleteAccountDialog(false)
    }
  }

  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, staggerChildren: 0.1 } },
  }
  const itemVariants = { hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }

  if (loading) {
    return (
      <DashboardPageShell title="設定" subtitle="アカウントとプランの管理" icon={<Settings className="h-6 w-6" />}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
        </div>
      </DashboardPageShell>
    )
  }

  // Determine current plan name
  let planName = "Free"
  if (profile.plan === "premium") {
    planName = "Premium"
  } else if (profile.plan === "standard" || profile.plan === "credit_only") {
    planName = "Standard"
  } else if (subscription) {
    if (PREMIUM_PRICE_IDS.includes(subscription.price_id)) {
      planName = "Premium"
    } else if (
      subscription.price_id === process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_STANDARD
    ) {
      planName = "Standard"
    }
  }

  return (
    <DashboardPageShell title="設定" subtitle="アカウントとプランの管理" icon={<Settings className="h-6 w-6" />}>
      <motion.div
        initial="hidden"
        animate="visible"
        variants={containerVariants}
        className="space-y-8"
      >

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
            <motion.div variants={itemVariants} initial="hidden" animate="visible" className="space-y-6">
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
              
              <Card>
                <CardHeader>
                  <CardTitle>外観設定</CardTitle>
                  <CardDescription>アプリケーションのテーマカラーを選択します</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 max-w-md">
                    <Button
                      variant="outline"
                      className={cn(
                        "h-24 flex flex-col items-center justify-center gap-2",
                        (mounted ? theme : profile.theme) === "light" && "border-2 border-primary bg-primary/5"
                      )}
                      onClick={() => handleThemeChange("light")}
                    >
                      <Sun className="h-6 w-6" />
                      <span>ライト</span>
                    </Button>
                    <Button
                      variant="outline"
                      className={cn(
                        "h-24 flex flex-col items-center justify-center gap-2",
                        (mounted ? theme : profile.theme) === "dark" && "border-2 border-primary bg-primary/5"
                      )}
                      onClick={() => handleThemeChange("dark")}
                    >
                      <Moon className="h-6 w-6" />
                      <span>ダーク</span>
                    </Button>
                    <Button
                      variant="outline"
                      className={cn(
                        "h-24 flex flex-col items-center justify-center gap-2",
                        (mounted ? theme : profile.theme) === "system" && "border-2 border-primary bg-primary/5"
                      )}
                      onClick={() => handleThemeChange("system")}
                    >
                      <Monitor className="h-6 w-6" />
                      <span>システム</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>

          <TabsContent value="subscription" className="space-y-6">
            <motion.div variants={itemVariants} initial="hidden" animate="visible" className="space-y-6">
              <Card className="border-blue-200 bg-white dark:border-blue-900 dark:bg-black">
                <CardHeader>
                  <CardTitle className="text-black dark:text-white">現在のプラン</CardTitle>
                  <CardDescription className="text-black/70 dark:text-white/70">使用状況とプランの詳細</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-white p-4 dark:border-blue-900 dark:bg-black">
                    <div>
                      <h3 className="text-xl font-bold text-black dark:text-white">
                        {planName} プラン
                      </h3>
                      <p className="mt-1 text-sm text-black/70 dark:text-white/70">
                        {planName === "Premium"
                          ? "最上位の機能をご利用いただけます"
                          : planName === "Standard"
                            ? "標準的な機能をご利用いただけます"
                            : "基本機能をご利用いただけます"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-black dark:text-white">
                        {DISPLAY_PLAN_PRICE[planName as "Free" | "Standard" | "Premium"] || DISPLAY_PLAN_PRICE.Free}
                      </p>
                      <p className="text-sm text-black/70 dark:text-white/70">/月</p>
                    </div>
                  </div>

                  {/* Credit Display */}
                  <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/30">
                    <div>
                      <h4 className="font-semibold text-blue-700 dark:text-blue-300">保有クレジット</h4>
                      <p className="text-sm text-black/70 dark:text-white/70">レポート作成に使用できます</p>
                    </div>
                    <div className="text-3xl font-bold text-blue-700 dark:text-blue-300">{profile.credits}</div>
                  </div>

	                  {subscription && (
	                    <div className="space-y-3">
	                      {(() => {
	                        const ymd = formatYmdJa(subscription.current_period_end)
	                        if (!ymd) return null
	                        const label = subscription.cancel_at_period_end ? "有効期限" : "次回更新日"
	                        return (
	                          <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-white p-4 text-sm text-black/70 dark:border-blue-900 dark:bg-black dark:text-white/70">
	                            <span>{label}</span>
	                            <span className="font-semibold text-black dark:text-white">{ymd}</span>
	                          </div>
	                        )
	                      })()}
	                      {subscription.cancel_at_period_end ? (
	                        <div className="space-y-3 rounded-lg border border-blue-200 bg-white p-4 dark:border-blue-900 dark:bg-black">
	                          <div className="flex items-start gap-3">
                            <AlertTriangle className="mt-0.5 h-5 w-5 text-blue-600 dark:text-blue-300" />
                            <div className="flex-1">
                              <h4 className="font-semibold text-black dark:text-white">解約予定</h4>
                              <p className="mt-1 text-sm text-black/70 dark:text-white/70">
                                現在のサブスクリプションは期間終了時に解約されます。それまでは引き続きご利用いただけます。
                              </p>
                            </div>
                          </div>
                          <Button
                            className="w-full bg-blue-600 text-white hover:bg-blue-700"
                            onClick={handleResumeSubscription}
                            disabled={isResuming}
                          >
                            {isResuming ? "処理中..." : "解約をキャンセル（継続する）"}
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-3 rounded-lg border border-blue-200 bg-white p-4 dark:border-blue-900 dark:bg-black">
                          <div className="flex items-start gap-3">
                            <AlertTriangle className="mt-0.5 h-5 w-5 text-blue-600 dark:text-blue-300" />
                            <div className="flex-1">
                              <h4 className="font-semibold text-black dark:text-white">プランの管理</h4>
                              <p className="mt-1 text-sm text-black/70 dark:text-white/70">
                                お支払い方法の変更はカスタマーポータルから行えます。
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-col gap-2">
                            <Button
                              variant="outline"
                              className="w-full border-blue-300 bg-white text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:bg-black dark:text-blue-300 dark:hover:bg-blue-950/30"
                              onClick={handlePortal}
                              disabled={isProcessing}
                            >
                              {isProcessing ? "読み込み中..." : "サブスクリプションを管理"}
                            </Button>
                            <Button
                              variant="outline"
                              className="w-full border-blue-300 bg-white text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:bg-black dark:text-blue-300 dark:hover:bg-blue-950/30"
                              onClick={() => setShowCancelSubDialog(true)}
                              disabled={isProcessing}
                            >
                              サブスクリプションを解約
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-blue-200 bg-white dark:border-blue-900 dark:bg-black">
                <CardHeader>
                  <CardTitle className="text-black dark:text-white">クレジットを追加購入</CardTitle>
                  <CardDescription className="text-black/70 dark:text-white/70">100クレジット単位で必要な分だけチャージできます</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-black dark:text-white">購入セット数</h4>
                      <p className="text-xs text-black/70 dark:text-white/70">
                        1セット = {CREDITS_PER_PACK}クレジット（最大{MAX_CREDIT_PACKS}セット）
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => updateCreditQuantity(creditQuantity - 1)}
                        disabled={creditQuantity <= 1 || isProcessing}
                        className="border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-950/30"
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
                        className="w-20 border-blue-300 bg-white text-center text-black dark:border-blue-700 dark:bg-black dark:text-white"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => updateCreditQuantity(creditQuantity + 1)}
                        disabled={creditQuantity >= MAX_CREDIT_PACKS || isProcessing}
                        className="border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-950/30"
                      >
                        +
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 rounded-lg border border-blue-200 bg-white p-4 dark:border-blue-900 dark:bg-black sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm text-black/70 dark:text-white/70">購入予定クレジット</p>
                      <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                        {creditQuantity * CREDITS_PER_PACK} クレジット
                      </p>
                    </div>
                    <Button
                      className="w-full sm:w-auto bg-blue-600 text-white hover:bg-blue-500"
                      onClick={handleCreditCheckout}
                      disabled={isProcessing}
                    >
                      {isProcessing ? "処理中..." : "Stripeで購入"}
                    </Button>
                  </div>
                  <p className="text-xs text-black/70 dark:text-white/70">
                    決済完了後すぐにクレジットが付与されます。Stripeの決済ページへ遷移します。
                  </p>
                </CardContent>
              </Card>

              <motion.div variants={itemVariants}>
                <h3 className="mb-4 text-xl font-semibold text-black dark:text-white">プラン比較</h3>
                <div className="grid md:grid-cols-3 gap-8">
                  {/* Free Plan */}
                  <motion.div
                    whileHover={{ scale: 1.05, y: -10 }}
                    className={`card overflow-hidden rounded-3xl border bg-white shadow-sm transition-all duration-200 hover:bg-white hover:shadow-lg dark:bg-black dark:hover:bg-black ${planName === "Free" ? "border-2 border-blue-600 dark:border-blue-500" : "border-blue-200 dark:border-blue-900"}`}
                  >
                    <div className="flex h-full flex-col space-y-6 p-6">
                      <div>
                        <h3 className="mb-2 text-2xl font-bold text-black dark:text-white">Free</h3>
                        <div className="flex items-baseline gap-2">
                          <span className="text-4xl font-bold text-black dark:text-white">{DISPLAY_PLAN_PRICE.Free}</span>
                          <span className="text-black/70 dark:text-white/70">/月</span>
                        </div>
                      </div>
                      <ul className="space-y-3 flex-grow">
                        <li className="flex items-center gap-3">
                          <Check className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-300" />
                          <span className="text-sm text-black/80 dark:text-white/80">月次クレジット付与なし</span>
                        </li>
                        <li className="flex items-center gap-3">
                          <Check className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-300" />
                          <span className="text-sm text-black/80 dark:text-white/80">必要な分だけクレジットパックを購入して利用</span>
                        </li>
                        <li className="flex items-center gap-3">
                          <Check className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-300" />
                          <span className="text-sm text-black/80 dark:text-white/80">基本的なレポート生成機能</span>
                        </li>
                      </ul>
                      <Button
                        variant="outline"
                        className="w-full border-blue-300 bg-white text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:bg-black dark:text-blue-300 dark:hover:bg-blue-950/30"
                        disabled={true}
                      >
                        {planName === "Free" ? "現在のプラン" : "選択不可"}
                      </Button>
                    </div>
                  </motion.div>

                  {/* Standard Plan */}
                  <motion.div
                    whileHover={{ scale: 1.05, y: -10 }}
                    className={`card relative overflow-hidden rounded-3xl border bg-white shadow-sm transition-all duration-200 hover:bg-white hover:shadow-lg dark:bg-black dark:hover:bg-black ${planName === "Standard" ? "border-2 border-blue-600 dark:border-blue-500" : "border-blue-200 dark:border-blue-900"}`}
                  >
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-full text-center z-10">
                      <span className="inline-block rounded-full bg-blue-600 px-6 py-2 text-base font-bold text-white shadow-lg dark:bg-blue-500">
                        おすすめ
                      </span>
                    </div>
                    <div className="flex h-full flex-col space-y-6 px-6 pb-6 pt-8">
                      <div>
                        <h3 className="mb-2 text-2xl font-bold text-black dark:text-white">Standard</h3>
                        <div className="flex items-baseline gap-2">
                          <span className="text-4xl font-bold text-black dark:text-white">{DISPLAY_PLAN_PRICE.Standard}</span>
                          <span className="text-black/70 dark:text-white/70">/月</span>
                        </div>
                      </div>
                      <ul className="space-y-3 flex-grow">
                        <li className="flex items-center gap-3">
                          <Check className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-300" />
                          <span className="text-sm text-black/80 dark:text-white/80">毎月{MONTHLY_CREDITS_STANDARD}クレジットを自動付与</span>
                        </li>
                        <li className="flex items-center gap-3">
                          <Check className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-300" />
                          <span className="text-sm text-black/80 dark:text-white/80">クレジットを消費して生成/アップロード</span>
                        </li>
                        <li className="flex items-center gap-3">
                          <Check className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-300" />
                          <span className="text-sm text-black/80 dark:text-white/80">不足分はクレジットパックで補充可能</span>
                        </li>
                        <li className="flex items-center gap-3">
                          <Check className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-300" />
                          <span className="text-sm text-black/80 dark:text-white/80">過去レポ再現モードを利用可能</span>
                        </li>
                      </ul>
                      {planName === "Standard" ? (
                        <Button className="w-full border border-blue-300 bg-white text-black/60 dark:border-blue-700 dark:bg-black dark:text-white/60" disabled>
                          現在のプラン
                        </Button>
                      ) : (
                        <Button
                          className="w-full bg-blue-600 text-white hover:bg-blue-700"
                          disabled={isProcessing}
                          onClick={() => handleCheckout(process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_STANDARD!)}
                        >
                          Standardを始める
                        </Button>
                      )}
                    </div>
                  </motion.div>

                  {/* Premium Plan */}
                  <motion.div
                    whileHover={{ scale: 1.05, y: -10 }}
                    className={`card relative overflow-hidden rounded-3xl border bg-white shadow-sm transition-all duration-200 hover:bg-white hover:shadow-lg dark:bg-black dark:hover:bg-black ${planName === "Premium" ? "border-2 border-blue-600 dark:border-blue-500" : "border-blue-200 dark:border-blue-900"}`}
                  >
                    <div className="flex h-full flex-col space-y-6 p-6 pt-8">
                      <div>
                        <h3 className="mb-2 text-2xl font-bold text-black dark:text-white">Premium</h3>
                        <div className="flex items-baseline gap-2">
                          <span className="text-4xl font-bold text-blue-700 dark:text-blue-300">{DISPLAY_PLAN_PRICE.Premium}</span>
                          <span className="text-black/70 dark:text-white/70">/月</span>
                        </div>
                      </div>
                      <ul className="space-y-3 flex-grow">
                        <li className="flex items-center gap-3">
                          <Check className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-300" />
                          <span className="text-sm text-black/80 dark:text-white/80">毎月{MONTHLY_CREDITS_PREMIUM}クレジットを自動付与</span>
                        </li>
                        <li className="flex items-center gap-3">
                          <Check className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-300" />
                          <span className="text-sm text-black/80 dark:text-white/80">高度なAI分析と全機能を利用可能</span>
                        </li>
                        <li className="flex items-center gap-3">
                          <Check className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-300" />
                          <span className="text-sm text-black/80 dark:text-white/80">不足時はクレジットパックで追加購入</span>
                        </li>
                      </ul>
                      {planName === "Premium" ? (
                        <Button className="w-full border border-blue-300 bg-white text-black/60 dark:border-blue-700 dark:bg-black dark:text-white/60" disabled>
                          現在のプラン
                        </Button>
                      ) : (
                        <Button
                          className="w-full bg-blue-600 text-white hover:bg-blue-500"
                          disabled={isProcessing}
                          onClick={() => handleCheckout(process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_PREMIUM!)}
                        >
                          Premiumを始める
                        </Button>
                      )}
                    </div>
                  </motion.div>
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
                      <Switch 
                        id="email-notifications" 
                        checked={emailNotifications}
                        onCheckedChange={(c) => handleNotificationChange('email', c)}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label htmlFor="report-complete">レポート完了通知</Label>
                        <p className="text-sm text-muted-foreground">生成が完了したら通知</p>
                      </div>
                      <Switch 
                        id="report-complete" 
                        checked={reportNotifications}
                        onCheckedChange={(c) => handleNotificationChange('report', c)}
                      />
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
                    <Button 
                      variant="destructive" 
                      onClick={() => setShowDeleteAccountDialog(true)}
                    >
                      アカウントを削除
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* Cancel Subscription Confirmation Dialog */}
      <AlertDialog open={showCancelSubDialog} onOpenChange={setShowCancelSubDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>サブスクリプションを解約しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              解約後も現在の請求期間の終了時まではサービスをご利用いただけます。期間終了後、自動的にFreeプランに移行します。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCancellingSub}>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelSubscription}
              disabled={isCancellingSub}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isCancellingSub ? "処理中..." : "解約する"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Account Confirmation Dialog */}
      <AlertDialog open={showDeleteAccountDialog} onOpenChange={setShowDeleteAccountDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>本当にアカウントを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              この操作は取り消せません。全てのデータ（レポート、アップロードファイル、設定）が永久に削除されます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingAccount}>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAccount}
              disabled={isDeletingAccount}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingAccount ? "処理中..." : "削除を実行"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardPageShell>
  )
}
