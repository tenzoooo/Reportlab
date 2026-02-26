"use client"

import React, { useRef } from "react"
import { Check, PlusCircle } from "lucide-react"
import { motion, useMotionTemplate, useMotionValue } from "framer-motion"
import { cn } from "@/lib/utils"

const afterItems = [
  {
    title: "AIが文体を瞬時に最適化",
    points: [
      "命令形を適切な報告書スタイルに変換",
      "常体（だ・である）への完全自動統一",
      "図表番号の自動付番と相互参照",
      "参考文献リストの自動生成"
    ],
    description: "文章の「型」はAIに任せてOK"
  },
  {
    title: "データと視覚資料の自動連携",
    points: [
      "指導書の数式や図をAIが自動抽出",
      "Excelデータを直接レポートへ反映",
      "数式は美しいOMML/LaTeX形式で",
      "AIが図表の意味を読み取り解説を生成"
    ],
    description: "コピペと手入力の作業がゼロに"
  },
  {
    title: "思考を加速させる補助線",
    points: [
      "AIが結果に基づいた考察の種を提案",
      "誤差要因の候補を理論的にリストアップ",
      "難解な実験原理も要点を抑えて要約",
      "一クリックで高品質な英語要約を作成"
    ],
    description: "あなたは「考える」ことに集中できる"
  }
]

function AfterCard({ item }: { item: any }) {
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

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      className="relative p-8 rounded-[2.5rem] overflow-hidden flex flex-col h-full bg-green-50/40 backdrop-blur-xl border border-green-200/30 shadow-[0_20px_50px_-15px_rgba(34,197,94,0.15)]"
    >
      <motion.div 
        className="absolute inset-0 border-2 pointer-events-none rounded-[2.5rem]"
        style={{
          borderColor: "#22c55e",
          WebkitMaskImage: borderMask,
          maskImage: borderMask,
          opacity: 0.3
        }}
      />

      <div className="relative z-10 flex flex-col h-full">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
            <PlusCircle className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-gray-900">{item.title}</h3>
        </div>

        <ul className="space-y-4 mb-8 flex-grow">
          {item.points.map((point: string, i: number) => (
            <li key={i} className="flex items-start gap-3 text-sm text-gray-600">
              <div className="mt-1 w-5 h-5 rounded-full bg-green-100 text-green-600 flex items-center justify-center shrink-0">
                <Check className="w-3 h-3" />
              </div>
              <span className="leading-relaxed">{point}</span>
            </li>
          ))}
        </ul>

        <p className="text-[11px] uppercase tracking-[0.2em] font-black mt-auto pt-6 border-t border-green-600/10 text-green-600/60">
          {item.description}
        </p>
      </div>
    </div>
  )
}

export default function BeforeAfterSection() {
  return (
    <section className="py-24 px-8 md:px-16 lg:px-24 mincho">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-20">
          <h2 className="text-3xl md:text-4xl font-light text-gray-900 mb-4">
            これからのレポート作成
          </h2>
          <p className="text-gray-600 text-sm max-w-md mx-auto font-light text-center">
            Reportlabが解決する、レポート作成の「負のルーチン」
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 items-stretch">
          {/* AFTER Cards ONLY */}
          {afterItems.map((item, i) => (
            <AfterCard key={i} item={item} />
          ))}
        </div>
      </div>
    </section>
  )
}
