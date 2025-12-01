"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { FileQuestion, ChevronDown, ChevronUp, Search, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const faqs = [
  {
    category: "基本的な使い方",
    questions: [
      {
        q: "レポートの作成方法は?",
        a: "ダッシュボードの「レポート一覧」ページから「新規作成」ボタンをクリックし、実験書のPDFファイルをアップロードしてください。AIが自動的に内容を解析し、レポートのたたき台を生成します。",
      },
      {
        q: "対応しているファイル形式は?",
        a: "現在、実験書はPDF形式（拡張子 .pdf）のファイルに対応しています。過去レポートを再現する機能では、参照用レポートとしてWord形式（.docx）のアップロードにも対応しています。",
      },
      {
        q: "レポート生成にかかる時間は?",
        a: "通常は数分程度で完了しますが、ファイルサイズや内容の量、サービスの混雑状況によって前後します。進行状況は「レポート一覧」ページから確認できます。",
      },
      {
        q: "生成されたレポートは編集できますか?",
        a: "はい、生成されたレポートはWord形式（.docx）でダウンロードでき、Wordや互換ソフトで自由に編集できます。同じ実験データからレポートを再生成することも可能です。",
      },
    ],
  },
  {
    category: "プランと料金",
    questions: [
      {
        q: "Freeプランの制限は?",
        a: "Freeプランでは月次クレジットの自動付与はありません。必要なタイミングでクレジットパックを購入してレポート生成に利用できます。ストレージ容量の目安は100MBで、基本的なレポート生成機能をご利用いただけます。",
      },
      {
        q: "Standardプランの特典は?",
        a: "Standardプランでは、毎月400クレジットが自動付与されます（通常、レポート1件の生成につき100クレジットを使用します）。ストレージ容量は1GBで、過去レポ再現モードやExcel表貼り付け・画像挿入などの有料機能をご利用いただけます。月額980円です。",
      },
      {
        q: "Premiumプランの特典は?",
        a: "Premiumプランでも毎月400クレジットが自動付与されます。Standardプランの機能に加えて、より大きなストレージ容量（5GB）や優先的なサポートなど、より充実した環境でご利用いただけます。月額1,980円です。",
      },
      {
        q: "プランの変更方法は?",
        a: "設定ページのサブスクリプションタブから、いつでもプランをアップグレードまたは解約できます。",
      },
      {
        q: "支払い方法は?",
        a: "Stripeを通じて主要なクレジットカード決済に対応しています。対応ブランドはご利用のカード会社やStripeの設定によって異なります。",
      },
      {
        q: "解約後もデータは残りますか?",
        a: "はい、解約後もアカウントとデータは保持されます。ただし、Freeプランの制限が適用されます。",
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
      {
        q: "ログインできない",
        a: "パスワードをお忘れの場合は「パスワードを忘れた場合」からリセットしてください。メールアドレスが正しいかも確認してください。",
      },
      {
        q: "通知が届かない",
        a: "迷惑メールフォルダをご確認ください。また、設定ページで通知設定が有効になっているか確認してください。",
      },
    ],
  },
  {
    category: "セキュリティとプライバシー",
    questions: [
      {
        q: "アップロードしたデータはどうなる?",
        a: "アップロードされた実験書や生成されたレポートは、Supabase上のストレージとデータベースで管理されます。ログインしているご本人のアカウントからのみアクセスできるように制御されており、不要になったデータはレポート一覧から手動で削除できます。",
      },
      {
        q: "データは第三者と共有される?",
        a: "いいえ、ユーザーのデータは運営者を除き第三者と共有されません。詳細はプライバシーポリシーをご確認ください。",
      },
      {
        q: "二段階認証は利用できますか?",
        a: "現時点では、アプリ内での二段階認証機能には対応していません。将来的な対応を検討しています。",
      },
      {
        q: "アカウントを削除するには?",
        a: "アカウント削除機能は現在開発中です。アカウントやデータの削除をご希望の場合は、「ヘルプセンター → メールサポート」からお問い合わせください。",
      },
    ],
  },
  {
    category: "機能について",
    questions: [
      {
        q: "複数の実験データを1つのレポートにまとめられますか?",
        a: "現在は、1つの実験書PDFから1つのレポートを作成する形式です。複数の実験をまとめたい場合は、それぞれ別レポートとして作成したうえで編集ソフト側で統合してください。",
      },
      {
        q: "過去のレポートを再利用できますか?",
        a: "はい、Standard/Premiumプランでは「過去レポ再現」モードを利用できます。参照したい過去レポート（Word形式 .docx）をアップロードすると、その構成や文体を参考にしたレポートを生成します。",
      },
      {
        q: "グラフや図表も自動で生成されますか?",
        a: "Excelから貼り付けた表データは、レポート内の表として整形して挿入されます。また、グラフや実験画像をファイルとしてアップロードすることで、レポート内の図として配置できます。",
      },
      {
        q: "共同編集は可能ですか?",
        a: "現在は1つのアカウントにつき個人利用を想定しており、リアルタイムの共同編集機能には対応していません。複数人で編集する場合は、ダウンロードしたWordファイルを共有してご利用ください。",
      },
    ],
  },
]

export default function FAQPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [expandedFAQ, setExpandedFAQ] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  const toggleFAQ = (id: string) => {
    setExpandedFAQ(expandedFAQ === id ? null : id)
  }

  const categories = faqs.map((faq) => faq.category)

  const filteredFAQs = faqs
    .filter((category) => !selectedCategory || category.category === selectedCategory)
    .map((category) => ({
      ...category,
      questions: category.questions.filter(
        (q) =>
          q.q.toLowerCase().includes(searchQuery.toLowerCase()) ||
          q.a.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    }))
    .filter((category) => category.questions.length > 0)

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
        <Link href="/help">
          <Button variant="ghost" className="mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" />
            ヘルプセンターに戻る
          </Button>
        </Link>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-4">
            <FileQuestion className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">よくある質問(FAQ)</h1>
          <p className="text-lg text-gray-600">お探しの答えを見つけてください</p>
        </motion.div>

        {/* Search Bar */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="relative max-w-2xl mx-auto">
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

        {/* Category Filters */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex flex-wrap gap-2 justify-center">
            <Button
              variant={selectedCategory === null ? "default" : "outline"}
              onClick={() => setSelectedCategory(null)}
              size="sm"
            >
              すべて
            </Button>
            {categories.map((category) => (
              <Button
                key={category}
                variant={selectedCategory === category ? "default" : "outline"}
                onClick={() => setSelectedCategory(category)}
                size="sm"
              >
                {category}
              </Button>
            ))}
          </div>
        </motion.div>

        {/* FAQ List */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
          {filteredFAQs.map((category, categoryIndex) => (
            <div key={categoryIndex}>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">{category.category}</h2>
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
                        <span className="text-left font-semibold text-gray-900 flex-1">{faq.q}</span>
                        {isExpanded ? (
                          <ChevronUp className="h-5 w-5 text-gray-500 flex-shrink-0 ml-4" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-gray-500 flex-shrink-0 ml-4" />
                        )}
                      </button>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3 }}
                          className="px-6 pb-4 text-gray-600 border-t border-gray-100"
                        >
                          <p className="pt-4">{faq.a}</p>
                        </motion.div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {filteredFAQs.length === 0 && (
            <div className="text-center py-12">
              <p className="text-lg text-gray-600">検索結果が見つかりませんでした。</p>
              <p className="text-gray-500 mt-2">別のキーワードでお試しください。</p>
            </div>
          )}
        </motion.div>

        {/* Contact CTA */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mt-12">
          <div className="bg-white border-2 border-primary rounded-xl p-8 text-center shadow-lg">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">お探しの答えが見つかりませんでしたか?</h2>
            <p className="text-lg text-gray-600 mb-6">サポートチームが迅速に対応いたします。</p>
            <div className="flex gap-4 justify-center">
              <Button asChild>
                <Link href="/help/email">メールで問い合わせる</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/help/chat">チャットで問い合わせる</Link>
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
