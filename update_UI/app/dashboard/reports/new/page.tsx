"use client"

import type React from "react"

import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import {
  Upload,
  FileText,
  X,
  CheckCircle2,
  ArrowRight,
  FileCheck,
  Loader2,
  Image as ImageIcon,
  ArrowUp,
  ArrowDown,
  Lock,
  Plus,
  TrendingUp,
  RotateCcw,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { createClient } from "@/lib/supabase/client"
import DashboardPageShell from "@/components/dashboard-page-shell"
import { ReportGenerationLiveView } from "@/components/report-generation-live-view"
import { cn } from "@/lib/utils"


const STEP_LABEL: Record<string, string> = {
  session_start: "セッション開始",
  ingest: "準備",
  normalize_inputs: "入力正規化",
  classify_assets: "アセット分類",
  pdf_parse: "PDF解析",
  clean_heading_positions: "見出し位置補正",
  parse_manual_structure: "構造解析",
  extract_method_numbers: "実験番号抽出",
  map_result_numbers: "結果番号対応付け",
  extract_theory_candidates: "理論式候補抽出",
  normalize_ommlify_formula: "理論式正規化",
  past_report_hints: "過去レポート参照",
  method_extract: "実験抽出",
  infer_required_outputs: "出力要件推定",
  required_outputs_gate: "要件曖昧性判定",
  inspect_excel: "Excel解析",
  select_excel_sheet: "シート選択",
  sheet_selection_gate: "シート選択判定",
  select_excel_ranges: "表範囲抽出",
  bind_table_columns: "列バインド",
  column_unit_gate: "単位判定",
  bind_theory_params: "理論式パラメータ対応",
  param_binding_gate: "パラメータ判定",
  bind_insert_assets: "図表割当",
  generate_graphs: "グラフ生成",
  resolve_axes: "軸ラベル解決",
  decide_theory_compare_hitl: "理論比較判定",
  compute_theory_value: "理論値計算",
  compute_delta_and_abs_error: "誤差計算",
  compute_slope_and_extreme: "傾き/極値計算",
  run_d_to_i_per_experiment: "D-I実験処理",
  unit_init: "実験ユニット生成",
  excel_mvp: "Excel要約",
  assemble_experiment_result_group: "実験結果まとめ",
  assemble_results_page: "結果ページ組立",
  build_discussion_page: "考察作成",
  build_summary_page: "まとめ作成",
  build_references_page: "参考文献",
  n_build_discussion_summary: "考察/まとめ生成",
  m_compose_footer: "Mフッター作成",
  j_merge_payload: "J統合",
  k_compose_markdown: "Markdown化",
  l_render_docx: "DOCX生成",
  l_emit_outputs: "成果物保存",
  validate: "検証",
  quant_comment_mvp: "定量コメント作成",
  render_markdown: "Markdown生成",
  review_markdown: "Markdown確認",
  render_docx: "DOCX生成",
}

const MONITORED_PROGRESS_STEPS = [
  "session_start",
  "ingest",
  "normalize_inputs",
  "classify_assets",
  "map_result_numbers",
  "normalize_ommlify_formula",
  "bc_layer_parallel",
  "run_d_to_i_per_experiment",
  "n_build_discussion_summary",
  "m_compose_footer",
  "j_merge_payload",
  "k_compose_markdown",
  "l_render_docx",
  "l_emit_outputs",
]

const PROCESSING_STORAGE_KEY = "reportlab:processing-state"

type StorageCategory = "experiment-data" | "table-json"

const generateSafeStoragePath = (
  userId: string,
  reportId: string,
  originalName: string,
  fallbackExt = "pdf",
  category: StorageCategory = "experiment-data"
) => {
  const normalizedFallback = fallbackExt.replace(/[^a-z0-9]/gi, "").toLowerCase() || "dat"
  const [, extMatch] = originalName.toLowerCase().match(/\.([a-z0-9]+)$/) ?? []
  const fileExt = extMatch || normalizedFallback
  const uniqueId = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Math.random().toString(36).slice(2)
  return `${userId}/${reportId}/${category}/${uniqueId}.${fileExt}`
}

const isUploadDebugEnabled = process.env.NEXT_PUBLIC_ENABLE_UPLOAD_DEBUG === "true"

const debugUpload = (...args: unknown[]) => {
  if (isUploadDebugEnabled) {
    // eslint-disable-next-line no-console
    console.debug("[upload-debug]", ...args)
  }
}

const getFileExtension = (fileName: string): string | undefined => {
  const match = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)
  return match ? match[1] : undefined
}

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "bmp", "webp", "heic", "heif", "tiff", "tif", "svg"])
const TABLE_FILE_EXTENSIONS = new Set(["csv", "json", "xlsx", "xlsm"])
const EXCEL_TABLE_EXTENSIONS = new Set(["xlsx", "xlsm"])

const isPdfFile = (file: File) => file.type === "application/pdf" || getFileExtension(file.name) === "pdf"
const isWordFile = (file: File) => 
  file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || 
  getFileExtension(file.name) === "docx" || 
  getFileExtension(file.name) === "doc"

const isImageFile = (file: File) => {
  if (file.type && file.type.startsWith("image/")) return true
  const ext = getFileExtension(file.name)
  return Boolean(ext && IMAGE_EXTENSIONS.has(ext))
}

const isTableFile = (file: File) => {
  const ext = getFileExtension(file.name)
  return Boolean(ext && TABLE_FILE_EXTENSIONS.has(ext))
}

type ExcelImagePreview = {
  id: string
  sourceKey: string
  sourceName: string
  fileName: string
  mimeType: string
  url: string
  size: number
}

type ExcelZipMeta = {
  media_count: number
  embeddings_image_count: number
  charts_count: number
  drawings_count: number
}

const excelSourceKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`
const tableFileKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`

const isExcelTableFile = (file: File) => {
  const ext = getFileExtension(file.name)
  return Boolean(ext && EXCEL_TABLE_EXTENSIONS.has(ext))
}

const guessImageMimeType = (filename: string) => {
  const lower = filename.toLowerCase()
  if (lower.endsWith(".png")) return "image/png"
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg"
  if (lower.endsWith(".webp")) return "image/webp"
  if (lower.endsWith(".gif")) return "image/gif"
  if (lower.endsWith(".bmp")) return "image/bmp"
  if (lower.endsWith(".tif") || lower.endsWith(".tiff")) return "image/tiff"
  if (lower.endsWith(".svg")) return "image/svg+xml"
  return "application/octet-stream"
}

const isBrowserRenderablePreview = (preview: Pick<ExcelImagePreview, "fileName" | "mimeType">) => {
  if (preview.mimeType.startsWith("image/svg")) return true
  if (!preview.mimeType.startsWith("image/")) return false
  const ext = getFileExtension(preview.fileName || "")
  if (!ext) return false
  // Commonly supported in modern browsers. (heic/heif/tiff are often not.)
  return ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].includes(ext)
}

const normalizeZipPath = (zipPath: string) => zipPath.replace(/\\/g, "/").replace(/^\/+/, "")

const isLikelyImagePath = (zipPath: string) => {
  const normalized = normalizeZipPath(zipPath).toLowerCase()
  const ext = (normalized.match(/\.([a-z0-9]+)$/)?.[1] || "").toLowerCase()
  if (!ext) return false
  // Include EMF/WMF because Excel often stores pasted objects as those.
  return ["png", "jpg", "jpeg", "gif", "bmp", "webp", "tif", "tiff", "svg", "emf", "wmf"].includes(ext)
}

const decodeXmlEntities = (value: string) => {
  return (value || "")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
}

const extractSheetNamesFromWorkbookXml = (xml: string) => {
  const out: string[] = []
  const re = /<sheet\b[^>]*\bname="([^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) {
    const name = decodeXmlEntities(m[1] || "").trim()
    if (name) out.push(name)
  }
  return out
}

const getZipEntryText = (entry: any) => {
  try {
    if (typeof entry?.asText === "function") return entry.asText() as string
    if (typeof entry?.asBinary === "function") return entry.asBinary() as string
    if (typeof entry?.asUint8Array === "function") {
      const bytes = entry.asUint8Array() as Uint8Array
      return new TextDecoder("utf-8").decode(bytes)
    }
  } catch {
    // ignore
  }
  return ""
}

const stripExcelSheetMeta = (filename: string) => {
  const raw = filename || ""
  const idx = raw.indexOf("::sheet=")
  return idx === -1 ? raw : raw.slice(0, idx)
}

const withExcelSheetMeta = (filename: string, sheetName: string) => {
  const base = stripExcelSheetMeta(filename)
  const sheet = (sheetName || "").trim()
  if (!sheet) return base
  return `${base}::sheet=${encodeURIComponent(sheet)}`
}

const parseHtmlTable = (html: string): string[][] => {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, "text/html")
  const table = doc.querySelector("table")
  if (!table) return []

  const grid: string[][] = []
  const rows = Array.from(table.querySelectorAll("tr"))

  rows.forEach((tr, rowIndex) => {
    if (!grid[rowIndex]) grid[rowIndex] = []
    let colIndex = 0
    const cells = Array.from(tr.querySelectorAll("th,td"))
    cells.forEach((cell) => {
      while (grid[rowIndex][colIndex] !== undefined) {
        colIndex += 1
      }
      const colspan = Math.max(1, Number(cell.getAttribute("colspan") || "1"))
      const rowspan = Math.max(1, Number(cell.getAttribute("rowspan") || "1"))
      const value = cell.textContent?.trim() ?? ""
      for (let r = 0; r < rowspan; r += 1) {
        const targetRow = rowIndex + r
        if (!grid[targetRow]) grid[targetRow] = []
        for (let c = 0; c < colspan; c += 1) {
          const targetCol = colIndex + c
          if (grid[targetRow][targetCol] === undefined) {
            grid[targetRow][targetCol] = value
          }
        }
      }
      colIndex += colspan
    })
  })

  return grid
}

const parsePlainTable = (text: string): string[][] => {
  if (!text.trim()) return []
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split("\t").map((cell) => cell.trim()))
}

const normalizeTableRows = (rows: string[][]): string[][] => {
  const cleaned = rows
    .map((row) => row.map((cell) => cell ?? "").map((cell) => cell.trim()))
    .filter((row) => row.some((cell) => cell.length > 0))
  return cleaned
}

const getImageFallbackExtension = (file: File) => {
  const ext = getFileExtension(file.name)
  if (ext && IMAGE_EXTENSIONS.has(ext)) {
    return ext
  }
  const mimePart = file.type.match(/\/([a-z0-9]+)/i)?.[1]?.toLowerCase()
  if (mimePart && IMAGE_EXTENSIONS.has(mimePart)) {
    return mimePart
  }
  return "png"
}

const CompletionBadge = ({ label }: { label: string }) => (
  <motion.span
    initial={{ opacity: 0, scale: 0.9, y: 2 }}
    animate={{ opacity: 1, scale: 1, y: 0 }}
    transition={{ type: "spring", stiffness: 260, damping: 18, mass: 0.6 }}
    className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 shadow-sm"
  >
    <CheckCircle2 className="h-3 w-3" />
    {label}
  </motion.span>
)

type ProcessingState = {
  reportId: string
  startedAt: number
  destination?: "edit" | "view"
}

const persistProcessingState = (state: ProcessingState) => {
  if (typeof window === "undefined") return
  window.localStorage.setItem(PROCESSING_STORAGE_KEY, JSON.stringify(state))
}

const clearProcessingState = () => {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(PROCESSING_STORAGE_KEY)
}

const restoreProcessingState = (): ProcessingState | null => {
  if (typeof window === "undefined") return null
  const raw = window.localStorage.getItem(PROCESSING_STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as ProcessingState
    if (parsed?.reportId && typeof parsed.startedAt === "number") {
      if (parsed.destination && parsed.destination !== "edit" && parsed.destination !== "view") {
        parsed.destination = "edit"
      }
      return parsed
    }
  } catch (err) {
    console.error("Failed to parse processing state", err)
  }
  clearProcessingState()
  return null
}

export default function NewReportPage() {
  const router = useRouter()
  const [experimentPdf, setExperimentPdf] = useState<File | null>(null)
  const [reportTitle, setReportTitle] = useState("")
  const [figureImages, setFigureImages] = useState<File[]>([])
  const [pastReports, setPastReports] = useState<File[]>([])
  const [tableFiles, setTableFiles] = useState<File[]>([])
  const [excelImagePreviews, setExcelImagePreviews] = useState<ExcelImagePreview[]>([])
  const [excelZipMetaBySourceKey, setExcelZipMetaBySourceKey] = useState<Record<string, ExcelZipMeta>>({})
  const [excelSheetNamesBySourceKey, setExcelSheetNamesBySourceKey] = useState<Record<string, string[]>>({})
  const [excelSelectedSheetBySourceKey, setExcelSelectedSheetBySourceKey] = useState<Record<string, string>>({})
  const [excelExtracting, setExcelExtracting] = useState<Record<string, boolean>>({})
  const [excelExtractErrors, setExcelExtractErrors] = useState<Record<string, string>>({})
  const processedExcelPreviewKeysRef = useRef<Set<string>>(new Set())
  const excelImagePreviewsRef = useRef<ExcelImagePreview[]>([])
  const tableFilesRef = useRef<File[]>([])
  const tableFileKeysRef = useRef<Set<string>>(new Set())
  const [pastedTables, setPastedTables] = useState<{ id: string; rows: string[][] }[]>([])
  const [existingPdf, setExistingPdf] = useState<{ name: string; path: string } | null>(null)
  const [existingImages, setExistingImages] = useState<{ name: string }[]>([])
  const [existingTables, setExistingTables] = useState<{ name: string }[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isPastReportDragging, setIsPastReportDragging] = useState(false)
  const [isImageDragging, setIsImageDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingDialogOpen, setProcessingDialogOpen] = useState(false)
  const [error, setError] = useState<string>("")
  const [processingReportId, setProcessingReportId] = useState<string | null>(null)
  const [processingDestination, setProcessingDestination] = useState<"edit" | "view">("edit")
  const [agentProgress, setAgentProgress] = useState<any | null>(null)
  const [agentProgressError, setAgentProgressError] = useState<string>("")
  const [showAgentDetails, setShowAgentDetails] = useState(false)
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [subscriptionPlan, setSubscriptionPlan] = useState<string | null>(null)
  const hasUploadedTables = pastedTables.length > 0 || tableFiles.length > 0 || existingTables.length > 0
  const hasFigureUploads = figureImages.length > 0 || existingImages.length > 0
  const excelTableFiles = useMemo(() => {
    const seen = new Set<string>()
    const unique: File[] = []
    for (const f of tableFiles) {
      if (!isExcelTableFile(f)) continue
      const key = excelSourceKey(f)
      if (seen.has(key)) continue
      seen.add(key)
      unique.push(f)
    }
    return unique
  }, [tableFiles])
  const excelPreviewsBySourceKey = useMemo(() => {
    const map = new Map<string, ExcelImagePreview[]>()
    for (const preview of excelImagePreviews) {
      const list = map.get(preview.sourceKey) || []
      list.push(preview)
      map.set(preview.sourceKey, list)
    }
    for (const [, list] of map) {
      list.sort((a, b) => a.fileName.localeCompare(b.fileName))
    }
    return map
  }, [excelImagePreviews])

  useEffect(() => {
    excelImagePreviewsRef.current = excelImagePreviews
  }, [excelImagePreviews])

  useEffect(() => {
    tableFilesRef.current = tableFiles
    tableFileKeysRef.current = new Set(tableFiles.map((f) => tableFileKey(f)))
  }, [tableFiles])

  useEffect(() => {
    return () => {
      excelImagePreviewsRef.current.forEach((p) => {
        try {
          URL.revokeObjectURL(p.url)
        } catch {
          // ignore
        }
      })
    }
  }, [])
  const hasPdfSelected = Boolean(experimentPdf || existingPdf)


  const confirmStopProcessing = () => {
    const ok = window.confirm("レポート作成の処理を停止しますか？\n（途中までの生成結果は破棄される可能性があります）")
    if (!ok) return
    stopProcessing()
  }

  const stopProcessing = () => {
    const reportId = processingReportId || resumeReportId
    const cancel = async () => {
      try {
        if (reportId) {
          const supabase = createClient()
          const {
            data: { session },
          } = await supabase.auth.getSession()

          if (session) {
            const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || ""
            const endpoint = `${baseUrl}/api/reports/cancel`
            await fetch(endpoint, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({ reportId }),
            }).catch(() => undefined)
          }
        }
      } finally {
        clearProcessingState()
        setIsProcessing(false)
        setProcessingDialogOpen(false)
        setIsUploading(false)
        setProcessingReportId(null)
        setProcessingDestination("edit")
        setAgentProgress(null)
        setAgentProgressError("")
        setShowAgentDetails(false)
        // 停止後は再開モード(queryのreportId)を解除し、新規作成フローへ戻す
        router.replace("/dashboard/reports/new")
      }
    }
    void cancel()
  }
  const hasUploadedImages = figureImages.length > 0 || existingImages.length > 0
  const [lastAddedTableId, setLastAddedTableId] = useState<string | null>(null)
  const tableHighlightTimer = useRef<number | null>(null)
  const [lastAddedImageIndex, setLastAddedImageIndex] = useState<number | null>(null)
  const [lastAddedImageLabel, setLastAddedImageLabel] = useState<string | null>(null)
  const imageHighlightTimer = useRef<number | null>(null)
  const [lastAddedFilesLabel, setLastAddedFilesLabel] = useState<string | null>(null)
  const filesHighlightTimer = useRef<number | null>(null)

  const searchParams = useSearchParams()
  const resumeReportId = searchParams.get("reportId")
  const activeResumeId = resumeReportId || processingReportId
  const liveCurrentLabel = useMemo(() => {
    const uiDetail = typeof agentProgress?.ui?.detail === "string" ? agentProgress.ui.detail.trim() : ""
    const uiExp = typeof agentProgress?.ui?.current_experiment === "string" ? agentProgress.ui.current_experiment.trim() : ""
    if (uiDetail && uiExp) return `${uiDetail} (${uiExp})`
    if (uiDetail) return uiDetail
    const lastStep = typeof agentProgress?.last_step === "string" ? agentProgress.last_step : ""
    if (!lastStep) return "実行中"
    return STEP_LABEL[lastStep] || lastStep
  }, [agentProgress?.last_step, agentProgress?.ui?.detail, agentProgress?.ui?.current_experiment])
  const liveProgressPercent = useMemo(() => {
    const snapshots = Array.isArray(agentProgress?.snapshots) ? agentProgress.snapshots : []
    const done = new Set<string>()
    for (const snapshot of snapshots) {
      const step = typeof snapshot?.step === "string" ? snapshot.step : ""
      if (step) done.add(step)
    }
    const total = MONITORED_PROGRESS_STEPS.length || 1
    const finished = MONITORED_PROGRESS_STEPS.filter((step) => done.has(step)).length
    return Math.round((finished / total) * 100)
  }, [agentProgress?.snapshots])

  useEffect(() => {
    const restored = restoreProcessingState()
    if (!restored) return
    if (!resumeReportId) {
      const params = new URLSearchParams(searchParams.toString())
      params.set("reportId", restored.reportId)
      router.replace(`?${params.toString()}`)
    }
    setProcessingReportId(restored.reportId)
    setProcessingDestination(restored.destination ?? "edit")
    setIsProcessing(true)
  }, [resumeReportId, router, searchParams])

  useEffect(() => {
    const loadDraft = async () => {
      if (!activeResumeId) return
      try {
        const supabase = createClient()
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!session) return

        // Fetch subscription plan from profiles
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("plan")
          .eq("id", session.user.id) // Fixed: use 'id' not 'user_id'
          .single()

        console.log("[FRONTEND] Fetched profile:", profile)
        console.log("[FRONTEND] Profile error:", profileError)

        if (profile?.plan === "premium") {
          setSubscriptionPlan("premium")
        } else if (profile?.plan === "standard" || profile?.plan === "credit_only") {
          setSubscriptionPlan("standard")
        } else {
          setSubscriptionPlan("free")
        }

        const { data: report } = await supabase
          .from("reports")
          .select("id, title, status")
          .eq("id", activeResumeId)
          .eq("user_id", session.user.id)
          .maybeSingle()

        if (report?.title) {
          setReportTitle(report.title)
        }

        const { data: files } = await supabase
          .from("experiment_data")
          .select("file_name, file_type, file_url")
          .eq("report_id", activeResumeId)
          .order("uploaded_at", { ascending: true })

        if (files && files.length > 0) {
          const pdf = files.find(
            (f) => f.file_type === "pdf" || f.file_type === "word" || (f.file_name || "").toLowerCase().endsWith(".pdf")
          )
          if (pdf?.file_name && pdf?.file_url) {
            setExistingPdf({ name: pdf.file_name, path: pdf.file_url })
          }
          setExistingImages(files.filter((f) => f.file_type === "image").map((f) => ({ name: f.file_name || "image" })))
          setExistingTables(files.filter((f) => f.file_type === "excel").map((f) => ({ name: f.file_name || "table" })))
        }
      } catch (loadError) {
        console.error("Failed to load draft", loadError)
      }
    }
    loadDraft()
  }, [activeResumeId])

  // Fetch subscription plan on mount even if not resuming
  useEffect(() => {
    const fetchSubscription = async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data: profile } = await supabase
        .from("profiles")
        .select("plan")
        .eq("id", session.user.id) // Fixed: use 'id' not 'user_id'
        .single()

      if (profile?.plan === "premium") {
        setSubscriptionPlan("premium")
      } else if (profile?.plan === "standard" || profile?.plan === "credit_only") {
        setSubscriptionPlan("standard")
      } else {
        setSubscriptionPlan("free")
      }
    }
    fetchSubscription()
  }, [])

  useEffect(() => {
    setProcessingDialogOpen(isProcessing)
  }, [isProcessing])

  useEffect(() => {
    if (!isProcessing || !processingReportId) return

    let canceled = false
    let timer: number | null = null

    const tick = async () => {
      try {
        const res = await fetch(`/api/reports/${processingReportId}/agent-progress`, { cache: "no-store" })
        if (!res.ok) return
        const json = await res.json().catch(() => null)
        if (!json || canceled) return
        if (json.available && json.progress) {
          setAgentProgress(json.progress)
          setAgentProgressError("")
          const progressStatus = typeof json.progress?.status === "string" ? json.progress.status.toLowerCase() : ""
          const snapshots = Array.isArray(json.progress?.snapshots) ? json.progress.snapshots : []
          const reachedLByStep = snapshots.some((s: any) => {
            const step = typeof s?.step === "string" ? s.step : ""
            return step === "l_emit_outputs" || step === "l_render_docx"
          })
          const reachedLByFlag = Boolean(json.progress?.reached_l_layer)
          const completed =
            progressStatus === "completed" ||
            progressStatus === "complete" ||
            progressStatus === "succeeded" ||
            progressStatus === "success" ||
            reachedLByFlag ||
            reachedLByStep
          const failed = progressStatus === "failed" || progressStatus === "error"
          if (completed || failed) {
            canceled = true
            clearProcessingState()
            setIsProcessing(false)
            if (completed) {
              if (processingDestination === "view") {
                router.push(`/dashboard/reports/${processingReportId}`)
              } else {
                router.push(`/dashboard/reports/${processingReportId}/${processingDestination}`)
              }
            } else {
              setError("レポート生成に失敗しました。再実行してください。")
            }
            return
          }
        }
      } catch (e) {
        if (canceled) return
        setAgentProgressError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!canceled) timer = window.setTimeout(tick, 2000)
      }
    }

    void tick()
    return () => {
      canceled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [isProcessing, processingDestination, processingReportId, router])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const canUploadPaidAssets = subscriptionPlan === "premium" || subscriptionPlan === "standard"

  const removeExcelImagePreviewsBySourceKey = (sourceKey: string) => {
    processedExcelPreviewKeysRef.current.delete(sourceKey)
    setExcelExtracting((prev) => {
      if (!prev[sourceKey]) return prev
      const next = { ...prev }
      delete next[sourceKey]
      return next
    })
    setExcelExtractErrors((prev) => {
      if (!prev[sourceKey]) return prev
      const next = { ...prev }
      delete next[sourceKey]
      return next
    })
    setExcelImagePreviews((prev) => {
      const removed = prev.filter((p) => p.sourceKey === sourceKey)
      removed.forEach((p) => {
        try {
          URL.revokeObjectURL(p.url)
        } catch {
          // ignore
        }
      })
      return prev.filter((p) => p.sourceKey !== sourceKey)
    })
  }

  const extractExcelImagePreviews = async (file: File) => {
    const sourceKey = excelSourceKey(file)
    setExcelExtracting((prev) => ({ ...prev, [sourceKey]: true }))
    setExcelExtractErrors((prev) => {
      if (!prev[sourceKey]) return prev
      const next = { ...prev }
      delete next[sourceKey]
      return next
    })

    try {
      const mod = await import("pizzip")
      const PizZip = mod.default
      const arrayBuffer = await file.arrayBuffer()
      const zip = new PizZip(new Uint8Array(arrayBuffer) as any)
      const zipFiles = (zip as any)?.files || {}

      const zipPaths = Object.keys(zipFiles).map((p) => normalizeZipPath(p))
      const meta: ExcelZipMeta = {
        media_count: zipPaths.filter((p) => p.toLowerCase().startsWith("xl/media/")).length,
        embeddings_image_count: zipPaths.filter((p) => p.toLowerCase().startsWith("xl/embeddings/") && isLikelyImagePath(p)).length,
        charts_count: zipPaths.filter((p) => p.toLowerCase().startsWith("xl/charts/")).length,
        drawings_count: zipPaths.filter((p) => p.toLowerCase().startsWith("xl/drawings/")).length,
      }
      setExcelZipMetaBySourceKey((prev) => ({ ...prev, [sourceKey]: meta }))

      const workbookEntryKey =
        Object.keys(zipFiles).find((k) => normalizeZipPath(k).toLowerCase() === "xl/workbook.xml") || ""
      const workbookXml = workbookEntryKey ? getZipEntryText((zipFiles as any)[workbookEntryKey]) : ""
      const sheetNames = workbookXml ? extractSheetNamesFromWorkbookXml(workbookXml) : []
      if (sheetNames.length > 0) {
        setExcelSheetNamesBySourceKey((prev) => ({ ...prev, [sourceKey]: sheetNames }))
        setExcelSelectedSheetBySourceKey((prev) => {
          if (prev[sourceKey]) return prev
          return { ...prev, [sourceKey]: sheetNames[0] }
        })
      }

      const entries = Object.entries(zipFiles)
        .filter(([zipPath, entry]) => {
          const normalized = normalizeZipPath(zipPath).toLowerCase()
          if ((entry as any)?.dir) return false
          if (normalized.startsWith("xl/media/")) return true
          if (normalized.startsWith("xl/embeddings/") && isLikelyImagePath(normalized)) return true
          return false
        })
        .sort(([a], [b]) => normalizeZipPath(a).localeCompare(normalizeZipPath(b)))

      const maxPreviewsPerWorkbook = 24
      const maxImageBytes = 10 * 1024 * 1024
      const stem = file.name.replace(/\.(xlsx|xlsm)$/i, "") || "excel"

      const previews: ExcelImagePreview[] = []
      for (let i = 0; i < entries.length && previews.length < maxPreviewsPerWorkbook; i += 1) {
        const [zipPath, entry] = entries[i]
        const normalizedPath = normalizeZipPath(zipPath)
        const base = normalizedPath.split("/").pop() || `image-${i + 1}`
        const fileName = `${stem}-${base}`
        const asUint8Array = (entry as any)?.asUint8Array
        const asArrayBuffer = (entry as any)?.asArrayBuffer
        const asBinary = (entry as any)?.asBinary

        let bytes: Uint8Array | null = null
        if (typeof asUint8Array === "function") {
          const rawBytes = asUint8Array.call(entry) as Uint8Array
          bytes = new Uint8Array(rawBytes)
        } else if (typeof asArrayBuffer === "function") {
          const rawBuffer = asArrayBuffer.call(entry) as ArrayBuffer
          bytes = new Uint8Array(rawBuffer)
        } else if (typeof asBinary === "function") {
          const binary = asBinary.call(entry) as string
          const buf = new Uint8Array(binary.length)
          for (let j = 0; j < binary.length; j += 1) {
            buf[j] = binary.charCodeAt(j) & 0xff
          }
          bytes = buf
        }

        if (!bytes) continue
        if (!bytes || bytes.byteLength === 0) continue
        if (bytes.byteLength > maxImageBytes) continue

        const mimeType = guessImageMimeType(fileName)
        const bytesForBlob = new Uint8Array(bytes.byteLength)
        bytesForBlob.set(bytes)
        const blob = new Blob([bytesForBlob], { type: mimeType })
        const url = URL.createObjectURL(blob)

        previews.push({
          id: `${sourceKey}:${normalizedPath}`,
          sourceKey,
          sourceName: file.name,
          fileName,
          mimeType,
          url,
          size: bytes.byteLength,
        })
      }

      if (entries.length === 0) {
        setExcelExtractErrors((prev) => ({
          ...prev,
          [sourceKey]: meta.charts_count > 0
            ? `画像が見つかりませんでした（このExcelにはグラフが ${meta.charts_count} 個あります。グラフは通常 xl/media に画像として保存されないため、ブラウザだけでは抽出できません。送信後にサーバ側でLibreOfficeを使ってPNG化→抽出する設定も可能です）`
            : "画像が見つかりませんでした（この .xlsx に埋め込み画像がない/リンク画像/保護されたファイル/.xls の可能性があります）",
        }))
      } else if (previews.length === 0) {
        setExcelExtractErrors((prev) => ({
          ...prev,
          [sourceKey]:
            `画像ファイルは検出しましたが、プレビューを作成できませんでした（検出=${entries.length}）。サイズ制限/形式（emf/wmf等）で表示できない可能性があります。`,
        }))
      }

      setExcelImagePreviews((prev) => {
        const removed = prev.filter((p) => p.sourceKey === sourceKey)
        removed.forEach((p) => {
          try {
            URL.revokeObjectURL(p.url)
          } catch {
            // ignore
          }
        })
        return [...prev.filter((p) => p.sourceKey !== sourceKey), ...previews]
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setExcelExtractErrors((prev) => ({ ...prev, [sourceKey]: msg }))
      processedExcelPreviewKeysRef.current.delete(sourceKey)
      setExcelImagePreviews((prev) => {
        const removed = prev.filter((p) => p.sourceKey === sourceKey)
        removed.forEach((p) => {
          try {
            URL.revokeObjectURL(p.url)
          } catch {
            // ignore
          }
        })
        return prev.filter((p) => p.sourceKey !== sourceKey)
      })
    } finally {
      setExcelExtracting((prev) => ({ ...prev, [sourceKey]: false }))
    }
  }

  const queueExcelImagePreviewExtraction = (files: File[]) => {
    const excelFiles = files.filter((f) => isExcelTableFile(f))
    if (excelFiles.length === 0) return
    for (const file of excelFiles) {
      const sourceKey = excelSourceKey(file)
      if (processedExcelPreviewKeysRef.current.has(sourceKey)) continue
      processedExcelPreviewKeysRef.current.add(sourceKey)
      void extractExcelImagePreviews(file)
    }
  }

  const addTableFiles = (files: File[]) => {
    const normalized = files.filter((f) => isTableFile(f))
    if (normalized.length > 0) {
      const uniqueToAdd: File[] = []
      for (const f of normalized) {
        const key = tableFileKey(f)
        if (tableFileKeysRef.current.has(key)) continue
        tableFileKeysRef.current.add(key)
        uniqueToAdd.push(f)
      }
      if (uniqueToAdd.length > 0) {
        setTableFiles((prev) => [...prev, ...uniqueToAdd])
        queueExcelImagePreviewExtraction(uniqueToAdd)
      }
    }
  }

  const removeTableFile = (index: number) => {
    setTableFiles((prev) => {
      const removed = prev[index]
      const next = prev.filter((_, i) => i !== index)
      if (removed) {
        tableFileKeysRef.current.delete(tableFileKey(removed))
      }
      if (removed && isExcelTableFile(removed)) {
        const key = excelSourceKey(removed)
        const stillExists = next.some((f) => isExcelTableFile(f) && excelSourceKey(f) === key)
        if (!stillExists) {
          removeExcelImagePreviewsBySourceKey(key)
          setExcelSheetNamesBySourceKey((prevMeta) => {
            if (!prevMeta[key]) return prevMeta
            const nextMeta = { ...prevMeta }
            delete nextMeta[key]
            return nextMeta
          })
          setExcelSelectedSheetBySourceKey((prevSel) => {
            if (!prevSel[key]) return prevSel
            const nextSel = { ...prevSel }
            delete nextSel[key]
            return nextSel
          })
        }
      }
      return next
    })
  }

  const clearAddedFilesLabelLater = () => {
    if (filesHighlightTimer.current) window.clearTimeout(filesHighlightTimer.current)
    filesHighlightTimer.current = window.setTimeout(() => setLastAddedFilesLabel(null), 2200)
  }

  const handleUnifiedFiles = (files: File[]) => {
    if (!files.length) return

    let addedPdf = false
    let addedImages = 0
    let addedTables = 0
    let addedPastReports = 0

    for (const file of files) {
      if (isPdfFile(file) || isWordFile(file)) {
        if (!experimentPdf) {
          setExperimentPdf(file)
          setExistingPdf(null)
          if (!reportTitle) {
            setReportTitle(file.name.replace(/\.(pdf|docx|doc)$/i, ""))
          }
          addedPdf = true
        } else {
          setPastReports((prev) => [...prev, file])
          addedPastReports += 1
        }
        continue
      }

      if (isImageFile(file)) {
        if (!canUploadPaidAssets) continue
        addImageFiles([file])
        addedImages += 1
        continue
      }

      if (isTableFile(file)) {
        // Excel画像の自動抽出はユーザーが結果を確認しやすいので、プラン判定前でも追加できるようにする。
        // それ以外の表（CSV/JSON）は従来通り有料プランのみ。
        if (!canUploadPaidAssets && !isExcelTableFile(file)) continue
        addTableFiles([file])
        addedTables += 1
        continue
      }
    }

    const labels: string[] = []
    if (addedPdf) labels.push("実験書")
    if (addedImages) labels.push(`画像${addedImages}`)
    if (addedTables) labels.push(`表${addedTables}`)
    if (addedPastReports) labels.push(`過去レポ${addedPastReports}`)
    if (labels.length) {
      setLastAddedFilesLabel(`${labels.join(" / ")} を追加しました`)
      clearAddedFilesLabelLater()
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const droppedFiles = Array.from(e.dataTransfer.files)
    handleUnifiedFiles(droppedFiles)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleUnifiedFiles(Array.from(e.target.files))
    }
    e.target.value = ""
  }

  const handlePastReportSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files).filter((f) => isPdfFile(f) || isWordFile(f))
      if (files.length > 0) {
        setPastReports((prev) => [...prev, ...files])
        setLastAddedFilesLabel(`過去レポート ${files.length} 件を追加しました`)
        clearAddedFilesLabelLater()
      }
    }
    e.target.value = ""
  }

  const handlePastReportDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsPastReportDragging(false)
    const files = Array.from(e.dataTransfer.files).filter((f) => isPdfFile(f) || isWordFile(f))
    if (files.length > 0) {
      setPastReports((prev) => [...prev, ...files])
      setLastAddedFilesLabel(`過去レポート ${files.length} 件を追加しました`)
      clearAddedFilesLabelLater()
    }
  }

  const removeFile = () => {
    setExperimentPdf(null)
    setExistingPdf(null)
  }

  const addImageFiles = (files: File[]) => {
    const normalized = files
      .filter((file) => isImageFile(file))
      .map((file, index) => {
        if (file.name) return file
        const ext = getImageFallbackExtension(file)
        return new File([file], `pasted-image-${Date.now()}-${index + 1}.${ext}`, {
          type: file.type || `image/${ext}`,
        })
      })
    if (normalized.length > 0) {
      setFigureImages((prev) => {
        const next = [...prev, ...normalized]
        const newIndex = next.length - 1
        setLastAddedImageIndex(newIndex)
        setLastAddedImageLabel(`画像 ${newIndex + 1} を追加しました`)
        if (imageHighlightTimer.current) {
          window.clearTimeout(imageHighlightTimer.current)
        }
        imageHighlightTimer.current = window.setTimeout(() => {
          setLastAddedImageIndex(null)
          setLastAddedImageLabel(null)
        }, 2200)
        return next
      })
    }
  }

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return
    const imageFiles = Array.from(e.target.files)
    addImageFiles(imageFiles)
    e.target.value = ""
  }

  const handleImageDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsImageDragging(true)
  }

  const handleImageDragLeave = () => {
    setIsImageDragging(false)
  }

  const handleImageDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsImageDragging(false)
    const droppedFiles = Array.from(e.dataTransfer.files)
    addImageFiles(droppedFiles)
  }

  const removeImage = (index: number) => {
    setFigureImages((prev) => prev.filter((_, i) => i !== index))
    if (lastAddedImageIndex === index) {
      setLastAddedImageIndex(null)
      setLastAddedImageLabel(null)
    }
  }

  const removePastReport = (index: number) => {
    setPastReports((prev) => prev.filter((_, i) => i !== index))
  }

  const moveImage = (index: number, direction: "up" | "down") => {
    setFigureImages((prev) => {
      const next = [...prev]
      const targetIndex = direction === "up" ? index - 1 : index + 1
      if (targetIndex < 0 || targetIndex >= next.length) {
        return prev
      }
      ;[next[index], next[targetIndex]] = [next[targetIndex], next[index]]
      return next
    })
  }

  const handleTablePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboard = event.clipboardData
    const html = clipboard?.getData("text/html") ?? ""
    const text = clipboard?.getData("text/plain") ?? ""
    let rows = normalizeTableRows(parseHtmlTable(html))
    if (rows.length === 0) {
      rows = normalizeTableRows(parsePlainTable(text))
    }
    if (rows.length > 0) {
      event.preventDefault()
      const newId = crypto.randomUUID()
      setPastedTables((prev) => [...prev, { id: newId, rows }])
      setLastAddedTableId(newId)
      if (tableHighlightTimer.current) {
        window.clearTimeout(tableHighlightTimer.current)
      }
      tableHighlightTimer.current = window.setTimeout(() => {
        setLastAddedTableId(null)
      }, 2200)
    }
  }

  const clearTables = () => setPastedTables([])
  const removeTable = (id: string) => setPastedTables((prev) => prev.filter((t) => t.id !== id))

  const handleImagePasteBoxPaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const files = Array.from(event.clipboardData?.items ?? [])
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file && isImageFile(file)))
    if (files.length > 0) {
      event.preventDefault()
      addImageFiles(files)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B"
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB"
    return (bytes / (1024 * 1024)).toFixed(1) + " MB"
  }

  const handleSubmit = async () => {
    if ((!experimentPdf && !existingPdf) || !reportTitle) return

    clearProcessingState()

    debugUpload("handleSubmit:start", {
      hasPdf: Boolean(experimentPdf || existingPdf),
      pdfName: experimentPdf?.name || existingPdf?.name,
      pdfSize: experimentPdf?.size,
      title: reportTitle,
      resumeReportId,
    })

    setError("")
    setIsUploading(true)
    setIsProcessing(true)

    const supabase = createClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      debugUpload("handleSubmit:no-session")
      setIsUploading(false)
      setIsProcessing(false)
      router.push("/login")
      return
    }

    debugUpload("handleSubmit:session", { userId: session.user.id })

    let reportId = resumeReportId || ""

    try {
      // 1) レポート作成（DB） もしくは既存下書きを再利用
      if (!resumeReportId) {
        const { data: inserted, error: insertError } = await supabase
          .from("reports")
          .insert([{ title: reportTitle, user_id: session.user.id, status: "draft" as const }])
          .select("id")
          .single()

        if (insertError || !inserted) throw new Error(insertError?.message ?? "Failed to create report")
        reportId = inserted.id as string
      } else {
        reportId = resumeReportId
      }
      debugUpload("handleSubmit:report-created", { reportId })

      // 2) PDFをStorageにアップロード
      if (experimentPdf) {
        const storagePath = generateSafeStoragePath(
          session.user.id,
          reportId,
          experimentPdf.name,
          "pdf",
          "experiment-data"
        )
        debugUpload("handleSubmit:upload:start", { storagePath })
        const { error: uploadError } = await supabase.storage
          .from("experiment-files")
          .upload(storagePath, experimentPdf, {
            contentType: experimentPdf.type || "application/pdf",
            upsert: true,
          })
        if (uploadError) {
          debugUpload("handleSubmit:upload:error", uploadError)
          throw new Error(uploadError.message)
        }
        debugUpload("handleSubmit:upload:success", { storagePath })

        const { error: fileInsertError } = await supabase.from("experiment_data").insert([
          {
            report_id: reportId,
            file_name: experimentPdf.name,
            file_type: "pdf",
            file_url: storagePath,
          },
        ])
        if (fileInsertError) {
          debugUpload("handleSubmit:experiment-data:error", fileInsertError)
          throw new Error(fileInsertError.message)
        }
        debugUpload("handleSubmit:experiment-data:success", { reportId, storagePath })
      }

      // 3.4) 貼り付け表を JSON としてアップロード（任意）
      if (pastedTables.length > 0) {
        for (let i = 0; i < pastedTables.length; i += 1) {
          const table = pastedTables[i]
          const jsonBlob = new Blob([JSON.stringify({ rows: table.rows }, null, 2)], {
            type: "application/json",
          })
          const tableFile = new File([jsonBlob], `table-${i + 1}.json`, { type: "application/json" })
          const tableStoragePath = generateSafeStoragePath(
            session.user.id,
            reportId,
            tableFile.name,
            "json",
            "table-json"
          )
          debugUpload("handleSubmit:table-upload:start", { index: i, tableStoragePath })
          // eslint-disable-next-line no-await-in-loop
          const { error: tableUploadError } = await supabase.storage
            .from("experiment-files")
            .upload(tableStoragePath, tableFile, {
              contentType: "application/json",
              upsert: true,
            })
          if (tableUploadError) {
            debugUpload("handleSubmit:table-upload:error", tableUploadError)
            throw new Error(tableUploadError.message)
          }
          const uploadedAt = new Date(Date.now() + i + 1000).toISOString()
          // eslint-disable-next-line no-await-in-loop
          const { error: tableInsertError } = await supabase.from("experiment_data").insert([
            {
              report_id: reportId,
              file_name: tableFile.name,
              file_type: "excel", // schema constraint: excel/image/code/word
              file_url: tableStoragePath,
              uploaded_at: uploadedAt,
            },
          ])
          if (tableInsertError) {
            debugUpload("handleSubmit:table-insert:error", tableInsertError)
            throw new Error(tableInsertError.message)
          }
          debugUpload("handleSubmit:table-upload:success", { reportId, tableStoragePath })
        }
      }

      // 3.4.1) 表ファイル（CSV/JSON）をアップロード（任意）
      if (tableFiles.length > 0) {
        for (let i = 0; i < tableFiles.length; i += 1) {
          const file = tableFiles[i]
          const ext = getFileExtension(file.name) || "csv"
          const tableStoragePath = generateSafeStoragePath(session.user.id, reportId, file.name, ext, "table-json")
          debugUpload("handleSubmit:table-file-upload:start", { index: i, tableStoragePath })

          const contentType =
            ext === "csv" ? "text/csv" : ext === "json" ? "application/json" : file.type || "application/octet-stream"

          // eslint-disable-next-line no-await-in-loop
          const { error: uploadError } = await supabase.storage.from("experiment-files").upload(tableStoragePath, file, {
            contentType,
            upsert: true,
          })
          if (uploadError) {
            debugUpload("handleSubmit:table-file-upload:error", uploadError)
            throw new Error(uploadError.message)
          }

          const uploadedAt = new Date(Date.now() + i + 2000).toISOString()
          const storageFileName =
            isExcelTableFile(file) ? withExcelSheetMeta(file.name, excelSelectedSheetBySourceKey[excelSourceKey(file)] || "") : file.name
          // eslint-disable-next-line no-await-in-loop
          const { error: insertError } = await supabase.from("experiment_data").insert([
            {
              report_id: reportId,
              file_name: storageFileName,
              file_type: "excel",
              file_url: tableStoragePath,
              uploaded_at: uploadedAt,
            },
          ])
          if (insertError) {
            debugUpload("handleSubmit:table-file-insert:error", insertError)
            throw new Error(insertError.message)
          }

          debugUpload("handleSubmit:table-file-upload:success", { reportId, tableStoragePath })
        }
      }

      // 3.5) 図の画像を追加でアップロード
      if (figureImages.length > 0) {
        for (let i = 0; i < figureImages.length; i += 1) {
          const imageFile = figureImages[i]
          const fallbackExt = getImageFallbackExtension(imageFile)
          const imageStoragePath = generateSafeStoragePath(
            session.user.id,
            reportId,
            imageFile.name,
            fallbackExt,
            "experiment-data"
          )
          debugUpload("handleSubmit:image-upload:start", { index: i, imageStoragePath })
          // eslint-disable-next-line no-await-in-loop
          const { error: imageUploadError } = await supabase.storage
            .from("experiment-files")
            .upload(imageStoragePath, imageFile, {
              contentType: imageFile.type || "image/png",
              upsert: true,
            })
          if (imageUploadError) {
            debugUpload("handleSubmit:image-upload:error", imageUploadError)
            throw new Error(imageUploadError.message)
          }

          const uploadedAt = new Date(Date.now() + i).toISOString()
          // eslint-disable-next-line no-await-in-loop
          const { error: imageInsertError } = await supabase.from("experiment_data").insert([
            {
              report_id: reportId,
              file_name: imageFile.name,
              file_type: "image",
              file_url: imageStoragePath,
              uploaded_at: uploadedAt,
            },
          ])
          if (imageInsertError) {
            debugUpload("handleSubmit:image-insert:error", imageInsertError)
            throw new Error(imageInsertError.message)
          }
          debugUpload("handleSubmit:image-upload:success", { reportId, imageStoragePath })
        }
      }

      // 3.6) 過去レポートをアップロード
      if (pastReports.length > 0) {
        for (let i = 0; i < pastReports.length; i += 1) {
          const file = pastReports[i]
          const ext = getFileExtension(file.name) || "docx"
          const storagePath = generateSafeStoragePath(session.user.id, reportId, file.name, ext, "experiment-data")
          
          const { error: uploadError } = await supabase.storage
            .from("experiment-files")
            .upload(storagePath, file, { upsert: true })
          if (uploadError) throw new Error(uploadError.message)

          const uploadedAt = new Date(Date.now() + i + 3000).toISOString()
          const { error: insertError } = await supabase.from("experiment_data").insert([
            {
              report_id: reportId,
              file_name: file.name,
              file_type: "word", // Past reports are treated as reference documents
              file_url: storagePath,
              uploaded_at: uploadedAt,
            },
          ])
          if (insertError) throw new Error(insertError.message)
        }
      }

      // 4) Dify を使うバックエンドの生成APIを呼び出し（Authorization: Bearer <token>）
      const token = session.access_token
      const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || ""
      const destination: ProcessingState["destination"] = "view"
      setProcessingDestination("view")

      const endpoint = `${baseUrl}/api/reports/generate`
      debugUpload("handleSubmit:generate-api:start", { endpoint })
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          reportId,
        }),
      })
      if (!res.ok) {
        const msg = await res.text()
        debugUpload("handleSubmit:generate-api:error", { status: res.status, body: msg })
        throw new Error(msg || `Failed to start generation: ${res.status}`)
      }
      debugUpload("handleSubmit:generate-api:success", { reportId })

      const startedAt = Date.now()
      setProcessingReportId(reportId)
      setIsProcessing(true)
      persistProcessingState({ reportId, startedAt, destination })
      return
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      debugUpload("handleSubmit:failed", { error: message, detail: e })
      clearProcessingState()
      setProcessingReportId(null)
      setIsProcessing(false)
      setError(message)
    } finally {
      setIsUploading(false)
      debugUpload("handleSubmit:finished")
    }
  }

  useEffect(() => {
    const handleGlobalPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest("#table-paste-area") || target?.closest("#image-paste-box")) return

      const files = Array.from(event.clipboardData?.items ?? [])
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file && isImageFile(file)))

      if (files.length > 0) {
        event.preventDefault()
        addImageFiles(files)
      }
    }

    window.addEventListener("paste", handleGlobalPaste)
    return () => {
      window.removeEventListener("paste", handleGlobalPaste)
    }
  }, [])

  useEffect(() => {
    const urls = figureImages.map((file) => URL.createObjectURL(file))
    setImagePreviews(urls)
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [figureImages])


  return (
    <DashboardPageShell
      title="新規レポート作成"
      subtitle="実験書PDF/Wordをアップロードして、AIによる解析を開始します"
      icon={<Plus className="h-6 w-6" />}
      hideHeader
    >
      <div className="max-w-4xl mx-auto">
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm font-bold"
          >
            {error}
          </motion.div>
        )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <Card
          className={cn(
            "border-2",
            (isProcessing || !hasPdfSelected) && "border-none bg-transparent shadow-none"
          )}
        >
          <CardContent className={cn("p-8", (isProcessing || !hasPdfSelected) && "p-0")}>
	            {isProcessing ? (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                <ReportGenerationLiveView
                  title="AIがレポートを生成中です"
                  reportTitle={reportTitle}
                  percent={liveProgressPercent}
                  currentLabel={liveCurrentLabel}
                  progress={agentProgress}
                  stepLabels={STEP_LABEL}
                  fileNames={[
                    experimentPdf?.name || existingPdf?.name || "実験書",
                    ...figureImages.map((f) => f.name),
                    ...tableFiles.map((f) => f.name),
                    ...pastReports.map((f) => f.name),
                  ]}
                  note="ブラウザを閉じても処理は継続します。完了後に自動でレポート画面へ移動します。"
                  onCancel={confirmStopProcessing}
                  cancelLabel="処理を停止"
                />
              </motion.div>
            ) : (
              <div className="space-y-10">
                {!hasPdfSelected ? (
                  /* Phase 1: Initial Uploaders (Main & Past Reports) */
                  <div className="space-y-10">
                    <div className="space-y-6">
                      <div className="text-center space-y-2">
                        <h2 className="text-2xl font-bold text-foreground">ファイルをアップロード</h2>
                        <p className="text-muted-foreground">実験書（必須）、画像、表データをまとめて追加できます</p>
                      </div>

                      <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={cn(
                          "relative border-2 border-dashed rounded-[2rem] transition-all duration-500 py-16 px-8 flex flex-col items-center justify-center gap-6 group overflow-hidden backdrop-blur-md",
                          isDragging
                            ? "border-primary bg-primary/10 scale-[1.01]"
                            : "border-border/70 bg-background/35 hover:border-primary/50 hover:bg-background/50"
                        )}
                      >
                        <div className={cn(
                          "h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary transition-transform duration-500 group-hover:scale-110 shadow-lg shadow-primary/10",
                          isDragging && "animate-bounce"
                        )}>
                          <Upload className="w-8 h-8" />
                        </div>

                        <div className="text-center space-y-1 relative z-10">
                          <p className="text-lg font-bold text-foreground">実験書・画像・表をドロップ</p>
                          <p className="text-xs text-muted-foreground">またはクリックして選択</p>
                        </div>

                        <input
                          id="files-upload-main"
                          type="file"
                          multiple
                          onChange={handleFileSelect}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                          accept=".pdf,application/pdf,image/*,.csv,.json,.xlsx,.xlsm,.docx"
                        />

                        <div className="flex flex-wrap items-center justify-center gap-3 relative z-10">
                          <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground bg-background/50 px-3 py-1 rounded-full border border-border uppercase tracking-widest">
                            <FileCheck className="w-3 h-3 text-emerald-500" />
                            <span>Manual</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground bg-background/50 px-3 py-1 rounded-full border border-border uppercase tracking-widest">
                            <ImageIcon className="w-3 h-3 text-blue-500" />
                            <span>Image</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground bg-background/50 px-3 py-1 rounded-full border border-border uppercase tracking-widest">
                            <TrendingUp className="w-3 h-3 text-purple-500" />
                            <span>Table</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="text-center space-y-2">
                        <h3 className="text-sm font-black text-muted-foreground uppercase tracking-[0.2em]">過去レポートを追加 (任意)</h3>
                        <p className="text-xs text-muted-foreground">AIがあなたの文体や好みを学習するために使用します</p>
                      </div>

                      <div
                        onDragOver={(e) => { e.preventDefault(); setIsPastReportDragging(true); }}
                        onDragLeave={() => setIsPastReportDragging(false)}
                        onDrop={handlePastReportDrop}
                        className={cn(
                          "relative border-2 border-dashed rounded-[2rem] transition-all duration-500 py-12 px-8 flex flex-col items-center justify-center gap-4 group overflow-hidden backdrop-blur-md",
                          isPastReportDragging
                            ? "border-orange-500 bg-orange-500/15 scale-[1.01]"
                            : "border-orange-500/35 bg-background/30 hover:border-orange-500/60 hover:bg-background/45"
                        )}
                      >
                        <div className={cn(
                          "h-12 w-12 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500 transition-transform duration-500 group-hover:scale-110",
                          isPastReportDragging && "animate-bounce"
                        )}>
                          <FileText className="w-6 h-6" />
                        </div>

                        <div className="text-center space-y-1 relative z-10">
                          <p className="text-sm font-bold text-foreground">ここに過去レポートをドロップ</p>
                          <p className="text-[10px] text-muted-foreground">PDF / Word ファイル対応</p>
                        </div>

                        <input
                          id="files-upload-past"
                          type="file"
                          multiple
                          onChange={handlePastReportSelect}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                          accept=".pdf,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Phase 2: PDF Selected - Show Detailed List and Title */
                  <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="space-y-6">
                      <div className="flex items-center justify-between px-2">
                        <h3 className="text-sm font-black text-muted-foreground uppercase tracking-[0.2em]">添付ファイル</h3>
                        <Button variant="ghost" size="sm" onClick={removeFile} className="text-destructive font-bold h-8 hover:bg-destructive/10">
                          <RotateCcw className="w-4 h-4 mr-2" />
                          全てリセット
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 gap-4">
                        {/* Primary Document (PDF/Word) */}
                        <div className="relative group">
                          <Card className="border-primary/30 bg-primary/5 dark:bg-primary/10 overflow-hidden border-2 shadow-sm shadow-primary/10">
                            <CardContent className="p-5 flex items-center gap-5">
                              <div className="h-14 w-14 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/20">
                                {isWordFile(experimentPdf || ({} as File)) ? <FileText className="w-7 h-7" /> : <FileCheck className="w-7 h-7" />}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <p className="text-[10px] font-black text-primary uppercase tracking-widest opacity-80">実験書 (メイン)</p>
                                  <span className="h-1 w-1 rounded-full bg-primary/30" />
                                  <p className="text-[10px] font-bold text-primary/60 uppercase">{formatFileSize(experimentPdf?.size || 0)}</p>
                                </div>
                                <p className="text-lg font-bold text-foreground truncate">{experimentPdf?.name || existingPdf?.name}</p>
                              </div>
                            </CardContent>
                          </Card>
                        </div>

                        {/* Secondary Assets List (Images, Tables & Past Reports) */}
                        {(figureImages.length > 0 || tableFiles.length > 0 || pastReports.length > 0 || pastedTables.length > 0) && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {/* Images */}
                            {figureImages.map((file, idx) => (
                              <Card key={`img-${idx}`} className="border-border bg-card/50 hover:bg-card transition-colors group">
                                <CardContent className="p-3 flex items-center gap-3">
                                  <div className="h-10 w-10 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
                                    <ImageIcon className="w-5 h-5" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">画像 {idx + 1}</p>
                                    <p className="text-sm font-semibold text-foreground truncate">{file.name}</p>
                                  </div>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={() => removeImage(idx)}
                                  >
                                    <X className="w-4 h-4" />
                                  </Button>
                                </CardContent>
                              </Card>
                            ))}

                            {/* Table Files */}
                            {tableFiles.map((file, idx) => (
                              <Card key={`table-${idx}`} className="border-border bg-card/50 hover:bg-card transition-colors group">
                                <CardContent className="p-3 flex items-center gap-3">
                                  <div className="h-10 w-10 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center">
                                    <TrendingUp className="w-5 h-5" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">表データ</p>
                                    <p className="text-sm font-semibold text-foreground truncate">{file.name}</p>
                                  </div>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={() => removeTableFile(idx)}
                                  >
                                    <X className="w-4 h-4" />
                                  </Button>
                                </CardContent>
                              </Card>
                            ))}

                            {/* Past Reports */}
                            {pastReports.map((file, idx) => (
                              <Card key={`past-${idx}`} className="border-border bg-card/50 hover:bg-card transition-colors group">
                                <CardContent className="p-3 flex items-center gap-3">
                                  <div className="h-10 w-10 rounded-lg bg-orange-500/10 text-orange-500 flex items-center justify-center">
                                    <FileText className="w-5 h-5" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">過去レポート</p>
                                    <p className="text-sm font-semibold text-foreground truncate">{file.name}</p>
                                  </div>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={() => removePastReport(idx)}
                                  >
                                    <X className="w-4 h-4" />
                                  </Button>
                                </CardContent>
                              </Card>
                            ))}

                            {/* Pasted Tables */}
                            {pastedTables.map((table, idx) => (
                              <Card key={`pasted-${idx}`} className="border-border bg-card/50 hover:bg-card transition-colors group">
                                <CardContent className="p-3 flex items-center gap-3">
                                  <div className="h-10 w-10 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                                    <Plus className="w-5 h-5" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">貼り付け表 {idx + 1}</p>
                                    <p className="text-sm font-semibold text-foreground truncate">{table.rows.length}行のデータ</p>
                                  </div>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={() => removeTable(table.id)}
                                  >
                                    <X className="w-4 h-4" />
                                  </Button>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        )}

                        {/* Add More Files Interactions */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* Add More Assets (Images/Tables) */}
                          <div className="relative group">
                            <input
                              id="add-more-assets"
                              type="file"
                              multiple
                              onChange={handleFileSelect}
                              className="sr-only"
                              accept="image/*,.csv,.json,.xlsx,.xlsm"
                            />
                            <label htmlFor="add-more-assets">
                              <div className="flex items-center justify-center gap-3 p-4 h-full rounded-2xl border-2 border-dashed border-border bg-muted/20 hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer group">
                                <Plus className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                                <span className="text-sm font-bold text-muted-foreground group-hover:text-primary transition-colors">画像や表を追加</span>
                              </div>
                            </label>
                          </div>

                          {/* Add More Past Reports */}
                          <div className="relative group">
                            <input
                              id="add-more-past"
                              type="file"
                              multiple
                              onChange={handlePastReportSelect}
                              className="sr-only"
                              accept=".pdf,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                            />
                            <label htmlFor="add-more-past">
                              <div className="flex items-center justify-center gap-3 p-4 h-full rounded-2xl border-2 border-dashed border-orange-500/20 bg-orange-500/5 hover:border-orange-500/50 hover:bg-orange-500/10 transition-all cursor-pointer group">
                                <FileText className="w-5 h-5 text-orange-500/50 group-hover:text-orange-500 transition-colors" />
                                <span className="text-sm font-bold text-orange-500/70 group-hover:text-orange-500 transition-colors">過去レポートを追加</span>
                              </div>
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center gap-2 px-2">
                        <FileText className="w-4 h-4 text-primary" />
                        <Label htmlFor="title-simple" className="text-sm font-black text-muted-foreground uppercase tracking-[0.2em]">
                          レポートタイトル
                        </Label>
                      </div>
                      <Input
                        id="title-simple"
                        value={reportTitle}
                        onChange={(e) => setReportTitle(e.target.value)}
                        placeholder="例: 理科実験レポート 第1回"
                        className="h-16 text-xl font-bold border-2 focus-visible:ring-primary/20 transition-all rounded-2xl px-6 bg-card"
                      />
                    </div>

                    <div className="pt-10">
                      <Button
                        onClick={handleSubmit}
                        disabled={isUploading || !reportTitle}
                        className="w-full h-20 text-2xl font-black bg-primary text-primary-foreground hover:bg-primary/90 rounded-[2rem] shadow-2xl shadow-primary/30 transition-all active:scale-[0.98] group"
                      >
                        {isUploading ? (
                          <div className="flex items-center gap-4">
                            <Loader2 className="w-8 h-8 animate-spin" />
                            <span>アップロード中...</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-4">
                            <span>レポートを作成開始</span>
                            <ArrowRight className="w-8 h-8 group-hover:translate-x-2 transition-transform" />
                          </div>
                        )}
                      </Button>
                      <p className="text-center text-xs font-bold text-muted-foreground mt-6 uppercase tracking-widest opacity-60">
                        Analysis & Generation will start automatically
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      </div>
    </DashboardPageShell>
  )
}
