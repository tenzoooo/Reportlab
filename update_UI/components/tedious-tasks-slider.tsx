"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import { motion, PanInfo, useMotionValue, useSpring, useMotionTemplate } from "framer-motion"
import { ChevronLeft, ChevronRight, Frown, AlertCircle, Coffee, Moon, BookOpen } from "lucide-react"
import { cn } from "@/lib/utils"

const AUTOMATED_TASKS = [
  { id: 1, title: "グラフの作成", desc: "Excelの生データを元に、プロット範囲や軸の設定を一つずつ手動で行う手間のかかる作業。" },
  { id: 2, title: "表の作成", desc: "罫線の太さやセルの幅を調整しながら、見やすい表をWordで一から作り上げる苦労。" },
  { id: 3, title: "グラフと表の挿入", desc: "作成した図表をWordに貼り付け、レイアウトが崩れないよう微調整を繰り返す時間。" },
  { id: 4, title: "セル・単位の調整", desc: "全数値の有効数字を確認し、単位漏れがないか一箇所ずつ目視で修正する地道な作業。" },
  { id: 5, title: "キャプションの生成", desc: "「図1.1 〇〇の特性」といった定型的な説明文を、すべての図表に対して考え出す負担。" },
  { id: 6, title: "定量的コメントの生成", desc: "グラフの傾向を読み取り、「増加傾向にある」といった事実を言葉にするための思考コスト。" },
  { id: 7, title: "考察文を能動態で生成", desc: "実験結果を論理的に分析し、報告書として適切な文体で書き上げるための多大な時間。" },
  { id: 8, title: "まとめの生成", desc: "実験全体を通して得られた成果を、過不足なく簡潔な結論としてまとめる作業の重荷。" },
  { id: 9, title: "参考文献のフォーマット", desc: "規定のフォーマットに合わせ、著者名や発行年を正確にタイピングして整える最後の手間。" },
]

const TIME_BENEFITS = [
  {
    icon: Moon,
    title: "週末の夜を自分のために",
    desc: "徹夜でレポートを仕上げる必要はありません。金曜日のうちにすべて終わらせて、土日は趣味や休息にたっぷり時間を使えます。"
  },
  {
    icon: Coffee,
    title: "余裕を持った夕食を",
    desc: "実験が終わったその日のうちに基盤が完成。空いた数時間で、友人とゆっくり夕食を楽しんだり、映画を一本見る余裕が生まれます。"
  },
  {
    icon: BookOpen,
    title: "本当に必要な勉強に集中",
    desc: "タイピング作業ではなく、考察の深化や資格試験の勉強、他教科の予習など、将来に繋がる「本質的な学び」に時間を投資できます。"
  },
]

const CARD_WIDTH = 340
const CARD_HEIGHT = 440
const GAP = 360

function GlassCard({ task, i, currentIndex, total, onCardClick }: any) {
  const cardRef = useRef<HTMLDivElement>(null)
  let rel = (i - currentIndex + total) % total
  if (rel > total / 2) rel -= total
  const absRel = Math.abs(rel)
  const isActive = rel === 0
  const radiusZ = 250
  const angle = (rel / total) * (Math.PI * 2)
  const x = Math.sin(angle) * 450
  const z = Math.cos(angle) * radiusZ
  const normalizedZ = (z + radiusZ) / (radiusZ * 2)
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
    <motion.div
      ref={cardRef}
      animate={{ x, z, scale: 0.6 + (normalizedZ * 0.4), zIndex: Math.round(normalizedZ * 100), opacity: 0.1 + (normalizedZ * 0.9), filter: `blur(${(1 - normalizedZ) * 12}px)` }}
      transition={{ type: "spring", stiffness: 180, damping: 40, mass: 1 }}
      className={cn("absolute rounded-[3rem] overflow-hidden will-change-transform shadow-xl transition-shadow duration-500", isActive && "shadow-[0_20px_80px_-15px_rgba(239,68,68,0.2)]")}
      style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}
      onMouseMove={handleMouseMove}
      onClick={(e) => { e.stopPropagation(); onCardClick(i); }}
    >
      <div className="w-full h-full relative p-10 flex flex-col items-start text-left overflow-hidden transition-colors duration-700" style={{ backgroundColor: isActive ? "rgba(255, 255, 255, 0.45)" : "rgba(255, 255, 255, 0.8)", backdropFilter: isActive ? "blur(24px)" : "none", WebkitBackdropFilter: isActive ? "blur(24px)" : "none" }}>
        <motion.div className="absolute inset-0 border-2 border-[#ef4444] pointer-events-none rounded-[3rem]" style={{ WebkitMaskImage: borderMask, maskImage: borderMask, opacity: isActive ? 0.3 : 0.1 }} />
        <div className="relative z-10 h-full flex flex-col w-full">
          <div className="w-16 h-16 rounded-3xl flex items-center justify-center mb-8 border shadow-lg bg-red-50/50">
            <Frown className="w-8 h-8 text-red-500" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-6 leading-tight">{task.title}</h3>
          <p className="text-gray-700 text-sm leading-relaxed font-light line-clamp-5">{task.desc}</p>
          <div className="mt-auto flex items-center justify-between w-full border-t border-black/5 pt-6">
            <span className="text-[10px] uppercase tracking-[0.3em] text-gray-400 font-black">Manual Task {task.id.toString().padStart(2, '0')}</span>
            <AlertCircle className={cn("w-4 h-4 text-red-400 transition-opacity", isActive ? "opacity-100" : "opacity-0")} />
          </div>
        </div>
      </div>
    </motion.div>
  )
}

const LineSmileIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M8 14s1.5 2 4 2 4-2 4-2" />
    <line x1="9" y1="9" x2="9.01" y2="9" />
    <line x1="15" y1="9" x2="15.01" y2="9" />
  </svg>
)

export default function TediousTasksSlider() {
  const [currentIndex, setCurrentIndex] = useState(0)
  const handlePrev = useCallback(() => setCurrentIndex((prev) => (prev - 1 + AUTOMATED_TASKS.length) % AUTOMATED_TASKS.length), [])
  const handleNext = useCallback(() => setCurrentIndex((prev) => (prev + 1) % AUTOMATED_TASKS.length), [])
  const handlePanEnd = (event: any, info: PanInfo) => {
    const threshold = 50
    if (info.offset.x > threshold) handlePrev()
    else if (info.offset.x < -threshold) handleNext()
  }

  return (
    <section id="features" className="py-32 overflow-hidden bg-transparent relative w-full flex flex-col items-center justify-center select-none content-visibility-auto mincho">
      <div className="max-w-6xl mx-auto w-full mb-20 relative z-10 text-center">
        <h2 className="text-3xl md:text-4xl font-light text-gray-900 mb-6">これまでの作業</h2>
        <p className="text-gray-600 text-sm max-w-2xl mx-auto font-light leading-relaxed">
          本来、レポートは実験結果を深く考察するためのもの。<br />
          しかし、現実には膨大な「単純作業」があなたの思考を妨げています。
        </p>
      </div>

      <motion.div className="relative w-full max-w-7xl mx-auto h-[550px] flex items-center justify-center transform-style-3d cursor-grab active:cursor-grabbing" onPanEnd={handlePanEnd}>
        <div className="relative w-full h-full flex items-center justify-center">
          {AUTOMATED_TASKS.map((task, i) => (
            <GlassCard key={task.id} task={task} i={i} currentIndex={currentIndex} total={AUTOMATED_TASKS.length} onCardClick={setCurrentIndex} />
          ))}
        </div>
      </motion.div>

      <div className="flex items-center gap-8 mt-12 relative z-10 mb-32">
        <button onClick={handlePrev} className="p-5 rounded-full bg-white/50 backdrop-blur-xl hover:bg-white text-gray-900 transition-all shadow-lg active:scale-90 border border-white/20">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div className="flex gap-2">
          {AUTOMATED_TASKS.map((_, i) => (
            <div key={i} className={cn("h-1.5 rounded-full transition-all duration-500", i === currentIndex ? "w-8 bg-red-600" : "w-2 bg-gray-300")} />
          ))}
        </div>
        <button onClick={handleNext} className="p-5 rounded-full bg-white/50 backdrop-blur-xl hover:bg-white text-gray-900 transition-all shadow-lg active:scale-90 border border-white/20">
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>

      {/* 解決メッセージ & 想像を煽る実用例 */}
      <div className="max-w-6xl mx-auto w-full px-8 relative z-10">
        <div className="flex flex-col items-center gap-12">
          {/* メインメッセージ */}
          <div className="flex flex-col items-center gap-6 animate-bounce-subtle">
            <div className="w-px h-16 bg-gradient-to-b from-gray-200 to-blue-500" />
            <div className="text-blue-600 font-medium tracking-widest text-sm uppercase">この作業全て解決します。</div>
            <div className="flex items-center gap-4 px-8 py-4 rounded-full bg-blue-50 border border-blue-100 shadow-sm">
              <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white shadow-lg">
                <LineSmileIcon />
              </div>
              <span className="text-blue-700 font-bold tracking-wider text-lg">レポート作成時間を80%削減できます</span>
            </div>
          </div>

          {/* 実用例カード */}
          <div className="grid md:grid-cols-3 gap-8 w-full mt-8">
            {TIME_BENEFITS.map((benefit, i) => (
              <div key={i} className="relative p-8 rounded-[2.5rem] bg-white/40 backdrop-blur-xl border border-blue-100 shadow-sm hover:shadow-md transition-all group">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <benefit.icon className="w-6 h-6 text-blue-500" />
                </div>
                <h4 className="text-lg font-bold text-gray-900 mb-4">{benefit.title}</h4>
                <p className="text-xs text-gray-600 leading-relaxed font-light">
                  {benefit.desc}
                </p>
              </div>
            ))}
          </div>

          <p className="text-gray-400 text-[10px] uppercase tracking-[0.4em] font-black text-center mt-8">
            Reclaim your time with Reportlab
          </p>
        </div>
      </div>

      <style jsx global>{`
        @keyframes bounce-subtle {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(10px); }
        }
        .animate-bounce-subtle { animation: bounce-subtle 3s infinite ease-in-out; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </section>
  )
}
