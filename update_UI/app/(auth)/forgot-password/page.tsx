"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { Mail, ArrowLeft } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setMessage("")
    setLoading(true)
    try {
      const supabase = createClient()
      const redirectTo = `${window.location.origin}/update-password`
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
      if (error) throw error
      setMessage("パスワード再設定用のメールを送信しました。受信トレイをご確認ください。")
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
          <h1 className="text-3xl font-bold text-foreground mb-2">パスワード再設定</h1>
          <p className="text-muted-foreground">ご登録のメールアドレスを入力してください</p>
        </div>

        <div className="bg-card rounded-2xl shadow-xl border border-border p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {message && <p className="text-sm text-green-600">{message}</p>}
            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-semibold text-card-foreground">
                メールアドレス
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all bg-background text-foreground"
                  placeholder="your.email@example.com"
                  required
                />
              </div>
            </div>

            <button type="submit" disabled={loading} className="w-full primary-button disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? "送信中..." : "再設定メールを送信"}
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

