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
} from "lucide-react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Progress } from "@/components/ui/progress"
import { createClient } from "@/lib/supabase/client"
import { ReportProcessingSteps, type ProcessingStep as ProcessingStatusStep } from "@/components/report-processing-steps"


type ProcessingStep = {
  label: string
  duration: number
}

const STEP_LABEL: Record<string, string> = {
  ingest: "準備",
  pdf_parse: "PDF解析",
  pdf_sections: "章見出し検出",
  discussion_extract: "考察抽出",
  method_extract: "実験抽出",
  unit_init: "実験ユニット生成",
  image_analyze: "画像解析",
  image_assign: "画像割当",
  table_parse: "表解析",
  table_assign: "表割当",
  discussion: "考察生成",
  summary: "まとめ生成",
  references: "参考文献",
  validate: "検証",
  render_docx: "DOCX生成",
}

const PROCESSING_STEPS: ProcessingStep[] = [
  { label: "実験方法を抽出中...", duration: 1200 },
  { label: "構造を把握中...", duration: 1200 },
  { label: "詳細情報を追加中...", duration: 1200 },
  { label: "図表のキャプションを決定中...", duration: 1200 },
  { label: "実験の説明文を生成中...", duration: 1200 },
  { label: "まとめを作成中...", duration: 1200 },
  { label: "考察を作成中...", duration: 1200 },
]

const PROCESSING_STORAGE_KEY = "reportlab:processing-state"
const PROCESSING_TOTAL_DURATION = PROCESSING_STEPS.reduce((sum, step) => sum + step.duration, 0)

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
    className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 shadow-sm"
  >
    <CheckCircle2 className="h-3.5 w-3.5" />
    {label}
  </motion.span>
)

type ProcessingState = {
  reportId: string
  startedAt: number
  destination?: "edit"
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
      if (parsed.destination && parsed.destination !== "edit") {
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
  const [isImageDragging, setIsImageDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingDialogOpen, setProcessingDialogOpen] = useState(false)
  const [error, setError] = useState<string>("")
  const [processingStart, setProcessingStart] = useState<number | null>(null)
  const [processingReportId, setProcessingReportId] = useState<string | null>(null)
  const [processingDestination, setProcessingDestination] = useState<"edit">("edit")
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

  const processingDetailSteps = useMemo<ProcessingStatusStep[]>(() => {
    const deriveStatus = (targetIndex: number): ProcessingStatusStep["status"] => {
      if (!isProcessing) return "pending"
      if (currentStep > targetIndex) return "done"
      if (currentStep === targetIndex) return "active"
      return "pending"
    }

    const steps: ProcessingStatusStep[] = [
      {
        key: "upload",
        label: "ファイルを保存",
        description: "PDFや画像、表データをクラウドにアップロードしています。",
        status: deriveStatus(0),
      },
      {
        key: "text",
        label: "実験方法の抽出・構造化",
        description: "PDFから実験方法を抽出し、章節構造と実験項目を整理しています。",
        status: deriveStatus(1),
      },
    ]

    if (hasFigureUploads) {
      steps.push({
        key: "image",
        label: "画像解析と実験ひも付け",
        description: "アップロードされた図表を解析し、該当する実験に割り当てています。",
        status: deriveStatus(2),
      })
    }

    steps.push({
      key: "prepare",
      label: "編集用データを作成",
      description:
        "抽出結果を保存し、編集画面で確認・修正してから生成できる状態にしています。",
      status: deriveStatus(hasFigureUploads ? 3 : 2),
    })

    return steps
  }, [currentStep, hasFigureUploads, isProcessing])

  const confirmStopProcessing = () => {
    const ok = window.confirm("レポート作成の処理を停止しますか？\n（途中までの生成結果は破棄される可能性があります）")
    if (!ok) return
    stopProcessing()
  }

  const stopProcessing = () => {
    const reportId = processingReportId || resumeReportId
    const cancel = async () => {
      if (!reportId) return
      try {
        const supabase = createClient()
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!session) return

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
      } finally {
        clearProcessingState()
        setIsProcessing(false)
        setProcessingDialogOpen(false)
        setProcessingReportId(null)
        setProcessingStart(null)
        setProgress(0)
        setCurrentStep(0)
        setAgentProgress(null)
        setAgentProgressError("")
        setShowAgentDetails(false)
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

  useEffect(() => {
    const restored = restoreProcessingState()
    if (!restored) return
    if (!resumeReportId) {
      const params = new URLSearchParams(searchParams.toString())
      params.set("reportId", restored.reportId)
      router.replace(`?${params.toString()}`)
    }
    setProcessingReportId(restored.reportId)
    setProcessingStart(restored.startedAt)
    setProcessingDestination(restored.destination ?? "edit")
    setIsProcessing(true)
    setCurrentStep(0)
    setProgress(0)
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
          const pdf = files.find((f) => f.file_type === "word" || (f.file_name || "").toLowerCase().endsWith(".pdf"))
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
  }, [isProcessing, processingReportId])

  const agentDetails = useMemo(() => {
    if (!agentProgress) return null
    const updatedAt = agentProgress.updated_at ? new Date(agentProgress.updated_at).toLocaleString() : ""
    const last = agentProgress.last_step ? `${STEP_LABEL[agentProgress.last_step] || agentProgress.last_step}` : "—"
    const stats = agentProgress.stats || {}
    const methodText = agentProgress.previews?.method_text || ""
    const prompts = agentProgress.previews?.prompts || []
    const methodTree = agentProgress.previews?.method_tree || []

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

        <div className="flex flex-wrap gap-2 text-xs">
          {typeof stats?.experiments_count === "number" ? <span>実験: {stats.experiments_count}</span> : null}
          {typeof stats?.images_count === "number" ? <span>画像: {stats.images_count}</span> : null}
          {typeof stats?.tables_count === "number" ? <span>表: {stats.tables_count}</span> : null}
          {typeof stats?.prompts_count === "number" ? <span>考察: {stats.prompts_count}</span> : null}
        </div>

        {showAgentDetails ? (
          <div className="space-y-2">
            {methodTree?.length ? (
              <div>
                <div className="font-semibold text-foreground mb-1">抽出した実験候補（先頭）</div>
                <ul className="list-disc pl-5 space-y-0.5">
                  {methodTree.map((m: string) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {prompts?.length ? (
              <div>
                <div className="font-semibold text-foreground mb-1">抽出した考察課題（先頭）</div>
                <ul className="list-disc pl-5 space-y-0.5">
                  {prompts.map((p: string) => (
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
          </div>
        ) : null}
      </div>
    )
  }, [agentProgress, agentProgressError, showAgentDetails])

  useEffect(() => {
    if (!processingStart || !processingReportId) return

    let timer: number
    const tick = () => {
      const elapsed = Date.now() - processingStart
      const clampedElapsed = Math.min(elapsed, PROCESSING_TOTAL_DURATION)
      const progressValue = Math.min((clampedElapsed / PROCESSING_TOTAL_DURATION) * 100, 100)
      setProgress(progressValue)

      let cumulative = 0
      let stepIndex = PROCESSING_STEPS.length - 1
      for (let i = 0; i < PROCESSING_STEPS.length; i += 1) {
        cumulative += PROCESSING_STEPS[i].duration
        if (clampedElapsed <= cumulative) {
          stepIndex = i
          break
        }
      }
      setCurrentStep(stepIndex)

      if (elapsed >= PROCESSING_TOTAL_DURATION) {
        clearProcessingState()
        router.push(`/dashboard/reports/${processingReportId}/${processingDestination}`)
        return
      }

      timer = window.setTimeout(tick, 100)
    }

    tick()
    return () => {
      window.clearTimeout(timer)
    }
  }, [processingDestination, processingStart, processingReportId, router])

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

    for (const file of files) {
      if (isPdfFile(file)) {
        if (!experimentPdf) {
          setExperimentPdf(file)
          setExistingPdf(null)
          if (!reportTitle) {
            setReportTitle(file.name.replace(/\.pdf$/i, ""))
          }
          addedPdf = true
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
    if (addedPdf) labels.push("PDF")
    if (addedImages) labels.push(`画像${addedImages}`)
    if (addedTables) labels.push(`表${addedTables}`)
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
    setProgress(0)
    setCurrentStep(0)

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
      setCurrentStep(0)
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
        setCurrentStep(1)
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

        setCurrentStep(2)
        const { error: fileInsertError } = await supabase.from("experiment_data").insert([
          {
            report_id: reportId,
            file_name: experimentPdf.name,
            file_type: "word", // PDFでもドキュメントとして扱う
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

      // 4) Dify を使うバックエンドの生成APIを呼び出し（Authorization: Bearer <token>）
      setCurrentStep(hasFigureUploads ? 3 : 2)
      const token = session.access_token
      const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || ""
      const destination: ProcessingState["destination"] = "edit"
      setProcessingDestination("edit")

      const endpoint = `${baseUrl}/api/reports/prepare`
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
      setProcessingStart(startedAt)
      setIsProcessing(true)
      setCurrentStep(0)
      setProgress(0)
      persistProcessingState({ reportId, startedAt, destination })
      return
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      debugUpload("handleSubmit:failed", { error: message, detail: e })
      clearProcessingState()
      setProcessingReportId(null)
      setProcessingStart(null)
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
    <div className="p-6 max-w-4xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
	        transition={{ duration: 0.5 }}
	        className="mb-8"
	      >
	        <h1 className="text-3xl font-bold text-foreground mb-2">新規レポート作成</h1>
	        <p className="text-muted-foreground" suppressHydrationWarning>
	          実験書PDFをアップロードして、編集用データを作成します
	        </p>
	        {error && (
	          <p className="mt-2 text-sm text-red-600">{error}</p>
	        )}
	      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <Card className="border-2">
          <CardContent className="p-8">
	            {isProcessing ? (
	              <motion.div
	                initial={{ opacity: 0 }}
	                animate={{ opacity: 1 }}
	                transition={{ duration: 0.3 }}
	                className="space-y-6"
	              >
	                <ReportProcessingSteps
	                  open={processingDialogOpen}
	                  onOpenChange={setProcessingDialogOpen}
	                  title={agentProgress ? "AIがレポートを作成中です" : "AIが処理中です"}
	                  headerStatusLabel={agentProgress ? "進行中" : "処理中"}
	                  steps={processingDetailSteps}
	                  details={agentDetails}
	                  footerNote="ブラウザを閉じても生成は続きます。完了後エディタへ移動します。"
	                  onCancel={confirmStopProcessing}
	                  cancelLabel="キャンセル"
	                />
	                <div className="text-center space-y-4">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
                    className="inline-block"
                  >
                    <Loader2 className="w-16 h-16 text-primary" />
                  </motion.div>
                  <h2 className="text-2xl font-bold text-foreground">レポートを生成中...</h2>
	                  <p className="text-muted-foreground">AIが実験データを解析しています</p>
	                  {!processingDialogOpen ? (
	                    <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
	                      <Button variant="outline" size="sm" onClick={() => setProcessingDialogOpen(true)}>
	                        処理状況を表示
	                      </Button>
	                      <Button variant="destructive" size="sm" onClick={confirmStopProcessing}>
	                        強制停止
	                      </Button>
	                    </div>
	                  ) : null}
	                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">進捗状況</span>
                    <span className="text-lg font-bold text-primary">{Math.round(progress)}%</span>
                  </div>

                  <Progress value={progress} className="h-3" />

                  <motion.div
                    key={currentStep}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3 }}
                    className="flex items-center space-x-3 p-4 bg-primary/10 border border-primary/30 rounded-lg"
                  >
                    <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                    <p className="text-sm font-medium text-foreground">{PROCESSING_STEPS[currentStep]?.label}</p>
                  </motion.div>

                  <div className="grid grid-cols-2 gap-3 pt-4">
                    {PROCESSING_STEPS.map((step, index) => (
                      <div
                        key={index}
                        className={`flex items-center space-x-2 text-xs ${index < currentStep
                          ? "text-primary"
                          : index === currentStep
                            ? "text-foreground font-semibold"
                            : "text-muted-foreground"
                          }`}
                      >
                        {index < currentStep ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : index === currentStep ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <div className="w-4 h-4 rounded-full border-2 border-muted" />
                        )}
                        <span className="truncate">{step.label.replace(/中\.\.\.$/, "")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="space-y-6">
                {/* Workflow Selection moved to bottom */}

                <div className="space-y-2">
                  <Label htmlFor="files-upload" className="text-base font-semibold text-card-foreground">
                    ファイルを追加（アップローダーは1つ）
                  </Label>
                  <input
                    id="files-upload"
                    type="file"
                    multiple
                    onChange={handleFileSelect}
                    className="sr-only"
                    accept=".pdf,application/pdf,image/*,.csv,.json,.xlsx,.xlsm,text/csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  />
                  <p className="text-sm text-muted-foreground mb-3">
                    実験書PDFは必須です。画像・表（CSV/JSON/XLSX）・過去レポート（DOCX）は任意で追加できます。
                  </p>

                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-lg transition-all duration-300 text-center py-6 px-4 mx-1 my-0 bg-card ${
                      isDragging ? "border-primary bg-primary/10 scale-[1.02]" : "border-border bg-muted/30 hover:bg-muted/50"
                    }`}
                  >
                    <motion.div initial={{ scale: 1 }} animate={{ scale: isDragging ? 1.05 : 1 }} transition={{ duration: 0.2 }}>
                      <Upload className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                    </motion.div>
                    <p className="text-lg text-card-foreground mb-2 font-semibold">ここにまとめてドラッグ&ドロップ</p>
                    <p className="text-sm text-muted-foreground mb-3">または</p>
                    <label htmlFor="files-upload">
                      <Button variant="outline" className="cursor-pointer bg-transparent hover:bg-primary/10" asChild>
                        <span>
                          <FileText className="mr-2 w-4 h-4" />
                          ファイルを選択
                        </span>
                      </Button>
                    </label>
                    <p className="text-xs text-muted-foreground mt-3">対応: PDF / 画像 / CSV / JSON / XLSX</p>
                    {!canUploadPaidAssets ? (
                      <p className="text-xs text-muted-foreground">※ 画像/表は有料プラン限定です（PDFは利用可能）</p>
                    ) : null}
                  </div>

                  <div className="space-y-3 pt-3">
                    <div className="rounded-lg border bg-muted/20 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-card-foreground">
                            実験書PDF <span className="text-destructive">*</span>
                          </p>
                          <p className="text-xs text-muted-foreground break-all">
                            {experimentPdf?.name || existingPdf?.name || "未選択"}
                          </p>
                        </div>
                        {experimentPdf || existingPdf ? (
                          <Button variant="ghost" size="sm" onClick={removeFile} className="text-destructive hover:bg-destructive/10">
                            外す
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    <div className="rounded-lg border bg-muted/20 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-card-foreground">追加ファイル（任意）</p>
                          <p className="text-xs text-muted-foreground">
                            画像: {figureImages.length}
                            {existingImages.length ? `（既存 ${existingImages.length}）` : ""} / 表: {tableFiles.length}
                            {existingTables.length ? `（既存 ${existingTables.length}）` : ""}
                            {excelTableFiles.length ? ` / Excel画像(プレビュー): ${excelImagePreviews.length}` : ""}
                          </p>
                          {lastAddedFilesLabel ? <CompletionBadge label={lastAddedFilesLabel} /> : null}
                        </div>
                      </div>

                      {tableFiles.length > 0 ? (
                        <div className="mt-3 space-y-1">
                          <p className="text-xs font-semibold text-muted-foreground">追加した表ファイル</p>
                          <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-0.5">
                            {tableFiles.map((f, idx) => (
                              <li key={`${f.name}-${idx}`} className="flex items-center justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="break-all">{f.name}</div>
                                  {isExcelTableFile(f) ? (
                                    <div className="mt-1 flex items-center gap-2">
                                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">抽出シート</span>
                                      {excelSheetNamesBySourceKey[excelSourceKey(f)]?.length ? (
                                        <select
                                          className="h-7 rounded border bg-background px-2 text-[11px] text-foreground"
                                          value={excelSelectedSheetBySourceKey[excelSourceKey(f)] || ""}
                                          onChange={(e) =>
                                            setExcelSelectedSheetBySourceKey((prev) => ({
                                              ...prev,
                                              [excelSourceKey(f)]: e.target.value,
                                            }))
                                          }
                                        >
                                          {excelSheetNamesBySourceKey[excelSourceKey(f)].map((name) => (
                                            <option key={name} value={name}>
                                              {name}
                                            </option>
                                          ))}
                                        </select>
                                      ) : (
                                        <input
                                          className="h-7 w-40 rounded border bg-background px-2 text-[11px] text-foreground"
                                          placeholder="例: Sheet1"
                                          value={excelSelectedSheetBySourceKey[excelSourceKey(f)] || ""}
                                          onChange={(e) =>
                                            setExcelSelectedSheetBySourceKey((prev) => ({
                                              ...prev,
                                              [excelSourceKey(f)]: e.target.value,
                                            }))
                                          }
                                        />
                                      )}
                                      <span className="text-[10px] text-muted-foreground">（このシートから表を自動抽出）</span>
                                    </div>
                                  ) : null}
                                </div>
                                <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => removeTableFile(idx)}>
                                  削除
                                </Button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="space-y-3 relative">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold text-card-foreground">Excel表を貼り付け（任意）</Label>
                    <div className="flex items-center gap-2">
                      {hasUploadedTables && <CompletionBadge label="表を追加済み" />}
                      {subscriptionPlan !== "premium" && subscriptionPlan !== "standard" && (
                        <div className="flex items-center text-amber-500 text-xs font-semibold">
                          <Lock className="w-3 h-3 mr-1" />
                          Paid Plan
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    コピーした表を貼り付けると参照用データとして保存されます。CSV/JSON/XLSXファイルは上のアップローダーから追加できます。
                  </p>

                  {subscriptionPlan === "premium" || subscriptionPlan === "standard" ? (
                    <>
                      <div className="flex items-start gap-2">
                        <textarea
                          id="table-paste-area"
                          className="w-full rounded-md border px-3 py-2 text-sm"
                          rows={4}
                          placeholder="ここに Ctrl/Cmd+V で貼り付け"
                          onPaste={handleTablePaste}
                        />
                        {lastAddedTableId && (
                          <CompletionBadge label={`表 ${pastedTables.length} を追加しました`} />
                        )}
                      </div>
                      {pastedTables.length > 0 ? (
                        <div className="space-y-3">
                          {pastedTables.map((table, idx) => (
                            <motion.div
                              key={table.id}
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.18, delay: Math.min(idx * 0.02, 0.2) }}
                              className={`overflow-x-auto rounded-md border bg-muted/30 transition-colors ${lastAddedTableId === table.id ? "border-emerald-200 bg-emerald-50/80 shadow-sm" : ""
                                }`}
                            >
                              <div className="flex items-center justify-between border-b px-3 py-2 text-sm font-semibold">
                                <span>
                                  表 {idx + 1}（{table.rows.length} 行）
                                </span>
                                <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => removeTable(table.id)}>
                                  削除
                                </Button>
                              </div>
                              <table className="w-full border-collapse text-sm">
                                <tbody>
                                  {table.rows.slice(0, 6).map((row, rowIndex) => (
                                    <tr key={rowIndex} className="divide-x border-b last:border-b-0">
                                      {row.map((cell, cellIndex) => (
                                        <td key={cellIndex} className="px-2 py-1">
                                          {cell || <span className="text-muted-foreground">（空）</span>}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              {table.rows.length > 6 && (
                                <p className="px-2 py-1 text-xs text-muted-foreground">先頭6行を表示しています。全 {table.rows.length} 行。</p>
                              )}
                            </motion.div>
                          ))}
                          <Button variant="outline" size="sm" onClick={clearTables}>
                            すべてクリア
                          </Button>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">ここに貼り付けると表データとして保存します。</p>
                      )}
                      {existingTables.length > 0 && (
                        <div className="text-xs text-muted-foreground">
                          既存の表: {existingTables.map((t) => t.name).join(", ")}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="relative rounded-md border border-dashed p-6 bg-muted/30 flex flex-col items-center justify-center text-center space-y-3">
                      <Lock className="w-8 h-8 text-muted-foreground" />
                      <div>
                        <p className="font-semibold text-foreground">この機能は有料プラン限定です</p>
                        <p className="text-sm text-muted-foreground mt-1">Excelの表データを直接貼り付けて、レポートの参照データとして利用できます。</p>
                      </div>
                      <Button variant="default" size="sm" onClick={() => router.push("/dashboard/settings?tab=subscription")}>
                        有料プランにアップグレード
                      </Button>
                    </div>
                  )}
                </div>

                <div className="space-y-2 relative">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold text-card-foreground">
                      実験結果の画像（任意）
                    </Label>
                    <div className="flex items-center gap-2">
                      {hasUploadedImages && <CompletionBadge label="画像を追加済み" />}
                      {subscriptionPlan !== "premium" && subscriptionPlan !== "standard" && (
                        <div className="flex items-center text-amber-500 text-xs font-semibold">
                          <Lock className="w-3 h-3 mr-1" />
                          Paid Plan
                        </div>
                      )}
                    </div>
                  </div>

                  {subscriptionPlan === "premium" || subscriptionPlan === "standard" ? (
                    <>
                      <p className="text-sm text-muted-foreground">
                        画像は上のアップローダーで追加できます（複数可）。追加した順番でレポートに挿入されます（後から並べ替え可能）。
                      </p>
                      <div className="flex items-center gap-2">
                        <label htmlFor="files-upload">
                          <Button variant="outline" size="sm" className="cursor-pointer bg-transparent hover:bg-primary/10" asChild>
                            <span>画像を追加</span>
                          </Button>
                        </label>
                        {lastAddedImageLabel ? <CompletionBadge label={lastAddedImageLabel} /> : null}
                      </div>

                      {excelTableFiles.length > 0 ? (
                        <div className="mt-3 space-y-2 rounded-md border bg-muted/10 p-3">
                          <p className="text-xs font-semibold text-muted-foreground">Excelから抽出される画像（プレビュー）</p>
                          <p className="text-xs text-muted-foreground">
                            アップロードしたExcel内の埋め込み画像は送信後に自動抽出されます。ここで事前に確認できます（クリックで拡大）。
                          </p>
                          <div className="space-y-3">
                            {excelTableFiles.map((file, idx) => {
                              const key = excelSourceKey(file)
                              const previews = excelPreviewsBySourceKey.get(key) || []
                              const isLoading = Boolean(excelExtracting[key])
                              const errorText = excelExtractErrors[key]
                              const meta = excelZipMetaBySourceKey[key]
                              return (
                                <div key={`${key}:${idx}`} className="rounded-md border bg-background p-3">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="space-y-1">
                                      <p className="text-xs font-semibold text-foreground break-all">{file.name}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {isLoading ? (
                                          <span className="inline-flex items-center gap-1">
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                            抽出中...
                                          </span>
                                        ) : (
                                          `${previews.length} 枚`
                                        )}
                                      </p>
                                      {meta ? (
                                        <p className="text-[10px] text-muted-foreground">
                                          検出: media={meta.media_count} / embeddings={meta.embeddings_image_count} / charts={meta.charts_count}
                                        </p>
                                      ) : null}
                                      {errorText ? (
                                        <p className="text-xs text-destructive break-all">抽出に失敗しました: {errorText}</p>
                                      ) : null}
                                    </div>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      disabled={isLoading}
                                      onClick={() => {
                                        processedExcelPreviewKeysRef.current.delete(key)
                                        void extractExcelImagePreviews(file)
                                      }}
                                    >
                                      再抽出
                                    </Button>
                                  </div>

                                  {previews.length > 0 ? (
                                    <div className="mt-2 grid grid-cols-4 gap-2">
                                      {previews.slice(0, 8).map((p) => (
                                        <a
                                          key={p.id}
                                          href={p.url}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="block rounded border bg-muted/20 hover:bg-muted/30"
                                        >
                                          {isBrowserRenderablePreview(p) ? (
                                            <img
                                              src={p.url}
                                              alt={p.fileName}
                                              className="h-16 w-full object-contain p-1"
                                              loading="lazy"
                                            />
                                          ) : (
                                            <div className="h-16 w-full p-1 flex items-center justify-center">
                                              <div className="w-full h-full rounded bg-muted/40 flex flex-col items-center justify-center">
                                                <span className="text-[10px] font-semibold text-muted-foreground">
                                                  {(getFileExtension(p.fileName) || "file").toUpperCase()}
                                                </span>
                                                <span className="text-[10px] text-muted-foreground">クリックで開く</span>
                                              </div>
                                            </div>
                                          )}
                                        </a>
                                      ))}
                                    </div>
                                  ) : null}
                                  {previews.length > 8 ? (
                                    <p className="mt-2 text-xs text-muted-foreground">※ プレビューは最大 8 枚まで表示します</p>
                                  ) : null}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ) : null}

                      {figureImages.length > 0 && (
                        <div className="space-y-3">
                          <p className="text-xs text-muted-foreground">
                            下のリストの順番通りにレポートへ図が挿入されます。上下ボタンで並べ替え、×で削除できます。
                          </p>
                          <div className="space-y-2">
                            {figureImages.map((file, index) => (
                              <motion.div
                                key={`${file.name}-${index}-${file.size}`}
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.2 }}
                                className={`flex items-center justify-between p-4 border rounded-lg bg-card/80 transition-colors ${lastAddedImageIndex === index ? "border-emerald-200 bg-emerald-50/80 shadow-sm" : ""}`}
                              >
                                <div className="flex items-center space-x-3 w-full">
                                  <div className="relative h-16 w-20 overflow-hidden rounded-md bg-muted border">
                                    {imagePreviews[index] ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={imagePreviews[index]} alt={file.name} className="h-full w-full object-cover" />
                                    ) : (
                                      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                                        <ImageIcon className="w-5 h-5" />
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-foreground break-all">{file.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                      図{index + 1}・{formatFileSize(file.size)}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    disabled={index === 0}
                                    onClick={() => moveImage(index, "up")}
                                    aria-label="ひとつ上に移動"
                                  >
                                    <ArrowUp className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    disabled={index === figureImages.length - 1}
                                    onClick={() => moveImage(index, "down")}
                                    aria-label="ひとつ下に移動"
                                  >
                                    <ArrowDown className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => removeImage(index)}
                                    aria-label="削除"
                                  >
                                    <X className="w-4 h-4" />
                                  </Button>
                                </div>
                              </motion.div>
                            ))}
                          </div>
                        </div>
                      )}
                      {figureImages.length === 0 && existingImages.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          既存の画像: {existingImages.map((img) => img.name).join(", ")}
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="relative rounded-md border border-dashed p-6 bg-muted/30 flex flex-col items-center justify-center text-center space-y-3">
                        <Lock className="w-8 h-8 text-muted-foreground" />
                        <div>
                          <p className="font-semibold text-foreground">この機能はPremiumプラン限定です</p>
                          <p className="text-sm text-muted-foreground mt-1">実験結果の画像をアップロードして、レポート内に自動挿入できます。</p>
                        </div>
                        <Button variant="default" size="sm" onClick={() => router.push("/dashboard/settings?tab=subscription")}>
                          Premiumにアップグレード
                        </Button>
                      </div>

                      {excelTableFiles.length > 0 ? (
                        <div className="mt-3 space-y-2 rounded-md border bg-muted/10 p-3">
                          <p className="text-xs font-semibold text-muted-foreground">Excelから抽出される画像（プレビュー）</p>
                          <p className="text-xs text-muted-foreground">
                            手動の画像アップロードは有料プラン限定ですが、Excel内の画像プレビューはここで確認できます。
                          </p>
                          <div className="space-y-3">
                            {excelTableFiles.map((file, idx) => {
                              const key = excelSourceKey(file)
                              const previews = excelPreviewsBySourceKey.get(key) || []
                              const isLoading = Boolean(excelExtracting[key])
                              const errorText = excelExtractErrors[key]
                              const meta = excelZipMetaBySourceKey[key]
                              return (
                                <div key={`${key}:${idx}`} className="rounded-md border bg-background p-3">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="space-y-1">
                                      <p className="text-xs font-semibold text-foreground break-all">{file.name}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {isLoading ? (
                                          <span className="inline-flex items-center gap-1">
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                            抽出中...
                                          </span>
                                        ) : (
                                          `${previews.length} 枚`
                                        )}
                                      </p>
                                      {meta ? (
                                        <p className="text-[10px] text-muted-foreground">
                                          検出: media={meta.media_count} / embeddings={meta.embeddings_image_count} / charts={meta.charts_count}
                                        </p>
                                      ) : null}
                                      {errorText ? (
                                        <p className="text-xs text-destructive break-all">抽出に失敗しました: {errorText}</p>
                                      ) : null}
                                    </div>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      disabled={isLoading}
                                      onClick={() => {
                                        processedExcelPreviewKeysRef.current.delete(key)
                                        void extractExcelImagePreviews(file)
                                      }}
                                    >
                                      再抽出
                                    </Button>
                                  </div>

                                  {previews.length > 0 ? (
                                    <div className="mt-2 grid grid-cols-4 gap-2">
                                      {previews.slice(0, 8).map((p) => (
                                        <a
                                          key={p.id}
                                          href={p.url}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="block rounded border bg-muted/20 hover:bg-muted/30"
                                        >
                                          {isBrowserRenderablePreview(p) ? (
                                            <img
                                              src={p.url}
                                              alt={p.fileName}
                                              className="h-16 w-full object-contain p-1"
                                              loading="lazy"
                                            />
                                          ) : (
                                            <div className="h-16 w-full p-1 flex items-center justify-center">
                                              <div className="w-full h-full rounded bg-muted/40 flex flex-col items-center justify-center">
                                                <span className="text-[10px] font-semibold text-muted-foreground">
                                                  {(getFileExtension(p.fileName) || "file").toUpperCase()}
                                                </span>
                                                <span className="text-[10px] text-muted-foreground">クリックで開く</span>
                                              </div>
                                            </div>
                                          )}
                                        </a>
                                      ))}
                                    </div>
                                  ) : null}
                                  {previews.length > 8 ? (
                                    <p className="mt-2 text-xs text-muted-foreground">※ プレビューは最大 8 枚まで表示します</p>
                                  ) : null}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>

                {hasPdfSelected && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-2"
                  >
                    <Label htmlFor="title" className="text-base font-semibold text-card-foreground">
                      レポートタイトル <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="title"
                      value={reportTitle}
                      onChange={(e) => setReportTitle(e.target.value)}
                      placeholder="例: 電気回路実験レポート"
                      className="h-12 text-base"
                    />
                  </motion.div>
                )}

                {/* 生成ワークフロー選択（通常/最適化/過去レポ再現）は廃止 */}

                {hasPdfSelected && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.2 }}
                    className="pt-4 border-t border-border"
                  >
                    <Button
                      onClick={handleSubmit}
                      disabled={isUploading}
                      className="w-full px-8 py-6 text-base font-semibold"
                      size="lg"
                      style={{
                        boxShadow: "0 0 20px rgba(94, 234, 212, 0.4)",
                      }}
                    >
                      {isUploading ? (
                        <>
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
                            className="mr-2"
                          >
                            <Upload className="w-5 h-5" />
                          </motion.div>
                          アップロード中...
                        </>
                      ) : (
                        <>
                          レポートを作成
                          <ArrowRight className="ml-2 w-5 h-5" />
                        </>
                      )}
                    </Button>
                  </motion.div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {isProcessing && !processingDialogOpen && (
        <div className="fixed bottom-6 right-6 z-40">
          <Button variant="default" className="shadow-lg" onClick={() => setProcessingDialogOpen(true)}>
            処理状況を表示
          </Button>
        </div>
      )}
    </div>
  )
}
