"use client"

import { Check } from "lucide-react"

const plans = [
  {
    name: "7日間無料トライアル",
    price: "¥0",
    period: "",
    description: "まずは無料でお試しください",
    features: [
      "7日間全機能利用可能",
      "PDF・Excel取り込み",
      "章構造自動生成",
      "クレジットカード不要",
    ],
    highlighted: false,
  },
  {
    name: "スタンダード",
    price: "¥980",
    period: "/月",
    description: "個人利用に最適なプラン",
    features: [
      "月10レポートまで作成",
      "PDF・Excel取り込み",
      "基本的な章構造提案",
      "表・グラフ自動生成",
      "メールサポート",
    ],
    highlighted: false,
  },
  {
    name: "プレミアム",
    price: "¥2,000",
    period: "/月",
    description: "頻繁に利用する方向け",
    features: [
      "無制限レポート作成",
      "高度なAI章構造分析",
      "考察コメント支援",
      "テンプレート無制限",
      "優先サポート",
    ],
    highlighted: true,
  },
  {
    name: "学期プラン",
    price: "¥8,000",
    period: "/半年",
    description: "1学期分をまとめてお得に",
    features: [
      "6ヶ月間利用可能",
      "無制限レポート作成",
      "全機能利用可能",
      "月額換算で約17%お得",
    ],
    highlighted: false,
  },
  {
    name: "単体レポート",
    price: "¥700",
    period: "/1レポート",
    description: "必要な時だけ利用したい方に",
    features: [
      "1レポート分の利用権",
      "全機能利用可能",
      "有効期限なし",
      "追加購入可能",
    ],
    highlighted: false,
  },
]

export default function PricingSection() {
  return (
    <section id="pricing" className="py-24 px-8 md:px-16 lg:px-24">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-light text-gray-900 mb-4">
            <span className="font-medium italic instrument">あなたに合った</span>料金プラン
          </h2>
          <p className="text-gray-600 text-sm max-w-md mx-auto">
            必要な機能を必要な分だけ。いつでもプラン変更可能です。
          </p>
        </div>

        {/* Top row - 3 cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-6">
          {plans.slice(0, 3).map((plan) => (
            <div
              key={plan.name}
              className={`p-6 rounded-2xl border transition-all duration-300 flex flex-col ${
                plan.highlighted
                  ? "bg-gray-900 border-gray-900"
                  : "bg-white border-gray-200 hover:border-gray-300 hover:shadow-md"
              }`}
            >
              {plan.highlighted && (
                <span className="inline-block px-2 py-0.5 rounded-full bg-white text-gray-900 text-xs font-medium mb-3 w-fit">
                  おすすめ
                </span>
              )}
              <h3 className={`text-base font-medium mb-1 ${plan.highlighted ? "text-white" : "text-gray-900"}`}>{plan.name}</h3>
              <p className={`text-xs mb-3 ${plan.highlighted ? "text-gray-400" : "text-gray-600"}`}>{plan.description}</p>
              <div className="flex items-baseline mb-4">
                <span className={`text-2xl font-light ${plan.highlighted ? "text-white" : "text-gray-900"}`}>{plan.price}</span>
                <span className={`text-xs ml-1 ${plan.highlighted ? "text-gray-400" : "text-gray-600"}`}>{plan.period}</span>
              </div>
              <ul className="space-y-2 mb-6 flex-grow">
                {plan.features.map((feature) => (
                  <li key={feature} className={`flex items-start gap-2 text-xs ${plan.highlighted ? "text-gray-300" : "text-gray-700"}`}>
                    <Check className={`w-3 h-3 mt-0.5 flex-shrink-0 ${plan.highlighted ? "text-gray-400" : "text-gray-500"}`} />
                    {feature}
                  </li>
                ))}
              </ul>
              <button
                className={`w-full py-2.5 rounded-full text-xs font-medium transition-all duration-200 cursor-pointer ${
                  plan.highlighted
                    ? "bg-white text-gray-900 hover:bg-gray-100"
                    : "bg-gray-900 text-white hover:bg-gray-800"
                }`}
              >
                始める
              </button>
            </div>
          ))}
        </div>

        {/* Bottom row - 2 cards spanning full width */}
        <div className="grid md:grid-cols-2 gap-6">
          {plans.slice(3, 5).map((plan) => (
            <div
              key={plan.name}
              className={`p-6 rounded-2xl border transition-all duration-300 flex flex-col ${
                plan.highlighted
                  ? "bg-gray-900 border-gray-900"
                  : "bg-white border-gray-200 hover:border-gray-300 hover:shadow-md"
              }`}
            >
              {plan.highlighted && (
                <span className="inline-block px-2 py-0.5 rounded-full bg-white text-gray-900 text-xs font-medium mb-3 w-fit">
                  おすすめ
                </span>
              )}
              <h3 className={`text-lg font-medium mb-1 ${plan.highlighted ? "text-white" : "text-gray-900"}`}>{plan.name}</h3>
              <p className={`text-sm mb-3 ${plan.highlighted ? "text-gray-400" : "text-gray-600"}`}>{plan.description}</p>
              <div className="flex items-baseline mb-4">
                <span className={`text-3xl font-light ${plan.highlighted ? "text-white" : "text-gray-900"}`}>{plan.price}</span>
                <span className={`text-sm ml-1 ${plan.highlighted ? "text-gray-400" : "text-gray-600"}`}>{plan.period}</span>
              </div>
              <ul className="space-y-2 mb-6 flex-grow">
                {plan.features.map((feature) => (
                  <li key={feature} className={`flex items-start gap-2 text-sm ${plan.highlighted ? "text-gray-300" : "text-gray-700"}`}>
                    <Check className={`w-4 h-4 mt-0.5 flex-shrink-0 ${plan.highlighted ? "text-gray-400" : "text-gray-500"}`} />
                    {feature}
                  </li>
                ))}
              </ul>
              <button
                className={`w-full py-3 rounded-full text-sm font-medium transition-all duration-200 cursor-pointer ${
                  plan.highlighted
                    ? "bg-white text-gray-900 hover:bg-gray-100"
                    : "bg-gray-900 text-white hover:bg-gray-800"
                }`}
              >
                始める
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
