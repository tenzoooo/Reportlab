"use client"

import { useState } from "react"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { User, Lock, Bell, Trash2, Save } from "lucide-react"

export default function SettingsPage() {
  const [fullName, setFullName] = useState("山田 太郎")
  const [email, setEmail] = useState("yamada@example.com")
  const [notifications, setNotifications] = useState(true)

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <Header />

      {/* Organic blob shapes */}
      <div className="blob-purple w-[400px] h-[400px] top-0 right-0 translate-x-1/4 -translate-y-1/4" />
      <div className="blob-yellow w-[350px] h-[350px] bottom-0 left-0 -translate-x-1/4 translate-y-1/4" />

      {/* Floating dots */}
      <div className="floating-dot bg-purple-600 top-1/4 left-1/4" style={{ animationDelay: "0s" }} />
      <div className="floating-dot bg-yellow-400 top-1/3 right-1/4" style={{ animationDelay: "1s" }} />
      <div className="floating-dot bg-pink-400 bottom-1/3 left-1/3" style={{ animationDelay: "2s" }} />

      <main className="container mx-auto px-4 py-12 relative z-10">
        <div className="max-w-3xl mx-auto space-y-8">
          <div className="text-center">
            <h1 className="text-5xl font-bold mb-4 text-balance">
              アカウント
              <span className="relative inline-block ml-3">
                <span className="text-purple-600">設定</span>
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
            <p className="text-xl text-muted-foreground">プロフィールとアカウント情報を管理</p>
          </div>

          {/* Profile Settings */}
          <Card className="rounded-3xl shadow-2xl border-2">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-purple-600 rounded-2xl flex items-center justify-center">
                  <User className="h-6 w-6 text-white" />
                </div>
                <div>
                  <CardTitle className="text-2xl">プロフィール</CardTitle>
                  <CardDescription className="text-base">基本情報を更新</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-base">
                  氏名
                </Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-base">
                  メールアドレス
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rounded-xl"
                />
              </div>
              <Button className="w-full rounded-xl py-6">
                <Save className="h-4 w-4 mr-2" />
                変更を保存
              </Button>
            </CardContent>
          </Card>

          {/* Password Settings */}
          <Card className="rounded-3xl shadow-2xl border-2">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-yellow-400 rounded-2xl flex items-center justify-center">
                  <Lock className="h-6 w-6 text-white" />
                </div>
                <div>
                  <CardTitle className="text-2xl">パスワード</CardTitle>
                  <CardDescription className="text-base">パスワードを変更</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="currentPassword" className="text-base">
                  現在のパスワード
                </Label>
                <Input id="currentPassword" type="password" placeholder="••••••••" className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword" className="text-base">
                  新しいパスワード
                </Label>
                <Input id="newPassword" type="password" placeholder="••••••••" className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-base">
                  新しいパスワード（確認）
                </Label>
                <Input id="confirmPassword" type="password" placeholder="••••••••" className="rounded-xl" />
              </div>
              <Button className="w-full rounded-xl py-6">
                <Lock className="h-4 w-4 mr-2" />
                パスワードを更新
              </Button>
            </CardContent>
          </Card>

          {/* Notification Settings */}
          <Card className="rounded-3xl shadow-2xl border-2">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-pink-400 rounded-2xl flex items-center justify-center">
                  <Bell className="h-6 w-6 text-white" />
                </div>
                <div>
                  <CardTitle className="text-2xl">通知設定</CardTitle>
                  <CardDescription className="text-base">メール通知を管理</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-accent rounded-2xl">
                <div>
                  <p className="font-medium">レポート完了通知</p>
                  <p className="text-sm text-muted-foreground">レポート生成が完了したときにメールで通知</p>
                </div>
                <Button
                  variant={notifications ? "default" : "outline"}
                  size="sm"
                  onClick={() => setNotifications(!notifications)}
                  className="rounded-xl"
                >
                  {notifications ? "ON" : "OFF"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="rounded-3xl shadow-2xl border-2 border-red-200 bg-red-50/50">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-red-600 rounded-2xl flex items-center justify-center">
                  <Trash2 className="h-6 w-6 text-white" />
                </div>
                <div>
                  <CardTitle className="text-2xl text-red-600">危険な操作</CardTitle>
                  <CardDescription className="text-base">アカウントを削除</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                アカウントを削除すると、すべてのデータが完全に削除されます。この操作は取り消せません。
              </p>
              <Button variant="destructive" className="w-full rounded-xl py-6">
                <Trash2 className="h-4 w-4 mr-2" />
                アカウントを削除
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
