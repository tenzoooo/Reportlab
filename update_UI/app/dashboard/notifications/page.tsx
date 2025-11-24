"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { Bell, Check, CheckCircle, AlertCircle, Clock, FileText, Trash2 } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"

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
    <div className="p-6 space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-foreground">通知</h1>
            <p className="text-muted-foreground mt-1">
              実験レポートやストレージ状況などの更新を確認できます
              {unreadCount > 0 && (
                <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-destructive/20 text-destructive rounded-full">
                  {unreadCount}件の未読
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={fetchNotifications} disabled={isLoading}>
              再読み込み
            </Button>
            {unreadCount > 0 && (
              <Button onClick={markAllAsRead} variant="outline" className="gap-2 bg-transparent">
                <Check className="h-4 w-4" />
                すべて既読にする
              </Button>
            )}
          </div>
        </div>
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="flex gap-2"
      >
        <button
          onClick={() => setFilter("unread")}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            filter === "unread"
              ? "bg-primary text-white"
              : "bg-white text-foreground border border-border hover:bg-accent"
          }`}
          style={
            filter === "unread"
              ? {
                  boxShadow: "0 0 20px rgba(94, 234, 212, 0.4)",
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
              ? "bg-primary text-white"
              : "bg-white text-foreground border border-border hover:bg-accent"
          }`}
          style={
            filter === "read"
              ? {
                  boxShadow: "0 0 20px rgba(94, 234, 212, 0.4)",
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
              ? "bg-primary text-white"
              : "bg-white text-foreground border border-border hover:bg-accent"
          }`}
          style={
            filter === "all"
              ? {
                  boxShadow: "0 0 20px rgba(94, 234, 212, 0.4)",
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
              <div key={idx} className="animate-pulse bg-white rounded-xl border border-border p-6 space-y-3">
                <div className="h-4 w-1/3 bg-muted rounded" />
                <div className="h-4 w-2/3 bg-muted rounded" />
                <div className="h-3 w-1/4 bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-16 text-red-500">{error}</div>
        ) : filteredNotifications.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="bg-white rounded-xl border border-border p-12 text-center"
          >
            <Bell className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-30" />
            <p className="text-muted-foreground text-lg">
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
              className={`bg-white rounded-xl border border-border p-6 hover:shadow-lg transition-all ${
                !notification.read ? "bg-primary/5" : ""
              }`}
              style={
                !notification.read
                  ? {
                      boxShadow: "0 0 15px rgba(94, 234, 212, 0.15)",
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
                        <h3 className="font-semibold text-foreground">{notification.title}</h3>
                        {!notification.read && <span className="h-2 w-2 bg-primary rounded-full" />}
                      </div>
                      <p className="text-muted-foreground mt-1">{notification.message}</p>
                      <div className="flex items-center gap-4 mt-3">
                        <p className="text-xs text-muted-foreground">{notification.time}</p>
                        {notification.link && (
                          <Link
                            href={notification.link}
                            className="text-xs text-primary hover:text-primary/80 font-medium"
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
                          className="p-2 text-muted-foreground hover:text-primary transition-colors rounded-lg hover:bg-accent"
                          title="既読にする"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => deleteNotification(notification.id)}
                        className="p-2 text-muted-foreground hover:text-destructive transition-colors rounded-lg hover:bg-accent"
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
    </div>
  )
}
