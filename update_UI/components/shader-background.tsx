"use client"

import { useEffect, useRef } from "react"
import { motion, useMotionValue, useSpring, useMotionTemplate } from "framer-motion"
import { MagnetProvider, useMagnet } from "./magnet-context"

interface ShaderBackgroundProps {
  children: React.ReactNode
}

function ShaderBackgroundContent({ children }: { children: React.ReactNode }) {
  const { magnetPoints } = useMagnet()
  
  const targetX = useMotionValue(0)
  const targetY = useMotionValue(0)
  const influenceValue = useMotionValue(0)
  const hoverValue = useMotionValue(0)

  // Spring設定を軽量化（計算コスト削減）
  const springConfig = { damping: 20, stiffness: 100, mass: 0.5 }
  const x = useSpring(targetX, springConfig)
  const y = useSpring(targetY, springConfig)
  const influence = useSpring(influenceValue, { damping: 20, stiffness: 80 })
  const hoverState = useSpring(hoverValue, { damping: 20, stiffness: 80 })

  useEffect(() => {
    let animationFrameId: number
    let lastX = 0
    let lastY = 0

    const updatePosition = () => {
      const curX = lastX
      const curY = lastY
      
      let nearestPoint = null
      let minDistance = Infinity
      let isAnyHovered = false
      const threshold = 350

      // 高速化: for...in よりも Object.values の方が速い場合があるが、
      // ここではループ回数が少ないため、計算ロジック自体は維持しつつRAFでラップする
      const points = Object.values(magnetPoints)
      
      for (const point of points) {
        const dx = point.x - (curX + window.scrollX)
        const dy = point.y - (curY + window.scrollY)
        // 平方根計算 (Math.sqrt) は重いため、距離の二乗で比較して最適化可能だが、
        // 可読性と threshold の兼ね合いで現状維持し、頻度を減らす
        const distance = Math.sqrt(dx * dx + dy * dy)

        if (distance < threshold && distance < minDistance) {
          minDistance = distance
          nearestPoint = point
        }
        if (point.isHovered) isAnyHovered = true
      }

      hoverValue.set(isAnyHovered ? 1 : 0)

      if (nearestPoint) {
        const rawInfluence = Math.pow(1 - minDistance / threshold, 1.5)
        const pullX = curX + (nearestPoint.x - window.scrollX - curX) * rawInfluence
        const pullY = curY + (nearestPoint.y - window.scrollY - curY) * rawInfluence
        
        targetX.set(pullX)
        targetY.set(pullY)
        influenceValue.set(rawInfluence)
      } else {
        targetX.set(curX)
        targetY.set(curY)
        influenceValue.set(0)
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      lastX = e.clientX
      lastY = e.clientY
      
      // INP対策: イベント毎に計算せず、次の描画フレームで一括処理する
      if (!animationFrameId) {
        animationFrameId = requestAnimationFrame(() => {
          updatePosition()
          animationFrameId = 0
        })
      }
    }

    window.addEventListener("mousemove", handleMouseMove)
    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      if (animationFrameId) cancelAnimationFrame(animationFrameId)
    }
  }, [magnetPoints, targetX, targetY, influenceValue, hoverValue])

  // レンダリング最適化: テンプレートリテラルの再計算を減らす
  const maskRadius = useMotionTemplate`calc(200px - (${influence} * 100px) - (${hoverState} * 40px))`
  const maskImage = useMotionTemplate`radial-gradient(${maskRadius} circle at ${x}px ${y}px, black 0%, transparent 100%)`
  const gridOpacity = useMotionTemplate`calc(0.5 + (${influence} * 0.3) + (${hoverState} * 0.2))`
  const spotlightRadius = useMotionTemplate`calc(150px - (${influence} * 50px) - (${hoverState} * 40px))`
  const spotlightOpacity = useMotionTemplate`calc(0.15 + (${influence} * 0.15) + (${hoverState} * 0.3))`

  return (
    <div className="bg-white relative min-h-screen overflow-x-hidden">
      <div
        className="fixed inset-0 z-0 pointer-events-none will-change-transform" // GPUレイヤー昇格
        style={{
          backgroundColor: "#fafafa",
          backgroundImage: `
            linear-gradient(to right, rgba(0, 0, 0, 0.05) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(0, 0, 0, 0.05) 1px, transparent 1px)
          `,
          backgroundSize: "24px 24px",
        }}
      />

      {/* Blue Glowing Grid Layer */}
      <motion.div
        className="fixed inset-0 z-0 pointer-events-none will-change-[mask-image]" // GPU最適化
        style={{
          backgroundImage: useMotionTemplate`
            linear-gradient(to right, rgba(59, 130, 246, ${gridOpacity}) 1.5px, transparent 1.5px),
            linear-gradient(to bottom, rgba(59, 130, 246, ${gridOpacity}) 1.5px, transparent 1.5px)
          `,
          backgroundSize: "24px 24px",
          WebkitMaskImage: maskImage,
          maskImage: maskImage,
        }}
      />
      
      {/* Spotlight Effect */}
      <motion.div
        className="fixed inset-0 z-0 pointer-events-none will-change-transform" // GPU最適化
        style={{
          background: useMotionTemplate`radial-gradient(${spotlightRadius} circle at ${x}px ${y}px, rgba(37, 99, 235, ${spotlightOpacity}), transparent 80%)`,
        }}
      />

      <div className="relative z-10">{children}</div>
    </div>
  )
}

export default function ShaderBackground({ children }: ShaderBackgroundProps) {
  return (
    <MagnetProvider>
      <ShaderBackgroundContent>{children}</ShaderBackgroundContent>
    </MagnetProvider>
  )
}