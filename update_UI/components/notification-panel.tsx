"use client"

import { motion, AnimatePresence } from "framer-motion"
import { Bell, X, FileText, AlertCircle, Clock, Upload, Megaphone } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"

const CATEGORY_CONFIG = {
  report: {
    label: "レポート作成完了",
    description: "最新の生成済みレポート",
    icon: FileText,
    accent: "text-primary",
  },
  processing: {
    label: "処理中",
    description: "現在実行中の処理状況",
    icon: Clock,
    accent: "text-sky-600",
  },
  storage: {
    label: "ストレージ容量警告",
    description: "容量超過に関する注意",
    icon: AlertCircle,
    accent: "text-amber-500",
  },
  upload: {
    label: "アップロード完了",
    description: "ファイルアップロードに関する通知",
    icon: Upload,
    accent: "text-emerald-600",
  },
  announcement: {
    label: "運営からのお知らせ",
    description: "メンテナンスやリリース情報",
    icon: Megaphone,
    accent: "text-purple-600",
  },
} as const

type NotificationCategory = keyof typeof CATEGORY_CONFIG

interface NotificationItem {
  id: string
  title: string
  message: string
  time: string
  createdAt?: string | null
  link?: string
  read: boolean
  category: NotificationCategory
}

type NotificationsResponse = {
  notifications: NotificationItem[]
}

export function NotificationPanel() {
  const [isOpen, setIsOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const unreadCount = notifications.filter((n) => !n.read).length

  const categoryKeys = useMemo(
    () => Object.keys(CATEGORY_CONFIG) as NotificationCategory[],
    []
  )

  const notificationsByCategory = useMemo(() => {
    const grouped = categoryKeys.reduce<Record<NotificationCategory, NotificationItem[]>>((acc, key) => {
      acc[key] = []
      return acc
    }, {} as Record<NotificationCategory, NotificationItem[]>)

    notifications.forEach((notification) => {
      if (grouped[notification.category]) {
        grouped[notification.category].push(notification)
      }
    })

    return grouped
  }, [notifications, categoryKeys])

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
      console.error("[notification-panel] failed to load notifications", err)
      setError("通知の取得に失敗しました")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  const markAsRead = (id: string) => {
    setNotifications(notifications.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }

  const markAllAsRead = () => {
    setNotifications(notifications.map((n) => ({ ...n, read: true })))
  }

  const getIcon = (category: NotificationCategory) => {
    const Icon = CATEGORY_CONFIG[category].icon
    return <Icon className={`h-5 w-5 ${CATEGORY_CONFIG[category].accent}`} />
  }

  return (
    <div className="relative">
      {/* Bell Icon Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-foreground/60 hover:text-foreground transition-colors rounded-lg hover:bg-accent"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center"
            style={{
              boxShadow: "0 0 10px rgba(239, 68, 68, 0.5)",
            }}
          >
            {unreadCount}
          </motion.span>
        )}
      </button>

      {/* Notification Panel */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 z-40 bg-white"
            />

            {/* Panel */}
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="absolute right-0 mt-2 w-96 bg-white border border-border rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col max-h-[80vh]"
              style={{
                boxShadow: "0 0 30px rgba(94, 234, 212, 0.15), 0 10px 40px rgba(0, 0, 0, 0.3)",
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-border bg-gray-50">
                <div className="flex items-center gap-2">
                  <Bell className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-foreground">通知</h3>
                  {unreadCount > 0 && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-destructive/20 text-destructive rounded-full">
                      {unreadCount}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-accent"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Mark all as read button */}
              {unreadCount > 0 && (
                <div className="px-4 py-2 border-b border-border bg-white">
                  <button
                    onClick={markAllAsRead}
                    className="text-sm text-primary hover:text-primary/80 transition-colors"
                  >
                    すべて既読にする
                  </button>
                </div>
              )}

              {/* Category Overview */}
              <div className="px-4 py-3 border-b border-border bg-white">
                <div className="grid grid-cols-1 gap-3">
                  {categoryKeys.map((categoryKey) => {
                    const config = CATEGORY_CONFIG[categoryKey]
                    const items = notificationsByCategory[categoryKey]
                    const latest = items[0]
                    return (
                      <div
                        key={categoryKey}
                        className="flex items-start gap-3 rounded-lg border border-border/70 px-3 py-2 bg-white/80"
                      >
                        <div className="mt-0.5">{getIcon(categoryKey)}</div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-foreground">{config.label}</p>
                            <span className="text-xs text-muted-foreground">
                              {items.length > 0 ? `${items.length}件` : "通知なし"}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">{config.description}</p>
                          {latest && (
                            <p className="text-xs text-foreground mt-1 line-clamp-1">
                              ・{latest.title}（{latest.time}）
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Notification List */}
              <div className="flex-1 overflow-y-auto bg-white">
                {isLoading ? (
                  <div className="flex flex-col gap-2 p-4">
                    {Array.from({ length: 3 }).map((_, idx) => (
                      <div key={idx} className="animate-pulse space-y-2 rounded-lg border border-border/60 p-4">
                        <div className="h-3 w-1/3 bg-muted rounded" />
                        <div className="h-3 w-2/3 bg-muted rounded" />
                        <div className="h-3 w-1/4 bg-muted rounded" />
                      </div>
                    ))}
                  </div>
                ) : error ? (
                  <div className="p-6 text-center text-sm text-red-500">{error}</div>
                ) : notifications.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <Bell className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>通知はありません</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {categoryKeys.map((categoryKey) => {
                      const config = CATEGORY_CONFIG[categoryKey]
                      const items = notificationsByCategory[categoryKey]
                      if (!items || items.length === 0) {
                        return null
                      }
                      return (
                        <div key={categoryKey}>
                          <div className="px-4 py-2 bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            {config.label}
                          </div>
                          {items.map((notification) => (
                            <motion.div
                              key={notification.id}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className={`p-4 hover:bg-accent transition-colors cursor-pointer ${
                                !notification.read ? "bg-primary/5" : ""
                              }`}
                              onClick={() => markAsRead(notification.id)}
                            >
                              {notification.link ? (
                                <Link href={notification.link} onClick={() => setIsOpen(false)}>
                                  <div className="flex gap-3">
                                    <div className="flex-shrink-0 mt-1">{getIcon(notification.category)}</div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-start justify-between gap-2">
                                        <h4 className="font-semibold text-sm text-foreground">{notification.title}</h4>
                                        {!notification.read && (
                                          <span className="flex-shrink-0 h-2 w-2 bg-primary rounded-full mt-1" />
                                        )}
                                      </div>
                                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                        {notification.message}
                                      </p>
                                      <p className="text-xs text-muted-foreground mt-2">{notification.time}</p>
                                    </div>
                                  </div>
                                </Link>
                              ) : (
                                <div className="flex gap-3">
                                  <div className="flex-shrink-0 mt-1">{getIcon(notification.category)}</div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-2">
                                      <h4 className="font-semibold text-sm text-foreground">{notification.title}</h4>
                                      {!notification.read && (
                                        <span className="flex-shrink-0 h-2 w-2 bg-primary rounded-full mt-1" />
                                      )}
                                    </div>
                                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                      {notification.message}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-2">{notification.time}</p>
                                  </div>
                                </div>
                              )}
                            </motion.div>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-3 border-t border-border bg-gray-50">
                <Link
                  href="/dashboard/notifications"
                  onClick={() => setIsOpen(false)}
                  className="block text-center text-sm text-primary hover:text-primary/80 transition-colors"
                >
                  すべての通知を見る
                </Link>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
