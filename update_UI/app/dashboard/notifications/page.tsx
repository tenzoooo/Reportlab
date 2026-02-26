"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { Bell, Check, CheckCircle, AlertCircle, Clock, FileText, Trash2 } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import DashboardPageShell from "@/components/dashboard-page-shell"

const CATEGORY_ICON = {
  report: <FileText className="h-6 w-6 text-primary" />,
  processing: <Clock className="h-6 w-6 text-sky-600" />,
  storage: <AlertCircle className="h-6 w-6 text-amber-500" />,
  upload: <CheckCircle className="h-6 w-6 text-emerald-600" />,
  announcement: <Bell className="h-6 w-6 text-purple-600" />,
} as const

type NotificationCategory = keyof typeof CATEGORY_ICON

interface NotificationItem {
  id: string
  category: NotificationCategory
  title: string
  message: string
  time: string
  link?: string
  read: boolean
}

type NotificationsResponse = {
  notifications: NotificationItem[]
}

export default function NotificationsPage() {
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all")
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" })
      const data: NotificationsResponse | { error?: string } | null = await response.json().catch(() => null)
      if (!response.ok) {
        const message = data && "error" in data && data.error ? data.error : "通知の取得に失敗しました"
        throw new Error(message)
      }
      setNotifications((data as NotificationsResponse)?.notifications ?? [])
    } catch (err) {
      console.error("[dashboard/notifications] failed to load notifications", err)
      setError("通知の取得に失敗しました")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      if (filter === "unread") return !n.read
      if (filter === "read") return n.read
      return true
    })
  }, [notifications, filter])

  const unreadCount = notifications.filter((n) => !n.read).length

  const markAsRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  const deleteNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }

  const getIcon = (category: NotificationCategory) => CATEGORY_ICON[category] || (
      <FileText className="h-6 w-6 text-muted-foreground" />
    )

  return (
    <DashboardPageShell
      title="通知"
      subtitle="実験レポートやストレージ状況などの更新を確認できます"
      icon={<Bell className="h-6 w-6" />}
      actions={
        <>
          <Button variant="ghost" size="sm" onClick={fetchNotifications} disabled={isLoading} className="text-slate-200 hover:text-white">
            再読み込み
          </Button>
          {unreadCount > 0 && (
            <Button onClick={markAllAsRead} variant="outline" className="gap-2 bg-transparent border-white/10 text-white hover:bg-white/5">
              <Check className="h-4 w-4" />
              すべて既読にする
            </Button>
          )}
        </>
      }
    >
      {unreadCount > 0 && (
        <div className="text-xs font-semibold text-blue-300 bg-blue-500/10 border border-blue-500/20 inline-flex items-center gap-2 px-3 py-1 rounded-full">
          未読 {unreadCount} 件
        </div>
      )}

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="flex gap-2 flex-wrap"
      >
        <button
          onClick={() => setFilter("unread")}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            filter === "unread"
              ? "bg-blue-600 text-white"
              : "bg-white/5 text-white border border-white/10 hover:bg-white/10"
          }`}
          style={
            filter === "unread"
              ? {
                  boxShadow: "0 0 20px rgba(59, 130, 246, 0.4)",
                }
              : {}
          }
        >
          未読 ({unreadCount})
        </button>
        <button
          onClick={() => setFilter("read")}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            filter === "read"
              ? "bg-blue-600 text-white"
              : "bg-white/5 text-white border border-white/10 hover:bg-white/10"
          }`}
          style={
            filter === "read"
              ? {
                  boxShadow: "0 0 20px rgba(59, 130, 246, 0.4)",
                }
              : {}
          }
        >
          既読 ({notifications.length - unreadCount})
        </button>
        <button
          onClick={() => setFilter("all")}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            filter === "all"
              ? "bg-blue-600 text-white"
              : "bg-white/5 text-white border border-white/10 hover:bg-white/10"
          }`}
          style={
            filter === "all"
              ? {
                  boxShadow: "0 0 20px rgba(59, 130, 246, 0.4)",
                }
              : {}
          }
        >
          すべて ({notifications.length})
        </button>
      </motion.div>

      {/* Notifications List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="animate-pulse bg-white/5 rounded-2xl border border-white/10 p-6 space-y-3">
                <div className="h-4 w-1/3 bg-white/10 rounded" />
                <div className="h-4 w-2/3 bg-white/10 rounded" />
                <div className="h-3 w-1/4 bg-white/10 rounded" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-16 text-red-400">{error}</div>
        ) : filteredNotifications.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="bg-white/5 rounded-2xl border border-white/10 p-12 text-center"
          >
            <Bell className="h-16 w-16 mx-auto mb-4 text-slate-500 opacity-30" />
            <p className="text-slate-300 text-lg">
              {filter === "unread"
                ? "未読の通知はありません"
                : filter === "read"
                  ? "既読の通知はありません"
                  : "通知はありません"}
            </p>
          </motion.div>
        ) : (
          filteredNotifications.map((notification, index) => (
            <motion.div
              key={notification.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              className={`bg-white/5 rounded-2xl border border-white/10 p-6 hover:bg-white/10 transition-all ${
                !notification.read ? "border-blue-500/40" : ""
              }`}
              style={
                !notification.read
                  ? {
                      boxShadow: "0 0 15px rgba(59, 130, 246, 0.2)",
                    }
                  : {}
              }
            >
              <div className="flex gap-4">
                {/* Icon */}
                <div className="flex-shrink-0 mt-1">{getIcon(notification.category)}</div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-white">{notification.title}</h3>
                        {!notification.read && <span className="h-2 w-2 bg-blue-500 rounded-full" />}
                      </div>
                      <p className="text-slate-300 mt-1">{notification.message}</p>
                      <div className="flex items-center gap-4 mt-3">
                        <p className="text-xs text-slate-500">{notification.time}</p>
                        {notification.link && (
                          <Link
                            href={notification.link}
                            className="text-xs text-blue-400 hover:text-blue-300 font-medium"
                          >
                            詳細を見る →
                          </Link>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      {!notification.read && (
                        <button
                          onClick={() => markAsRead(notification.id)}
                          className="p-2 text-slate-400 hover:text-blue-300 transition-colors rounded-lg hover:bg-white/5"
                          title="既読にする"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => deleteNotification(notification.id)}
                        className="p-2 text-slate-400 hover:text-red-400 transition-colors rounded-lg hover:bg-white/5"
                        title="削除"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </DashboardPageShell>
  )
}
