"use client"

import { FileText, BarChart3, MessageSquare, Layers, Upload, Shield } from "lucide-react"

const features = [
  {
    icon: FileText,
    title: "指導書PDF自動解析",
    description:
      "実験指導書から「目的」「原理」「手順」をAIが自動抽出。手入力でWordに写す作業が不要になります。",
  },
  {
    icon: Upload,
    title: "マルチモーダル入力",
    description:
      "PDF、Excel、実験風景写真など複数形式のファイルをアップロード。AIが自動で対応付けを行います。",
  },
  {
    icon: BarChart3,
    title: "グラフ・表の自動生成",
    description:
      "Excelデータを読み取り、適切な軸ラベルやキャプション付きグラフをWord形式で直接出力します。",
  },
  {
    icon: MessageSquare,
    title: "定量的考察の支援",
    description:
      "実験結果に基づいた定量的なコメントを自動生成。考察のヒントとなる補助線を提供します。",
  },
  {
    icon: Layers,
    title: "レイヤー化パイプライン",
    description:
      "解析・マッピング・生成の各工程を独立管理。リアルタイムで進捗を確認できます。",
  },
  {
    icon: Shield,
    title: "セキュアなデータ管理",
    description:
      "Supabaseによる認証と行レベルセキュリティで、あなたのデータを安全に保護します。",
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
            レポート作成に必要なすべてをAIがサポート
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
