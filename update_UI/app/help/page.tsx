"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import {
  BookOpen,
  FileQuestion,
  MessageCircle,
  Mail,
  ChevronDown,
  ChevronUp,
  PlayCircle,
  Download,
  Search,
  ArrowLeft,
} from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const faqs = [
  {
    category: "基本的な使い方",
    questions: [
      {
        q: "レポートの作成方法は?",
        a: "ダッシュボードから「新規作成」ボタンをクリックし、実験書PDFをアップロードしてください。AIが自動的に内容を解析し、レポートを生成します。",
      },
      {
        q: "対応しているファイル形式は?",
        a: "現在、PDF形式の実験書に対応しています。最大ファイルサイズは50MBです。",
      },
      {
        q: "レポート生成にかかる時間は?",
        a: "通常、3〜5分程度で完了します。ファイルサイズや内容の複雑さにより変動する場合があります。",
      },
    ],
  },
  {
    category: "プランと料金",
    questions: [
      {
        q: "Freeプランの制限は?",
        a: "Freeプランでは月5件までレポートを作成でき、ストレージは100MBまで利用できます。",
      },
      {
        q: "Premiumプランの特典は?",
        a: "Premiumプランでは無制限のレポート作成、1GBのストレージ、優先サポートをご利用いただけます。月額980円です。",
      },
      {
        q: "プランの変更方法は?",
        a: "設定ページのサブスクリプションタブから、いつでもプランをアップグレードまたは解約できます。",
      },
    ],
  },
  {
    category: "トラブルシューティング",
    questions: [
      {
        q: "アップロードがエラーになる",
        a: "ファイルサイズが50MBを超えていないか、PDF形式であることを確認してください。問題が続く場合はサポートにお問い合わせください。",
      },
      {
        q: "レポート生成が失敗する",
        a: "実験書PDFの内容が読み取れない可能性があります。PDFが破損していないか、テキストが読み取り可能な状態かを確認してください。",
      },
      {
        q: "ダウンロードできない",
        a: "ブラウザのポップアップブロッカーが有効になっていないか確認してください。それでも問題が解決しない場合は別のブラウザをお試しください。",
      },
    ],
  },
  {
    category: "セキュリティ",
    questions: [
      {
        q: "アップロードしたデータはどうなる?",
        a: "すべてのデータは暗号化され、厳重に保管されます。レポート生成後、一定期間経過したデータは自動削除されます。",
      },
      {
        q: "データは第三者と共有される?",
        a: "いいえ、ユーザーのデータは一切第三者と共有されません。プライバシーポリシーをご確認ください。",
      },
    ],
  },
]

const guides = [
  {
    title: "はじめてのレポート作成",
    description: "初めての方向けに、レポート作成の基本的な流れを解説します",
    icon: PlayCircle,
    href: "#",
  },
  {
    title: "効果的なレポート作成のコツ",
    description: "より良いレポートを作成するためのベストプラクティス",
    icon: BookOpen,
    href: "#",
  },
  {
    title: "ショートカットキー一覧",
    description: "作業効率を上げるキーボードショートカット",
    icon: Download,
    href: "#",
  },
]

export default function HelpPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [expandedFAQ, setExpandedFAQ] = useState<string | null>(null)

  const toggleFAQ = (id: string) => {
    setExpandedFAQ(expandedFAQ === id ? null : id)
  }

  const filteredFAQs = faqs.map((category) => ({
    ...category,
    questions: category.questions.filter(
      (q) =>
        q.q.toLowerCase().includes(searchQuery.toLowerCase()) || q.a.toLowerCase().includes(searchQuery.toLowerCase()),
    ),
  }))

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="mb-6">
          <Button asChild variant="outline" className="gap-2 bg-transparent">
            <Link href="/dashboard/reports">
              <ArrowLeft className="h-4 w-4" />
              レポート一覧に戻る
            </Link>
          </Button>
        </motion.div>

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">ヘルプセンター</h1>
          <p className="text-lg text-gray-600">Reportlabの使い方やよくある質問をご確認いただけます</p>
        </motion.div>

        {/* Search Bar */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-12">
          <div className="max-w-2xl mx-auto relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <Input
              type="text"
              placeholder="質問を検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-6 text-lg border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16"
        >
          <motion.div variants={itemVariants}>
            <Link href="/help/email">
              <div className="bg-white p-6 rounded-xl border-2 border-gray-200 hover:border-primary hover:shadow-lg transition-all duration-300 cursor-pointer group">
                <Mail className="h-10 w-10 text-primary mb-4 group-hover:scale-110 transition-transform" />
                <h3 className="text-xl font-bold text-gray-900 mb-2">メールサポート</h3>
                <p className="text-gray-600">24時間以内に返信いたします</p>
              </div>
            </Link>
          </motion.div>

          <motion.div variants={itemVariants}>
            <Link href="/help/chat">
              <div className="bg-white p-6 rounded-xl border-2 border-gray-200 hover:border-primary hover:shadow-lg transition-all duration-300 cursor-pointer group">
                <MessageCircle className="h-10 w-10 text-primary mb-4 group-hover:scale-110 transition-transform" />
                <h3 className="text-xl font-bold text-gray-900 mb-2">チャットサポート</h3>
                <p className="text-gray-600">リアルタイムでサポート</p>
              </div>
            </Link>
          </motion.div>

          <motion.div variants={itemVariants}>
            <Link href="/help/faq">
              <div className="bg-white p-6 rounded-xl border-2 border-gray-200 hover:border-primary hover:shadow-lg transition-all duration-300 cursor-pointer group">
                <FileQuestion className="h-10 w-10 text-primary mb-4 group-hover:scale-110 transition-transform" />
                <h3 className="text-xl font-bold text-gray-900 mb-2">FAQ</h3>
                <p className="text-gray-600">よくある質問を確認</p>
              </div>
            </Link>
          </motion.div>
        </motion.div>

        {/* User Guides */}

        {/* FAQ Section */}
        <motion.div variants={containerVariants} initial="hidden" animate="visible" className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">よくある質問</h2>
          <div className="space-y-8">
            {filteredFAQs.map((category, categoryIndex) => (
              <motion.div key={categoryIndex} variants={itemVariants}>
                {category.questions.length > 0 && (
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-4">{category.category}</h3>
                    <div className="space-y-3">
                      {category.questions.map((faq, faqIndex) => {
                        const faqId = `${categoryIndex}-${faqIndex}`
                        const isExpanded = expandedFAQ === faqId
                        return (
                          <div key={faqIndex} className="bg-white rounded-xl border-2 border-gray-200 overflow-hidden">
                            <button
                              onClick={() => toggleFAQ(faqId)}
                              className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                            >
                              <span className="text-left font-semibold text-gray-900">{faq.q}</span>
                              {isExpanded ? (
                                <ChevronUp className="h-5 w-5 text-gray-500 flex-shrink-0" />
                              ) : (
                                <ChevronDown className="h-5 w-5 text-gray-500 flex-shrink-0" />
                              )}
                            </button>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.3 }}
                                className="px-6 pb-4 text-gray-600"
                              >
                                {faq.a}
                              </motion.div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Contact CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white border-2 border-primary p-8 rounded-xl text-center shadow-lg"
        >
          <h2 className="text-2xl font-bold text-gray-900 mb-4">解決できない問題がありますか?</h2>
          <p className="text-lg text-gray-600 mb-6">
            サポートチームが迅速に対応いたします。お気軽にお問い合わせください。
          </p>
          <Button asChild size="lg" className="bg-primary text-white hover:bg-primary/90 font-semibold">
            <Link href="/help/email">サポートに問い合わせる</Link>
          </Button>
        </motion.div>
      </div>
    </div>
  )
}
