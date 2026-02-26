"use client"

import type React from "react"
import { LayoutDashboard, FileText, Plus, Settings, User, MessageSquare, LogOut } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Suspense, useEffect, useState } from "react"
import Image from "next/image"
import { motion } from "framer-motion"
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
import { NotificationPanel } from "@/components/notification-panel"
import { SearchDialog } from "@/components/search-dialog"
import { createClient } from "@/lib/supabase/client"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [userEmail, setUserEmail] = useState<string>("")
  const [credits, setCredits] = useState<number | null>(null)
  const [storageUsage, setStorageUsage] = useState<number>(0)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const run = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (user?.email) setUserEmail(user.email)

        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("credits")
            .eq("id", user.id)
            .single()

          if (profile) setCredits(profile.credits)

          const { data: usage } = await supabase.rpc("get_storage_usage", { user_id: user.id })
          if (typeof usage === "number") setStorageUsage(usage)
        }

        if (user) {
          const apiSecret = process.env.NEXT_PUBLIC_API_ROUTE_SECRET
          if (apiSecret) {
            await fetch("/api/stripe/create-customer", {
              method: "POST",
              headers: { "x-api-route-secret": apiSecret },
            })
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
    { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { title: "Reports", href: "/dashboard/reports", icon: FileText },
    { title: "Create New", href: "/dashboard/reports/new", icon: Plus },
    { title: "Settings", href: "/dashboard/settings", icon: Settings },
  ]

  return (
    <SidebarProvider defaultOpen={true}>
      <Sidebar 
        side="left" 
        variant="sidebar" 
        collapsible="icon"
        className="border-r border-sidebar-border bg-sidebar/80 backdrop-blur-3xl"
      >
        <SidebarHeader className="p-0">
          <div className="flex items-center gap-3 px-6 py-10">
            <motion.div 
              whileHover={{ rotate: 10, scale: 1.1 }}
              className="h-10 w-10 relative flex-shrink-0 bg-primary/10 rounded-2xl shadow-sm p-2"
            >
              <Image src="/icon.png" alt="App Icon" fill className="object-contain p-1.5" priority />
            </motion.div>
            <span className="text-2xl font-bold text-foreground instrument tracking-tighter group-data-[collapsible=icon]:hidden">
              Reportlab
            </span>
          </div>
        </SidebarHeader>

        <SidebarContent className="px-4">
          <SidebarMenu className="space-y-2">
            {navigation.map((item) => {
              const isActive = pathname === item.href
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton 
                    asChild 
                    isActive={isActive} 
                    tooltip={item.title}
                    className={`relative flex items-center gap-3 h-12 px-4 rounded-2xl transition-all duration-300 group ${
                      isActive 
                        ? "bg-primary/10 text-primary border border-primary/20 shadow-sm" 
                        : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                    }`}
                  >
                    <Link href={item.href}>
                      <item.icon className={`h-5 w-5 transition-transform duration-300 group-hover:scale-110 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                      <span className={`font-semibold tracking-tight ${isActive ? "instrument text-base" : "mincho text-sm"}`}>
                        {item.title}
                      </span>
                      {isActive && (
                        <motion.div 
                          layoutId="active-nav"
                          className="absolute left-0 w-1.5 h-6 bg-primary rounded-full"
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                        />
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarContent>

        <SidebarFooter className="p-6 border-t border-sidebar-border">
          <div className="space-y-6 group-data-[collapsible=icon]:hidden">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-bold">
                <span>Storage</span>
                <span className="text-foreground">{(storageUsage / (1024 * 1024)).toFixed(1)}MB</span>
              </div>
              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden border border-border">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min((storageUsage / (100 * 1024 * 1024)) * 100, 100)}%` }}
                  className="h-full bg-gradient-to-r from-primary to-indigo-500"
                />
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-gradient-to-br from-primary to-indigo-600 shadow-lg text-primary-foreground relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-70 mb-1">Laboratory Points</p>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold instrument">{credits !== null ? credits : "—"}</span>
                <span className="text-[10px] font-bold opacity-80">LP</span>
              </div>
            </div>

            <Link href="/feedback" className="block">
              <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground hover:text-foreground text-xs gap-2 px-2 hover:bg-sidebar-accent rounded-xl transition-all">
                <MessageSquare className="h-4 w-4" />
                <span className="font-bold uppercase tracking-widest text-[10px]">Feedback</span>
              </Button>
            </Link>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="bg-background relative">
        {/* 背景のグリッド */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:40px_40px] opacity-20 pointer-events-none" />
        
        {/* Header */}
        <header className="sticky top-0 z-50 bg-background/40 backdrop-blur-md border-b border-border">
          <div className="flex h-16 items-center justify-between px-4 sm:px-10">
            <div className="flex items-center gap-6">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground transition-colors" />
              <div className="h-4 w-[1px] bg-border hidden sm:block" />
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-[0.3em] hidden sm:block">
                {navigation.find(n => n.href === pathname)?.title || "Dashboard"}
              </div>
            </div>

            <div className="flex items-center gap-5">
              <div className="flex items-center gap-2">
                <SearchDialog />
                <NotificationPanel />
              </div>
              
              <div className="h-8 w-[1px] bg-border mx-1" />

              {mounted ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-3 group outline-none">
                      <div className="text-right hidden lg:block">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none mb-1">Admin</p>
                        <p className="text-xs font-bold text-foreground truncate max-w-[120px]">{userEmail.split('@')[0]}</p>
                      </div>
                      <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-muted to-secondary shadow-sm border border-border flex items-center justify-center text-primary transition-all group-hover:border-primary/50">
                        <User className="h-5 w-5" />
                      </div>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64 p-3 bg-card/80 backdrop-blur-2xl border-border/40 rounded-[2rem] shadow-2xl space-y-1">
                    <div className="px-4 py-4 mb-2 bg-muted/50 rounded-2xl border border-border">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Logged in as</p>
                      <p className="text-sm font-bold text-foreground truncate">{userEmail}</p>
                    </div>
                    <DropdownMenuItem asChild className="rounded-xl cursor-pointer py-2.5 focus:bg-primary/10 focus:text-primary font-semibold">
                      <Link href="/dashboard/profile">プロフィール</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild className="rounded-xl cursor-pointer py-2.5 focus:bg-primary/10 focus:text-primary font-semibold">
                      <Link href="/dashboard/settings">設定</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild className="rounded-xl cursor-pointer py-2.5 focus:bg-primary/10 focus:text-primary font-semibold">
                      <Link href="/help">ヘルプ</Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-border opacity-50" />
                    <DropdownMenuItem
                      onClick={async () => {
                        const supabase = createClient()
                        await supabase.auth.signOut()
                        router.push('/login')
                      }}
                      className="text-red-500 font-bold rounded-xl cursor-pointer py-2.5 focus:bg-red-500/10 focus:text-red-500"
                    >
                      <LogOut className="h-4 w-4 mr-2" /> Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <div className="h-9 w-9 rounded-xl bg-muted animate-pulse border border-border" />
              )}
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 relative">
          <Suspense fallback={
            <div className="flex h-[calc(100vh-64px)] items-center justify-center">
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full" 
              />
            </div>
          }>
            {children}
          </Suspense>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}