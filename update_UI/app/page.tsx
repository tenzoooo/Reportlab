"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import { FileText, Zap, Shield, TrendingUp, Clock, CheckCircle, ArrowRight } from "lucide-react"
import dynamic from "next/dynamic"
import { Suspense } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"

const FloatingBeaker = dynamic(() => import("@/components/3d/floating-beaker"), { ssr: false })
const DataVisualization = dynamic(() => import("@/components/3d/data-visualization"), { ssr: false })

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
}

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background cyber-grid">
      {/* Header */}
      <motion.header
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="sticky top-0 z-50 bg-card/80 backdrop-blur-md border-b border-border"
        style={{ boxShadow: "0 0 15px rgba(94, 234, 212, 0.1)" }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <motion.div
              className="flex items-center gap-2"
              whileHover={{ scale: 1.05 }}
              transition={{ type: "spring", stiffness: 400 }}
            >
              <Image src="/app-icon.png" alt="App Icon" width={32} height={32} />
              <span className="text-xl font-bold text-foreground">Reportlab</span>
            </motion.div>
            <nav className="hidden md:flex items-center gap-6">
              <a href="#features" className="text-muted-foreground hover:text-primary transition-colors">
                機能
              </a>
              <a href="#workflow" className="text-muted-foreground hover:text-primary transition-colors">
                使い方
              </a>
              <a href="#pricing" className="text-muted-foreground hover:text-primary transition-colors">
                料金
              </a>
              <Link href="/login" className="text-primary hover:text-primary/90 font-semibold transition-colors">
                ログイン
              </Link>
              <Button className="primary-button" asChild>
                <Link href="/register">無料で始める</Link>
              </Button>
            </nav>
          </div>
        </div>
      </motion.header>

      {/* Hero Section */}
      <section className="py-20 lg:py-32 relative overflow-hidden">
        <motion.div
          className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5"
          animate={{
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 4,
            repeat: Number.POSITIVE_INFINITY,
            ease: "easeInOut",
          }}
        />

        <div className="absolute right-0 top-0 w-1/3 h-full opacity-20 pointer-events-none">
          <Suspense fallback={<div />}>
            <FloatingBeaker />
          </Suspense>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <motion.div className="text-center space-y-8" initial="hidden" animate="visible" variants={staggerContainer}>
            <motion.div
              variants={fadeInUp}
              className="inline-block px-4 py-2 bg-primary/20 text-primary rounded-full text-sm font-semibold border border-primary/30"
              style={{ boxShadow: "0 0 15px rgba(94, 234, 212, 0.3)" }}
            >
              AI駆動のレポート作成
            </motion.div>
            <motion.h1
              variants={fadeInUp}
              className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground tracking-tight"
            >
              実験レポートの面倒なところは
              <br />
              <span className="text-primary text-5xl sm:text-6xl lg:text-7xl">AIでいい</span>。
            </motion.h1>
            <motion.p variants={fadeInUp} className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              AIが実験データを自動分析。統計処理、グラフ生成、参考文献検索を一瞬で完了。 あなたは考察に集中するだけ。
            </motion.p>
            <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button className="primary-button text-lg px-8 py-4 w-full sm:w-auto" asChild>
                <Link href="/register">今すぐ無料で始める</Link>
              </Button>
              <Button className="secondary-button text-lg px-8 py-4 w-full sm:w-auto" asChild>
                <Link href="#workflow">使い方を見る</Link>
              </Button>
            </motion.div>

            {/* KPI Band */}
            <motion.div
              variants={staggerContainer}
              className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-12 max-w-4xl mx-auto"
            >
              {[
                { value: "80%", label: "作成時間削減", color: "text-primary" },
                { value: "10分", label: "平均処理時間", color: "text-secondary" },
                { value: "1,000+", label: "利用学生数", color: "text-success" },
              ].map((kpi, i) => (
                <motion.div
                  key={i}
                  variants={fadeInUp}
                  whileHover={{ scale: 1.1, y: -5 }}
                  className="text-center space-y-2"
                >
                  <motion.div
                    className={`text-4xl font-bold ${kpi.color}`}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.5 + i * 0.2, type: "spring" }}
                  >
                    {kpi.value}
                  </motion.div>
                  <div className="text-muted-foreground">{kpi.label}</div>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section
        id="features"
        className="py-20 bg-card/50 backdrop-blur-sm relative overflow-hidden border-y border-border/50"
      >
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-primary/5 to-secondary/5"
          animate={{
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{
            duration: 5,
            repeat: Number.POSITIVE_INFINITY,
            ease: "easeInOut",
          }}
        />

        <div className="absolute left-0 top-1/4 w-1/4 h-1/2 opacity-10 pointer-events-none">
          <Suspense fallback={<div />}>
            <DataVisualization />
          </Suspense>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center space-y-4 mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">主な機能</h2>
            <p className="text-xl text-muted-foreground">AIがあなたのレポート作成をフルサポート</p>
          </motion.div>

          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-3 gap-8"
          >
            {[
              {
                icon: Zap,
                title: "AI自動分析",
                color: "text-primary",
                bgColor: "bg-primary/10",
                hoverBg: "bg-primary",
                items: ["統計処理（平均値、標準偏差、相関係数）", "グラフ自動生成", "理論値との誤差分析"],
              },
              {
                icon: FileText,
                title: "Word自動生成",
                color: "text-secondary",
                bgColor: "bg-secondary/10",
                hoverBg: "bg-secondary",
                items: ["実験結果セクションの完全自動化", "参考文献の自動検索・挿入", "大学指定フォーマット対応"],
              },
              {
                icon: Clock,
                title: "過去資産活用",
                color: "text-success",
                bgColor: "bg-success/10",
                hoverBg: "bg-success",
                items: ["過去レポートからテンプレート抽出", "構成やフォーマットの再利用", "レポート履歴の一元管理"],
              },
            ].map((feature, i) => (
              <motion.div
                key={i}
                variants={fadeInUp}
                whileHover={{
                  scale: 1.05,
                  y: -10,
                  transition: { type: "spring", stiffness: 300 },
                }}
                className="feature-card group cursor-pointer"
              >
                <motion.div
                  className={`h-12 w-12 ${feature.bgColor} rounded-lg flex items-center justify-center mb-4 group-hover:${feature.hoverBg} transition-colors`}
                  whileHover={{ rotate: 360 }}
                  transition={{ duration: 0.6 }}
                >
                  <feature.icon
                    className={`h-6 w-6 ${feature.color} group-hover:text-primary-foreground transition-colors`}
                  />
                </motion.div>
                <h3 className="text-xl font-semibold mb-3 text-foreground">{feature.title}</h3>
                <ul className="space-y-2 text-muted-foreground">
                  {feature.items.map((item, j) => (
                    <motion.li
                      key={j}
                      initial={{ opacity: 0, x: -10 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.1 * j }}
                      className="flex items-start gap-2"
                    >
                      <CheckCircle className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </motion.li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Workflow Section */}
      <section id="workflow" className="py-20 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-secondary/10 to-accent/10" />
        <motion.div
          className="absolute inset-0"
          animate={{
            background: [
              "radial-gradient(circle at 0% 0%, rgba(94,234,212,0.1) 0%, transparent 50%)",
              "radial-gradient(circle at 100% 100%, rgba(168,85,247,0.1) 0%, transparent 50%)",
              "radial-gradient(circle at 0% 0%, rgba(94,234,212,0.1) 0%, transparent 50%)",
            ],
          }}
          transition={{
            duration: 10,
            repeat: Number.POSITIVE_INFINITY,
            ease: "easeInOut",
          }}
        />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center space-y-4 mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">3ステップで完成</h2>
            <p className="text-xl text-muted-foreground">シンプルな操作で高品質なレポートを作成</p>
          </motion.div>

          <div className="space-y-12">
            {[
              {
                step: 1,
                title: "データをアップロード",
                description:
                  "Excel、画像、コードなど、実験データをドラッグ&ドロップ。オシロスコープの画像も、手書きメモの写真も対応。",
                color: "bg-primary",
              },
              {
                step: 2,
                title: "AIが自動分析",
                description:
                  "数分待つだけで、統計処理、グラフ生成、傾向分析が完了。 進捗はリアルタイムで確認できます。",
                color: "bg-secondary",
              },
              {
                step: 3,
                title: "レポートをダウンロード",
                description: "完成したWord文書をダウンロード。 考察部分はあなたが記入する形で、学習効果も確保。",
                color: "bg-success",
              },
            ].map((workflow, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: i % 2 === 0 ? -50 : 50 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: i * 0.2 }}
                className={`flex flex-col ${i % 2 === 1 ? "md:flex-row-reverse" : "md:flex-row"} items-center gap-8`}
              >
                <div className="flex-1 space-y-4">
                  <motion.div
                    className={`inline-flex items-center justify-center h-12 w-12 rounded-full ${workflow.color} text-primary-foreground font-bold text-xl`}
                    whileHover={{ scale: 1.2, rotate: 360 }}
                    transition={{ type: "spring", stiffness: 260, damping: 20 }}
                  >
                    {workflow.step}
                  </motion.div>
                  <h3 className="text-2xl font-bold text-foreground">{workflow.title}</h3>
                  <p className="text-lg text-muted-foreground leading-relaxed">{workflow.description}</p>
                </div>
                <motion.div
                  className="flex-1"
                  whileHover={{ scale: 1.05 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  {/* Workflow visual cards */}
                  {workflow.step === 1 && (
                    <div className="bg-card rounded-2xl shadow-xl p-8 border-2 border-dashed border-border">
                      <div className="text-center space-y-4">
                        <motion.div
                          className="h-24 w-24 mx-auto bg-primary/10 rounded-full flex items-center justify-center"
                          animate={{ y: [0, -10, 0] }}
                          transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
                        >
                          <FileText className="h-12 w-12 text-primary" />
                        </motion.div>
                        <p className="font-semibold text-foreground">ファイルをドロップ</p>
                        <p className="text-sm text-muted-foreground">Excel, 画像, コード対応</p>
                      </div>
                    </div>
                  )}
                  {workflow.step === 2 && (
                    <div className="bg-card rounded-2xl shadow-xl p-8">
                      <div className="space-y-6">
                        <motion.div
                          className="flex items-center gap-4"
                          initial={{ opacity: 0, x: -20 }}
                          whileInView={{ opacity: 1, x: 0 }}
                          viewport={{ once: true }}
                        >
                          <div className="h-10 w-10 bg-success/10 rounded-full flex items-center justify-center">
                            <CheckCircle className="h-6 w-6 text-success" />
                          </div>
                          <div className="flex-1">
                            <p className="font-semibold text-foreground">統計処理完了</p>
                            <div className="h-2 bg-success/20 rounded-full mt-2">
                              <motion.div
                                className="h-2 bg-success rounded-full"
                                initial={{ width: 0 }}
                                whileInView={{ width: "100%" }}
                                viewport={{ once: true }}
                                transition={{ duration: 1, delay: 0.3 }}
                              />
                            </div>
                          </div>
                        </motion.div>
                        <motion.div
                          className="flex items-center gap-4"
                          initial={{ opacity: 0, x: -20 }}
                          whileInView={{ opacity: 1, x: 0 }}
                          viewport={{ once: true }}
                          transition={{ delay: 0.2 }}
                        >
                          <motion.div
                            className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center"
                            animate={{ scale: [1, 1.1, 1] }}
                            transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY }}
                          >
                            <TrendingUp className="h-6 w-6 text-primary" />
                          </motion.div>
                          <div className="flex-1">
                            <p className="font-semibold text-foreground">グラフ生成中...</p>
                            <div className="h-2 bg-muted rounded-full mt-2">
                              <motion.div
                                className="h-2 bg-primary rounded-full"
                                animate={{ width: ["0%", "66%"] }}
                                transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
                              />
                            </div>
                          </div>
                        </motion.div>
                      </div>
                    </div>
                  )}
                  {workflow.step === 3 && (
                    <div className="bg-card rounded-2xl shadow-xl p-8">
                      <div className="space-y-4">
                        <motion.div
                          className="border-2 border-border rounded-lg p-4"
                          whileHover={{ borderColor: "#3B82F6" }}
                        >
                          <div className="flex items-center gap-3 mb-2">
                            <FileText className="h-6 w-6 text-primary" />
                            <span className="font-semibold text-foreground">実験レポート.docx</span>
                          </div>
                          <p className="text-sm text-muted-foreground">2.3 MB • 2024/10/28</p>
                        </motion.div>
                        <motion.button
                          className="primary-button w-full"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <span className="flex items-center justify-center gap-2">
                            ダウンロード
                            <ArrowRight className="h-5 w-5" />
                          </span>
                        </motion.button>
                      </div>
                    </div>
                  )}
                </motion.div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 bg-card/50 backdrop-blur-sm border-y border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center space-y-4 mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">シンプルな料金プラン</h2>
            <p className="text-xl text-muted-foreground">まずは無料で試せます</p>
          </motion.div>

          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto"
          >
            {[
              {
                name: "Free",
                price: "¥0",
                features: ["月5件までのレポート作成", "100MBのストレージ", "基本的なAI分析機能"],
                highlighted: false,
              },
              {
                name: "Premium",
                price: "¥980",
                features: ["無制限のレポート作成", "1GBのストレージ", "高度なAI分析機能", "優先サポート"],
                highlighted: true,
              },
            ].map((plan, i) => (
              <motion.div
                key={i}
                variants={fadeInUp}
                whileHover={{ scale: 1.05, y: -10 }}
                className={`card ${plan.highlighted ? "border-2 border-secondary relative mt-8" : ""}`}
              >
                {plan.highlighted && (
                  <motion.div
                    className="absolute -top-5 left-1/2 -translate-x-1/2"
                    animate={{
                      y: [0, -5, 0],
                      scale: [1, 1.1, 1],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Number.POSITIVE_INFINITY,
                      ease: "easeInOut",
                    }}
                  >
                    <span
                      className="bg-gradient-to-r from-pink-500 to-orange-500 text-white px-6 py-2 rounded-full text-base font-bold shadow-lg"
                      style={{ boxShadow: "0 0 20px rgba(236, 72, 153, 0.6), 0 0 40px rgba(251, 146, 60, 0.4)" }}
                    >
                      おすすめ
                    </span>
                  </motion.div>
                )}
                <div className="space-y-6">
                  <div>
                    <h3 className="text-2xl font-bold text-foreground mb-2">{plan.name}</h3>
                    <div className="flex items-baseline gap-2">
                      <motion.span
                        className={`text-5xl font-bold ${plan.highlighted ? "text-secondary" : "text-foreground"}`}
                        initial={{ opacity: 0, scale: 0 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        transition={{ type: "spring", delay: 0.3 }}
                      >
                        {plan.price}
                      </motion.span>
                      <span className="text-muted-foreground">/月</span>
                    </div>
                  </div>
                  <ul className="space-y-3">
                    {plan.features.map((feature, j) => (
                      <motion.li
                        key={j}
                        initial={{ opacity: 0, x: -10 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 * j }}
                        className="flex items-start gap-3"
                      >
                        <CheckCircle className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                        <span className="text-muted-foreground">{feature}</span>
                      </motion.li>
                    ))}
                  </ul>
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Link
                      href="/register"
                      className={`${plan.highlighted ? "primary-button bg-secondary hover:bg-secondary/90" : "secondary-button"} w-full block text-center`}
                    >
                      {plan.name === "Free" ? "無料で始める" : "Premiumを始める"}
                    </Link>
                  </motion.div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Security Section */}
      <section className="py-20 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-secondary/5 to-primary/5" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center gap-12">
            <motion.div
              className="flex-1"
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <motion.div
                className="inline-flex items-center justify-center h-20 w-20 bg-primary/10 rounded-2xl mb-6"
                whileHover={{ rotate: 360 }}
                transition={{ duration: 0.6 }}
              >
                <Shield className="h-10 w-10 text-primary" />
              </motion.div>
              <h2 className="text-3xl font-bold text-foreground mb-4">安全なデータ管理</h2>
              <p className="text-lg text-muted-foreground leading-relaxed mb-6">
                あなたの実験データは暗号化され、厳重に保護されます。
                データは本人のみがアクセス可能で、外部に公開されることは一切ありません。
              </p>
              <ul className="space-y-3">
                {["HTTPS通信による暗号化", "個人情報保護法準拠", "定期的なセキュリティ監査"].map((item, i) => (
                  <motion.li
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.1 * i }}
                    className="flex items-start gap-3"
                  >
                    <CheckCircle className="h-6 w-6 text-success flex-shrink-0 mt-0.5" />
                    <span className="text-card-foreground">{item}</span>
                  </motion.li>
                ))}
              </ul>
            </motion.div>
            <motion.div
              className="flex-1"
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <div className="bg-card rounded-2xl shadow-2xl p-8">
                <div className="space-y-4">
                  {["データ暗号化", "アクセス制御", "バックアップ"].map((item, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, scale: 0.8 }}
                      whileInView={{ opacity: 1, scale: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.2 * i }}
                      whileHover={{ scale: 1.05 }}
                      className="flex items-center justify-between p-4 bg-success/10 rounded-lg"
                    >
                      <span className="font-semibold text-foreground">{item}</span>
                      <motion.div
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, delay: i * 0.3 }}
                      >
                        <CheckCircle className="h-6 w-6 text-success" />
                      </motion.div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <motion.section
        className="py-20 neon-gradient relative overflow-hidden"
        style={{ boxShadow: "0 0 50px rgba(94, 234, 212, 0.3)" }}
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
      >
        <motion.div
          className="absolute inset-0 opacity-10"
          animate={{
            backgroundPosition: ["0% 0%", "100% 100%"],
          }}
          transition={{ duration: 20, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
          style={{
            backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)",
            backgroundSize: "50px 50px",
          }}
        />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <motion.h2
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl sm:text-4xl font-bold text-primary-foreground mb-6"
          >
            レポート作成時間を今すぐ削減
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-xl text-primary-foreground/90 mb-8 leading-relaxed"
          >
            無料プランで今日から始められます。クレジットカード不要。
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Link
                href="/register"
                className="bg-card text-primary px-8 py-4 rounded-lg font-semibold text-lg hover:bg-card/90 transition-all shadow-lg hover:shadow-xl w-full sm:w-auto inline-block"
              >
                無料で始める
              </Link>
            </motion.div>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Link
                href="#features"
                className="bg-primary-foreground/20 text-primary-foreground px-8 py-4 rounded-lg font-semibold text-lg hover:bg-primary-foreground/30 transition-all w-full sm:w-auto inline-block"
              >
                詳しく見る
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </motion.section>

      {/* Footer */}
      <footer className="bg-card border-t border-border/50 text-foreground py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Image src="/app-icon.png" alt="App Icon" width={24} height={24} />
                <span className="font-bold">Reportlab</span>
              </div>
              <p className="text-background/70 text-sm">AIで実験レポート作成を効率化</p>
            </div>
            <div>
              <h3 className="font-semibold mb-4">製品</h3>
              <ul className="space-y-2 text-background/70 text-sm">
                <li>
                  <a href="#features" className="hover:text-background transition-colors">
                    機能
                  </a>
                </li>
                <li>
                  <a href="#pricing" className="hover:text-background transition-colors">
                    料金
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-background transition-colors">
                    セキュリティ
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">サポート</h3>
              <ul className="space-y-2 text-background/70 text-sm">
                <li>
                  <a href="#" className="hover:text-background transition-colors">
                    ヘルプセンター
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-background transition-colors">
                    お問い合わせ
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-background transition-colors">
                    FAQ
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">法的事項</h3>
              <ul className="space-y-2 text-background/70 text-sm">
                <li>
                  <a href="#" className="hover:text-background transition-colors">
                    利用規約
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-background transition-colors">
                    プライバシーポリシー
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-background transition-colors">
                    特定商取引法
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-background/20 mt-8 pt-8 text-center text-background/70 text-sm">
            © 2025 Reportlab. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  )
}
