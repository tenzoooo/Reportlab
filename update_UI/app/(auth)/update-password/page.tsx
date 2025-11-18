"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { Lock, ArrowLeft } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

export default function UpdatePasswordPage() {
  const router = useRouter()
  const search = useSearchParams()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  // New password recovery links may include a `code` param that must be exchanged for a session
  useEffect(() => {
    const code = search?.get("code")
    if (!code) return
    const run = async () => {
      try {
        const supabase = createClient()
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) throw error
      } catch (e) {
        console.error(e)
      }
    }
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setMessage("")
    if (password.length < 8) {
      setError("パスワードは8文字以上で入力してください")
      return
    }
    if (password !== confirm) {
      setError("パスワードが一致しません")
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setMessage("パスワードを更新しました。ログインしてください。")
      setTimeout(() => router.push("/login"), 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Image src="/app-icon.png" alt="App Icon" width={40} height={40} className="h-10 w-10" />
            <span className="text-2xl font-bold text-foreground">Reportlab</span>
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">パスワード更新</h1>
          <p className="text-muted-foreground">新しいパスワードを設定してください</p>
        </div>

        <div className="bg-card rounded-2xl shadow-xl border border-border p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {message && <p className="text-sm text-green-600">{message}</p>}
            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-semibold text-card-foreground">
                新しいパスワード
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all bg-background text-foreground"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="confirm" className="block text-sm font-semibold text-card-foreground">
                パスワード（確認）
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all bg-background text-foreground"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <button type="submit" disabled={loading} className="w-full primary-button disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? "更新中..." : "パスワードを更新"}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link href="/login" className="text-muted-foreground hover:text-foreground text-sm transition-colors inline-flex items-center gap-1">
              <ArrowLeft className="h-4 w-4" /> ログインへ戻る
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

