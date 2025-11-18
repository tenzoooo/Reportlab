"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import {
  ArrowRight,
  BookOpen,
  CircuitBoard,
  Clock,
  Copy,
  Globe,
  HelpCircle,
  Layers,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react"

const primaryCtaLabel = "無料ではじめる"

const leftNavItems = [
  { label: "プロダクト", href: "#product" },
  { label: "導入事例", href: "#customers" },
  { label: "料金", href: "#pricing" },
  { label: "セキュリティ", href: "#security" },
  { label: "ドキュメント", href: "/docs" },
]

const heroKpiBand = ["レポート自動化への第一歩", "開発進行中", "開発目標を設定", "ベータテスター募集中"]

const trustBadges = [
  { label: "AI下書き自動生成", description: "研究ノートから12秒以内に一次ドラフトを作成", icon: Sparkles },
  { label: "多チャネル出力", description: "PDF・Notion・PPTXへの同時出力に対応", icon: Layers },
  { label: "監査ログ・配信管理", description: "ロール別承認・監査ログを自動保存・配信", icon: CircuitBoard },
]

const kpiHighlights = [
  { metric: 0, suffix: "", label: "プロジェクトの目標", description: "レポート作成プロセスを効率化することを目指します" },
  { metric: 0, suffix: "", label: "開発進行中", description: "現在機能開発を進めています" },
  { metric: 0, suffix: "", label: "開発目標", description: "実験レポートの自動化を実現します" },
  { metric: 0, suffix: "", label: "開発中", description: "数値実績は開発完了後に反映予定" },
]

type FeatureItem = {
  title: string
  icon: LucideIcon
  summary: string
  bullets: string[]
  cta: string
}

const features: FeatureItem[] = [
  {
    title: "AIによる実験データ分析",
    icon: Sparkles,
    summary: "実験データを分析し、グラフを自動生成します。",
    bullets: ["データ分析の自動化", "グラフの自動生成", "実験結果の可視化"],
    cta: "仕組みを見る",
  },
  {
    title: "Wordレポート自動生成",
    icon: CircuitBoard,
    summary: "分析結果をWordレポートとして自動生成します。",
    bullets: ["Word形式での出力", "テンプレートベースの生成", "過去レポートとの統合"],
    cta: "ドキュメントを見る",
  },
  {
    title: "テンプレートベースのレポート生成",
    icon: Layers,
    summary: "定義済みテンプレートを使用してレポートを自動生成します。",
    bullets: ["テンプレートの活用", "画像/表の自動差し込み", "カスタムテンプレート対応"],
    cta: "テンプレを確認",
  },
  {
    title: "非同期処理と進捗監視",
    icon: ShieldCheck,
    summary: "QStashとSupabase Realtimeを使用した非同期処理とリアルタイム進捗監視。",
    bullets: ["非同期処理の実装", "進捗状況の可視化", "リアルタイム更新"],
    cta: "ステータスを見る",
  },
]

type WorkflowStep = {
  id: number
  label: string
  title: string
  description: string
  input: string[]
  process: string[]
  output: string[]
  uiMock: string
  yamlMock: string
}

const workflowSteps: WorkflowStep[] = [
  {
    id: 1,
    label: "STEP 01",
    title: "データと過去レポートのアップロード",
    description: "実験データ（CSV / Excel / PNG）と過去レポートをアップロードします。",
    input: ["CSV", "Excel", "PNG", "過去レポート"],
    process: ["ファイル検証", "データ正規化"],
    output: ["アップロード完了"],
    uiMock: "ファイルアップロード • 検証中 • データ正規化",
    yamlMock: `upload:
  source: user-upload
  formats: [csv, excel, png, docx]
  outputs: validated-data`,
  },
  {
    id: 2,
    label: "STEP 02",
    title: "AIによるデータ分析とグラフ生成",
    description: "アップロードされたデータをAIで分析し、グラフを自動生成します。",
    input: ["実験データ"],
    process: ["データ分析", "グラフ生成"],
    output: ["分析結果", "グラフ"],
    uiMock: "AI分析中 • グラフ生成中 • 処理完了",
    yamlMock: `analysis:
  model: ai-analysis
  inputs: experiment-data
  outputs: analysis-result, graphs`,
  },
  {
    id: 3,
    label: "STEP 03",
    title: "Wordレポートの生成",
    description: "分析結果とグラフをテンプレートに基づいてWordレポートとして生成します。",
    input: ["分析結果", "グラフ", "テンプレート"],
    process: ["レポート生成", "フォーマット調整"],
    output: ["Wordレポート"],
    uiMock: "レポート生成中 • フォーマット調整 • 完成",
    yamlMock: `generation:
  template: word-template
  inputs: analysis-result, graphs
  outputs: word-report`,
  },
  {
    id: 4,
    label: "STEP 04",
    title: "レポートのダウンロードと最終確認",
    description: "生成されたレポートをダウンロードし、最終確認を行います。",
    input: ["Wordレポート"],
    process: ["ダウンロード準備", "確認"],
    output: ["ダウンロード完了"],
    uiMock: "ダウンロード準備中 • 確認 • 完了",
    yamlMock: `download:
  source: generated-report
  actions: prepare-download, verify`,
  },
]

type LiveEvent = {
  status: "成功" | "警告" | "要再試験"
  tone: "success" | "warning" | "info"
  absolute: string
  relative: string
  summary: string
  detail: string
}

const liveEvents: LiveEvent[] = [
  {
    status: "成功",
    tone: "success",
    absolute: "2024-10-29 10:00:00",
    relative: "1分前",
    summary: "ユーザー認証完了",
    detail: "認証プロセスが正常に完了しました",
  },
  {
    status: "成功",
    tone: "success",
    absolute: "2024-10-29 10:00:05",
    relative: "1分前",
    summary: "ファイルアップロード開始",
    detail: "実験データのアップロードを開始しました",
  },
  {
    status: "成功",
    tone: "info",
    absolute: "2024-10-29 10:00:10",
    relative: "1分前",
    summary: "AI分析ジョブをキューに追加",
    detail: "QStashキューに追加しました (ID: 12345)",
  },
  {
    status: "成功",
    tone: "success",
    absolute: "2024-10-29 10:00:15",
    relative: "1分前",
    summary: "Supabase Realtime接続完了",
    detail: "リアルタイム更新が有効になりました",
  },
]

type Testimonial = {
  summary: string
  quote: string
  name: string
  role: string
  company: string
  kpis: string[]
}

const testimonials: Testimonial[] = [
  {
    summary: "査読待ちが40%短縮",
    quote: "自動追問で抜け漏れが可視化され、AI下書きのまま承認できるケースが増えました。監査ログも同時に吐き出されます。",
    name: "Eriko Takahashi",
    role: "Head of R&D",
    company: "Polaris Bio",
    kpis: ["週15時間削減", "導入4週間"],
  },
  {
    summary: "海外拠点でテンプレ統一",
    quote: "Notion / PDF / PPTX の同時出力で配信遅延がゼロ。品質再現率100%の定義もダッシュボードで共有できました。",
    name: "Marcus Feld",
    role: "CTO",
    company: "Orbital Materials",
    kpis: ["品質再現率100%", "導入5週間"],
  },
]

const securityFrameworks = [
  { name: "ISO/IEC 27001", scope: "研究データ・テンプレート保護", year: "2024年度監査" },
  { name: "SOC2 Type II", scope: "レポート配信・Webhook監視", year: "2024年度更改" },
  { name: "ISMAP", scope: "官公庁・大学向け環境", year: "準備済み / 申請中" },
]

const logos = ["Arise Labs", "Bluegrid", "Centauri", "Kinetic", "NovaVision", "Photonics"]

const wizardSteps = ["メール入力", "用途選択", "テンプレ選択", "デモデータ投入"]

const structuredData: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "REPORTLAB",
  description: "実験レポート自動化OS。平均28%・週15時間の作業削減を実現。",
  brand: "REPORTLAB",
  offers: {
    "@type": "Offer",
    priceCurrency: "JPY",
    price: "0",
    availability: "https://schema.org/InStock",
  },
}

const footerColumns = [
  {
    title: "会社情報",
    links: [
      { label: "会社概要", href: "#" },
      { label: "ニュース", href: "#" },
      { label: "採用情報", href: "#careers" },
    ],
  },
  {
    title: "法務",
    links: [
      { label: "利用規約", href: "#" },
      { label: "プライバシー", href: "#" },
      { label: "セキュリティ", href: "#security" },
    ],
  },
  {
    title: "セキュリティ",
    links: [
      { label: "ステータスページ", href: "#" },
      { label: "SOC2 レポート", href: "#" },
      { label: "監査ログ", href: "#" },
    ],
  },
  {
    title: "開発者",
    links: [
      { label: "ドキュメント", href: "/docs" },
      { label: "API リファレンス", href: "/docs" },
      { label: "CLI / SDK", href: "#" },
    ],
  },
  {
    title: "サポート",
    links: [
      { label: "導入相談", href: "#contact" },
      { label: "問い合わせ", href: "#contact" },
      { label: "ステータスページ", href: "#" },
    ],
  },
]

export default function Home() {
  const [scrolled, setScrolled] = useState(false)
  const [activeSection, setActiveSection] = useState("hero")
  const [workflowViews, setWorkflowViews] = useState<Record<number, "ui" | "yaml">>(() =>
    workflowSteps.reduce((acc, step) => ({ ...acc, [step.id]: "ui" as const }), {})
  )
  const [isLive, setIsLive] = useState(true)
  const [showSampleEvents, setShowSampleEvents] = useState(true)
  const [copied, setCopied] = useState(false)
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [kpiReady, setKpiReady] = useState(false)
  const [countedValues, setCountedValues] = useState<number[]>(() => kpiHighlights.map(() => 0))
  const [wizardStep, setWizardStep] = useState(0)
  const [wizardData, setWizardData] = useState({
    email: "",
    usage: "",
    template: "",
    dataset: "",
  })
  const [contactData, setContactData] = useState({
    start: "",
    seats: "",
    tools: "",
    email: "",
  })
  const [currentWorkflow, setCurrentWorkflow] = useState(1)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    window.addEventListener("scroll", onScroll)
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => {
    const ids = ["hero", "pricing", "logos", "product", "workflow", "live", "customers", "security", "cta"]
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id)
          }
        })
      },
      { rootMargin: "-40% 0px -40% 0px", threshold: 0.2 }
    )
    ids.forEach((id) => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => setKpiReady(true), 400)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!kpiReady) return
    let frame = 0
    const start = performance.now()
    const duration = 1200
    const animate = (time: number) => {
      const progress = Math.min((time - start) / duration, 1)
      setCountedValues(kpiHighlights.map((kpi) => kpi.metric * progress))
      if (progress < 1) {
        frame = requestAnimationFrame(animate)
      }
    }
    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [kpiReady])

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentWorkflow((prev) => (prev === workflowSteps.length ? 1 : prev + 1))
    }, 4500)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const revealEls = document.querySelectorAll<HTMLElement>(".reveal")
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible")
          }
        })
      },
      { threshold: 0.25 }
    )
    revealEls.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    return () => {
      if (copyTimeout.current) clearTimeout(copyTimeout.current)
    }
  }, [])

  const handleToggleView = (id: number, view: "ui" | "yaml") => {
    setWorkflowViews((prev) => ({ ...prev, [id]: view }))
  }

  const payloadString = useMemo(
    () =>
      JSON.stringify(
        {
          risk: "低",
          next_step: "温度帯を+5℃で再試験",
          confidence: 0.92,
          reviewer: "qa-lead",
          channel: ["PDF", "Notion", "PPTX"],
        },
        null,
        2
      ),
    []
  )

  const handleCopyPayload = async () => {
    if (copyTimeout.current) clearTimeout(copyTimeout.current)
    try {
      await navigator.clipboard.writeText(payloadString)
      setCopied(true)
      copyTimeout.current = setTimeout(() => setCopied(false), 1600)
    } catch (error) {
      console.error("copy failed", error)
    }
  }

  const handleWizardInput = (field: keyof typeof wizardData, value: string) => {
    setWizardData((prev) => ({ ...prev, [field]: value }))
  }

  const handleContactInput = (field: keyof typeof contactData, value: string) => {
    setContactData((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <header className={`sticky-header border-b ${scrolled ? "is-scrolled" : ""}`}>
        <div className={`page-container flex flex-wrap items-center justify-between gap-4 ${scrolled ? "py-3" : "py-5"}`}>
          <div className="flex items-center gap-10">
            <Link href="/" aria-current="page" className="text-lg font-semibold tracking-[0.35em] text-slate-900">
              REPORTLAB
            </Link>
            <nav className="hidden items-center gap-4 lg:flex" aria-label="主要ナビゲーション">
              {leftNavItems.map((item) => {
                const targetId = item.href.startsWith("#") ? item.href.slice(1) : null
                const isActive = targetId ? activeSection === targetId : false
                return (
                  <Link key={item.label} href={item.href} className="nav-link" aria-current={isActive ? "page" : undefined}>
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <details className="help-menu hidden lg:block">
              <summary className="rounded-full border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600">
                <HelpCircle className="mr-1 inline h-4 w-4" aria-hidden="true" /> ヘルプ
              </summary>
              <div className="help-menu-content" role="menu" aria-label="ヘルプメニュー">
                <Link href="/docs" role="menuitem">
                  <BookOpen className="h-4 w-4" aria-hidden="true" /> ドキュメント
                </Link>
                <Link href="#security" role="menuitem">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" /> セキュリティ
                </Link>
              </div>
            </details>
            <button type="button" className="hidden rounded-full border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 lg:inline-flex" aria-label="言語切り替え">
              <Globe className="mr-1 h-4 w-4" aria-hidden="true" /> JA / EN
            </button>
            <Link href="/login" className="secondary-button text-sm">
              ログイン
            </Link>
            <Link href="/register" className="primary-button text-sm">
              {primaryCtaLabel}
            </Link>
          </div>
        </div>
      </header>

      <section id="hero" className="section bg-gradient-to-br from-[#2c1b64] via-[#3b2c97] to-[#1c4c8c] text-white rounded-3xl mx-4 mt-16 mb-8">
        <div className="page-container space-y-10">
          <div className="hero-grid items-center">
            <div className="space-y-6">
              <p className="text-sm font-semibold uppercase tracking-[0.4em] text-white/70">現役理系大学生が作ったレポート効率化ツール</p>
              <h1>レポートの面倒な部分はもうAIでいい</h1>
              <p className="text-lg text-white/85">
                実験レポートの作成で時間がかかる部分をAIで自動化。データ分析からレポート生成まで、面倒な作業を効率化します。
              </p>
              <div className="cluster">
                <Link href="/register" className="primary-button text-base">
                  {primaryCtaLabel}
                </Link>
                <Link href="/contact" className="secondary-button text-base text-white">
                  デモを見る
                </Link>
              </div>
              <div className="trust-badges" role="list">
                {trustBadges.map((badge) => (
                  <div key={badge.label} className="rounded-2xl border border-white/30 px-4 py-3" role="listitem">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <badge.icon className="h-4 w-4" aria-hidden="true" /> {badge.label}
                    </p>
                    <p className="trust-text">{badge.description}</p>
                  </div>
                ))}
              </div>
              <div className="kpi-band" aria-label="主要KPI">
                {heroKpiBand.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="section bg-slate-50">
        <div className="page-container space-y-10">
          <div className="text-center">
            <p className="eyebrow text-indigo-500">Impact</p>
            <h2 className="text-3xl font-semibold">プロジェクトの目標</h2>
            <p className="mt-3 text-sm text-slate-600">開発目標とプロジェクトの方向性を明示します。実績は開発完了後に反映予定です。</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {kpiHighlights.map((kpi, index) => {
              return (
                <div key={kpi.label} className="kpi-card" aria-live="polite">
                  <p className="text-2xl font-semibold text-slate-900 mb-2">開発中</p>
                  <p className="mt-2 text-base font-semibold text-slate-800">{kpi.label}</p>
                  <p className="mt-1 text-sm text-slate-600">{kpi.description}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <section id="logos" className="section">
        <div className="page-container space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm font-semibold text-slate-600">採用 120+ 社 / 研究室・研究科</p>
            <button type="button" className="logo-button">ケーススタディを開く <ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
          </div>
          <div className="logo-wall">
            {logos.map((logo) => (
              <div key={logo} className="logo-chip text-sm text-slate-600" role="img" aria-label={`${logo} のロゴ`}>
                {logo}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="product" className="section bg-white">
        <div className="page-container space-y-10">
          <div className="space-y-3 text-center md:text-left">
            <p className="eyebrow text-indigo-500">Product</p>
            <h2 className="text-3xl font-semibold">開発予定のコア機能</h2>
            <p className="text-sm text-slate-600">レポートライフサイクルを自動化するための4つの主要機能を開発予定です。</p>
          </div>
          <div className="split-grid">
            {features.map((feature) => (
              <div key={feature.title} className="feature-card">
                <div className="flex items-center gap-3">
                  <feature.icon className="h-5 w-5 text-indigo-500" aria-hidden="true" />
                  <h3 className="text-2xl font-semibold text-slate-900">{feature.title}</h3>
                </div>
                <p className="text-sm text-slate-600">{feature.summary}</p>
                <ul className="space-y-1 text-sm">
                  {feature.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
                <button type="button" className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600">
                  {feature.cta}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="workflow" className="section bg-slate-50">
        <div className="page-container space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="eyebrow text-indigo-500">Workflow</p>
              <h2 className="text-3xl font-semibold">レポート生成のステップ</h2>
              <p className="text-sm text-slate-600">入力 → 処理 → 出力の構造で整理し、モバイルはタイムライン、デスクトップは横並びで表示します。</p>
            </div>
            <div className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">STEP {currentWorkflow.toString().padStart(2, "0")} が進行中</div>
          </div>
          <div className="hidden gap-4 md:grid md:grid-cols-4">
            {workflowSteps.map((step) => (
              <div key={step.id} className={`workflow-card-desktop ${currentWorkflow === step.id ? "ring-2 ring-indigo-300" : ""}`}>
                <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-500">{step.label}</p>
                <h3 className="mt-2 text-xl font-semibold text-slate-900">{step.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{step.description}</p>
                <div className="mt-4 space-y-2 text-xs text-slate-500">
                  <p className="font-semibold text-slate-700">入力: {step.input.join(" / ")}</p>
                  <p className="font-semibold text-slate-700">処理: {step.process.join(" / ")}</p>
                  <p className="font-semibold text-slate-700">出力: {step.output.join(" / ")}</p>
                </div>
                <div className="mt-4 flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 p-1 text-xs font-semibold">
                  {(["ui", "yaml"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => handleToggleView(step.id, mode)}
                      className={`flex-1 rounded-full px-3 py-1 ${workflowViews[step.id] === mode ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
                      aria-pressed={workflowViews[step.id] === mode}
                    >
                      {mode === "ui" ? "スクリーンショットを見る" : "YAML例を見る"}
                    </button>
                  ))}
                </div>
                {workflowViews[step.id] === "ui" ? (
                  <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">{step.uiMock}</div>
                ) : (
                  <pre className="mt-3 rounded-2xl bg-slate-900/90 p-3 text-xs text-emerald-200">
                    <code>{step.yamlMock}</code>
                  </pre>
                )}
                <button type="button" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-indigo-600">
                  サンプルで試す <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
          <div className="timeline md:hidden">
            {workflowSteps.map((step) => (
              <div key={step.id} className="timeline-step rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-500">{step.label}</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">{step.title}</h3>
                <p className="text-sm text-slate-600">{step.description}</p>
                <div className="mt-3 text-xs text-slate-500">
                  <p>入力: {step.input.join(" / ")}</p>
                  <p>処理: {step.process.join(" / ")}</p>
                  <p>出力: {step.output.join(" / ")}</p>
                </div>
                <div className="mt-3 flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 p-1 text-[0.65rem] font-semibold">
                  {(["ui", "yaml"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => handleToggleView(step.id, mode)}
                      className={`flex-1 rounded-full px-2 py-1 ${workflowViews[step.id] === mode ? "bg-white text-slate-900" : "text-slate-400"}`}
                      aria-pressed={workflowViews[step.id] === mode}
                    >
                      {mode === "ui" ? "スクリーンショットを見る" : "YAML例を見る"}
                    </button>
                  ))}
                </div>
                {workflowViews[step.id] === "ui" ? (
                  <div className="mt-2 rounded-2xl bg-slate-50 p-3 text-xs text-slate-600">{step.uiMock}</div>
                ) : (
                  <pre className="mt-2 rounded-2xl bg-slate-900/90 p-3 text-[0.7rem] text-emerald-200">
                    <code>{step.yamlMock}</code>
                  </pre>
                )}
                <button type="button" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-indigo-600">
                  サンプルで試す <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="live" className="section bg-white">
        <div className="page-container grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-4">
            <p className="eyebrow text-indigo-500">Live Monitoring</p>
            <h2 className="text-3xl font-semibold">レポート生成ログ (開発中)</h2>
            <p className="text-sm text-slate-600">開発中の機能です。ユーザー認証、ファイルアップロード、QStash、Supabase Realtimeなどの技術を使用した進捗ログを表示します。</p>
            <div className="live-card">
              {showSampleEvents ? (
                liveEvents.map((event) => (
                  <div key={event.summary} className="border-b border-dashed border-slate-100 py-4 last:border-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-slate-900">{event.summary}</p>
                      <span className={`status-pill ${event.tone}`}>{event.status}</span>
                    </div>
                    <p className="text-sm text-slate-600">{event.detail}</p>
                    <p className="text-xs text-slate-500">
                      {event.relative} / {event.absolute}
                    </p>
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-600">イベントなし。サンプルを流すボタンから確認してください。</div>
              )}
              <div className="mt-4 flex flex-wrap gap-3">
                <button type="button" className="secondary-button text-xs" onClick={() => setShowSampleEvents(true)}>
                  サンプルを流す
                </button>
                <button type="button" className="secondary-button text-xs">
                  エラーを再試行
                </button>
              </div>
            </div>
          </div>
          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6" aria-live="polite">
              <p className="text-sm font-semibold text-slate-600">JSON / 監査ログ</p>
              <pre className="mt-3">
                <code>{payloadString}</code>
              </pre>
              <button type="button" className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-indigo-600" onClick={handleCopyPayload}>
                <Copy className="h-4 w-4" aria-hidden="true" /> {copied ? "コピー済み" : "JSONをコピー"}
              </button>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-6">
              <p className="text-sm font-semibold text-slate-600">空の状態</p>
              <div className="mt-3 rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                Webhook未受信時はここにプレースホルダーを表示し、「サンプルを流す」から試験データを投入できます。
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="customers" className="section bg-slate-50">
        <div className="page-container space-y-10">
          <div className="text-center">
            <p className="eyebrow text-indigo-500">Beta Testing</p>
            <h2 className="text-3xl font-semibold">ベータテスター募集中</h2>
            <p className="mt-3 text-sm text-slate-600">現在開発中の機能を早期にお試しいただけるベータテスターを募集しています。ご意見・ご feedback をお待ちしています。</p>
          </div>
          <div className="rounded-3xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-blue-50 p-8 text-center">
            <p className="text-lg font-semibold text-slate-900 mb-4">ベータテスターにご参加ください</p>
            <p className="text-sm text-slate-600 mb-6">開発中の機能をいち早く体験し、フィードバックをお寄せください。</p>
            <Link href="/register" className="primary-button text-base inline-flex">
              ベータテスターに登録
            </Link>
          </div>
        </div>
      </section>

      <section id="security" className="section bg-white">
        <div className="page-container space-y-10">
          <div className="text-center">
            <p className="eyebrow text-indigo-500">Security</p>
            <h2 className="text-3xl font-semibold">監査フレームワークと日本リージョン運用</h2>
            <p className="mt-3 text-sm text-slate-600">各フレームワークごとにスコープと監査年度を明記し、暗号化情報を可視化しました。</p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {securityFrameworks.map((framework) => (
              <div key={framework.name} className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Framework</p>
                <h3 className="mt-2 text-xl font-semibold text-slate-900">{framework.name}</h3>
                <p className="text-sm text-slate-600">{framework.scope}</p>
                <p className="text-xs text-slate-500">{framework.year}</p>
              </div>
            ))}
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
            <p className="text-sm font-semibold text-slate-600">日本リージョン・暗号化</p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
              <li>AWS 東京リージョン / KMS 管理</li>
              <li>VPC Peering と PrivateLink で接続</li>
              <li>Audit API でリアルタイム監査</li>
            </ul>
            <Link href="#contact" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-indigo-600">
              セキュリティ白書を請求 <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <section id="contact" className="section bg-slate-50">
        <div className="page-container grid gap-10 lg:grid-cols-2">
          <div className="cta-card space-y-6">
            <p className="eyebrow text-indigo-500">Wizard</p>
            <h2 className="text-3xl font-semibold text-slate-900">{primaryCtaLabel} までの 4 ステップ</h2>
            <div className="wizard-steps">
              {wizardSteps.map((step, index) => (
                <span key={step} className={index <= wizardStep ? "active" : ""} />
              ))}
            </div>
            <p className="text-sm text-slate-600">SSO (SAML / OIDC) ログインも同じフローで案内します。</p>
            <div className="space-y-4">
              {wizardStep === 0 && (
                <label className="block text-sm font-semibold text-slate-700">
                  メールアドレス
                  <input
                    type="email"
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3"
                    placeholder="you@example.com"
                    value={wizardData.email}
                    onChange={(e) => handleWizardInput("email", e.target.value)}
                  />
                </label>
              )}
              {wizardStep === 1 && (
                <label className="block text-sm font-semibold text-slate-700">
                  用途を選択
                  <select
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3"
                    value={wizardData.usage}
                    onChange={(e) => handleWizardInput("usage", e.target.value)}
                  >
                    <option value="">選択してください</option>
                    <option value="rd">研究室レポート</option>
                    <option value="course">授業課題</option>
                    <option value="enterprise">企業内R&D</option>
                  </select>
                </label>
              )}
              {wizardStep === 2 && (
                <label className="block text-sm font-semibold text-slate-700">
                  テンプレート
                  <input
                    type="text"
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3"
                    placeholder="total_template_fixed.docx"
                    value={wizardData.template}
                    onChange={(e) => handleWizardInput("template", e.target.value)}
                  />
                </label>
              )}
              {wizardStep === 3 && (
                <label className="block text-sm font-semibold text-slate-700">
                  デモデータ
                  <textarea
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3"
                    rows={3}
                    placeholder="CSV / Excel / 画像のパス"
                    value={wizardData.dataset}
                    onChange={(e) => handleWizardInput("dataset", e.target.value)}
                  />
                </label>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="secondary-button text-sm"
                disabled={wizardStep === 0}
                onClick={() => setWizardStep((prev) => Math.max(prev - 1, 0))}
              >
                戻る
              </button>
              <button
                type="button"
                className="primary-button text-sm"
                onClick={() => setWizardStep((prev) => (prev === wizardSteps.length - 1 ? 0 : prev + 1))}
              >
                {wizardStep === wizardSteps.length - 1 ? "完了" : "次へ"}
              </button>
            </div>
          </div>
          <div className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6">
            <p className="eyebrow text-indigo-500">Enterprise Contact</p>
            <h2 className="text-3xl font-semibold">エンタープライズ相談</h2>
            <p className="text-sm text-slate-600">SLA / セキュリティ白書はお問い合わせ後に共有します。</p>
            <form className="space-y-4">
              <label className="block text-sm font-semibold text-slate-700">
                希望開始時期
                <select
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3"
                  value={contactData.start}
                  onChange={(e) => handleContactInput("start", e.target.value)}
                >
                  <option value="">選択してください</option>
                  <option value="1-2">1〜2ヶ月以内</option>
                  <option value="3-6">3〜6ヶ月以内</option>
                  <option value="6+">6ヶ月以降</option>
                </select>
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                利用人数
                <select
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3"
                  value={contactData.seats}
                  onChange={(e) => handleContactInput("seats", e.target.value)}
                >
                  <option value="">選択してください</option>
                  <option value="<20">〜20名</option>
                  <option value="20-100">20〜100名</option>
                  <option value=">100">100名以上</option>
                </select>
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                既存ツール
                <input
                  type="text"
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3"
                  placeholder="例: Notion, SharePoint"
                  value={contactData.tools}
                  onChange={(e) => handleContactInput("tools", e.target.value)}
                />
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                連絡先メール
                <input
                  type="email"
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3"
                  placeholder="enterprise@example.com"
                  value={contactData.email}
                  onChange={(e) => handleContactInput("email", e.target.value)}
                />
              </label>
              <button type="button" className="primary-button w-full">
                導入相談を送信
              </button>
            </form>
          </div>
        </div>
      </section>

      <section id="cta" className="section">
        <div className="page-container">
          <div className="final-cta space-y-4">
            <p className="eyebrow text-indigo-500">Get started</p>
            <h2 className="text-3xl font-semibold text-slate-900">REPORTLABで次の監査前にレポート自動化を実現</h2>
            <p className="text-base text-slate-600">クレジットカード不要・14日間無料。SAML / OIDC SSO ですぐにチーム全員を招待できます。</p>
            <div className="cluster justify-center">
              <Link href="/register" className="primary-button text-base">
                {primaryCtaLabel}
              </Link>
              <Link href="/docs" className="secondary-button text-base">
                ドキュメントを見る
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="bg-slate-950 py-16 text-white">
        <div className="page-container space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-lg font-semibold tracking-[0.35em]">REPORTLAB</p>
              <p className="text-xs text-slate-400">実験レポートOS / R&D & QA チーム向け</p>
            </div>
            <button type="button" className="lang-toggle">
              <Globe className="h-4 w-4" aria-hidden="true" /> JA / EN ・ JP
            </button>
          </div>
          <div className="footer-grid">
            {footerColumns.map((column) => (
              <div key={column.title}>
                <h4>{column.title}</h4>
                {column.links.map((link) => (
                  <Link key={link.label} href={link.href} className="text-sm" aria-label={link.label}>
                    {link.label}
                  </Link>
                ))}
              </div>
            ))}
          </div>
          <div className="text-xs text-slate-500">
            © {new Date().getFullYear()} REPORTLAB. All rights reserved. | <Link href="/status" className="text-slate-300 underline">ステータスページ</Link>
          </div>
        </div>
      </footer>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
    </main>
  )
}
