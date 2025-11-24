"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { FileText, Plus, Search, Download, Trash2, Eye, MoreVertical, Play, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { createClient } from "@/lib/supabase/client"
import { getFileUrl } from "@/lib/storage/get-file-url"

type FilterTab = "all" | "completed" | "processing"

export default function ReportsPage() {
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(10)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>("")
  const [mounted, setMounted] = useState(false)
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)
  const [reports, setReports] = useState<{
    id: string
    title: string
    status: "draft" | "processing" | "completed" | "error"
    created_at: string | null
    updated_at: string | null
    file_url: string | null
  }[]>([])
  const [total, setTotal] = useState(0)

  const fetchReports = async () => {
    setLoading(true)
    setError("")
    try {
      const supabase = createClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        window.location.href = "/login"
        return
      }
      const start = (currentPage - 1) * pageSize
      const end = start + pageSize - 1

      let query = supabase
        .from("reports")
        .select("id, title, status, created_at, updated_at, file_url", { count: "exact" })
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false })

      if (activeFilter !== "all") {
        query = query.eq("status", activeFilter)
      }
      if (searchQuery) {
        query = query.ilike("title", `%${searchQuery}%`)
      }

      const { data, count, error: qError } = await query.range(start, end)
      if (qError) throw new Error(qError.message)

      setReports(data || [])
      setTotal(count || 0)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchReports()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter, searchQuery, currentPage])

  useEffect(() => {
    setMounted(true)
  }, [])

  const filteredReports = useMemo(() => reports, [reports])

  const filterTabs = [
    { id: "all" as FilterTab, label: "すべて", count: total },
    { id: "completed" as FilterTab, label: "完了", count: undefined },
    { id: "processing" as FilterTab, label: "処理中", count: undefined },
  ]

  const handleDownload = async (id: string, title: string) => {
    try {
      const supabase = createClient()
      const report = reports.find((r) => r.id === id)
      if (!report) throw new Error("レポートが見つかりません")
      if (report.status !== "completed" || !report.file_url) {
        throw new Error("ダウンロード可能なファイルがありません")
      }
      const url = await getFileUrl(report.file_url, `${title || "report"}.docx`)
      window.location.href = url
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("このレポートを削除してもよろしいですか?")) return
    try {
      const supabase = createClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) return

      // Best-effort: delete related files from storage (if policy allows)
      const { data: expFiles } = await supabase
        .from("experiment_data")
        .select("file_url")
        .eq("report_id", id)

      const report = reports.find((r) => r.id === id)
      const storagePaths = [
        ...(expFiles || []).map((f) => (f.file_url || "").replace(/^\/+/, "")).filter(Boolean),
        ...(report?.file_url ? [report.file_url.replace(/^\/+/, "")] : []),
      ]

      if (storagePaths.length > 0) {
        await supabase.storage.from("experiment-files").remove(storagePaths)
      }

      const { error } = await supabase.from("reports").delete().eq("id", id).eq("user_id", session.user.id)
      if (error) throw new Error(error.message)

      fetchReports()
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    }
  }

  const handleRegenerate = async (id: string) => {
    try {
      setRegeneratingId(id)
      const supabase = createClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        window.location.href = "/login"
        return
      }
      const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || ""
      const endpoint = `${baseUrl}/api/reports/regenerate/from-cache`
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ reportId: id }),
      })
      if (!res.ok) {
        const msg = await res.text()
        throw new Error(msg || `再生成に失敗しました (${res.status})`)
      }
      setReports((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: "processing" as const } : r))
      )
      alert("レポートの再生成を開始しました。処理が完了するとステータスが更新されます。")
      fetchReports()
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setRegeneratingId(null)
    }
  }

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">レポート一覧</h1>
          <p className="text-muted-foreground mt-2">作成したレポートを管理できます</p>
        </div>
        <Button size="lg" className="bg-primary hover:bg-primary/90 gap-2" asChild>
          <Link href="/dashboard/reports/new">
            <Plus className="h-5 w-5" />
            新規作成
          </Link>
        </Button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 mb-6 border-b border-border">
        {filterTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveFilter(tab.id)}
            className={`px-4 py-3 text-sm font-semibold transition-colors relative ${
              activeFilter === tab.id
                ? "text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            <span className="ml-2 text-xs bg-muted px-2 py-1 rounded-full">{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            id="reports-search"
            name="q"
            type="search"
            role="searchbox"
            aria-label="レポートを検索"
            placeholder="レポートを検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 h-12 text-base"
            autoComplete="off"
          />
        </div>
      </div>

      {/* Reports Table */}
      <Card>
        <CardContent className="p-0">
          {error && (
            <div className="px-6 py-3 text-sm text-red-600">{error}</div>
          )}
          {/* Table Header */}
          <div className="hidden md:grid md:grid-cols-12 gap-4 px-6 py-4 bg-muted/50 border-b border-border font-semibold text-sm text-card-foreground">
            <div className="col-span-5">タイトル</div>
            <div className="col-span-3">作成日</div>
            <div className="col-span-3">ステータス</div>
            <div className="col-span-1 text-right">操作</div>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-border">
            {filteredReports.length === 0 ? (
              <div className="px-6 py-12 text-center text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 text-muted" />
                <p className="text-lg font-medium">レポートが見つかりません</p>
                <p className="text-sm mt-2">検索条件を変更するか、新しいレポートを作成してください</p>
              </div>
            ) : (
              filteredReports.map((report) => (
                <div
                  key={report.id}
                  className="px-6 py-4 hover:bg-muted/50 transition-colors grid grid-cols-1 md:grid-cols-12 gap-4 items-center"
                >
                  {/* Title */}
                  <div className="col-span-1 md:col-span-5 flex items-center gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    <Link
                      href={`/dashboard/reports/${report.id}`}
                      className="font-semibold text-foreground hover:text-primary transition-colors"
                    >
                      {report.title}
                    </Link>
                  </div>

                  {/* Date */}
                  <div className="col-span-1 md:col-span-3 text-sm text-muted-foreground md:text-base">
                    <span className="md:hidden font-medium text-card-foreground">作成日: </span>
                    {mounted && report.created_at ? new Date(report.created_at).toLocaleString() : "-"}
                  </div>

                  {/* Status */}
                  <div className="col-span-1 md:col-span-3">
                    <span
                      className={`status-pill ${
                        report.status === "completed"
                          ? "bg-success/10 text-success"
                          : report.status === "processing"
                            ? "bg-primary/10 text-primary"
                            : report.status === "draft"
                              ? "bg-muted/20 text-muted-foreground"
                              : "bg-destructive/10 text-destructive"
                      }`}
                    >
                      {report.status === "completed"
                        ? "完了"
                        : report.status === "processing"
                          ? "処理中"
                          : report.status === "draft"
                            ? "下書き"
                            : "エラー"}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="col-span-1 md:col-span-1 flex justify-end">
                    {mounted ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem asChild>
                            <Link href={`/dashboard/reports/${report.id}`} className="flex items-center gap-2">
                              <Eye className="h-4 w-4" />
                              詳細を見る
                            </Link>
                          </DropdownMenuItem>
                          {report.status === "draft" && (
                            <DropdownMenuItem asChild>
                              <Link href={`/dashboard/reports/new?reportId=${report.id}`} className="flex items-center gap-2">
                                <Play className="h-4 w-4" />
                                下書きを再開
                              </Link>
                            </DropdownMenuItem>
                          )}
                          {report.status !== "draft" && (
                            <DropdownMenuItem
                              className="flex items-center gap-2"
                              disabled={regeneratingId === report.id}
                              onClick={() => handleRegenerate(report.id)}
                            >
                              {regeneratingId === report.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RotateCcw className="h-4 w-4" />
                              )}
                              再生成
                            </DropdownMenuItem>
                          )}
                          {report.status === "completed" && report.file_url && (
                            <DropdownMenuItem
                              className="flex items-center gap-2"
                              onClick={() => handleDownload(report.id, report.title)}
                            >
                              <Download className="h-4 w-4" />
                              ダウンロード
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="flex items-center gap-2 text-destructive focus:text-destructive"
                            onClick={() => handleDelete(report.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                            削除
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <div className="h-8 w-8 rounded-md bg-muted" aria-hidden />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {filteredReports.length > 0 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
          >
            前へ
          </Button>
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.max(1, Math.ceil(total / pageSize)) })
              .slice(0, 5)
              .map((_, index) => {
                const page = index + 1
                return (
              <Button
                key={page}
                variant={currentPage === page ? "default" : "outline"}
                size="sm"
                onClick={() => setCurrentPage(page)}
                className="w-10"
              >
                {page}
              </Button>
                )
              })}
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= Math.max(1, Math.ceil(total / pageSize))}
            onClick={() => setCurrentPage((prev) => prev + 1)}
          >
            次へ
          </Button>
        </div>
      )}
    </div>
  )
}
