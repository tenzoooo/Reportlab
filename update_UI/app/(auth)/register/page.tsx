"use client"

import type React from "react"
import { useState, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Mail, Lock, User, AlertCircle, Eye, EyeOff, CheckCircle } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { motion, useMotionTemplate, useMotionValue } from "framer-motion"
import ShaderBackground from "@/components/shader-background"
import PulsingCircle from "@/components/pulsing-circle"
import GlassButton from "@/components/glass-button"

export default function RegisterPage() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendError, setResendError] = useState("")
  const [resendSuccess, setResendSuccess] = useState("")

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

  const validatePassword = (pwd: string) => {
    return pwd.length >= 8 && /[A-Z]/.test(pwd) && /[a-z]/.test(pwd) && /[0-9]/.test(pwd)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    if (!name || !email || !password || !confirmPassword) {
      setError("すべてのフィールドを入力してください")
      setLoading(false)
      return
    }

    if (!validatePassword(password)) {
      setError("パスワードは8文字以上で、大文字・小文字・数字を含む必要があります")
      setLoading(false)
      return
    }

    if (password !== confirmPassword) {
      setError("パスワードが一致しません")
      setLoading(false)
      return
    }

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name },
        },
      })

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      setEmailSent(true)
    } catch (err) {
      setError("登録中にエラーが発生しました")
    } finally {
      setLoading(false)
    }
  }

  const handleResendEmail = async () => {
    if (!email) {
      setResendError("登録したメールアドレスが確認できませんでした。")
      return
    }

    setResendError("")
    setResendSuccess("")
    setResending(true)

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
      })

      if (error) throw error
      setResendSuccess("確認メールを再送しました。")
    } catch (err) {
      setResendError(err instanceof Error ? err.message : "メールの再送に失敗しました")
    } finally {
      setResending(false)
    }
  }

  if (emailSent) {
    return (
      <ShaderBackground>
        <div className="min-h-screen flex items-center justify-center px-4 py-12 relative z-10">
          <div className="w-full max-w-md">
            <div 
              className="p-8 rounded-3xl shadow-2xl text-center"
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.45)",
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
                border: "1px solid rgba(255, 255, 255, 0.4)",
              }}
            >
              <div className="flex justify-center mb-6">
                <div className="h-20 w-20 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle className="h-10 w-10 text-green-600" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 mincho">確認メールを送信しました</h2>
              <p className="text-gray-600 mb-8 text-sm leading-relaxed">
                ご登録いただいたメールアドレス ({email}) に確認リンクを送信しました。<br />
                メール内のリンクをクリックして、アカウント登録を完了してください。
              </p>
              
              {resendSuccess && (
                <div className="bg-green-50/80 border border-green-200 rounded-xl p-4 text-left mb-4 text-sm text-green-700">
                  {resendSuccess}
                </div>
              )}
              {resendError && (
                <div className="bg-red-50/80 border border-red-200 rounded-xl p-4 text-left mb-4 text-sm text-red-700">
                  {resendError}
                </div>
              )}

              <div className="space-y-4">
                <button
                  type="button"
                  onClick={handleResendEmail}
                  disabled={resending}
                  className="w-full py-3 text-sm font-semibold text-blue-600 border border-blue-200 rounded-xl hover:bg-white/50 transition-all disabled:opacity-50"
                >
                  {resending ? "再送信中..." : "確認メールを再送する"}
                </button>
                <GlassButton variant="filled" className="w-full py-3 h-auto bg-blue-600 text-white" asChild>
                  <Link href="/login">ログインページへ</Link>
                </GlassButton>
              </div>
            </div>
          </div>
        </div>
      </ShaderBackground>
    )
  }

  return (
    <ShaderBackground>
      <div className="min-h-screen flex items-center justify-center px-4 py-12 relative z-10">
        <PulsingCircle />
        
        <div className="w-full max-w-md">
          {/* Logo and Title */}
          <div className="text-center mb-8 mincho">
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="text-3xl font-bold text-gray-900 instrument tracking-tight">Reportlab</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">新規登録</h1>
            <p className="text-gray-500 text-sm">無料でアカウントを作成</p>
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
              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-600 font-medium">{error}</p>
                  </div>
                )}

                <div className="space-y-2">
                  <label htmlFor="name" className="block text-sm font-semibold text-gray-700">
                    お名前
                  </label>
                  <div className="relative group">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                    <input
                      id="name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-white/50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-gray-900"
                      placeholder="山田 太郎"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="email" className="block text-sm font-semibold text-gray-700">
                    メールアドレス
                  </label>
                  <div className="relative group">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-white/50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-gray-900"
                      placeholder="your.email@example.com"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="password" className="block text-sm font-semibold text-gray-700">
                    パスワード
                  </label>
                  <div className="relative group">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-12 py-3 bg-white/50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-gray-900"
                      placeholder="••••••••"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-1"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-500 ml-1">8文字以上、大文字・小文字・数字を含む</p>
                </div>

                <div className="space-y-2">
                  <label htmlFor="confirmPassword" className="block text-sm font-semibold text-gray-700">
                    パスワード（確認）
                  </label>
                  <div className="relative group">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                    <input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full pl-10 pr-12 py-3 bg-white/50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-gray-900"
                      placeholder="••••••••"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-1"
                    >
                      {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <GlassButton 
                  variant="filled" 
                  className="w-full py-3 h-auto bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/30 border-none mt-4"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      登録中...
                    </span>
                  ) : (
                    "アカウントを作成"
                  )}
                </GlassButton>
              </form>

              <div className="mt-8 text-center pt-6 border-t border-gray-200/50">
                <p className="text-gray-500 text-sm">
                  すでにアカウントをお持ちの場合{" "}
                  <Link href="/login" className="text-blue-600 hover:text-blue-700 font-semibold transition-colors hover:underline underline-offset-4 ml-1">
                    ログイン
                  </Link>
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8 text-center">
            <Link href="/" className="text-gray-500 hover:text-gray-900 text-sm transition-colors flex items-center justify-center gap-2 group">
              <span className="group-hover:-translate-x-1 transition-transform">←</span> ホームに戻る
            </Link>
          </div>
        </div>
      </div>
    </ShaderBackground>
  )
}