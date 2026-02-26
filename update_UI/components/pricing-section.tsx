"use client"

import React, { useRef, useState } from "react"
import { Check } from "lucide-react"
import { motion, useMotionTemplate, useMotionValue } from "framer-motion"
import GlassButton from "./glass-button"

// 月間・年間サブスクリプション
const BASE_PLANS = [
  {
    id: "free",
    name: "7日間無料トライアル",
    price: "¥0",
    annualPrice: "¥0",
    monthlyEquivalent: "¥0",
    description: "まずは無料でお試しください",
    features: [
      "7日間全機能利用可能",
      "PDF・Excel取り込み",
      "章構造自動生成",
      "クレジットカード不要",
    ],
    highlighted: true,
  },
  {
    id: "standard",
    name: "スタンダード",
    price: "¥980",
    annualPrice: "¥9,600", // 800 * 12
    monthlyEquivalent: "¥800",
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
    id: "premium",
    name: "プレミアム",
    price: "¥2,000",
    annualPrice: "¥18,000", // 1500 * 12
    monthlyEquivalent: "¥1,500",
    description: "頻繁に利用する方向け",
    features: [
      "月50レポートまで作成",
      "高度なAI章構造分析",
      "考察コメント支援",
      "テンプレート無制限",
      "優先サポート",
    ],
    highlighted: false,
  },
]

// 半年プラン（学期プラン）
const SEMESTER_PLANS = [
  {
    id: "semester-standard",
    name: "学期プラン（スタンダード）",
    price: "¥5,100", // 850 * 6
    monthlyEquivalent: "¥850",
    description: "1学期分をまとめてお得に",
    features: [
      "6ヶ月間利用可能",
      "月10レポートまで作成",
      "全機能利用可能",
      "月額換算で約13%お得",
    ],
    highlighted: false,
  },
  {
    id: "semester-premium",
    name: "学期プラン（プレミアム）",
    price: "¥10,500", // 1750 * 6
    monthlyEquivalent: "¥1,750",
    description: "本気でレポートに取り組む学期に",
    features: [
      "6ヶ月間利用可能",
      "月50レポートまで作成",
      "全機能利用可能",
      "月額換算で約12%お得",
    ],
    highlighted: false,
  },
]

const ONE_TIME_PLANS = [
  {
    id: "single",
    name: "単体レポート",
    price: "¥700",
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

function PricingCard({ plan, isAnnual, type = "subscription" }: any) {
  const cardRef = useRef<HTMLDivElement>(null)
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    mouseX.set(e.clientX - rect.left)
    mouseY.set(e.clientY - rect.top)
  }

  const borderMask = useMotionTemplate`radial-gradient(250px circle at ${mouseX}px ${mouseY}px, rgba(255,255,255,0.8), transparent 100%)`

  let displayPrice = plan.price
  let period = "/月"
  let subText = ""

  if (type === "subscription") {
    if (isAnnual && plan.monthlyEquivalent) {
      displayPrice = plan.monthlyEquivalent
      period = "/月"
      subText = `（年間 ${plan.annualPrice} / 一括払い）`
    } else {
      period = "/月"
    }
  } else if (type === "semester") {
    displayPrice = plan.monthlyEquivalent
    period = "/月"
    subText = `（半年 ${plan.price} / 一括払い）`
  } else {
    displayPrice = plan.price
    period = "/レポート"
  }

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      className={`relative p-8 rounded-3xl transition-all duration-300 flex flex-col h-full overflow-hidden group
        ${plan.highlighted ? "shadow-[0_20px_80px_-15px_rgba(59,130,246,0.3)] border-blue-500/20 scale-[1.02] z-10" : "hover:shadow-xl"}
      `}
      style={{
        backgroundColor: "rgba(255, 255, 255, 0.45)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        border: `1px solid ${plan.highlighted ? "rgba(59, 130, 246, 0.3)" : "rgba(255, 255, 255, 0.4)"}`,
      }}
    >
      <motion.div 
        className="absolute inset-0 border-2 pointer-events-none rounded-3xl z-20"
        style={{
          borderColor: "#3b82f6",
          WebkitMaskImage: borderMask,
          maskImage: borderMask,
          opacity: plan.highlighted ? 0.6 : 0.4
        }}
      />

      <div className="relative z-10 flex flex-col h-full">
        {plan.highlighted && (
          <span className="inline-block px-3 py-1 rounded-full bg-blue-600/10 text-blue-600 text-[10px] font-bold mb-4 w-fit uppercase tracking-wider border border-blue-600/20">
            Recommended
          </span>
        )}
        
        <h3 className={`text-lg font-bold mb-2 ${plan.highlighted ? "text-blue-900" : "text-gray-900"}`}>{plan.name}</h3>
        <p className="text-xs mb-6 text-gray-500 font-light">{plan.description}</p>
        
        <div className="flex flex-col mb-8">
          <div className="flex items-baseline">
            <span className={`text-4xl font-light tracking-tight ${plan.highlighted ? "text-blue-600" : "text-gray-900"}`}>
              {displayPrice}
            </span>
            <span className="text-sm ml-1 text-gray-400">{period}</span>
          </div>
          {subText && (
            <span className="text-[10px] text-gray-400 mt-1">{subText}</span>
          )}
        </div>
        
        <ul className="space-y-3 mb-8 flex-grow">
          {plan.features.map((feature: string) => (
            <li key={feature} className="flex items-start gap-3 text-sm text-gray-600">
              <div className={`mt-0.5 p-0.5 rounded-full ${plan.highlighted ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-500"}`}>
                <Check className="w-3 h-3" />
              </div>
              <span className="leading-tight font-light">{feature}</span>
            </li>
          ))}
        </ul>
        
        <GlassButton 
          variant={plan.highlighted ? "filled" : "glassSubtle"} 
          className={`w-full py-3 h-auto text-sm ${plan.highlighted ? "bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/30" : "bg-white/50 text-gray-900 hover:bg-white/80 border-gray-200"}`}
          href="/register"
        >
          始める
        </GlassButton>
      </div>
    </div>
  )
}

export default function PricingSection() {
  const [isAnnual, setIsAnnual] = useState(false)

  return (
    <section id="pricing" className="py-24 px-8 md:px-16 lg:px-24">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12 mincho">
          <h2 className="text-3xl md:text-4xl font-light text-gray-900 mb-6">
            料金プラン
          </h2>
          <p className="text-gray-600 text-sm max-w-md mx-auto mb-8">
            必要な機能を必要な分だけ。いつでもプラン変更可能です。
          </p>

          {/* Toggle Switch */}
          <div className="flex items-center justify-center gap-4">
            <span className={`text-sm ${!isAnnual ? "text-gray-900 font-medium" : "text-gray-500"}`}>月間払い</span>
            <button
              onClick={() => setIsAnnual(!isAnnual)}
              className="relative w-14 h-8 rounded-full bg-gray-200 border border-gray-300 shadow-inner transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              aria-label="Toggle billing cycle"
            >
              <div
                className={`absolute top-1 left-1 w-6 h-6 rounded-full bg-white shadow-md transform transition-transform duration-300 ${
                  isAnnual ? "translate-x-6" : "translate-x-0"
                }`}
              />
            </button>
            <span className={`text-sm ${isAnnual ? "text-gray-900 font-medium" : "text-gray-500"}`}>
              年間払い 
              <span className="ml-1 text-[10px] text-blue-600 font-bold bg-blue-100 px-2 py-0.5 rounded-full">
                最大25%お得
              </span>
            </span>
          </div>
        </div>

        {/* Subscription Plans */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          {BASE_PLANS.map((plan) => (
            <PricingCard key={plan.id} plan={plan} isAnnual={isAnnual} type="subscription" />
          ))}
        </div>

        {/* Semester Plans Section */}
        <div className="mb-16">
          <div className="flex items-center gap-4 mb-8">
            <div className="h-px flex-1 bg-gray-200" />
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-widest text-center">学期プラン (6ヶ月一括)</h3>
            <div className="h-px flex-1 bg-gray-200" />
          </div>
          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {SEMESTER_PLANS.map((plan) => (
              <PricingCard key={plan.id} plan={plan} isAnnual={false} type="semester" />
            ))}
          </div>
        </div>

        {/* One-time Plan */}
        <div className="grid md:grid-cols-1 gap-6 max-w-sm mx-auto">
          {ONE_TIME_PLANS.map((plan) => (
            <PricingCard key={plan.id} plan={plan} isAnnual={false} type="one-time" />
          ))}
        </div>
      </div>
    </section>
  )
}