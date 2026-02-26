"use client"

import { FileText, BarChart3, Lightbulb, Eye, Share2, ShieldCheck } from "lucide-react"

const features = [
  {
    icon: FileText,
    title: "実験手順を自動で書き出し",
    description:
      "PDFの指導書を読み取って、「目的」「原理」「手順」を自動で整理。手入力の手間をゼロにします。",
  },
  {
    icon: Share2,
    title: "あらゆるファイルを一括取り込み",
    description:
      "PDFだけでなく、実験データのExcelやホワイトボードの写真まで、まとめてAIが内容を把握します。",
  },
  {
    icon: BarChart3,
    title: "グラフ・表を自動でWordへ",
    description:
      "Excelの数値から、軸ラベルや説明が付いたグラフを自動作成。そのままレポートに貼り付けられます。",
  },
  {
    icon: Lightbulb,
    title: "考察のヒントを提案",
    description:
      "実験結果に基づいたコメントを自動生成。何をどう書けばいいか、AIがあなたの思考をサポートします。",
  },
  {
    icon: Eye,
    title: "作成状況がひと目でわかる",
    description:
      "解析から完成まで、今どのステップにいるかをリアルタイムで表示。待ち時間のストレスを減らします。",
  },
  {
    icon: ShieldCheck,
    title: "大切なデータを守る安心設計",
    description:
      "高度なセキュリティにより、あなたのレポートや実験データは厳重に保護され、他人に漏れることはありません。",
  },
]

export default function FeaturesSection() {
  return (
    <section id="features" className="py-24 px-8 md:px-16 lg:px-24">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-light text-gray-900 mb-4">
            <span className="font-medium italic instrument">シンプル</span>で
            <span className="font-medium italic instrument">パワフル</span>な機能
          </h2>
          <p className="text-gray-600 text-sm max-w-md mx-auto">
            レポート作成の「面倒くさい」をすべて解決
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="p-6 rounded-2xl bg-white border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all duration-300"
            >
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                <feature.icon className="w-5 h-5 text-gray-700" />
              </div>
              <h3 className="text-gray-900 text-lg font-medium mb-2">{feature.title}</h3>
              <p className="text-gray-600 text-sm leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
