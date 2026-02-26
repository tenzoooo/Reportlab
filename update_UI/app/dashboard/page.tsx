"use client"

import { useEffect, useMemo, useState } from "react"
import { motion, useMotionTemplate, useMotionValue } from "framer-motion"
import Link from "next/link"
import { FileText, Plus, Clock, TrendingUp, ArrowRight, LayoutDashboard } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import DashboardPageShell from "@/components/dashboard-page-shell"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

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

type ReportSummary = {
  id: string
  title: string
  status: "draft" | "processing" | "completed" | "error"
  created_at: string | null
}

export default function DashboardPage() {
  const [stats, setStats] = useState([
    { icon: FileText, value: "-", label: "総レポート数", color: "text-primary", bg: "bg-primary/10", border: "border-primary/20" },
    { icon: TrendingUp, value: "-", label: "今月作成", color: "text-purple-500", bg: "bg-purple-500/10", border: "border-purple-500/20" },
    { icon: Clock, value: "-", label: "処理中", color: "text-indigo-500", bg: "bg-indigo-500/10", border: "border-indigo-500/20" },
  ])
  const [recentReports, setRecentReports] = useState<ReportSummary[]>([])
  const [error, setError] = useState<string>("")

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          setError("ログインが必要です")
          return
        }

        const now = new Date()
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

        const [{ count: total }, { count: monthly }, { count: processing }, { data: recent }] = await Promise.all([
          supabase.from("reports").select("id", { count: "exact", head: true }).eq("user_id", session.user.id),
          supabase.from("reports").select("id", { count: "exact", head: true }).eq("user_id", session.user.id).gte("created_at", startOfMonth),
          supabase.from("reports").select("id", { count: "exact", head: true }).eq("user_id", session.user.id).eq("status", "processing"),
          supabase.from("reports").select("id, title, status, created_at").eq("user_id", session.user.id).order("created_at", { ascending: false }).limit(5),
        ])

        setStats((prev) =>
          prev.map((item) => {
            if (item.label === "総レポート数") return { ...item, value: (total ?? 0).toString() }
            if (item.label === "今月作成") return { ...item, value: (monthly ?? 0).toString() }
            if (item.label === "処理中") return { ...item, value: (processing ?? 0).toString() }
            return item
          })
        )

        setRecentReports((recent || []).map(r => ({
          id: r.id,
          title: r.title || "無題のレポート",
          status: r.status,
          created_at: r.created_at,
        })))
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    }
    load()
  }, [])

  const formattedReports = useMemo(() => {
    return recentReports.map((report) => {
      const date = report.created_at ? new Date(report.created_at).toLocaleDateString('ja-JP') : "-"
      const statusLabel =
        report.status === "completed" ? "完了" : report.status === "processing" ? "処理中" : report.status === "draft" ? "下書き" : "エラー"
      return { ...report, date, statusLabel }
    })
  }, [recentReports])

  // Mouse spotlight effect (subtle)
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)
  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    mouseX.set(e.clientX - rect.left)
    mouseY.set(e.clientY - rect.top)
  }
  const spotlight = useMotionTemplate`radial-gradient(1000px circle at ${mouseX}px ${mouseY}px, var(--primary) 0%, transparent 80%)` // Using CSS var for spotlight color if possible, or opacity trick

  return (
    <DashboardPageShell
      title="Dashboard"
      subtitle="実験レポートの作成状況と統計"
      icon={<LayoutDashboard className="h-6 w-6" />}
    >
      <div 
        onMouseMove={handleMouseMove} 
        className="relative overflow-hidden rounded-[2.5rem] border border-border bg-background shadow-sm"
      >
        {/* Subtle background pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:40px_40px] opacity-10 pointer-events-none" />
        
        {/* Spotlight overlay - careful with light mode visibility */}
        <motion.div 
          className="absolute inset-0 pointer-events-none z-0 opacity-5 dark:opacity-10" 
          style={{ background: `radial-gradient(600px circle at ${mouseX}px ${mouseY}px, currentColor, transparent 80%)`, color: 'var(--primary)' }} 
        />

        <div className="relative z-10 p-8 sm:p-12 space-y-12">

        {/* KPI Grid */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-3 gap-8"
        >
          {stats.map((stat, index) => (
            <motion.div key={index} variants={fadeInUp} whileHover={{ y: -5 }}>
              <Card className="h-full border-border bg-card/50 backdrop-blur-sm hover:bg-card transition-all duration-300 overflow-hidden group">
                <CardContent className="p-8 flex flex-col justify-between h-full space-y-6">
                  <div className={cn("p-4 rounded-2xl w-fit transition-transform group-hover:scale-110", stat.bg, stat.border, "border")}>
                    <stat.icon className={cn("h-7 w-7", stat.color)} />
                  </div>
                  <div>
                    <div className="text-5xl font-bold text-foreground instrument tracking-tighter mb-1">{stat.value}</div>
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">{stat.label}</div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          {/* Recent Reports List */}
          <motion.div 
            className="lg:col-span-2 space-y-6"
            initial="hidden" 
            animate="visible" 
            variants={fadeInUp}
          >
            <div className="flex items-center justify-between px-2">
              <h2 className="text-2xl font-bold text-foreground instrument">Recent Reports</h2>
              <Link href="/dashboard/reports" className="text-sm font-bold text-primary hover:text-primary/80 flex items-center gap-2 group transition-colors">
                すべて見る <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>

            <Card className="rounded-[2.5rem] border-border bg-card/50 backdrop-blur-sm overflow-hidden shadow-md">
              <div className="divide-y divide-border">
                {formattedReports.length > 0 ? (
                  formattedReports.map((report, index) => (
                    <Link
                      key={report.id}
                      href={`/dashboard/reports/${report.id}`}
                      className="flex items-center justify-between p-6 hover:bg-muted/50 transition-all group"
                    >
                      <div className="flex items-center gap-5">
                        <div className="h-12 w-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary group-hover:scale-110 transition-all">
                          <FileText className="h-6 w-6" />
                        </div>
                        <div>
                          <p className="font-bold text-foreground text-lg tracking-tight group-hover:text-primary transition-colors">{report.title}</p>
                          <div className="flex items-center gap-3 mt-1.5">
                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">{report.date}</p>
                            <span className="h-1 w-1 rounded-full bg-border" />
                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">ID: {report.id.slice(0, 8)}</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className={cn(
                          "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.15em] border",
                          report.status === "completed"
                            ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400"
                            : report.status === "processing"
                              ? "bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400"
                              : report.status === "draft"
                                ? "bg-slate-500/10 text-slate-600 border-slate-500/20 dark:text-slate-400"
                                : "bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-400"
                        )}>
                          {report.statusLabel}
                        </div>
                        <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="p-20 text-center space-y-4">
                    <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto">
                      <FileText className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground font-bold uppercase tracking-widest text-xs">
                      No reports found
                    </p>
                  </div>
                )}
              </div>
            </Card>
          </motion.div>

          {/* Quick Actions */}
          <motion.div 
            initial="hidden" 
            animate="visible" 
            variants={fadeInUp}
            className="space-y-6"
          >
            <h2 className="text-2xl font-bold text-foreground instrument px-2">Quick Actions</h2>
            
            <Card className="rounded-[3rem] border-border bg-gradient-to-br from-primary/5 to-purple-500/5 overflow-hidden relative group hover:shadow-lg transition-all">
              <CardContent className="p-10 text-center space-y-8 relative z-10">
                <div className="relative">
                  <div className="mx-auto h-20 w-20 rounded-[2rem] bg-card shadow-lg flex items-center justify-center text-primary mb-2 group-hover:scale-110 group-hover:-rotate-6 transition-all duration-500 border border-border">
                    <Plus className="h-10 w-10" />
                  </div>
                  <div className="absolute -top-2 -right-2 h-6 w-6 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-[10px] font-black animate-bounce">NEW</div>
                </div>
                
                <div className="space-y-3">
                  <h3 className="text-2xl font-bold text-foreground instrument tracking-tight">Generate Report</h3>
                  <p className="text-xs text-muted-foreground mincho leading-relaxed max-w-[200px] mx-auto">
                    実験データをアップロードして、<br />AIがレポートを即座に生成。
                  </p>
                </div>

                <Button 
                  className="w-full py-6 h-auto bg-primary text-primary-foreground hover:bg-primary/90 rounded-2xl font-bold text-base shadow-lg shadow-primary/20"
                  asChild
                >
                  <Link href="/dashboard/reports/new">
                    新規作成を開始
                  </Link>
                </Button>
              </CardContent>
              
              {/* Decorative blob */}
              <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-primary/10 rounded-full blur-3xl group-hover:bg-primary/20 transition-all duration-700 pointer-events-none" />
            </Card>

            {/* AI Insight Card (light-mode friendly) */}
            <Card className="rounded-[2rem] border border-border bg-card/70 shadow-md backdrop-blur-sm">
              <CardContent className="p-5 flex items-start gap-3">
                <div className="mt-1 flex-shrink-0">
                  <div className="h-2.5 w-2.5 rounded-full bg-blue-500 shadow-[0_0_0_3px_rgba(59,130,246,0.25)]" />
                </div>
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">
                    AI Tip
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed mincho">
                    過去のレポートをアップロードすると、AIがあなたの文体を学習し、より自然な執筆を支援します。
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
        </div>
      </div>
    </DashboardPageShell>
  )
}