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
      {
        q: "生成されたレポートは編集できますか?",
        a: "はい、ダウンロード後にWord形式で編集可能です。また、再生成も何度でも行えます。",
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
        a: "Premiumプランでは無制限のレポート作成、1GBのストレージ、優先サポート、カスタムテンプレートをご利用いただけます。月額980円です。",
      },
      {
        q: "プランの変更方法は?",
        a: "設定ページのサブスクリプションタブから、いつでもプランをアップグレードまたは解約できます。",
      },
      {
        q: "支払い方法は?",
        a: "クレジットカード(Visa、Mastercard、JCB、American Express)に対応しています。",
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
        a: "すべてのデータは暗号化され、厳重に保管されます。レポート生成後、一定期間経過したデータは自動削除されます。",
      },
      {
        q: "データは第三者と共有される?",
        a: "いいえ、ユーザーのデータは一切第三者と共有されません。プライバシーポリシーをご確認ください。",
      },
      {
        q: "二段階認証は利用できますか?",
        a: "はい、設定ページのセキュリティタブから二段階認証を有効にできます。セキュリティ強化のため、ぜひご利用ください。",
      },
      {
        q: "アカウントを削除するには?",
        a: "設定ページの最下部に「アカウント削除」ボタンがあります。削除すると全てのデータが完全に削除されますのでご注意ください。",
      },
    ],
  },
  {
    category: "機能について",
    questions: [
      {
        q: "複数の実験データを1つのレポートにまとめられますか?",
        a: "はい、レポート作成時に複数のPDFファイルをアップロードすることで、まとめて1つのレポートを生成できます。",
      },
      {
        q: "過去のレポートを再利用できますか?",
        a: "はい、新規作成時に過去のレポートをテンプレートとして使用できます。",
      },
      {
        q: "グラフや図表も自動で生成されますか?",
        a: "はい、アップロードされたデータから自動的にグラフや図表を生成します。",
      },
      {
        q: "共同編集は可能ですか?",
        a: "現在は個人利用のみですが、チームプランを準備中です。リリース時にお知らせいたします。",
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
