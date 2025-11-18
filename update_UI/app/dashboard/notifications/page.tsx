"use client"

import { motion } from "framer-motion"
import { Bell, CheckCircle, AlertCircle, Clock, FileText, Trash2, Check } from "lucide-react"
import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

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
    message: "ストレージ使用量が80%に達しました。Premiumプランへのアップグレードをご検討ください。",
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
  {
    id: "5",
    type: "success",
    title: "レポートダウンロード",
    message: "「実験3のレポート」のダウンロードが完了しました",
    time: "5時間前",
    read: true,
  },
  {
    id: "6",
    type: "info",
    title: "システムメンテナンス",
    message: "本日23:00〜24:00の間、システムメンテナンスを実施します",
    time: "昨日",
    read: true,
  },
  {
    id: "7",
    type: "success",
    title: "アカウント作成完了",
    message: "アカウントの作成が完了しました。Reportlabへようこそ！", // Updated message
    time: "3日前",
    read: true,
  },
]

export default function NotificationsPage() {
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all")
  const [notifications, setNotifications] = useState(mockNotifications)

  const filteredNotifications = notifications.filter((n) => {
    if (filter === "unread") return !n.read
    if (filter === "read") return n.read
    return true
  })

  const unreadCount = notifications.filter((n) => !n.read).length

  const markAsRead = (id: string) => {
    setNotifications(notifications.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }

  const markAllAsRead = () => {
    setNotifications(notifications.map((n) => ({ ...n, read: true })))
  }

  const deleteNotification = (id: string) => {
    setNotifications(notifications.filter((n) => n.id !== id))
  }

  const getIcon = (type: string) => {
    switch (type) {
      case "success":
        return <CheckCircle className="h-6 w-6 text-primary" />
      case "warning":
        return <AlertCircle className="h-6 w-6 text-amber-500" />
      case "info":
        return <Clock className="h-6 w-6 text-secondary" />
      default:
        return <FileText className="h-6 w-6 text-muted-foreground" />
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">通知</h1>
            <p className="text-muted-foreground mt-1">
              実験レポートの作成状況を確認できます
              {unreadCount > 0 && (
                <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-destructive/20 text-destructive rounded-full">
                  {unreadCount}件の未読
                </span>
              )}
            </p>
          </div>
          {unreadCount > 0 && (
            <Button onClick={markAllAsRead} variant="outline" className="gap-2 bg-transparent text-justify">
              <Check className="h-4 w-4" />
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="lucide lucide-check h-4 w-4"
              ></svg>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="lucide lucide-check h-4 w-4"
              >
                <path d="M20 6 9 17l-5-5"></path>
              </svg>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="lucide lucide-check h-4 w-4"
              ></svg>
              すべて既読にする
            </Button>
          )}
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
      </motion.div>

      {/* Notifications List */}
      <div className="space-y-3">
        {filteredNotifications.length === 0 ? (
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
                <div className="flex-shrink-0 mt-1">{getIcon(notification.type)}</div>

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
