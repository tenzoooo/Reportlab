"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import { motion, PanInfo, useMotionValue, useSpring, useMotionTemplate } from "framer-motion"
import { ChevronLeft, ChevronRight, FileText, Share2, BarChart3, Lightbulb, Eye, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"

const CARDS = [
  { id: 1, title: "実験手順を自動で書き出し", description: "PDFの指導書を読み取って、「目的」「原理」「手順」を自動で整理。手入力の手間をゼロにします。", icon: FileText },
  { id: 2, title: "あらゆるファイルを一括取り込み", description: "PDFだけでなく、実験データのExcelやホワイトボードの写真まで、まとめて AI が内容を把握します。", icon: Share2 },
  { id: 3, title: "グラフ・表を自動でWordへ", description: "Excelの数値から、軸ラベルや説明が付いたグラフを自動作成。そのままレポートに貼り付けられます。", icon: BarChart3 },
  { id: 4, title: "考察のヒントを提案", description: "実験結果に基づいたコメントを自動生成。何をどう書けばいいか、AI があなたの思考をサポートします。", icon: Lightbulb },
  { id: 5, title: "作成状況がひと目でわかる", description: "解析から完成まで、今どのステップにいるかをリアルタイムで表示。待ち時間のストレスを減らします。", icon: Eye },
  { id: 6, title: "大切なデータを守る安心設計", description: "高度なセキュリティにより、あなたのレポートや実験データは厳重に保護され、他人に漏れることはありません。", icon: ShieldCheck },
]

const CARD_WIDTH = 340
const CARD_HEIGHT = 440

function GlassCard({ card, i, currentIndex, rel, x, z, scale, zIndex, opacity, blur, color, onCardClick }: any) {
  const cardRef = useRef<HTMLDivElement>(null)
  const isActive = i === currentIndex
  
  // マウス座標の管理（枠線の光用）
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    mouseX.set(e.clientX - rect.left)
    mouseY.set(e.clientY - rect.top)
  }

  // 枠線の光の強度を弱めるための調整 (マスクの範囲を広げつつ、色の乗りを薄くする)
  const borderMask = useMotionTemplate`radial-gradient(250px circle at ${mouseX}px ${mouseY}px, rgba(255,255,255,0.8), transparent 100%)`

  return (
    <motion.div
      ref={cardRef}
      animate={{ 
        x, z, scale, zIndex, opacity, 
        filter: `blur(${blur}px)`,
      }}
      transition={{ type: "spring", stiffness: 180, damping: 40, mass: 1 }}
      className={cn(
        "absolute rounded-[3rem] overflow-hidden will-change-transform shadow-xl transition-shadow duration-500",
        isActive && "shadow-[0_20px_80px_-15px_rgba(59,130,246,0.2)]"
      )}
      style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}
      onMouseMove={handleMouseMove}
      onClick={(e) => { e.stopPropagation(); onCardClick(i); }}
    >
      <div 
        className="w-full h-full relative p-10 flex flex-col items-start text-left overflow-hidden transition-colors duration-700"
        style={{
          backgroundColor: isActive ? "rgba(255, 255, 255, 0.45)" : "rgba(255, 255, 255, 0.8)",
          backdropFilter: isActive ? "blur(24px)" : "none",
          WebkitBackdropFilter: isActive ? "blur(24px)" : "none",
        }}
      >
        {/* ベースの非常に薄い枠線 */}
        <div className="absolute inset-0 border border-black/[0.03] rounded-[3rem] pointer-events-none" />

        {/* マウスに追従して光る枠線（青色固定・強度弱め） */}
        <motion.div 
          className="absolute inset-0 border-2 pointer-events-none rounded-[3rem]"
          style={{
            borderColor: "#3b82f6", // 青色に固定
            WebkitMaskImage: borderMask,
            maskImage: borderMask,
            opacity: isActive ? 0.4 : 0.2 // 強度を大幅にダウン
          }}
        />

        <div className="relative z-10 h-full flex flex-col w-full">
          <motion.div 
            className="w-16 h-16 rounded-3xl flex items-center justify-center mb-8 border shadow-lg transition-transform duration-300 hover:scale-110" 
            animate={{ 
              borderColor: isActive ? color : "rgba(0, 0, 0, 0.05)",
              background: isActive ? `linear-gradient(135deg, ${color}1a, ${color}1a)` : "rgba(255,255,255,1)"
            }}
          >
            <motion.div animate={{ color }}>
              <card.icon className="w-8 h-8" />
            </motion.div>
          </motion.div>
          
          <h3 className="text-2xl font-bold text-gray-900 mb-6 leading-tight">{card.title}</h3>
          <p className="text-gray-700 text-sm leading-relaxed font-light line-clamp-5">{card.description}</p>
          
          <div className="mt-auto flex items-center justify-between w-full border-t border-black/5 pt-6">
            <span className="text-[10px] uppercase tracking-[0.3em] text-gray-400 font-black">Module {card.id.toString().padStart(2, '0')}</span>
            <motion.div 
              className="w-2 h-2 rounded-full" 
              animate={{ 
                scale: isActive ? [1, 1.5, 1] : 1, 
                opacity: isActive ? [0.5, 1, 0.5] : 0.2,
                backgroundColor: color 
              }} 
              transition={{ duration: 2, repeat: Infinity }} 
            />
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default function CoverFlowCarousel() {
  const [currentIndex, setCurrentIndex] = useState(2)

  const handlePrev = useCallback(() => setCurrentIndex((prev) => (prev - 1 + CARDS.length) % CARDS.length), [])
  const handleNext = useCallback(() => setCurrentIndex((prev) => (prev + 1) % CARDS.length), [])

  const handleCardClick = (index: number) => index !== currentIndex && setCurrentIndex(index)

  const handlePanEnd = (event: any, info: PanInfo) => {
    const threshold = 50
    if (info.offset.x > threshold) handlePrev()
    else if (info.offset.x < -threshold) handleNext()
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") handlePrev()
      else if (e.key === "ArrowRight") handleNext()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handlePrev, handleNext])

  const getRelativePosition = (index: number) => {
    const total = CARDS.length
    let rel = (index - currentIndex + total) % total
    if (rel > total / 2) rel -= total
    return rel
  }

  return (
    <section id="features" className="py-32 overflow-hidden bg-transparent relative w-full h-[900px] flex flex-col items-center justify-center select-none content-visibility-auto">
      <div className="max-w-5xl mx-auto w-full mb-20 relative z-10 text-center mincho">
        <h2 className="text-4xl md:text-5xl font-light text-gray-900 mb-6 tracking-tight text-center">
          <span className="font-medium italic instrument">シンプル</span>で
          <span className="font-medium italic instrument">パワフル</span>な機能
        </h2>
        <p className="text-gray-600 text-base max-w-lg mx-auto font-light text-center">
          レポート作成のあらゆる工程を、最先端のAIがカバーします。
        </p>
      </div>

      <motion.div className="relative w-full max-w-7xl mx-auto h-[550px] flex items-center justify-center transform-style-3d cursor-grab active:cursor-grabbing" onPanEnd={handlePanEnd}>
        <div className="relative w-full h-full flex items-center justify-center">
          {CARDS.map((card, i) => {
            const rel = getRelativePosition(i)
            const angle = (rel / CARDS.length) * (Math.PI * 2)
            const x = Math.sin(angle) * 450
            const z = Math.cos(angle) * 250
            const normalizedZ = (z + 250) / 500
            
            let color = "#3b82f6" 
            if (rel < 0) color = "#a855f7" 
            else if (rel === 0) color = "#8b5cf6" 
            else color = "#3b82f6" 

            return (
              <GlassCard 
                key={card.id}
                card={card}
                i={i}
                currentIndex={currentIndex}
                rel={rel}
                x={x}
                z={z}
                scale={0.6 + (normalizedZ * 0.4)}
                zIndex={Math.round(normalizedZ * 100)}
                opacity={0.1 + (normalizedZ * 0.9)}
                blur={(1 - normalizedZ) * 12}
                color={color}
                onCardClick={handleCardClick}
              />
            )
          })}
        </div>
      </motion.div>

      {/* Controls */}
      <div className="flex items-center gap-8 mt-12 relative z-10">
        <button onClick={handlePrev} className="p-5 rounded-full bg-white/50 backdrop-blur-xl hover:bg-white text-gray-900 transition-all shadow-lg active:scale-90 border border-white/20">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div className="flex gap-2">
          {CARDS.map((_, i) => (
            <div key={i} className={cn("h-1.5 rounded-full transition-all duration-500", i === currentIndex ? "w-8 bg-indigo-600" : "w-2 bg-gray-300")} />
          ))}
        </div>
        <button onClick={handleNext} className="p-5 rounded-full bg-white/50 backdrop-blur-xl hover:bg-white text-gray-900 transition-all shadow-lg active:scale-90 border border-white/20">
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>
    </section>
  )
}
