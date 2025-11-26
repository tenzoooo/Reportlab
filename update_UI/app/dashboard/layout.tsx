"use client"

import type React from "react"

import { FlaskConical, LayoutDashboard, FileText, Plus, Settings, User, MessageSquare, LogOut } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Suspense, useEffect, useState } from "react"
import Image from "next/image"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { NotificationPanel } from "@/components/notification-panel"
import { SearchDialog } from "@/components/search-dialog"
import { createClient } from "@/lib/supabase/client"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [userEmail, setUserEmail] = useState<string>("")
  const [credits, setCredits] = useState<number | null>(null)
  const [storageUsage, setStorageUsage] = useState<number>(0)
  // Avoid hydration mismatch for Radix Dropdown by rendering it after mount
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const run = async () => {
      try {
        const supabase = createClient()

        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (user?.email) setUserEmail(user.email)

        // Fetch user profile for credits
        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("credits")
            .eq("id", user.id)
            .single()

          if (profile) {
            setCredits(profile.credits)
          }

          // Fetch storage usage
          const { data: usage } = await supabase.rpc("get_storage_usage", { user_id: user.id })
          if (typeof usage === "number") {
            setStorageUsage(usage)
          }
        }

        // Ensure each logged-in user has a Stripe customer row and metadata
        if (user) {
          const apiSecret = process.env.NEXT_PUBLIC_API_ROUTE_SECRET
          if (apiSecret) {
            const res = await fetch("/api/stripe/create-customer", {
              method: "POST",
              headers: { "x-api-route-secret": apiSecret },
            })
            if (!res.ok) {
              console.error("Failed to ensure Stripe customer", await res.text())
            }
          } else {
            console.warn("API route secret not set; skipping Stripe customer ensure")
          }
        }
      } catch (err) {
        console.error("Failed to initialize dashboard", err)
      }
    }
    run()
    setMounted(true)
  }, [])

  const navigation = [
    {
      title: "ダッシュボード",
      href: "/dashboard",
      icon: LayoutDashboard,
    },
    {
      title: "レポート一覧",
      href: "/dashboard/reports",
      icon: FileText,
    },
    {
      title: "新規作成",
      href: "/dashboard/reports/new",
      icon: Plus,
    },
    /*
    {
      title: "テンプレ検証",
      href: "/dashboard/template-playground",
      icon: FlaskConical,
    },
    */
    {
      title: "設定",
      href: "/dashboard/settings",
      icon: Settings,
    },
  ]

  return (
    <SidebarProvider defaultOpen={true}>
      <Sidebar side="left" variant="sidebar" collapsible="icon">
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2 py-2">
            <Image src="/app-icon.png" alt="App Icon" width={24} height={24} className="flex-shrink-0" />
            <span className="text-sm font-bold text-gray-900 truncate group-data-[collapsible=icon]:hidden">
              Reportlab
            </span>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarMenu>
            {navigation.map((item) => {
              const isActive = pathname === item.href
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
                    <Link href={item.href} className="flex items-center gap-3">
                      <item.icon className="h-5 w-5" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarContent>

        <SidebarFooter>
          <div className="px-2 py-4 space-y-4 group-data-[collapsible=icon]:hidden">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">ストレージ使用量</span>
              </div>
              <Progress value={Math.min((storageUsage / (100 * 1024 * 1024)) * 100, 100)} className="h-2" />
              <p className="text-xs text-gray-500">{(storageUsage / (1024 * 1024)).toFixed(1)} MB / 100 MB</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">クレジット残数</span>
              </div>
              <p className="text-xs text-gray-500">{credits !== null ? `${credits} クレジット` : "読み込み中..."}</p>
            </div>
            <Link href="/dashboard/settings?tab=subscription" className="block">
              <Button variant="outline" size="sm" className="w-full gradient-button bg-transparent">
                Premiumへ
              </Button>
            </Link>
            <Link href="/feedback" className="block">
              <Button variant="outline" size="sm" className="w-full bg-white hover:bg-gray-50">
                <MessageSquare className="h-4 w-4 mr-2" />
                フィードバックを送る
              </Button>
            </Link>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        {/* Header */}
        <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-200">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
              <div className="hidden md:block">
                <span className="text-xl font-bold text-gray-900">Reportlab</span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Search */}
              <SearchDialog />

              <NotificationPanel />

              {/* User Menu */}
              {mounted ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-full">
                      <div className="h-8 w-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold">
                        <User className="h-5 w-5" />
                      </div>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 bg-white border-border">
                    {userEmail && (
                      <div className="px-2 py-1.5 text-xs text-gray-500 select-text">
                        {userEmail}
                      </div>
                    )}
                    <DropdownMenuItem>
                      <Link href="/dashboard/profile" className="w-full">
                        プロフィール
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Link href="/dashboard/settings" className="w-full">
                        設定
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Link href="/help" className="w-full">
                        ヘルプ
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={async () => {
                        const supabase = createClient()
                        await supabase.auth.signOut()
                        router.push('/login')
                      }}
                      className="text-red-600 cursor-pointer"
                    >
                      <LogOut className="h-4 w-4 mr-2" /> ログアウト
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <div className="h-9 w-9 rounded-full bg-gray-100" aria-hidden />
              )}
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-auto">
          <Suspense fallback={<div>Loading...</div>}>{children}</Suspense>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
