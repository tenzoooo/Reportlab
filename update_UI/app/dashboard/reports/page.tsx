"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { FileText, Plus, Search, Download, Trash2, Eye, MoreVertical, Play, RotateCcw, Loader2, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { createClient } from "@/lib/supabase/client"
import { getFileUrl } from "@/lib/storage/get-file-url"
import DashboardPageShell from "@/components/dashboard-page-shell"
import { cn } from "@/lib/utils"

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
      alert("レポートの再生成を開始しました。")
      fetchReports()
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setRegeneratingId(null)
    }
  }

  return (
    <DashboardPageShell
      title="レポート一覧"
      subtitle="作成したレポートを管理できます"
      icon={<FileText className="h-6 w-6" />}
      actions={
        <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2 shadow-lg shadow-primary/20" asChild>
          <Link href="/dashboard/reports/new">
            <Plus className="h-5 w-5" />
            新規作成
          </Link>
        </Button>
      }
    >

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 mb-6 border-b border-border">
        {filterTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveFilter(tab.id)}
            className={cn(
              "px-4 py-3 text-sm font-semibold transition-colors relative",
              activeFilter === tab.id
                ? "text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-2 text-[10px] bg-muted px-2 py-0.5 rounded-full text-muted-foreground border border-border">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <Input
            id="reports-search"
            name="q"
            type="search"
            role="searchbox"
            aria-label="レポートを検索"
            placeholder="レポートを検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 h-12 text-base bg-card border-border focus-visible:ring-primary/20"
            autoComplete="off"
          />
        </div>
      </div>

      {/* Reports Table Card */}
      <Card className="border-border bg-card/50 backdrop-blur-sm shadow-md overflow-hidden">
        <CardContent className="p-0">
          {error && (
            <div className="px-6 py-3 text-sm text-destructive bg-destructive/10 border-b border-destructive/20">{error}</div>
          )}
          
          {/* Table Header */}
          <div className="hidden md:grid md:grid-cols-12 gap-4 px-6 py-4 bg-muted/50 border-b border-border font-bold text-[10px] uppercase tracking-widest text-muted-foreground">
            <div className="col-span-5">タイトル</div>
            <div className="col-span-3">作成日</div>
            <div className="col-span-3">ステータス</div>
            <div className="col-span-1 text-right">操作</div>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-border">
            {loading && reports.length === 0 ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredReports.length === 0 ? (
              <div className="px-6 py-20 text-center space-y-4">
                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto border border-border">
                  <FileText className="h-8 w-8 text-muted-foreground opacity-50" />
                </div>
                <div className="space-y-1">
                  <p className="text-lg font-bold text-foreground">レポートが見つかりません</p>
                  <p className="text-sm text-muted-foreground">検索条件を変更するか、新しいレポートを作成してください</p>
                </div>
              </div>
            ) : (
              filteredReports.map((report) => (
                <div
                  key={report.id}
                  className="px-6 py-4 hover:bg-muted/30 transition-colors grid grid-cols-1 md:grid-cols-12 gap-4 items-center group"
                >
                  {/* Title */}
                  <div className="col-span-1 md:col-span-5 flex items-center gap-4">
                    <div className="h-10 w-10 rounded-xl bg-primary/5 border border-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <Link
                        href={`/dashboard/reports/${report.id}`}
                        className="font-bold text-foreground hover:text-primary transition-colors block truncate text-lg tracking-tight"
                      >
                        {report.title}
                      </Link>
                      <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest md:hidden">
                        {mounted && report.created_at ? new Date(report.created_at).toLocaleDateString() : "-"}
                      </p>
                    </div>
                  </div>

                  {/* Date (Desktop) */}
                  <div className="hidden md:block col-span-1 md:col-span-3 text-sm text-muted-foreground">
                    {mounted && report.created_at ? new Date(report.created_at).toLocaleString('ja-JP', { 
                      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' 
                    }) : "-"}
                  </div>

                  {/* Status */}
                  <div className="col-span-1 md:col-span-3">
                    <span
                      className={cn(
                        "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border",
                        report.status === "completed"
                          ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400"
                          : report.status === "processing"
                            ? "bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400"
                            : report.status === "draft"
                              ? "bg-muted text-muted-foreground border-border"
                              : "bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-400"
                      )}
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
                          <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-muted">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 p-2 bg-card/95 backdrop-blur-xl border-border shadow-2xl rounded-2xl">
                          <DropdownMenuItem asChild className="rounded-xl cursor-pointer py-2.5">
                            <Link href={`/dashboard/reports/${report.id}`} className="flex items-center gap-3">
                              <Eye className="h-4 w-4 text-primary" />
                              <span className="font-semibold">詳細を見る</span>
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-border/50 my-1" />
                          
                          {report.status === "draft" && (
                            <DropdownMenuItem asChild className="rounded-xl cursor-pointer py-2.5">
                              <Link href={`/dashboard/reports/new?reportId=${report.id}`} className="flex items-center gap-3">
                                <Play className="h-4 w-4 text-emerald-500" />
                                <span className="font-semibold">下書きを再開</span>
                              </Link>
                            </DropdownMenuItem>
                          )}
                          
                          {report.status !== "draft" && (
                            <DropdownMenuItem
                              className="rounded-xl cursor-pointer py-2.5 flex items-center gap-3"
                              disabled={regeneratingId === report.id}
                              onClick={() => handleRegenerate(report.id)}
                            >
                              {regeneratingId === report.id ? (
                                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                              ) : (
                                <RotateCcw className="h-4 w-4 text-primary" />
                              )}
                              <span className="font-semibold">再生成</span>
                            </DropdownMenuItem>
                          )}
                          
                          {report.status === "completed" && report.file_url && (
                            <DropdownMenuItem
                              className="rounded-xl cursor-pointer py-2.5 flex items-center gap-3"
                              onClick={() => handleDownload(report.id, report.title)}
                            >
                              <Download className="h-4 w-4 text-primary" />
                              <span className="font-semibold">ダウンロード</span>
                            </DropdownMenuItem>
                          )}
                          
                          <DropdownMenuSeparator className="bg-border/50 my-1" />
                          
                          <DropdownMenuItem
                            className="rounded-xl cursor-pointer py-2.5 flex items-center gap-3 text-destructive focus:text-destructive focus:bg-destructive/10"
                            onClick={() => handleDelete(report.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="font-bold">削除</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <div className="h-9 w-9 rounded-md bg-muted animate-pulse" aria-hidden />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > pageSize && (
        <div className="flex items-center justify-center gap-3 mt-10">
          <Button
            variant="outline"
            size="icon"
            className="rounded-xl border-border bg-card hover:bg-muted"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          <div className="flex items-center gap-2">
            {Array.from({ length: Math.ceil(total / pageSize) })
              .slice(0, 5)
              .map((_, index) => {
                const page = index + 1
                return (
                  <Button
                    key={page}
                    variant={currentPage === page ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setCurrentPage(page)}
                    className={cn(
                      "w-10 h-10 rounded-xl font-bold transition-all",
                      currentPage === page 
                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" 
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                  >
                    {page}
                  </Button>
                )
              })}
          </div>
          
          <Button
            variant="outline"
            size="icon"
            className="rounded-xl border-border bg-card hover:bg-muted"
            disabled={currentPage >= Math.ceil(total / pageSize)}
            onClick={() => setCurrentPage((prev) => prev + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </DashboardPageShell>
  )
}
