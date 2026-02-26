"use client"

import type React from "react"

import { useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FileText, Loader2, Sparkles } from "lucide-react"

export default function SignInPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    console.log("[v0] サインイン開始:", email)

    const supabase = createClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: {
        emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL || `${window.location.origin}/`,
      },
    })

    if (error) {
      console.log("[v0] サインインエラー:", error.message)
      setError("メールアドレスまたはパスワードが正しくありません")
      setLoading(false)
    } else {
      console.log("[v0] サインイン成功:", data.user?.email)
      window.location.href = "/workflow"
    }
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center p-4">
      {/* Organic blob shapes */}
      <div className="blob-purple w-[400px] h-[400px] top-0 right-0 translate-x-1/4 -translate-y-1/4" />
      <div className="blob-pink w-[300px] h-[300px] bottom-0 left-0 -translate-x-1/4 translate-y-1/4" />

      {/* Floating dots */}
      <div className="floating-dot bg-purple-600 top-1/4 left-1/4" style={{ animationDelay: "0s" }} />
      <div className="floating-dot bg-pink-400 top-1/3 right-1/4" style={{ animationDelay: "1s" }} />
      <div className="floating-dot bg-yellow-400 bottom-1/3 right-1/3" style={{ animationDelay: "2s" }} />

      <Card className="w-full max-w-md relative z-10 rounded-3xl shadow-2xl border-2">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-purple-800 rounded-2xl flex items-center justify-center shadow-lg">
              <FileText className="h-8 w-8 text-white" />
            </div>
          </div>
          <CardTitle className="text-3xl font-bold">ReportAI にログイン</CardTitle>
          <CardDescription className="text-base">
            アカウントにログインして、レポート生成を開始しましょう
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignIn} className="space-y-4">
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
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded-xl border-2 border-red-200">{error}</div>
            )}

            <Button type="submit" className="w-full rounded-xl py-6" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ログイン中...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  ログイン
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm">
            <p className="text-muted-foreground">
              アカウントをお持ちでないですか？{" "}
              <Link href="/auth/signup" className="text-purple-600 hover:underline font-medium">
                今すぐ登録
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
