"use client"

import type React from "react"

import { useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FileText, Loader2, Sparkles, CheckCircle2 } from "lucide-react"

export default function SignUpPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (password.length < 6) {
      setError("パスワードは6文字以上である必要があります")
      setLoading(false)
      return
    }

    console.log("[v0] サインアップ開始:", email)

    const supabase = createClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
        emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL || `${window.location.origin}/`,
      },
    })

    if (error) {
      console.log("[v0] サインアップエラー:", error.message)
      setError(error.message)
      setLoading(false)
    } else {
      console.log("[v0] サインアップ成功:", data.user?.email)
      setSuccess(true)
      setTimeout(() => {
        window.location.href = "/workflow"
      }, 2000)
    }
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center p-4">
      {/* Organic blob shapes */}
      <div className="blob-yellow w-[400px] h-[400px] top-0 left-0 -translate-x-1/4 -translate-y-1/4" />
      <div className="blob-purple w-[350px] h-[350px] bottom-0 right-0 translate-x-1/4 translate-y-1/4" />

      {/* Floating dots */}
      <div className="floating-dot bg-yellow-400 top-1/4 right-1/4" style={{ animationDelay: "0s" }} />
      <div className="floating-dot bg-purple-600 top-1/3 left-1/4" style={{ animationDelay: "1s" }} />
      <div className="floating-dot bg-pink-400 bottom-1/3 left-1/3" style={{ animationDelay: "2s" }} />

      <Card className="w-full max-w-md relative z-10 rounded-3xl shadow-2xl border-2">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-2xl flex items-center justify-center shadow-lg">
              <FileText className="h-8 w-8 text-white" />
            </div>
          </div>
          <CardTitle className="text-3xl font-bold">ReportAI に登録</CardTitle>
          <CardDescription className="text-base">
            アカウントを作成して、今すぐレポート生成を体験しましょう
          </CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="text-center py-8">
              <div className="text-green-600 mb-4">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="h-12 w-12" />
                </div>
              </div>
              <h3 className="text-xl font-bold mb-2">登録完了!</h3>
              <p className="text-muted-foreground">ダッシュボードにリダイレクトしています...</p>
            </div>
          ) : (
            <form onSubmit={handleSignUp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">氏名</Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="山田 太郎"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  disabled={loading}
                  className="rounded-xl"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">メールアドレス</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  className="rounded-xl"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">パスワード</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  className="rounded-xl"
                />
                <p className="text-xs text-muted-foreground">6文字以上で入力してください</p>
              </div>

              {error && (
                <div className="text-sm text-red-600 bg-red-50 p-3 rounded-xl border-2 border-red-200">{error}</div>
              )}

              <Button type="submit" className="w-full rounded-xl py-6" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    登録中...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    今すぐ体験
                  </>
                )}
              </Button>
            </form>
          )}

          {!success && (
            <div className="mt-6 text-center text-sm">
              <p className="text-muted-foreground">
                すでにアカウントをお持ちですか？{" "}
                <Link href="/auth/signin" className="text-purple-600 hover:underline font-medium">
                  ログイン
                </Link>
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
