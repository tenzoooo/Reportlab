"use client"

import { motion, useScroll, useTransform, useSpring, useMotionValue } from "framer-motion"
import Link from "next/link"
import { FileText, Zap, Shield, TrendingUp, Clock, CheckCircle, ArrowRight, Sparkles, Cpu, Activity } from "lucide-react"
import dynamic from "next/dynamic"
import { Suspense, useRef, useState, useEffect } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"

const FloatingBeaker = dynamic(() => import("@/components/3d/floating-beaker"), { ssr: false })
const DataVisualization = dynamic(() => import("@/components/3d/data-visualization"), { ssr: false })

const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" as const } },
}

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.2,
    },
  },
}

const glitchAnimation = {
  hidden: { opacity: 0, x: -10 },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      type: "spring",
      stiffness: 100,
      damping: 10,
    },
  },
}

export default function LandingPage() {
  const { scrollYProgress } = useScroll()
  const y = useTransform(scrollYProgress, [0, 1], [0, -50])
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)

  const springConfig = { damping: 25, stiffness: 150, mass: 0.5 }
  const mouseXSpring = useSpring(mouseX, springConfig)
  const mouseYSpring = useSpring(mouseY, springConfig)

  // Parallax transforms
  const backgroundX = useTransform(mouseXSpring, [-1, 1], [20, -20])
  const backgroundY = useTransform(mouseYSpring, [-1, 1], [20, -20])

  const floatingX = useTransform(mouseXSpring, [-1, 1], [-40, 40])
  const floatingY = useTransform(mouseYSpring, [-1, 1], [-40, 40])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Calculate normalized position (-1 to 1)
      const x = (e.clientX / window.innerWidth) * 2 - 1
      const y = (e.clientY / window.innerHeight) * 2 - 1

      mouseX.set(x)
      mouseY.set(y)
    }
    window.addEventListener("mousemove", handleMouseMove)
    return () => window.removeEventListener("mousemove", handleMouseMove)
  }, [mouseX, mouseY])

  return (
    <div className="min-h-screen bg-background cyber-grid selection:bg-primary/30 selection:text-primary-foreground overflow-x-hidden">
      {/* Header */}
      <motion.header
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: "circOut" as const }}
        className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-white/5"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <motion.div
              className="flex items-center gap-3 group cursor-pointer"
              whileHover={{ scale: 1.02 }}
            >
              <div className="relative">
                <div className="absolute inset-0 bg-primary/50 blur-lg rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <Image src="/app-icon.png" alt="App Icon" width={36} height={36} className="relative z-10" />
              </div>
              <span className="text-2xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70 group-hover:from-primary group-hover:to-secondary transition-all duration-300">
                Reportlab
              </span>
            </motion.div>
            <nav className="hidden md:flex items-center gap-8">
              {["機能", "使い方", "料金"].map((item, i) => (
                <a
                  key={i}
                  href={`#${item === "機能" ? "features" : item === "使い方" ? "workflow" : "pricing"}`}
                  className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors relative group"
                >
                  {item}
                  <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-primary transition-all group-hover:w-full" />
                </a>
              ))}
              <Link href="/login" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
                ログイン
              </Link>
              <Button className="primary-button font-bold tracking-wide" asChild>
                <Link href="/register">無料で始める</Link>
              </Button>
            </nav>
          </div>
        </div>
      </motion.header>

      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden pt-20 pb-32">
        {/* Dynamic Background Elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div
            className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[128px]"
            style={{ x: backgroundX, y: backgroundY }}
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.3, 0.5, 0.3]
            }}
            transition={{ duration: 5, repeat: Number.POSITIVE_INFINITY, repeatType: "reverse" }}
          />
          <motion.div
            className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-secondary/20 rounded-full blur-[128px]"
            style={{ x: backgroundX, y: backgroundY }}
            animate={{
              scale: [1.2, 1, 1.2],
              opacity: [0.3, 0.5, 0.3]
            }}
            transition={{ duration: 7, repeat: Number.POSITIVE_INFINITY, repeatType: "reverse" }}
          />
        </div>

        <motion.div
          className="absolute right-0 top-0 w-full md:w-1/2 h-full opacity-20 md:opacity-40 pointer-events-none mix-blend-screen"
          style={{ x: floatingX, y: floatingY }}
        >
          <Suspense fallback={<div />}>
            <FloatingBeaker />
          </Suspense>
        </motion.div>

        {/* Text Background Glow for Readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-transparent to-background/80 pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 w-full">
          <motion.div
            className="max-w-4xl mx-auto text-center space-y-10"
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
          >
            <motion.div variants={fadeInUp} className="inline-block">
              <span className="px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-sm font-bold tracking-wider uppercase backdrop-blur-md shadow-[0_0_20px_rgba(94,234,212,0.2)]">
                Next Gen Lab Assistant
              </span>
            </motion.div>

            <motion.h1 variants={fadeInUp} className="text-5xl sm:text-7xl lg:text-8xl font-black tracking-tighter leading-[1.1]">
              <span className="block text-foreground">
                考察以外は、
              </span>
              <span className="block mt-2 text-transparent bg-clip-text bg-gradient-to-r from-black via-gray-600 to-gray-900 opacity-100 pb-4">
                書かなくていい。
              </span>
            </motion.h1>

            <motion.p variants={fadeInUp} className="text-xl sm:text-2xl text-muted-foreground/90 max-w-2xl mx-auto leading-relaxed font-light">
              レポートの実験結果のページを
              <br />
              自動で作成。
            </motion.p>

            <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-8">
              <Button className="primary-button text-lg px-10 py-6 w-full sm:w-auto text-lg hover:scale-105 transition-transform" asChild>
                <Link href="/register">今すぐ解放される</Link>
              </Button>
              <Button variant="ghost" className="text-lg px-8 py-6 w-full sm:w-auto hover:bg-white/5 hover:text-primary transition-all group" asChild>
                <Link href="#workflow" className="flex items-center gap-2">
                  仕組みを見る
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Link>
              </Button>
            </motion.div>

            {/* KPI Stats */}
            <motion.div
              variants={staggerContainer}
              className="grid grid-cols-2 md:grid-cols-4 gap-8 pt-20 border-t border-white/5 mt-20"
            >
              {[
                { value: "90%", label: "時間削減", icon: Clock },
                { value: "5分", label: "平均生成時間", icon: Zap },
                { value: "∞", label: "可能性", icon: TrendingUp },
              ].map((stat, i) => (
                <motion.div key={i} variants={fadeInUp} className="text-center group">
                  <div className="flex justify-center mb-3 text-muted-foreground group-hover:text-primary transition-colors">
                    <stat.icon className="w-6 h-6" />
                  </div>
                  <div className="text-3xl sm:text-4xl font-black text-foreground mb-1 tracking-tight">{stat.value}</div>
                  <div className="text-xs sm:text-sm font-bold uppercase tracking-widest text-muted-foreground/70">{stat.label}</div>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-card/30 backdrop-blur-3xl skew-y-3 transform origin-top-left scale-110" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-20"
          >
            <h2 className="text-4xl sm:text-5xl font-black mb-6 tracking-tight">
              圧倒的<span className="text-primary">パフォーマンス</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl">
              もう、WordとExcelを行き来する必要はありません。
              <br />
              Reportlabが、あなたの研究時間を最大化します。
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: Zap,
                title: "一瞬で、完成",
                desc: "PDFをドラッグ＆ドロップするだけ。章立て、図表、フォーマット、全てAIが自動で構築します。",
                color: "from-yellow-400 to-orange-500"
              },
              {
                icon: Cpu,
                title: "レポート特化型AI",
                desc: "実験書の文脈を理解し、最適なフォーマットを自動生成。考察に必要な要素を自動で抽出します。",
                color: "from-blue-400 to-cyan-500"
              },
              {
                icon: Activity,
                title: "完全な管理",
                desc: "過去のレポートも、実験データも、全てクラウドで一元管理。いつでもどこでも、続きから。",
                color: "from-purple-400 to-pink-500"
              }
            ].map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.2 }}
                whileHover={{ y: -10 }}
                className="group relative p-8 rounded-3xl bg-card border border-white/5 hover:border-primary/50 transition-all duration-500 overflow-hidden"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${feature.color} opacity-0 group-hover:opacity-5 transition-opacity duration-500`} />
                <div className="relative z-10">
                  <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500 border border-white/10 group-hover:border-primary/50">
                    <feature.icon className="w-7 h-7 text-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <h3 className="text-2xl font-bold mb-4 group-hover:text-primary transition-colors">{feature.title}</h3>
                  <p className="text-muted-foreground/90 leading-relaxed">
                    {feature.desc}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Workflow Section */}
      <section id="workflow" className="py-32 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="text-center mb-24"
          >
            <h2 className="text-4xl sm:text-5xl font-black mb-6 tracking-tight">驚くほど、シンプル</h2>
            <p className="text-xl text-muted-foreground">
              複雑な操作は一切不要。直感的な3ステップ。
            </p>
          </motion.div>

          <div className="relative">
            {/* Connecting Line */}
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-primary/50 to-transparent hidden md:block" />

            {[
              {
                step: "01",
                title: "Upload",
                desc: "実験書PDFと生データを投げる。",
                detail: "画像、Excel、テキスト...形式は問いません。",
                align: "left"
              },
              {
                step: "02",
                title: "Analyze",
                desc: "AIが構造化する。",
                detail: "構造解析、フォーマット生成、考察課題の抽出。",
                align: "right"
              },
              {
                step: "03",
                title: "Done",
                desc: "レポートを受け取る。",
                detail: "あとは考察を書くだけ。Word形式でダウンロード。",
                align: "left"
              }
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: item.align === "left" ? -50 : 50 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: i * 0.2 }}
                className={`flex items-center gap-12 mb-24 ${item.align === "right" ? "flex-row-reverse" : ""} relative`}
              >
                <div className={`flex-1 ${item.align === "right" ? "text-left" : "text-right"}`}>
                  <div className="inline-block">
                    <span className="text-8xl font-black text-white/5 absolute -top-10 -z-10 select-none">
                      {item.step}
                    </span>
                    <h3 className="text-4xl font-bold mb-2">{item.title}</h3>
                    <p className="text-xl font-medium text-primary mb-2">{item.desc}</p>
                    <p className="text-muted-foreground">{item.detail}</p>
                  </div>
                </div>

                <div className="relative z-10 hidden md:flex items-center justify-center w-16 h-16 rounded-full bg-background border-4 border-card shadow-[0_0_30px_rgba(94,234,212,0.3)]">
                  <div className="w-4 h-4 rounded-full bg-primary animate-pulse" />
                </div>

                <div className="flex-1">
                  <div className="aspect-video rounded-2xl bg-card/50 border border-white/10 backdrop-blur-sm p-8 flex items-center justify-center group hover:border-primary/50 transition-colors duration-500">
                    {i === 0 && <FileText className="w-20 h-20 text-white/20 group-hover:text-primary transition-colors duration-500" />}
                    {i === 1 && <Activity className="w-20 h-20 text-white/20 group-hover:text-secondary transition-colors duration-500" />}
                    {i === 2 && <CheckCircle className="w-20 h-20 text-white/20 group-hover:text-success transition-colors duration-500" />}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-32 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-20"
          >
            <h2 className="text-4xl sm:text-5xl font-black mb-6 tracking-tight">
              未来への<span className="text-primary">投資</span>
            </h2>
            <p className="text-xl text-muted-foreground">
              コーヒー1杯分の価格で、あなたの週末を取り戻します。
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto items-center">
            {[
              {
                name: "Free",
                price: "¥0",
                desc: "まずは体験してください",
                features: ["月次クレジットなし", "ストレージ 100MB", "基本機能へのアクセス"],
                cta: "無料で始める",
                href: "/register",
                highlight: false
              },
              {
                name: "Standard",
                price: "¥980",
                desc: "最も選ばれているプラン",
                features: ["毎月400クレジット", "ストレージ 1GB", "優先処理キュー", "高度なAIモデル利用"],
                cta: "Standardで始める",
                href: "/register?plan=standard",
                highlight: true
              },
              {
                name: "Premium",
                price: "¥1,980",
                desc: "本気で研究する人へ",
                features: ["毎月1000クレジット", "ストレージ 5GB", "最優先サポート", "新機能への早期アクセス"],
                cta: "Premiumで始める",
                href: "/register?plan=premium",
                highlight: false
              }
            ].map((plan, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                whileHover={{ scale: plan.highlight ? 1.05 : 1.02 }}
                className={`relative p-8 rounded-3xl ${plan.highlight
                  ? "bg-card border-2 border-primary shadow-[0_0_50px_rgba(94,234,212,0.15)] z-10"
                  : "bg-card/50 border border-white/5"
                  }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-5 left-0 right-0 flex justify-center">
                    <span className="bg-gradient-to-r from-primary to-secondary text-background font-bold px-6 py-1.5 rounded-full text-sm shadow-lg animate-pulse">
                      RECOMMENDED
                    </span>
                  </div>
                )}

                <div className="text-center mb-8">
                  <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
                  <div className="flex items-baseline justify-center gap-1 mb-2">
                    <span className="text-4xl font-black">{plan.price}</span>
                    <span className="text-muted-foreground">/月</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{plan.desc}</p>
                </div>

                <ul className="space-y-4 mb-8">
                  {plan.features.map((feature, j) => (
                    <li key={j} className="flex items-center gap-3 text-sm">
                      <CheckCircle className={`w-5 h-5 ${plan.highlight ? "text-primary" : "text-muted-foreground"}`} />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  className={`w-full py-6 font-bold tracking-wide ${plan.highlight ? "primary-button" : "secondary-button"
                    }`}
                  asChild
                >
                  <Link href={plan.href}>{plan.cta}</Link>
                </Button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-primary/10 via-transparent to-transparent" />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <motion.h2
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="text-5xl sm:text-6xl font-black mb-8 tracking-tighter"
          >
            準備はいいですか？
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-xl text-muted-foreground mb-12"
          >
            クレジットカードは不要です。<br />
            まずは無料で、その圧倒的なスピードを体感してください。
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            whileHover={{ scale: 1.05 }}
          >
            <Button className="primary-button text-xl px-12 py-8 rounded-full shadow-[0_0_40px_rgba(94,234,212,0.4)] hover:shadow-[0_0_60px_rgba(94,234,212,0.6)] transition-all" asChild>
              <Link href="/register">無料で始める</Link>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-black/20 backdrop-blur-lg py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex items-center gap-2">
              <Image src="/app-icon.png" alt="App Icon" width={24} height={24} className="opacity-70" />
              <span className="font-bold text-muted-foreground">Reportlab</span>
            </div>
            <div className="flex gap-8 text-sm text-muted-foreground">
              <Link href="/legal/terms" className="hover:text-primary transition-colors">利用規約</Link>
              <Link href="/legal/privacy-policy" className="hover:text-primary transition-colors">プライバシーポリシー</Link>
              <Link href="/legal/commercial-disclosure" className="hover:text-primary transition-colors">特定商取引法に基づく表記</Link>
            </div>
            <div className="text-sm text-muted-foreground/50">
              © 2025 Reportlab. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
