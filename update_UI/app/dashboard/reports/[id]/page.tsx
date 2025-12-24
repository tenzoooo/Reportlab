"use client"

import { useEffect, useMemo, useState, useRef } from "react"
import { motion } from "framer-motion"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft, Download, Trash2, FileText, ImageIcon, FileSpreadsheet, CheckCircle, Loader2, AlertCircle, RotateCcw, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { createClient } from "@/lib/supabase/client"
import { getFileUrl } from "@/lib/storage/get-file-url"
import { ReportProcessingSteps, type ProcessingStep as ProcessingStatusStep } from "@/components/report-processing-steps"

type ReportStatus = "draft" | "processing" | "completed" | "error"

type AgentProgress = {
  version?: number
  job_id?: string
  status?: string
  updated_at?: string
  last_step?: string
  snapshots?: Array<{ step?: string; storage_key?: string }>
  stats?: {
    pdf_pages?: number | null
    method_tree_count?: number
    experiments_count?: number
    images_count?: number
    tables_count?: number
    prompts_count?: number
  }
  previews?: {
    method_text?: string
    discussion_text?: string
    prompts?: string[]
    method_tree?: string[]
  }
}

const AGENT_STEP_ORDER = [
  "ingest",
  "pdf_parse",
  "pdf_sections",
  "discussion_extract",
  "method_extract",
  "unit_init",
  "image_analyze",
  "image_assign",
  "table_parse",
  "table_assign",
  "discussion",
  "summary",
  "references",
  "validate",
  "render_docx",
] as const

const STEP_LABEL: Record<string, string> = {
  ingest: "入力の取り込み",
  pdf_parse: "PDFテキスト抽出",
  pdf_sections: "章の検出と切り出し",
  discussion_extract: "考察課題の抽出",
  method_extract: "実験方法の構造化",
  unit_init: "レポート骨子の作成",
  image_analyze: "画像の解析",
  image_assign: "画像の割り当て",
  table_parse: "表の解析",
  table_assign: "表の割り当て",
  discussion: "考察本文の生成",
  summary: "要約の生成",
  references: "参考文献の生成",
  validate: "整合性チェック",
  render_docx: "DOCX生成",
}

const stepStatusFromProgress = (progress: AgentProgress | null) => {
  const done = new Set(
    (progress?.snapshots || [])
      .map((s) => s?.step)
      .filter((s): s is string => typeof s === "string" && s.length > 0)
  )
  const last = typeof progress?.last_step === "string" ? progress.last_step : ""
  const lastIndex = AGENT_STEP_ORDER.findIndex((s) => s === last)
  return (step: string) => {
    if (done.has(step)) return "done" as const
    if (last && lastIndex !== -1) {
      const idx = AGENT_STEP_ORDER.findIndex((s) => s === step)
      if (idx === lastIndex + 1) return "active" as const
    }
    return "pending" as const
  }
}

export default function ReportDetailPage() {
  const params = useParams()
  const reportId = params.id as string
  const isUuid = (v: string) =>
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(v)

  const [status, setStatus] = useState<ReportStatus>("processing")
  const [title, setTitle] = useState<string>("")
  const [createdAt, setCreatedAt] = useState<string>("")
  const [files, setFiles] = useState<{ name: string; type: "excel" | "image" | "code" | "word"; uploaded_at?: string }[]>([])
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [progress, setProgress] = useState<number>(0)
  const [error, setError] = useState<string>("")
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [processingOverlayOpen, setProcessingOverlayOpen] = useState(false)
  const [processingSteps, setProcessingSteps] = useState<ProcessingStatusStep[]>([])
  const [agentProgress, setAgentProgress] = useState<AgentProgress | null>(null)
  const [agentProgressError, setAgentProgressError] = useState<string>("")
  const [showAgentDetails, setShowAgentDetails] = useState(false)

  const abortControllerRef = useRef<AbortController | null>(null)

  const getFileIcon = (type: string) => {
    switch (type) {
      case "excel":
        return <FileSpreadsheet className="h-5 w-5 text-success" />
      case "image":
        return <ImageIcon className="h-5 w-5 text-primary" />
      default:
        return <FileText className="h-5 w-5 text-muted-foreground" />
    }
  }

  const getStatusConfig = (s: ReportStatus) => {
    switch (s) {
      case "completed":
        return { icon: <CheckCircle className="h-6 w-6" />, label: "完了", color: "text-success", bgColor: "bg-success/10" }
      case "processing":
        return { icon: <Loader2 className="h-6 w-6 animate-spin" />, label: "処理中", color: "text-primary", bgColor: "bg-primary/10" }
      case "error":
        return { icon: <AlertCircle className="h-6 w-6" />, label: "エラー", color: "text-destructive", bgColor: "bg-destructive/10" }
      case "draft":
      default:
        return { icon: <FileText className="h-6 w-6" />, label: "下書き", color: "text-muted-foreground", bgColor: "bg-muted/20" }
    }
  }

  const statusConfig = getStatusConfig(status)

  useEffect(() => {
    let cancel = false
    const load = async () => {
      try {
        if (!isUuid(reportId)) {
          setError("無効なレポートIDです")
          setStatus("error")
          return
        }
        const supabase = createClient()
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!session) {
          window.location.href = "/login"
          return
        }
        const { data: report, error: rErr } = await supabase
          .from("reports")
          .select("id, title, status, created_at, file_url")
          .eq("id", reportId)
          .eq("user_id", session.user.id)
          .maybeSingle()
        if (rErr) throw new Error(rErr.message)
        if (!report) throw new Error("レポートが見つかりません")
        if (cancel) return
        setTitle(report.title || "")
        setStatus((report.status as ReportStatus) || "processing")
        setCreatedAt(report.created_at || "")
        setFileUrl(report.file_url || null)

        const { data: expData, error: eErr } = await supabase
          .from("experiment_data")
          .select("file_name, file_type, uploaded_at")
          .eq("report_id", reportId)
        if (eErr) throw new Error(eErr.message)
        const mapped = (expData || []).map((f) => ({
          name: f.file_name as string,
          type: f.file_type as "excel" | "image" | "code" | "word",
          uploaded_at: f.uploaded_at as string | undefined,
        }))
        setFiles(mapped)
      } catch (e) {
        if (!cancel) setError(e instanceof Error ? e.message : String(e))
      }
    }
    load()

    const interval = setInterval(async () => {
      if (status !== "processing") return
      setProgress((p) => Math.min(95, p + 3))
      await load()
    }, 3000)
    return () => {
      cancel = true
      clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId, status])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    let cancel = false
    let interval: ReturnType<typeof setInterval> | null = null

    const loadProgress = async () => {
      try {
        if (status !== "processing") return
        const supabase = createClient()
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!session) return

        const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || ""
        const endpoint = `${baseUrl}/api/reports/${reportId}/agent-progress`
        const res = await fetch(endpoint, {
          method: "GET",
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (!res.ok) return
        const json = (await res.json()) as { available?: boolean; progress?: AgentProgress }
        if (cancel) return
        if (json.available && json.progress) {
          setAgentProgress(json.progress)
          setAgentProgressError("")
        }
      } catch (e) {
        if (!cancel) setAgentProgressError(e instanceof Error ? e.message : String(e))
      }
    }

    if (status === "processing") {
      void loadProgress()
      interval = setInterval(loadProgress, 2500)
    } else {
      setAgentProgress(null)
      setAgentProgressError("")
      setShowAgentDetails(false)
    }

    return () => {
      cancel = true
      if (interval) clearInterval(interval)
    }
  }, [reportId, status])

  const baseProcessingSteps = useMemo<ProcessingStatusStep[]>(
    () => [
      {
        key: "analyze",
        label: "再解析・抽出",
        description: "PDF/Wordを再解析し、実験方法と構造を抽出しています。",
        status: "pending",
      },
      {
        key: "image",
        label: "画像解析と割り当て",
        description: "アップロードされた図表を解析し、実験にひも付けています。",
        status: "pending",
      },
      {
        key: "generate",
        label: "DOCX生成",
        description: "テンプレートに流し込み、レポートを生成しています。",
        status: "pending",
      },
    ],
    []
  )

  const agentSteps = useMemo<ProcessingStatusStep[] | null>(() => {
    if (!agentProgress) return null
    const statusOf = stepStatusFromProgress(agentProgress)
    return [
      {
        key: "pdf",
        label: "PDFの理解",
        description: `PDFを読み取り、章を検出して必要箇所を切り出します（ページ数: ${agentProgress.stats?.pdf_pages ?? "?"}）。`,
        status: ["ingest", "pdf_parse", "pdf_sections"].every((s) => statusOf(s) === "done")
          ? "done"
          : ["ingest", "pdf_parse", "pdf_sections"].some((s) => statusOf(s) === "active")
              ? "active"
              : "pending",
      },
      {
        key: "extract",
        label: "課題・方法の抽出",
        description: `実験方法の構造化（${agentProgress.stats?.method_tree_count ?? 0}件）と、考察の設問抽出（${agentProgress.stats?.prompts_count ?? 0}件）を行います。`,
        status: ["discussion_extract", "method_extract", "unit_init"].every((s) => statusOf(s) === "done")
          ? "done"
          : ["discussion_extract", "method_extract", "unit_init"].some((s) => statusOf(s) === "active")
              ? "active"
              : "pending",
      },
      {
        key: "assets",
        label: "図表の解析と割り当て",
        description: `画像(${agentProgress.stats?.images_count ?? 0})/表(${agentProgress.stats?.tables_count ?? 0})を解析し、どの実験に対応するか割り当てます。`,
        status: ["image_analyze", "image_assign", "table_parse", "table_assign"].every((s) => statusOf(s) === "done")
          ? "done"
          : ["image_analyze", "image_assign", "table_parse", "table_assign"].some((s) => statusOf(s) === "active")
              ? "active"
              : "pending",
      },
      {
        key: "compose",
        label: "文章の生成と整合性チェック",
        description: "考察/要約/参考文献を生成し、形式や整合性をチェックします。",
        status: ["discussion", "summary", "references", "validate"].every((s) => statusOf(s) === "done")
          ? "done"
          : ["discussion", "summary", "references", "validate"].some((s) => statusOf(s) === "active")
              ? "active"
              : "pending",
      },
      {
        key: "render",
        label: "DOCX生成",
        description: "テンプレートに流し込み、DOCXを生成します。",
        status: statusOf("render_docx"),
      },
    ]
  }, [agentProgress])

  const resetProcessingSteps = () => {
    setProcessingSteps(baseProcessingSteps.map((step, idx) => ({ ...step, status: idx === 0 ? "active" : "pending" })))
    setProcessingOverlayOpen(true)
  }

  const completeProcessingSteps = () => {
    setProcessingSteps((prev) => prev.map((step) => ({ ...step, status: "done" })))
  }

  const failProcessingSteps = () => {
    setProcessingSteps((prev) => prev.map((step) => (step.status === "done" ? step : { ...step, status: "error" })))
    setProcessingOverlayOpen(true)
  }

  const stopProcessingOverlay = () => {
    setProcessingOverlayOpen(false)
    setIsRegenerating(false)
    setProgress(0)
  }

  const cancelServerProcessing = async () => {
    try {
      const supabase = createClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        window.location.href = "/login"
        return
      }

      const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || ""
      const endpoint = `${baseUrl}/api/reports/cancel`
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ reportId }),
      })

      if (!res.ok) {
        const msg = await res.text()
        throw new Error(msg || `キャンセルに失敗しました (${res.status})`)
      }

      stopProcessingOverlay()
      setStatus("draft")
      alert("処理をキャンセルしました。")
    } catch (cancelErr) {
      alert(cancelErr instanceof Error ? cancelErr.message : String(cancelErr))
    }
  }

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    void cancelServerProcessing()
  }

  const handleRegenerateAI = async () => {
    try {
      if (!confirm("AIで再生成しますか？\n（クレジットを消費する可能性があります）")) return

      if (abortControllerRef.current) abortControllerRef.current.abort()
      const controller = new AbortController()
      abortControllerRef.current = controller

      setIsRegenerating(true)
      setFileUrl(null)
      setProgress(0)
      resetProcessingSteps()
      const supabase = createClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        window.location.href = "/login"
        return
      }

      const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || ""
      // Use the standard generation endpoint for full AI regeneration
      const endpoint = `${baseUrl}/api/reports/generate`
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ reportId }),
        signal: controller.signal,
      })
      if (!res.ok) {
        const msg = await res.text()
        failProcessingSteps()
        throw new Error(msg || `再生成に失敗しました (${res.status})`)
      }
      setStatus("processing")
      setProgress(0)
      completeProcessingSteps()
      alert("AIによる再生成を開始しました。")
    } catch (regErr) {
      if (regErr instanceof Error && regErr.name === 'AbortError') {
        console.log('Regeneration aborted')
        return
      }
      failProcessingSteps()
      alert(regErr instanceof Error ? regErr.message : String(regErr))
    } finally {
      setIsRegenerating(false)
      abortControllerRef.current = null
    }
  }

  const handleRegenerateJSON = async () => {
    try {
      if (abortControllerRef.current) abortControllerRef.current.abort()
      const controller = new AbortController()
      abortControllerRef.current = controller

      setIsRegenerating(true)
      setFileUrl(null)
      setProgress(0)
      resetProcessingSteps()
      const supabase = createClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        window.location.href = "/login"
        return
      }

      const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || ""
      const endpoint = `${baseUrl}/api/reports/regenerate/from-json`
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ reportId }),
        signal: controller.signal,
      })
      if (!res.ok) {
        const msg = await res.text()
        failProcessingSteps()
        throw new Error(msg || `再生成に失敗しました (${res.status})`)
      }
      setStatus("processing")
      setProgress(0)
      completeProcessingSteps()
      alert("JSONからの再生成を開始しました。")
    } catch (regErr) {
      if (regErr instanceof Error && regErr.name === 'AbortError') {
        console.log('Regeneration aborted')
        return
      }
      failProcessingSteps()
      alert(regErr instanceof Error ? regErr.message : String(regErr))
    } finally {
      setIsRegenerating(false)
      abortControllerRef.current = null
    }
  }

  const processingStepsForDisplay = processingSteps.length ? processingSteps : baseProcessingSteps
  const stepsForDialog = agentSteps || processingStepsForDisplay

  const agentDetails = useMemo(() => {
    if (!agentProgress) return null
    const updatedAt = agentProgress.updated_at ? new Date(agentProgress.updated_at).toLocaleString() : ""
    const last = agentProgress.last_step ? `${STEP_LABEL[agentProgress.last_step] || agentProgress.last_step}` : "—"
    const methodTree = agentProgress.previews?.method_tree || []
    const prompts = agentProgress.previews?.prompts || []
    const methodText = agentProgress.previews?.method_text || ""
    const discussionText = agentProgress.previews?.discussion_text || ""

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="space-y-0.5">
            <div className="text-foreground">最終ステップ: {last}</div>
            <div className="text-muted-foreground">更新: {updatedAt || "—"}</div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowAgentDetails((v) => !v)}>
            {showAgentDetails ? "詳細を閉じる" : "詳細を見る"}
          </Button>
        </div>

        {agentProgressError ? <div className="text-destructive">進捗取得エラー: {agentProgressError}</div> : null}

        {showAgentDetails ? (
          <div className="space-y-2">
            {methodTree.length ? (
              <div>
                <div className="font-semibold text-foreground mb-1">抽出した実験候補（先頭）</div>
                <ul className="list-disc pl-5 space-y-0.5">
                  {methodTree.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {prompts.length ? (
              <div>
                <div className="font-semibold text-foreground mb-1">抽出した考察課題（先頭）</div>
                <ul className="list-disc pl-5 space-y-0.5">
                  {prompts.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {methodText ? (
              <div>
                <div className="font-semibold text-foreground mb-1">実験方法（抜粋）</div>
                <pre className="whitespace-pre-wrap rounded-md border bg-background p-2 text-xs text-foreground max-h-40 overflow-auto">
                  {methodText}
                </pre>
              </div>
            ) : null}
            {discussionText ? (
              <div>
                <div className="font-semibold text-foreground mb-1">考察（抜粋）</div>
                <pre className="whitespace-pre-wrap rounded-md border bg-background p-2 text-xs text-foreground max-h-40 overflow-auto">
                  {discussionText}
                </pre>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    )
  }, [agentProgress, agentProgressError, showAgentDetails])

  return (
    <div className="page-container">
      <ReportProcessingSteps
        open={processingOverlayOpen}
        onOpenChange={setProcessingOverlayOpen}
        title={agentProgress ? "AIがレポートを作成中です" : "AIが処理中です"}
        headerStatusLabel={agentProgress ? "進行中" : "処理中"}
        steps={stepsForDialog}
        details={agentDetails}
        footerNote="再生成中はこの画面を開いたままにしてください。完了すると最新状態で読み込まれます。"
        onCancel={cancelServerProcessing}
        cancelLabel="キャンセル"
      />
      {status === "processing" && !processingOverlayOpen && (
        <div className="fixed bottom-6 right-6 z-40">
          <Button variant="default" className="shadow-lg" onClick={() => setProcessingOverlayOpen(true)}>
            処理状況を表示
          </Button>
        </div>
      )}
      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}>
        <Link href="/dashboard/reports" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeft className="h-4 w-4" /> レポート一覧に戻る
        </Link>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="mb-6">
        <h1 className="text-3xl font-bold text-foreground mb-2">{title || "レポート"}</h1>
        <p className="text-muted-foreground">作成日: {mounted && createdAt ? new Date(createdAt).toLocaleString() : "-"}</p>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card>
          <CardContent className="p-6">
            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full ${statusConfig.bgColor} ${statusConfig.color}`}>
              {statusConfig.icon}
              <span className="font-semibold">{statusConfig.label}</span>
            </div>

            {status === "processing" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
                <p className="text-muted-foreground">AIが実験データを解析し、レポートを生成しています...</p>
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">進捗状況</span>
                    <span className="text-lg font-bold text-primary">{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-3" />
                  <motion.div className="h-2 w-2 bg-primary rounded-full" animate={{ x: [0, 20, 0] }} transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY, ease: "linear" }} />
                </div>
              </motion.div>
            )}

            {status === "completed" && (
              <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.3, type: "spring" }}>
                <p className="text-muted-foreground">レポートの生成が完了しました。ダウンロードできます。</p>
              </motion.div>
            )}

            {status === "draft" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
                <p className="text-muted-foreground">抽出結果を確認・修正してから、DOCXを生成できます。</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button asChild variant="outline" className="gap-2">
                    <Link href={`/dashboard/reports/${reportId}/edit`}>
                      <FileText className="h-4 w-4" />
                      詳細編集
                    </Link>
                  </Button>
                </div>
              </motion.div>
            )}

            {status === "error" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
                <p className="text-destructive">レポートの生成中にエラーが発生しました。もう一度お試しください。</p>
              </motion.div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
        <h2 className="text-xl font-semibold text-foreground mb-4">アップロード済みファイル</h2>
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {files.map((file, index) => (
                <motion.div key={index} className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6 + index * 0.1 }} whileHover={{ x: 4 }}>
                  <div className="flex items-center gap-3">
                    {getFileIcon(file.type)}
                    <div>
                      <p className="font-medium text-foreground">{file.name}</p>
                      {file.uploaded_at && <p className="text-sm text-muted-foreground">{new Date(file.uploaded_at).toLocaleString()}</p>}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div className="mt-8 space-y-4" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
        {status === "completed" && fileUrl && (
          <Card className="bg-blue-50 border-blue-200 max-w-md mx-auto">
            <CardContent className="p-4">
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Button
                  size="lg"
                  className="w-full h-10 text-base gap-2 bg-primary hover:bg-primary/90"
                  onClick={async () => {
                    try {
                      const supabase = createClient()
                      const {
                        data: { session },
                      } = await supabase.auth.getSession()
                      if (!session) return
                      if (!fileUrl) throw new Error("ダウンロード可能なファイルがありません")
                      const url = await getFileUrl(fileUrl, `${title || "report"}.docx`)
                      window.location.href = url
                    } catch (e) {
                      alert(e instanceof Error ? e.message : String(e))
                    }
                  }}
                >
                  <Download className="h-5 w-5" /> レポートをダウンロード
                </Button>
              </motion.div>
            </CardContent>
          </Card>
        )}

        <Card className="max-w-md mx-auto">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Supabaseのアップロード済みファイルを再取得し、DifyでJSONを再生成してテンプレートに差し込みます。テンプレート更新や生成失敗時のリトライに使えます。
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Button
                variant="outline"
                size="lg"
                className="w-full gap-2"
                onClick={handleRegenerateJSON}
                disabled={isRegenerating}
              >
                {isRegenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                JSONから再生成
              </Button>
              <Button
                variant="default"
                size="lg"
                className="w-full gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white border-0"
                onClick={handleRegenerateAI}
                disabled={isRegenerating}
              >
                {isRegenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                AIで再生成
              </Button>
            </div>

            {(isRegenerating || status === "processing") && (
              <div className="pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={handleStop}
                >
                  <Square className="h-4 w-4" />
                  キャンセル
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Button
            variant="destructive"
            size="lg"
            className="w-full sm:w-auto gap-2"
            onClick={async () => {
              if (!confirm("このレポートを削除してもよろしいですか?")) return
              try {
                const supabase = createClient()
                const {
                  data: { session },
                } = await supabase.auth.getSession()
                if (!session) return
                // Best-effort: delete related storage files first
                const { data: expFiles } = await supabase
                  .from("experiment_data")
                  .select("file_url")
                  .eq("report_id", reportId)

                const storagePaths = [
                  ...(expFiles || []).map((f) => (f.file_url || "").replace(/^\/+/, "")).filter(Boolean),
                  ...(fileUrl ? [fileUrl.replace(/^\/+/, "")] : []),
                ]
                if (storagePaths.length > 0) {
                  await supabase.storage.from("experiment-files").remove(storagePaths)
                }

                const { error } = await supabase
                  .from("reports")
                  .delete()
                  .eq("id", reportId)
                  .eq("user_id", session.user.id)
                if (error) throw new Error(error.message)

                window.location.href = "/dashboard/reports"
              } catch (e) {
                alert(e instanceof Error ? e.message : String(e))
              }
            }}
          >
            <Trash2 className="h-5 w-5" /> 削除
          </Button>
        </motion.div>
      </motion.div>
    </div>
  )
}
