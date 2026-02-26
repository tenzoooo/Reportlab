"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Sparkles } from "lucide-react"

export function Header() {
  return (
    <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-purple-800 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-purple-600 to-purple-800 bg-clip-text text-transparent">
              ReportAI
            </span>
          </Link>

          <nav className="flex items-center gap-6">
            <Link
              href="/workflow"
              className="text-sm font-medium hover:text-purple-600 transition-colors hidden md:block"
            >
              ワークフロー
            </Link>
            <Link
              href="/history"
              className="text-sm font-medium hover:text-purple-600 transition-colors hidden md:block"
            >
              履歴
            </Link>
            <Link href="/pricing" className="text-sm font-medium hover:text-purple-600 transition-colors">
              料金
            </Link>
            <Link href="/auth/signin">
              <Button variant="outline" size="sm" className="rounded-xl bg-transparent">
                ログイン
              </Button>
            </Link>
            <Link href="/auth/signup">
              <Button size="sm" className="rounded-xl shadow-lg">
                今すぐ体験
              </Button>
            </Link>
          </nav>
        </div>
      </div>
    </header>
  )
}
