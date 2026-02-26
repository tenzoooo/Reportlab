"use client"

import React, { useRef } from "react"
import { motion, useMotionTemplate, useMotionValue } from "framer-motion"
import { AlertCircle, FileWarning, Database, Brain } from "lucide-react"
import { cn } from "@/lib/utils"

const PAIN_POINTS = [
  {
    category: "執筆・スタイルの苦行",
    icon: FileWarning,
    items: [
      "実験書の命令形をすべて「～した」形式へ書き換える苦労",
      "「だ・である」調への統一を1行ずつチェックする手間",
      "参考文献の書式（著者名、発行年、ページ）を整える面倒さ",
      "増えるたびにズレる図番号・表番号の管理と修正"
    ],
    color: "#ef4444" // Red for pain
  },
  {
    category: "図表・データ入力の絶望",
    icon: Database,
    items: [
      "Word特有の操作感に苦戦する、複雑な数式の作成",
      "Excelの数値を1つずつWordの表へ転記する単純作業",
      "指導書の図を書き写したり、スクショして貼り付ける手間",
      "グラフの軸ラベルや、図ごとの説明文を一から考える負担"
    ],
    color: "#f59e0b" // Amber for warning
  },
  {
    category: "分析・高度な記述の壁",
    icon: Brain,
    items: [
      "真っ白な画面を前に「考察に何を書くか」数時間悩む",
      "理論値とのズレ... 実験誤差の原因分析の難しさ",
      "複雑な実験原理を簡潔にまとめる情報の取捨選択",
      "不慣れな専門用語を使った英語の要約（Abstract）作成"
    ],
    color: "#dc2626" // Stronger Red
  }
]

function PainPointCard({ point }: { point: any }) {
  const cardRef = useRef<HTMLDivElement>(null)
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    mouseX.set(e.clientX - rect.left)
    mouseY.set(e.clientY - rect.top)
  }

  const borderMask = useMotionTemplate`radial-gradient(250px circle at ${mouseX}px ${mouseY}px, white, transparent 100%)`

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      className="relative p-8 rounded-[3rem] overflow-hidden flex flex-col h-full bg-red-50/10 backdrop-blur-xl border border-red-200/20 shadow-lg group"
    >
      {/* 負の要素を強調する赤いスポットライト枠線 */}
      <motion.div 
        className="absolute inset-0 border-2 pointer-events-none rounded-[3rem]"
        style={{
          borderColor: point.color,
          WebkitMaskImage: borderMask,
          maskImage: borderMask,
          opacity: 0.3
        }}
      />

      <div className="relative z-10">
        <div className="flex items-center gap-4 mb-8">
          <div 
            className="w-12 h-12 rounded-2xl flex items-center justify-center border shadow-inner"
            style={{ backgroundColor: `${point.color}15`, borderColor: `${point.color}30` }}
          >
            <point.icon className="w-6 h-6" style={{ color: point.color }} />
          </div>
          <h3 className="text-xl font-bold text-gray-900">{point.category}</h3>
        </div>

        <ul className="space-y-4">
          {point.items.map((item: string, i: number) => (
            <li key={i} className="flex items-start gap-3 text-sm text-gray-600">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: `${point.color}80` }} />
              <span className="leading-relaxed">{item}</span>
            </li>
          ))}
        </ul>
      </div>
      
      {/* 背景の薄いノイズ的なGlow */}
      <div 
        className="absolute -bottom-24 -right-24 w-64 h-64 rounded-full opacity-5 blur-3xl pointer-events-none"
        style={{ backgroundColor: point.color }}
      />
    </div>
  )
}

export default function TraditionalPainPoints() {
  return (
    <section className="py-24 px-8 md:px-16 lg:px-24 mincho">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-20">
          <h2 className="text-3xl md:text-4xl font-light text-gray-900 mb-6">
            そのレポート作成、<span className="text-red-500 font-medium">「作業」</span>で終わっていませんか？
          </h2>
          <p className="text-gray-500 text-sm max-w-2xl mx-auto font-light leading-relaxed">
            本来、レポートは実験結果を深く考察するためのもの。<br />
            しかし、現実には膨大な「単純作業」があなたの思考を妨げています。
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {PAIN_POINTS.map((point, i) => (
            <PainPointCard key={i} point={point} />
          ))}
        </div>
      </div>
    </section>
  )
}
