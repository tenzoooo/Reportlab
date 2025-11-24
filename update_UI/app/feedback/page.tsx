"use client"

import type React from "react"

import { useState } from "react"
import { motion } from "framer-motion"
import { ArrowLeft, Send, Star } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

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
  const [formData, setFormData] = useState({
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
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
          <Card className="max-w-md mx-auto">
            <CardContent className="pt-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold mb-2">フィードバックありがとうございます！</h2>
              <p className="text-muted-foreground mb-6">
                貴重なご意見をいただき、ありがとうございます。サービス改善の参考にさせていただきます。
              </p>
              {submittedData && (
                <div className="text-left space-y-4 mb-6">
                  <div>
                    <p className="text-sm text-muted-foreground">お名前</p>
                    <p className="font-medium">{submittedData.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">メールアドレス</p>
                    <p className="font-medium">{submittedData.email}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">ステータス</p>
                    <p className="font-medium">{submittedData.status}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">要件</p>
                    <p className="font-medium whitespace-pre-wrap">{submittedData.feedback}</p>
                  </div>
                </div>
              )}
              <Link href="/dashboard">
                <Button className="w-full">ダッシュボードに戻る</Button>
              </Link>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        {/* Back Button */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              ダッシュボードに戻る
            </Button>
          </Link>
        </motion.div>

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <h1 className="text-3xl font-bold">フィードバック</h1>
          <p className="text-muted-foreground mt-2">
            ご意見・ご要望をお聞かせください。皆様のフィードバックがサービス向上に繋がります。
          </p>
        </motion.div>

        {/* Feedback Form */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card>
            <CardHeader>
              <CardTitle>フィードバックフォーム</CardTitle>
              <CardDescription>どのような内容でもお気軽にお送りください</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Rating */}
                <div className="space-y-2">
                  <Label>満足度</Label>
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
                            star <= (hoveredRating || rating) ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Name */}
                <div className="space-y-2">
                  <Label htmlFor="name">お名前</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="山田太郎"
                    required
                  />
                </div>

                {/* Email */}
                <div className="space-y-2">
                  <Label htmlFor="email">メールアドレス</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="example@email.com"
                    required
                  />
                </div>

                {/* Category */}
                <div className="space-y-2">
                  <Label htmlFor="category">カテゴリー</Label>
                  <select
                    id="category"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as FeedbackCategory })}
                    className="w-full px-3 py-2 border border-input rounded-lg bg-background"
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
                  <Label htmlFor="message">要件</Label>
                  <Textarea
                    id="message"
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    placeholder="具体的な要件やご要望をお聞かせください..."
                    rows={6}
                    required
                  />
                </div>

                {/* Submit Button */}
                {errorMessage && <p className="text-sm text-red-500">{errorMessage}</p>}
                <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
                  <Send className="h-4 w-4 mr-2" />
                  {isSubmitting ? "送信中..." : "送信する"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
