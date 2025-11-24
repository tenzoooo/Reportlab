"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft, Download, Trash2, FileText, ImageIcon, FileSpreadsheet, CheckCircle, Loader2, AlertCircle, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { createClient } from "@/lib/supabase/client"
import { getFileUrl } from "@/lib/storage/get-file-url"

type ReportStatus = "draft" | "processing" | "completed" | "error"

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

  const handleRegenerateAI = async () => {
    try {
      if (!confirm("AIで再生成しますか？\n（クレジットを消費する可能性があります）")) return
      setIsRegenerating(true)
      setFileUrl(null)
      setProgress(0)
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
      })
      if (!res.ok) {
        const msg = await res.text()
        throw new Error(msg || `再生成に失敗しました (${res.status})`)
      }
      setStatus("processing")
      setProgress(0)
      alert("AIによる再生成を開始しました。")
    } catch (regErr) {
      alert(regErr instanceof Error ? regErr.message : String(regErr))
    } finally {
      setIsRegenerating(false)
    }
  }

  const handleRegenerateJSON = async () => {
    try {
      setIsRegenerating(true)
      setFileUrl(null)
      setProgress(0)
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
      })
      if (!res.ok) {
        const msg = await res.text()
        throw new Error(msg || `再生成に失敗しました (${res.status})`)
      }
      setStatus("processing")
      setProgress(0)
      alert("JSONからの再生成を開始しました。")
    } catch (regErr) {
      alert(regErr instanceof Error ? regErr.message : String(regErr))
    } finally {
      setIsRegenerating(false)
    }
  }

  return (
    <div className="page-container">
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
