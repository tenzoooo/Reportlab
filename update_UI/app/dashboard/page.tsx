"use client"

import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import Link from "next/link"
import { FileText, Plus, Clock, TrendingUp, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/client"

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
    { icon: FileText, value: "-", label: "総レポート数", color: "text-primary", bgColor: "bg-primary/10" },
    { icon: TrendingUp, value: "-", label: "今月作成", color: "text-secondary", bgColor: "bg-secondary/10" },
    { icon: Clock, value: "-", label: "処理中", color: "text-warning", bgColor: "bg-warning/10" },
  ])
  const [recentReports, setRecentReports] = useState<ReportSummary[]>([])
  const [error, setError] = useState<string>("")

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient()
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!session) {
          setError("ログインが必要です")
          return
        }

        const now = new Date()
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

        const [{ count: total }, { count: monthly }, { count: processing }, { data: recent }] = await Promise.all([
          supabase.from("reports").select("id", { count: "exact", head: true }).eq("user_id", session.user.id),
          supabase
            .from("reports")
            .select("id", { count: "exact", head: true })
            .eq("user_id", session.user.id)
            .gte("created_at", startOfMonth),
          supabase
            .from("reports")
            .select("id", { count: "exact", head: true })
            .eq("user_id", session.user.id)
            .eq("status", "processing"),
          supabase
            .from("reports")
            .select("id, title, status, created_at")
            .eq("user_id", session.user.id)
            .order("created_at", { ascending: false })
            .limit(5),
        ])

        setStats((prev) =>
          prev.map((item) => {
            if (item.label === "総レポート数") return { ...item, value: (total ?? 0).toString() }
            if (item.label === "今月作成") return { ...item, value: (monthly ?? 0).toString() }
            if (item.label === "処理中") return { ...item, value: (processing ?? 0).toString() }
            return item
          })
        )

        setRecentReports(
          (recent || []).map((r) => ({
            id: r.id as string,
            title: (r.title as string) || "無題のレポート",
            status: r.status as ReportSummary["status"],
            created_at: r.created_at as string | null,
          }))
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    }
    load()
  }, [])

  const formattedReports = useMemo(() => {
    return recentReports.map((report) => {
      const date = report.created_at ? new Date(report.created_at).toLocaleDateString() : "-"
      const statusLabel =
        report.status === "completed" ? "完了" : report.status === "processing" ? "処理中" : report.status === "draft" ? "下書き" : "エラー"
      return { ...report, date, statusLabel }
    })
  }, [recentReports])

  return (
    <div className="page-container">
      {/* Page Title */}
      <motion.div
        className="mb-8"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-3xl font-bold text-foreground">ダッシュボード</h1>
        <p className="text-muted-foreground mt-2">実験レポートの作成状況を確認できます</p>
      </motion.div>

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8"
      >
        {stats.map((stat, index) => (
          <motion.div
            key={index}
            variants={fadeInUp}
            whileHover={{
              scale: 1.05,
              y: -5,
              transition: { type: "spring", stiffness: 300 },
            }}
          >
            <Card className="kpi-card">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <motion.div
                      className={`inline-flex items-center justify-center h-12 w-12 rounded-lg ${stat.bgColor} mb-4`}
                      whileHover={{ rotate: 360 }}
                      transition={{ duration: 0.6 }}
                    >
                      <stat.icon className={`h-6 w-6 ${stat.color}`} />
                    </motion.div>
                    <motion.div
                      className="text-4xl font-bold text-foreground mb-2"
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.3 + index * 0.1, type: "spring" }}
                    >
                      {stat.value}
                    </motion.div>
                    <div className="text-sm text-muted-foreground">{stat.label}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      <motion.div
        className="mb-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold text-foreground">最近のレポート</h2>
          <Link
            href="/dashboard/reports"
            className="text-primary hover:text-primary/90 font-medium text-sm flex items-center gap-1"
          >
            すべて見る
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {formattedReports.map((report, index) => (
                <motion.div
                  key={report.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + index * 0.1 }}
                  whileHover={{ backgroundColor: "rgba(59, 130, 246, 0.1)" }}
                >
                  <Link
                    href={`/dashboard/reports/${report.id}`}
                    className="flex items-center justify-between p-4 hover:bg-primary/10 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      <span className="font-semibold text-foreground">{report.title}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-muted-foreground">{report.date}</span>
                      <motion.span
                        whileHover={{ scale: 1.1 }}
                        className={`status-pill ${
                          report.status === "completed"
                            ? "bg-success/10 text-success"
                            : report.status === "processing"
                              ? "bg-primary/10 text-primary"
                              : "bg-destructive/10 text-destructive"
                        }`}
                      >
                        {report.statusLabel}
                      </motion.span>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.8 }}
        whileHover={{ scale: 1.02 }}
      >
        <Card className="bg-gradient-to-r from-primary to-secondary border-0 relative overflow-hidden">
          <motion.div
            className="absolute inset-0 opacity-10"
            animate={{
              backgroundPosition: ["0% 0%", "100% 100%"],
            }}
            transition={{ duration: 20, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
            style={{
              backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)",
              backgroundSize: "20px 20px",
            }}
          />
          <CardContent className="p-8 relative z-10">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="text-primary-foreground space-y-2">
                <h3 className="text-2xl font-bold">新しいレポートを作成</h3>
                <p className="text-primary-foreground/90">実験データをアップロードして、AIがレポートを自動生成します</p>
              </div>
              <Button size="lg" className="bg-card text-primary hover:bg-card/90 gap-2" asChild>
                <Link href="/dashboard/reports/new">
                  <Plus className="h-5 w-5" />
                  新規レポート作成
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
