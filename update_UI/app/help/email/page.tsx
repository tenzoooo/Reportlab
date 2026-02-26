"use client"

import type React from "react"

import { useState } from "react"
import { motion } from "framer-motion"
import { Mail, Send } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import StandalonePageShell from "@/components/standalone-page-shell"

export default function EmailSupportPage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  })
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      const { error } = await supabase.from("support_tickets").insert({
        name: formData.name,
        email: formData.email,
        subject: formData.subject,
        message: formData.message,
        user_id: user?.id || null,
      })

      if (error) throw error

      setIsSubmitted(true)
      toast.success("お問い合わせを送信しました")
    } catch (error) {
      console.error("Error submitting ticket:", error)
      toast.error("送信に失敗しました。時間をおいて再度お試しください。")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <StandalonePageShell
      title="メールサポート"
      subtitle="24時間以内に返信いたします"
      backHref="/help"
      backLabel="ヘルプセンターに戻る"
      badge="Support"
    >
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-white/5 rounded-full mb-4 border border-white/10">
          <Mail className="h-8 w-8 text-blue-400" />
        </div>
        <h2 className="text-3xl font-bold text-white mb-2">お問い合わせフォーム</h2>
        <p className="text-sm text-slate-300">必要事項をご記入ください</p>
      </motion.div>

        {!isSubmitted ? (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <div className="bg-white/5 rounded-3xl border border-white/10 p-8 shadow-[0_25px_80px_-40px_rgba(59,130,246,0.6)]">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <Label htmlFor="name" className="text-slate-200 font-semibold">
                    お名前 <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="name"
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="mt-2 bg-slate-950/60 border-white/10 text-white placeholder:text-slate-500"
                    placeholder="山田太郎"
                  />
                </div>

                <div>
                  <Label htmlFor="email" className="text-slate-200 font-semibold">
                    メールアドレス <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="mt-2 bg-slate-950/60 border-white/10 text-white placeholder:text-slate-500"
                    placeholder="example@email.com"
                  />
                </div>

                <div>
                  <Label htmlFor="subject" className="text-slate-200 font-semibold">
                    件名 <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="subject"
                    type="text"
                    required
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                    className="mt-2 bg-slate-950/60 border-white/10 text-white placeholder:text-slate-500"
                    placeholder="お問い合わせの件名"
                  />
                </div>

                <div>
                  <Label htmlFor="message" className="text-slate-200 font-semibold">
                    お問い合わせ内容 <span className="text-red-500">*</span>
                  </Label>
                  <Textarea
                    id="message"
                    required
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    className="mt-2 min-h-[200px] bg-slate-950/60 border-white/10 text-white placeholder:text-slate-500"
                    placeholder="詳細をご記入ください"
                  />
                </div>

                <Button type="submit" size="lg" className="w-full bg-blue-600 text-white hover:bg-blue-500" disabled={isSubmitting}>
                  <Send className="h-5 w-5 mr-2" />
                  {isSubmitting ? "送信中..." : "送信する"}
                </Button>
              </form>
            </div>

            <div className="mt-8 bg-white/5 border border-white/10 rounded-2xl p-6">
              <h3 className="text-lg font-bold text-white mb-3">お問い合わせ前にご確認ください</h3>
              <ul className="space-y-2 text-sm text-slate-300">
                <li>• よくある質問で解決できる可能性があります</li>
                <li>• Premium会員の方は優先的に対応いたします</li>
                <li>• 営業時間: 平日 9:00-18:00</li>
                <li>• 土日祝日のお問い合わせは翌営業日に対応いたします</li>
              </ul>
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white/5 rounded-3xl border border-white/10 p-12 text-center shadow-[0_25px_80px_-40px_rgba(16,185,129,0.6)]"
          >
            <div className="inline-flex items-center justify-center w-20 h-20 bg-emerald-500/15 rounded-full mb-6">
              <Send className="h-10 w-10 text-emerald-400" />
            </div>
            <h2 className="text-3xl font-bold text-white mb-4">送信完了</h2>
            <p className="text-sm text-slate-300 mb-8">
              お問い合わせありがとうございます。
              <br />
              24時間以内に返信いたしますので、しばらくお待ちください。
            </p>
            <Button asChild variant="outline" className="border-white/15 text-white hover:bg-white/5">
              <Link href="/help">ヘルプセンターに戻る</Link>
            </Button>
          </motion.div>
        )}
    </StandalonePageShell>
  )
}
