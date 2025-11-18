"use client"

import type React from "react"

import { useState } from "react"
import { motion } from "framer-motion"
import { Mail, Send, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

export default function EmailSupportPage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  })
  const [isSubmitted, setIsSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // ここで実際のメール送信処理を行う
    setIsSubmitted(true)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <Link href="/help">
          <Button variant="ghost" className="mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" />
            ヘルプセンターに戻る
          </Button>
        </Link>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-4">
            <Mail className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">メールサポート</h1>
          <p className="text-lg text-gray-600">24時間以内に返信いたします</p>
        </motion.div>

        {!isSubmitted ? (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <div className="bg-white rounded-xl border-2 border-gray-200 p-8 shadow-lg">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <Label htmlFor="name" className="text-gray-900 font-semibold">
                    お名前 <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="name"
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="mt-2"
                    placeholder="山田太郎"
                  />
                </div>

                <div>
                  <Label htmlFor="email" className="text-gray-900 font-semibold">
                    メールアドレス <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="mt-2"
                    placeholder="example@email.com"
                  />
                </div>

                <div>
                  <Label htmlFor="subject" className="text-gray-900 font-semibold">
                    件名 <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="subject"
                    type="text"
                    required
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                    className="mt-2"
                    placeholder="お問い合わせの件名"
                  />
                </div>

                <div>
                  <Label htmlFor="message" className="text-gray-900 font-semibold">
                    お問い合わせ内容 <span className="text-red-500">*</span>
                  </Label>
                  <Textarea
                    id="message"
                    required
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    className="mt-2 min-h-[200px]"
                    placeholder="詳細をご記入ください"
                  />
                </div>

                <Button type="submit" size="lg" className="w-full">
                  <Send className="h-5 w-5 mr-2" />
                  送信する
                </Button>
              </form>
            </div>

            <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-3">お問い合わせ前にご確認ください</h3>
              <ul className="space-y-2 text-gray-700">
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
            className="bg-white rounded-xl border-2 border-green-200 p-12 text-center shadow-lg"
          >
            <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-6">
              <Send className="h-10 w-10 text-green-600" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">送信完了</h2>
            <p className="text-lg text-gray-600 mb-8">
              お問い合わせありがとうございます。
              <br />
              24時間以内に返信いたしますので、しばらくお待ちください。
            </p>
            <Button asChild variant="outline">
              <Link href="/help">ヘルプセンターに戻る</Link>
            </Button>
          </motion.div>
        )}
      </div>
    </div>
  )
}
