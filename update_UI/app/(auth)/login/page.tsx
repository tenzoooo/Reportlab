"use client"

import type React from "react"
import { useState, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Mail, Lock, AlertCircle, Eye, EyeOff } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { motion, useMotionTemplate, useMotionValue } from "framer-motion"
import ShaderBackground from "@/components/shader-background"
import PulsingCircle from "@/components/pulsing-circle"
import GlassButton from "@/components/glass-button"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
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

  const borderMask = useMotionTemplate`radial-gradient(250px circle at ${mouseX}px ${mouseY}px, rgba(255,255,255,0.8), transparent 100%)`

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    if (!email || !password) {
      setError("メールアドレスとパスワードを入力してください")
      setLoading(false)
      return
    }

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      router.push("/dashboard/reports/new")
    } catch (err) {
      setError("ログイン中にエラーが発生しました")
    } finally {
      setLoading(false)
    }
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
            <h1 className="text-2xl font-bold text-gray-900 mb-2">ログイン</h1>
            <p className="text-gray-500 text-sm">アカウントにログインしてください</p>
          </div>

          {/* Glass Login Card */}
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
            {/* マウスに追従して光る枠線 */}
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
                {/* Error Message */}
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-600 font-medium">{error}</p>
                  </div>
                )}

                {/* Email Field */}
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
                      className="w-full pl-10 pr-4 py-3 bg-white/50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-gray-900 placeholder:text-gray-400"
                      placeholder="your.email@example.com"
                      required
                    />
                  </div>
                </div>

                {/* Password Field */}
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
                      className="w-full pl-10 pr-12 py-3 bg-white/50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-gray-900 placeholder:text-gray-400"
                      placeholder="••••••••"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-100"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                {/* Forgot Password Link */}
                <div className="text-right">
                  <Link
                    href="/forgot-password"
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors hover:underline underline-offset-4"
                  >
                    パスワードを忘れた場合
                  </Link>
                </div>

                {/* Login Button */}
                <GlassButton 
                  variant="filled" 
                  className="w-full py-3 h-auto bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/30 border-none"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ログイン中...
                    </span>
                  ) : (
                    "ログイン"
                  )}
                </GlassButton>
              </form>

              {/* Register Link */}
              <div className="mt-8 text-center pt-6 border-t border-gray-200/50">
                <p className="text-gray-500 text-sm">
                  アカウントをお持ちでない場合{" "}
                  <Link href="/register" className="text-blue-600 hover:text-blue-700 font-semibold transition-colors hover:underline underline-offset-4 ml-1">
                    新規登録
                  </Link>
                </p>
              </div>
            </div>
          </div>

          {/* Back to Home */}
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