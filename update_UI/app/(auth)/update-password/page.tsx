"use client"

import { useEffect, useState, Suspense, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Lock, ArrowLeft, AlertCircle, CheckCircle } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { motion, useMotionTemplate, useMotionValue } from "framer-motion"
import ShaderBackground from "@/components/shader-background"
import PulsingCircle from "@/components/pulsing-circle"
import GlassButton from "@/components/glass-button"

function UpdatePasswordForm() {
  const router = useRouter()
  const search = useSearchParams()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  // Card spotlight effect
  const cardRef = useRef<HTMLDivElement>(null)
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    mouseX.set(e.clientX - rect.left)
    mouseY.set(e.clientY - rect.top)
  }

  const borderMask = useMotionTemplate`radial-gradient(300px circle at ${mouseX}px ${mouseY}px, rgba(255,255,255,0.8), transparent 100%)`

  useEffect(() => {
    const code = search?.get("code")
    if (!code) return
    const run = async () => {
      try {
        const supabase = createClient()
        const codeVerifierFromUrl = search?.get("code_verifier")
        const codeVerifierFromStorage = typeof window !== "undefined" ? localStorage.getItem("supabase.auth.token-code-verifier") : null

        const codeVerifier = codeVerifierFromUrl || codeVerifierFromStorage
        if (!codeVerifier) {
          setError("リンクを開いたブラウザで再度お試しください。")
          return
        }

        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          setError(error.message)
          return
        }
      } catch (e) {
        setError("セッションの復元に失敗しました。")
      }
    }
    run()
  }, [search])

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
      setMessage("パスワードを更新しました。")
      setTimeout(() => router.push("/login"), 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md">
      {/* Logo and Title */}
      <div className="text-center mb-8 mincho">
        <div className="flex items-center justify-center gap-2 mb-4">
          <span className="text-3xl font-bold text-gray-900 instrument tracking-tight">Reportlab</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">パスワード更新</h1>
        <p className="text-gray-500 text-sm">新しいパスワードを設定してください</p>
      </div>

      {/* Glass Card */}
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        className="relative p-8 rounded-3xl overflow-hidden group shadow-2xl"
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.45)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid rgba(255, 255, 255, 0.4)",
        }}
      >
        {/* Spotlight Border */}
        <motion.div 
          className="absolute inset-0 border-2 pointer-events-none rounded-3xl z-20"
          style={{
            borderColor: "#3b82f6",
            WebkitMaskImage: borderMask,
            maskImage: borderMask,
            opacity: 0.4
          }}
        />

        <div className="relative z-30">
          <form onSubmit={handleSubmit} className="space-y-6">
            {message && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-green-700 font-medium">{message}</p>
              </div>
            )}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-600 font-medium">{error}</p>
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-semibold text-gray-700">
                新しいパスワード
              </label>
              <div className="relative group">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white/50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-gray-900"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="confirm" className="block text-sm font-semibold text-gray-700">
                パスワード（確認）
              </label>
              <div className="relative group">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                <input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white/50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-gray-900"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <GlassButton 
              variant="filled" 
              className="w-full py-3 h-auto bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/30 border-none mt-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  更新中...
                </span>
              ) : (
                "パスワードを更新"
              )}
            </GlassButton>
          </form>

          <div className="mt-8 text-center pt-6 border-t border-gray-200/50">
            <Link href="/login" className="text-gray-500 hover:text-blue-600 text-sm font-medium transition-colors inline-flex items-center gap-1 group">
              <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" /> ログインへ戻る
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function UpdatePasswordPage() {
  return (
    <ShaderBackground>
      <div className="min-h-screen flex items-center justify-center px-4 py-12 relative z-10">
        <PulsingCircle />
        <Suspense fallback={<div className="text-white">Loading...</div>}>
          <UpdatePasswordForm />
        </Suspense>
      </div>
    </ShaderBackground>
  )
}