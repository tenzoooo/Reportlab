"use client"

import type React from "react"

import { useEffect, useState } from "react"
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
  ImagePlus,
  Image as ImageIcon,
  ArrowUp,
  ArrowDown,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Progress } from "@/components/ui/progress"
import { createClient } from "@/lib/supabase/client"

type ProcessingStep = {
  label: string
  duration: number
}

const PROCESSING_STEPS: ProcessingStep[] = [
  { label: "PDFファイルをアップロード中...", duration: 1000 },
  { label: "実験データを解析中...", duration: 2000 },
  { label: "統計処理を実行中...", duration: 2000 },
  { label: "グラフを生成中...", duration: 1500 },
  { label: "レポート本文を作成中...", duration: 2000 },
  { label: "参考文献を検索中...", duration: 1500 },
  { label: "最終チェック中...", duration: 1000 },
]

const generateSafeStoragePath = (
  userId: string,
  reportId: string,
  originalName: string,
  fallbackExt = "pdf"
) => {
  const normalizedFallback = fallbackExt.replace(/[^a-z0-9]/gi, "").toLowerCase() || "dat"
  const [, extMatch] = originalName.toLowerCase().match(/\.([a-z0-9]+)$/) ?? []
  const fileExt = extMatch || normalizedFallback
  const uniqueId = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Math.random().toString(36).slice(2)
  return `${userId}/${reportId}/${uniqueId}.${fileExt}`
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

const isPdfFile = (file: File) => file.type === "application/pdf" || getFileExtension(file.name) === "pdf"

const isImageFile = (file: File) => {
  if (file.type && file.type.startsWith("image/")) return true
  const ext = getFileExtension(file.name)
  return Boolean(ext && IMAGE_EXTENSIONS.has(ext))
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

export default function NewReportPage() {
  const router = useRouter()
  const [experimentPdf, setExperimentPdf] = useState<File | null>(null)
  const [reportTitle, setReportTitle] = useState("")
  const [figureImages, setFigureImages] = useState<File[]>([])
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
  const [error, setError] = useState<string>("")

  const searchParams = useSearchParams()
  const resumeReportId = searchParams.get("reportId")

  useEffect(() => {
    const loadDraft = async () => {
      if (!resumeReportId) return
      try {
        const supabase = createClient()
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!session) return

        const { data: report } = await supabase
          .from("reports")
          .select("id, title, status")
          .eq("id", resumeReportId)
          .eq("user_id", session.user.id)
          .maybeSingle()

        if (report?.title) {
          setReportTitle(report.title)
        }

        const { data: files } = await supabase
          .from("experiment_data")
          .select("file_name, file_type, file_url")
          .eq("report_id", resumeReportId)
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
  }, [resumeReportId])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const droppedFiles = Array.from(e.dataTransfer.files)
    const pdfFile = droppedFiles.find((file) => isPdfFile(file))
    if (pdfFile) {
      setExperimentPdf(pdfFile)
      setExistingPdf(null)
      if (!reportTitle) {
        setReportTitle(pdfFile.name.replace(".pdf", ""))
      }
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files)
      const pdfFile = files.find((file) => isPdfFile(file))
      if (pdfFile) {
        setExperimentPdf(pdfFile)
        setExistingPdf(null)
        if (!reportTitle) {
          setReportTitle(pdfFile.name.replace(/\.pdf$/i, ""))
        }
      }
    }
    e.target.value = ""
  }

  const removeFile = () => {
    setExperimentPdf(null)
  }

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return
    const imageFiles = Array.from(e.target.files).filter((file) => isImageFile(file))
    if (imageFiles.length > 0) {
      setFigureImages((prev) => [...prev, ...imageFiles])
    }
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
    const droppedFiles = Array.from(e.dataTransfer.files).filter((file) => isImageFile(file))
    if (droppedFiles.length > 0) {
      setFigureImages((prev) => [...prev, ...droppedFiles])
    }
  }

  const removeImage = (index: number) => {
    setFigureImages((prev) => prev.filter((_, i) => i !== index))
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
      setPastedTables((prev) => [...prev, { id: crypto.randomUUID(), rows }])
    }
  }

  const clearTables = () => setPastedTables([])
  const removeTable = (id: string) => setPastedTables((prev) => prev.filter((t) => t.id !== id))

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B"
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB"
    return (bytes / (1024 * 1024)).toFixed(1) + " MB"
  }

  const handleSubmit = async () => {
    if ((!experimentPdf && !existingPdf) || !reportTitle) return

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

    let totalProgress = 0
    const totalDuration = PROCESSING_STEPS.reduce((sum, step) => sum + step.duration, 0)

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

      // 1) レポート作成（DB） もしくは既存下書きを再利用
      try {
        setCurrentStep(0)
        if (!resumeReportId) {
          const { data: inserted, error: insertError } = await supabase
            .from("reports")
            .insert([
              { title: reportTitle, user_id: session.user.id, status: "draft" as const },
            ])
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
          // Save with original filename so the stored key matches what we later sign for Dify (PDF URL)
          const storagePath = generateSafeStoragePath(session.user.id, reportId, experimentPdf.name)
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

          // 3) experiment_data 登録（ファイルタイプはスキーマの都合上 "word" を使用）
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
          for (let i = 0; i < pastedTables.length; i++) {
            const table = pastedTables[i]
          const jsonBlob = new Blob([JSON.stringify({ rows: table.rows }, null, 2)], {
            type: "application/json",
          })
          const tableFile = new File([jsonBlob], `table-${i + 1}.json`, { type: "application/json" })
          const tableStoragePath = generateSafeStoragePath(session.user.id, reportId, tableFile.name, "json")
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

      // 3.5) 図の画像を追加でアップロード
      if (figureImages.length > 0) {
        for (let i = 0; i < figureImages.length; i++) {
          const imageFile = figureImages[i]
          const fallbackExt = getImageFallbackExtension(imageFile)
          const imageStoragePath = generateSafeStoragePath(
            session.user.id,
            reportId,
            imageFile.name,
            fallbackExt
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
      setCurrentStep(3)
      const token = session.access_token
      const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || ""
      const endpoint = `${baseUrl}/api/reports/generate`
      debugUpload("handleSubmit:generate-api:start", { endpoint })
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reportId }),
      })
      if (!res.ok) {
        const msg = await res.text()
        debugUpload("handleSubmit:generate-api:error", { status: res.status, body: msg })
        throw new Error(msg || `Failed to start generation: ${res.status}`)
      }
      debugUpload("handleSubmit:generate-api:success", { reportId })

      // 疑似進捗を最後まで進めた後、詳細ページへ
      for (let i = 0; i < PROCESSING_STEPS.length; i++) {
        setCurrentStep(i)
        const step = PROCESSING_STEPS[i]

        const stepProgressIncrement = (step.duration / totalDuration) * 100
        const startProgress = totalProgress
        const endProgress = totalProgress + stepProgressIncrement

        const stepStartTime = Date.now()

        // eslint-disable-next-line no-await-in-loop
        await new Promise<void>((resolve) => {
          const interval = setInterval(() => {
            const elapsed = Date.now() - stepStartTime
            const stepProgress = Math.min(elapsed / step.duration, 1)
            const currentProgress = startProgress + stepProgressIncrement * stepProgress

            setProgress(Math.min(currentProgress, 100))

            if (elapsed >= step.duration) {
              clearInterval(interval)
              resolve()
            }
          }, 50)
        })

        totalProgress = endProgress
      }

      setProgress(100)
      await new Promise((resolve) => setTimeout(resolve, 500))

      router.push(`/dashboard/reports/${reportId}`)
      return
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      debugUpload("handleSubmit:failed", { error: message, detail: e })
      setError(message)
    } finally {
      setIsUploading(false)
      setIsProcessing(false)
      debugUpload("handleSubmit:finished")
    }

    // 旧: 疑似進捗のみ
    for (let i = 0; i < PROCESSING_STEPS.length; i++) {
      setCurrentStep(i)
      const step = PROCESSING_STEPS[i]

      const stepProgressIncrement = (step.duration / totalDuration) * 100
      const startProgress = totalProgress
      const endProgress = totalProgress + stepProgressIncrement

      const stepStartTime = Date.now()

      await new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          const elapsed = Date.now() - stepStartTime
          const stepProgress = Math.min(elapsed / step.duration, 1)
          const currentProgress = startProgress + stepProgressIncrement * stepProgress

          setProgress(Math.min(currentProgress, 100))

          if (elapsed >= step.duration) {
            clearInterval(interval)
            resolve()
          }
        }, 50)
      })

      totalProgress = endProgress
    }

    setProgress(100)

    await new Promise((resolve) => setTimeout(resolve, 500))

    router.push("/dashboard/reports")
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-8"
      >
        <h1 className="text-3xl font-bold text-foreground mb-2">新規レポート作成</h1>
        <p className="text-muted-foreground">実験書PDFをアップロードして、自動でレポートを生成します</p>
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
                        className={`flex items-center space-x-2 text-xs ${
                          index < currentStep
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
                <div className="space-y-2">
                  <Label htmlFor="pdf-upload" className="text-base font-semibold text-card-foreground">実験書PDF</Label>
                  <input
                    id="pdf-upload"
                    type="file"
                    onChange={handleFileSelect}
                    className="sr-only"
                    accept=".pdf,application/pdf"
                  />
                  <p className="text-sm text-muted-foreground mb-3">
                    実験書のPDFファイルをアップロードしてください。AIが内容を解析してレポートを自動生成します。
                  </p>

                {!experimentPdf ? (
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                      className={`border-2 border-dashed rounded-lg transition-all duration-300 text-center py-6 px-4 mx-1 my-0 bg-card ${
                        isDragging
                          ? "border-primary bg-primary/10 scale-[1.02]"
                          : "border-border bg-muted/30 hover:bg-muted/50"
                      }`}
                    >
                      <motion.div
                        initial={{ scale: 1 }}
                        animate={{ scale: isDragging ? 1.1 : 1 }}
                        transition={{ duration: 0.2 }}
                      >
                        <Upload className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                      </motion.div>
                      <p className="text-lg text-card-foreground mb-2 font-semibold">実験書PDFをドラッグ&ドロップ</p>
                      <p className="text-sm text-muted-foreground mb-3">または</p>
                      <label htmlFor="pdf-upload">
                        <Button variant="outline" className="cursor-pointer bg-transparent hover:bg-primary/10" asChild>
                          <span>
                            <FileText className="mr-2 w-4 h-4" />
                            PDFファイルを選択
                          </span>
                        </Button>
                      </label>
                      <p className="text-xs text-muted-foreground mt-3">対応形式: PDF</p>
                      <p className="text-xs text-muted-foreground">最大サイズ: 50MB</p>
                    </div>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3 }}
                      className="flex items-center justify-between p-6 bg-card border-2 border-primary/50 rounded-lg"
                      style={{
                        boxShadow: "0 0 20px rgba(94, 234, 212, 0.2)",
                      }}
                    >
                      <div className="flex items-center space-x-4">
                        <div className="p-3 bg-primary/10 rounded-lg">
                          <FileCheck className="w-8 h-8 text-primary" />
                        </div>
                        <div>
                          <p className="text-base font-semibold text-foreground">{experimentPdf.name}</p>
                          <p className="text-sm text-muted-foreground">{formatFileSize(experimentPdf.size)}</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={removeFile}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <X className="w-5 h-5" />
                      </Button>
                    </motion.div>
                  )}

                  {!experimentPdf && existingPdf && (
                    <div className="p-4 bg-muted/50 border rounded-lg">
                      <p className="text-sm font-semibold text-foreground">前回のPDFを利用中</p>
                      <p className="text-xs text-muted-foreground break-all">{existingPdf.name}</p>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <Label className="text-base font-semibold text-card-foreground">Excel表を貼り付け（任意）</Label>
                  <p className="text-sm text-muted-foreground">
                    コピーした表を貼り付けると参照用データとして保存されます。複数貼り付けると順番に追加されます。
                  </p>
                  <textarea
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    rows={4}
                    placeholder="ここに Ctrl/Cmd+V で貼り付け"
                    onPaste={handleTablePaste}
                  />
                {pastedTables.length > 0 ? (
                  <div className="space-y-3">
                    {pastedTables.map((table, idx) => (
                        <div key={table.id} className="overflow-x-auto rounded-md border bg-muted/30">
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
                        </div>
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
              </div>

              <div className="space-y-2">
                <Label htmlFor="image-upload" className="text-base font-semibold text-card-foreground">
                  実験結果の画像（任意）
                </Label>
                  <input id="image-upload" type="file" multiple accept="image/*" onChange={handleImageSelect} className="sr-only" />
                  <p className="text-sm text-muted-foreground mb-3">
                    図キャプションの直前に表示したい実験結果の画像をアップロードしてください。アップロードした順番でレポートに挿入されます（後から並べ替え可能）。
                  </p>
                  <div
                    onDragOver={handleImageDragOver}
                    onDragLeave={handleImageDragLeave}
                    onDrop={handleImageDrop}
                    className={`border-2 border-dashed rounded-lg transition-all duration-300 py-5 px-4 bg-card ${
                      isImageDragging ? "border-primary bg-primary/10 scale-[1.01]" : "border-border bg-muted/30 hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex flex-col items-center text-center space-y-2">
                      <ImagePlus className="w-10 h-10 text-muted-foreground" />
                      <p className="font-semibold text-card-foreground">画像をドラッグ&ドロップ</p>
                      <p className="text-xs text-muted-foreground">JPG / PNG / HEIC などの画像ファイルに対応</p>
                      <label htmlFor="image-upload">
                        <Button variant="outline" size="sm" className="cursor-pointer mt-2 bg-transparent hover:bg-primary/10" asChild>
                          <span>画像を選択</span>
                        </Button>
                      </label>
                    </div>
                  </div>

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
                            className="flex items-center justify-between p-4 border rounded-lg bg-card/80"
                          >
                            <div className="flex items-center space-x-3">
                              <div className="p-2 bg-primary/10 rounded-lg">
                                <ImageIcon className="w-5 h-5 text-primary" />
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-foreground">{file.name}</p>
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
              </div>

                {experimentPdf && (
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

                {experimentPdf && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3, delay: 0.1 }}
                    className="p-4 bg-primary/10 border border-primary/30 rounded-lg"
                  >
                    <div className="flex items-start space-x-3">
                      <CheckCircle2 className="w-5 h-5 text-primary mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-card-foreground">AIが自動でレポートを生成します</p>
                        <p className="text-xs text-muted-foreground">
                          実験書PDFの内容を解析し、目的・方法・結果・考察を含む完全なレポートを生成します。
                          通常2-5分程度で完了します。
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {experimentPdf && (
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
    </div>
  )
}
