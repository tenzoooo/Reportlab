"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import {
  BookOpen,
  FileQuestion,
  Mail,
  ChevronDown,
  ChevronUp,
  PlayCircle,
  Download,
  Search,
} from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import StandalonePageShell from "@/components/standalone-page-shell"

const faqs = [
  {
    category: "基本的な使い方",
    questions: [
      {
        q: "レポートの作成方法は?",
        a: "ダッシュボードの「レポート一覧」から「新規作成」ボタンをクリックし、実験書のPDFファイルをアップロードすると、AIが内容を解析してレポートのたたき台を自動生成します。",
      },
      {
        q: "対応しているファイル形式は?",
        a: "現在、実験書はPDF形式（拡張子 .pdf）に対応しています。過去レポートを再現する機能では、参照用レポートとしてWord形式（.docx）のアップロードにも対応しています。",
      },
      {
        q: "レポート生成にかかる時間は?",
        a: "通常は数分程度で完了しますが、ファイルサイズや内容の量、混雑状況によって前後します。進行状況は「レポート一覧」ページから確認できます。",
      },
    ],
  },
  {
    category: "プランと料金",
    questions: [
      {
        q: "各プランのクレジット数は?",
        a: "StandardプランとPremiumプランはいずれも、毎月400クレジットが自動付与されます（通常、レポート1件の生成につき100クレジットを使用します）。Freeプランには月次クレジットの自動付与はありませんが、必要な分だけクレジットパックを購入して利用できます。",
      },
      {
        q: "StandardプランとPremiumプランの違いは?",
        a: "どちらのプランでも毎月のクレジット付与に加え、過去レポ再現モードやExcel表貼り付け、画像挿入などの有料機能が利用できます。Premiumプランでは、より大きなストレージ容量（5GB）や優先的なサポートなど、より充実した環境でご利用いただけます。",
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
        a: "PDF形式であることを確認してください。ファイルサイズが極端に大きい場合はエラーになることがありますので、分割や圧縮もお試しください。問題が続く場合はサポートにお問い合わせください。",
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
        a: "アップロードされた実験書や生成されたレポートは、Supabase上のストレージとデータベースで管理され、ログインしているご本人のアカウントからのみアクセスできるよう制御されています。不要になったデータはレポート一覧から手動で削除できます。",
      },
      {
        q: "データは第三者と共有される?",
        a: "いいえ、ユーザーのデータは運営者を除き第三者と共有されません。詳細はプライバシーポリシーをご確認ください。",
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
    <StandalonePageShell
      title="ヘルプセンター"
      subtitle="Reportlabの使い方やよくある質問をご確認いただけます"
      backHref="/dashboard/reports"
      backLabel="レポート一覧に戻る"
      badge="Support"
    >
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-3">
        <p className="text-sm uppercase tracking-[0.35em] text-slate-400 font-semibold">Help & Guides</p>
        <h2 className="text-2xl sm:text-3xl font-bold text-white">困りごとをすぐ解決</h2>
      </motion.div>

        {/* Search Bar */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-12">
          <div className="max-w-2xl mx-auto relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-500" />
            <Input
              type="text"
              placeholder="質問を検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-6 text-lg border border-white/10 rounded-2xl bg-slate-950/60 text-white placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-blue-500/40"
            />
          </div>
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16"
        >
          <motion.div variants={itemVariants}>
            <Link href="/help/email">
              <div className="bg-white/5 p-6 rounded-2xl border border-white/10 hover:border-white/20 hover:shadow-[0_25px_60px_-25px_rgba(59,130,246,0.5)] transition-all duration-300 cursor-pointer group">
                <Mail className="h-10 w-10 text-blue-400 mb-4 group-hover:scale-110 transition-transform" />
                <h3 className="text-xl font-bold text-white mb-2">メールサポート</h3>
                <p className="text-slate-400 text-sm">24時間以内に返信いたします</p>
              </div>
            </Link>
          </motion.div>



          <motion.div variants={itemVariants}>
            <Link href="/help/faq">
              <div className="bg-white/5 p-6 rounded-2xl border border-white/10 hover:border-white/20 hover:shadow-[0_25px_60px_-25px_rgba(59,130,246,0.5)] transition-all duration-300 cursor-pointer group">
                <FileQuestion className="h-10 w-10 text-blue-400 mb-4 group-hover:scale-110 transition-transform" />
                <h3 className="text-xl font-bold text-white mb-2">FAQ</h3>
                <p className="text-slate-400 text-sm">よくある質問を確認</p>
              </div>
            </Link>
          </motion.div>
        </motion.div>

        {/* User Guides */}

        {/* FAQ Section */}
        <motion.div variants={containerVariants} initial="hidden" animate="visible" className="mb-16">
          <h2 className="text-3xl font-bold text-white mb-6">よくある質問</h2>
          <div className="space-y-8">
            {filteredFAQs.map((category, categoryIndex) => (
              <motion.div key={categoryIndex} variants={itemVariants}>
                {category.questions.length > 0 && (
                  <div>
                    <h3 className="text-xl font-bold text-white mb-4">{category.category}</h3>
                    <div className="space-y-3">
                      {category.questions.map((faq, faqIndex) => {
                        const faqId = `${categoryIndex}-${faqIndex}`
                        const isExpanded = expandedFAQ === faqId
                        return (
                          <div key={faqIndex} className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
                            <button
                              onClick={() => toggleFAQ(faqId)}
                              className="w-full px-6 py-4 flex items-center justify-between hover:bg-white/5 transition-colors"
                            >
                              <span className="text-left font-semibold text-white">{faq.q}</span>
                              {isExpanded ? (
                                <ChevronUp className="h-5 w-5 text-slate-400 flex-shrink-0" />
                              ) : (
                                <ChevronDown className="h-5 w-5 text-slate-400 flex-shrink-0" />
                              )}
                            </button>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.3 }}
                                className="px-6 pb-4 text-slate-300 text-sm leading-relaxed"
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
          className="bg-white/5 border border-white/10 p-8 rounded-3xl text-center shadow-[0_25px_80px_-40px_rgba(59,130,246,0.6)]"
        >
          <h2 className="text-2xl font-bold text-white mb-4">解決できない問題がありますか?</h2>
          <p className="text-sm text-slate-300 mb-6">
            サポートチームが迅速に対応いたします。お気軽にお問い合わせください。
          </p>
          <Button asChild size="lg" className="bg-blue-600 text-white hover:bg-blue-500 font-semibold">
            <Link href="/help/email">サポートに問い合わせる</Link>
          </Button>
        </motion.div>
    </StandalonePageShell>
  )
}
