"use client"

import { motion, AnimatePresence } from "framer-motion"
import { Bell, X, FileText, CheckCircle, AlertCircle, Clock } from "lucide-react"
import { useState } from "react"
import Link from "next/link"

interface Notification {
  id: string
  type: "success" | "warning" | "info"
  title: string
  message: string
  time: string
  link?: string
  read: boolean
}

const mockNotifications: Notification[] = [
  {
    id: "1",
    type: "success",
    title: "レポート作成完了",
    message: "「実験1のレポート」の生成が完了しました",
    time: "2分前",
    link: "/dashboard/reports",
    read: false,
  },
  {
    id: "2",
    type: "info",
    title: "処理中",
    message: "「実験2のレポート」を処理中です(65%完了)",
    time: "10分前",
    link: "/dashboard/reports",
    read: false,
  },
  {
    id: "3",
    type: "warning",
    title: "ストレージ容量の警告",
    message: "ストレージ使用量が80%に達しました",
    time: "1時間前",
    link: "/dashboard/settings",
    read: true,
  },
  {
    id: "4",
    type: "success",
    title: "アップロード完了",
    message: "実験データのアップロードが完了しました",
    time: "3時間前",
    read: true,
  },
]

export function NotificationPanel() {
  const [isOpen, setIsOpen] = useState(false)
  const [notifications, setNotifications] = useState(mockNotifications)

  const unreadCount = notifications.filter((n) => !n.read).length

  const markAsRead = (id: string) => {
    setNotifications(notifications.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }

  const markAllAsRead = () => {
    setNotifications(notifications.map((n) => ({ ...n, read: true })))
  }

  const getIcon = (type: string) => {
    switch (type) {
      case "success":
        return <CheckCircle className="h-5 w-5 text-primary" />
      case "warning":
        return <AlertCircle className="h-5 w-5 text-amber-500" />
      case "info":
        return <Clock className="h-5 w-5 text-secondary" />
      default:
        return <FileText className="h-5 w-5 text-muted-foreground" />
    }
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
              className="absolute right-0 mt-2 w-96 bg-white border border-border rounded-xl shadow-2xl z-50 overflow-hidden"
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

              {/* Notification List */}
              <div className="max-h-96 overflow-y-auto bg-white">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <Bell className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>通知はありません</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {notifications.map((notification) => (
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
                              <div className="flex-shrink-0 mt-1">{getIcon(notification.type)}</div>
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
                            <div className="flex-shrink-0 mt-1">{getIcon(notification.type)}</div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <h4 className="font-semibold text-sm text-foreground">{notification.title}</h4>
                                {!notification.read && (
                                  <span className="flex-shrink-0 h-2 w-2 bg-primary rounded-full mt-1" />
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{notification.message}</p>
                              <p className="text-xs text-muted-foreground mt-2">{notification.time}</p>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    ))}
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
