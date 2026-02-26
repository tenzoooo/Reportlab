"use client"

import type React from "react"

import { useState } from "react"
import { motion } from "framer-motion"
import { Send, Star } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import StandalonePageShell from "@/components/standalone-page-shell"

const CATEGORY_OPTIONS = [
  { value: "新機能改善", label: "新機能・改善の提案" },
  { value: "不具合", label: "不具合の報告" },
  { value: "その他", label: "その他" },
] as const

type FeedbackCategory = (typeof CATEGORY_OPTIONS)[number]["value"]

type SubmittedFeedback = {
  name: string
  email: string
  status: FeedbackCategory
  feedback: string
  rating: number | null
}

export default function FeedbackPage() {
  const [rating, setRating] = useState(0)
  const [hoveredRating, setHoveredRating] = useState(0)
  const [submitted, setSubmitted] = useState(false)
  const [formData, setFormData] = useState<{
    name: string
    email: string
    category: FeedbackCategory
    message: string
  }>({
    name: "",
    email: "",
    category: CATEGORY_OPTIONS[0].value,
    message: "",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [submittedData, setSubmittedData] = useState<SubmittedFeedback | null>(null)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setErrorMessage(null)
    setIsSubmitting(true)

    const payload: SubmittedFeedback = {
      name: formData.name,
      email: formData.email,
      status: formData.category,
      feedback: formData.message,
      rating: rating || null,
    }

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: "" }))
        console.error("[v0] Failed to submit feedback", data)
        setErrorMessage(data.error || "フィードバックの送信に失敗しました。時間をおいて再度お試しください。")
        return
      }
      setSubmittedData(payload)
      setSubmitted(true)
    } catch (err) {
      console.error("[v0] Unexpected error while submitting feedback", err)
      setErrorMessage("予期せぬエラーが発生しました。時間をおいて再度お試しください。")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <StandalonePageShell
        title="フィードバック送信完了"
        subtitle="貴重なご意見を受け取りました"
        backHref="/dashboard"
        backLabel="ダッシュボードに戻る"
        badge="Feedback"
      >
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
          <Card className="max-w-md mx-auto bg-white/5 border-white/10">
            <CardContent className="pt-6">
              <div className="w-16 h-16 bg-emerald-500/15 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold mb-2 text-white">フィードバックありがとうございます！</h2>
              <p className="text-sm text-slate-300 mb-6">
                貴重なご意見をいただき、ありがとうございます。サービス改善の参考にさせていただきます。
              </p>
              {submittedData && (
                <div className="text-left space-y-4 mb-6">
                  <div>
                    <p className="text-xs uppercase tracking-widest text-slate-500">お名前</p>
                    <p className="font-medium text-white">{submittedData.name}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-widest text-slate-500">メールアドレス</p>
                    <p className="font-medium text-white">{submittedData.email}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-widest text-slate-500">ステータス</p>
                    <p className="font-medium text-white">{submittedData.status}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-widest text-slate-500">要件</p>
                    <p className="font-medium text-white whitespace-pre-wrap">{submittedData.feedback}</p>
                  </div>
                </div>
              )}
              <Link href="/dashboard">
                <Button className="w-full bg-blue-600 text-white hover:bg-blue-500">ダッシュボードに戻る</Button>
              </Link>
            </CardContent>
          </Card>
        </motion.div>
      </StandalonePageShell>
    )
  }

  return (
    <StandalonePageShell
      title="フィードバック"
      subtitle="ご意見・ご要望をお聞かせください。サービス向上に役立てます。"
      backHref="/dashboard"
      backLabel="ダッシュボードに戻る"
      badge="Feedback"
    >
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle className="text-white">フィードバックフォーム</CardTitle>
            <CardDescription className="text-slate-400">どのような内容でもお気軽にお送りください</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Rating */}
                <div className="space-y-2">
                  <Label className="text-slate-200">満足度</Label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRating(star)}
                        onMouseEnter={() => setHoveredRating(star)}
                        onMouseLeave={() => setHoveredRating(0)}
                        className="focus:outline-none"
                      >
                        <Star
                          className={`h-8 w-8 transition-colors ${
                            star <= (hoveredRating || rating) ? "fill-yellow-400 text-yellow-400" : "text-slate-600"
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Name */}
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-slate-200">お名前</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="山田太郎"
                    required
                    className="bg-slate-950/60 border-white/10 text-white placeholder:text-slate-500"
                  />
                </div>

                {/* Email */}
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-slate-200">メールアドレス</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="example@email.com"
                    required
                    className="bg-slate-950/60 border-white/10 text-white placeholder:text-slate-500"
                  />
                </div>

                {/* Category */}
                <div className="space-y-2">
                  <Label htmlFor="category" className="text-slate-200">カテゴリー</Label>
                  <select
                    id="category"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as FeedbackCategory })}
                    className="w-full px-3 py-2 border border-white/10 rounded-lg bg-slate-950/60 text-white"
                    required
                  >
                    {CATEGORY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Message */}
                <div className="space-y-2">
                  <Label htmlFor="message" className="text-slate-200">要件</Label>
                  <Textarea
                    id="message"
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    placeholder="具体的な要件やご要望をお聞かせください..."
                    rows={6}
                    required
                    className="bg-slate-950/60 border-white/10 text-white placeholder:text-slate-500"
                  />
                </div>

                {/* Submit Button */}
                {errorMessage && <p className="text-sm text-red-400">{errorMessage}</p>}
                <Button type="submit" className="w-full bg-blue-600 text-white hover:bg-blue-500" size="lg" disabled={isSubmitting}>
                  <Send className="h-4 w-4 mr-2" />
                  {isSubmitting ? "送信中..." : "送信する"}
                </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </StandalonePageShell>
  )
}
