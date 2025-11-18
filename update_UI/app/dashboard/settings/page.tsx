"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { motion } from "framer-motion"
import { User, CreditCard, Bell, Shield, Check, AlertTriangle } from "lucide-react"
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

export default function SettingsPage() {
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab") || "profile"
  const [activeTab, setActiveTab] = useState<string>(tabParam)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [currentPlan, setCurrentPlan] = useState("premium")
  const [profile, setProfile] = useState({ name: "", email: "", university: "", department: "" })
  const [profileMessage, setProfileMessage] = useState<string>("")
  const [profileError, setProfileError] = useState<string>("")
  const [isSavingProfile, setIsSavingProfile] = useState(false)

  useEffect(() => {
    setActiveTab(tabParam)

    const loadProfile = async () => {
      const safe = (v: any) => (typeof v === "string" ? v : "")
      try {
        const supabase = createClient()
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser()
        if (error || !user) {
          setProfileError("ユーザー情報の取得に失敗しました")
          return
        }
        setProfile({
          name: safe(user.user_metadata?.name),
          email: safe(user.email),
          university: safe(user.user_metadata?.university),
          department: safe(user.user_metadata?.department),
        })
      } catch (err) {
        setProfileError(err instanceof Error ? err.message : "プロフィール取得に失敗しました")
      }
    }
    loadProfile()
  }, [])

  const handleSaveProfile = async () => {
    setProfileMessage("")
    setProfileError("")
    setIsSavingProfile(true)
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
      setProfileMessage("プロフィールを保存しました")
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "プロフィールの保存に失敗しました")
    } finally {
      setIsSavingProfile(false)
    }
  }

  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, staggerChildren: 0.1 } },
  }
  const itemVariants = { hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }

  const handleCancelSubscription = () => {
    setCurrentPlan("free")
    setShowCancelDialog(false)
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

        <Tabs value={activeTab} onValueChange={setActiveTab} defaultValue={tabParam} className="w-full">
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

          <TabsContent value="profile" className="space-y-6" forceMount>
            <motion.div variants={itemVariants}>
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

                  {profileMessage && <p className="text-sm text-green-600">{profileMessage}</p>}
                  {profileError && <p className="text-sm text-red-600">{profileError}</p>}

                  <div className="flex justify-end">
                    <Button onClick={handleSaveProfile} disabled={isSavingProfile}>
                      {isSavingProfile ? "保存中..." : "変更を保存"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>

          <TabsContent value="subscription" className="space-y-6" forceMount>
            <motion.div variants={itemVariants} className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>現在のプラン</CardTitle>
                  <CardDescription>使用状況とプランの詳細</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                    <div>
                      <h3 className="text-xl font-bold text-foreground">
                        {currentPlan === "premium" ? "Premium" : "Free"} プラン
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {currentPlan === "premium"
                          ? "すべての機能をご利用いただけます"
                          : "基本機能をご利用いただけます"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-foreground">{currentPlan === "premium" ? "¥980" : "¥0"}</p>
                      <p className="text-sm text-muted-foreground">/月</p>
                    </div>
                  </div>

                  {currentPlan === "premium" && (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-3">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                        <div className="flex-1">
                          <h4 className="font-semibold text-amber-900">プランの解約</h4>
                          <p className="text-sm text-amber-700 mt-1">
                            解約すると、次回請求日からFreeプランに変更されます。それまでは引き続きPremium機能をご利用いただけます。
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        className="w-full border-amber-300 text-amber-900 hover:bg-amber-100 bg-transparent"
                        onClick={() => setShowCancelDialog(true)}
                      >
                        サブスクリプションを解約
                      </Button>
                    </div>
                  )}

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">レポート作成</span>
                        <span className="font-semibold text-foreground">
                          {currentPlan === "premium" ? "15 件" : "3 / 5 件"}
                        </span>
                      </div>
                      <Progress value={currentPlan === "premium" ? 100 : 60} className="h-2" />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">ストレージ</span>
                        <span className="font-semibold text-foreground">
                          {currentPlan === "premium" ? "245 MB / 1 GB" : "45 MB / 100 MB"}
                        </span>
                      </div>
                      <Progress value={currentPlan === "premium" ? 24 : 45} className="h-2" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <motion.div variants={itemVariants}>
                <h3 className="text-xl font-semibold text-foreground mb-4">プラン比較</h3>
                <div className="grid md:grid-cols-2 gap-6">
                  <Card className={`border-2 ${currentPlan === "free" ? "border-primary" : "border-border"}`}>
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
                          <span className="text-foreground">レポート作成 5件/月</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="h-5 w-5 text-primary" />
                          <span className="text-foreground">ストレージ 100MB</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="h-5 w-5 text-primary" />
                          <span className="text-foreground">基本サポート</span>
                        </li>
                      </ul>
                      <Button variant="outline" className="w-full bg-transparent" disabled={currentPlan === "free"}>
                        {currentPlan === "free" ? "現在のプラン" : "ダウングレード"}
                      </Button>
                    </CardContent>
                  </Card>

                  <Card
                    className={`border-2 ${currentPlan === "premium" ? "border-primary" : "border-border"} shadow-lg relative overflow-hidden`}
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
                          <span className="text-foreground">レポート作成 無制限</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="h-5 w-5 text-primary" />
                          <span className="text-foreground">ストレージ 1GB</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="h-5 w-5 text-primary" />
                          <span className="text-foreground">優先サポート</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="h-5 w-5 text-primary" />
                          <span className="text-foreground">高度なAI分析</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="h-5 w-5 text-primary" />
                          <span className="text-foreground">カスタムテンプレート</span>
                        </li>
                      </ul>
                      <Button
                        className={`w-full ${
                          currentPlan === "premium"
                            ? ""
                            : "bg-gradient-to-r from-pink-500 via-yellow-500 to-pink-500 bg-[length:200%_100%] animate-gradient-x text-white font-semibold shadow-lg hover:shadow-xl transition-shadow"
                        }`}
                        disabled={currentPlan === "premium"}
                      >
                        {currentPlan === "premium" ? "現在のプラン" : "アップグレード"}
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </motion.div>
            </motion.div>
          </TabsContent>

          <TabsContent value="notifications" className="space-y-6" forceMount>
            <motion.div variants={itemVariants}>
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
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label htmlFor="storage-alert">ストレージ警告</Label>
                        <p className="text-sm text-muted-foreground">容量が80%を超えたら通知</p>
                      </div>
                      <Switch id="storage-alert" defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label htmlFor="marketing">マーケティングメール</Label>
                        <p className="text-sm text-muted-foreground">新機能やキャンペーン情報</p>
                      </div>
                      <Switch id="marketing" />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button>変更を保存</Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>

          <TabsContent value="security" className="space-y-6" forceMount>
            <motion.div variants={itemVariants}>
              <Card>
                <CardHeader>
                  <CardTitle>セキュリティ設定</CardTitle>
                  <CardDescription>アカウントのセキュリティを管理します</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-foreground">パスワード変更</h3>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="current-password">現在のパスワード</Label>
                        <Input id="current-password" type="password" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="new-password">新しいパスワード</Label>
                        <Input id="new-password" type="password" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="confirm-password">パスワード確認</Label>
                        <Input id="confirm-password" type="password" />
                      </div>
                      <Button>パスワード変更</Button>
                    </div>
                  </div>
                  <div className="pt-6 border-t space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <h3 className="text-lg font-semibold text-foreground">2段階認証</h3>
                        <p className="text-sm text-muted-foreground">セキュリティを強化します</p>
                      </div>
                      <Switch id="two-factor" />
                    </div>
                  </div>
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

      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent className="bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              サブスクリプションの解約
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 pt-2">
              <p>本当にPremiumプランを解約しますか?</p>
              <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
                <p className="text-sm text-amber-900 font-semibold">解約後の変更内容:</p>
                <ul className="text-sm text-amber-800 mt-2 space-y-1 list-disc list-inside">
                  <li>レポート作成が月5件に制限されます</li>
                  <li>ストレージが100MBに制限されます</li>
                  <li>Premium限定機能が使用できなくなります</li>
                </ul>
              </div>
              <p className="text-sm text-muted-foreground">
                次回請求日(2025年12月8日)からFreeプランに変更されます。それまでは引き続きPremium機能をご利用いただけます。
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelSubscription}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              解約する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
