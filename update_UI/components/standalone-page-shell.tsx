import type React from "react"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

type StandalonePageShellProps = {
  title: string
  subtitle?: string
  backHref?: string
  backLabel?: string
  badge?: string
  children: React.ReactNode
  className?: string
}

export default function StandalonePageShell({
  title,
  subtitle,
  backHref,
  backLabel = "前のページに戻る",
  badge,
  children,
  className,
}: StandalonePageShellProps) {
  return (
    <div className={cn("relative min-h-screen bg-[#0a0c10] text-white overflow-hidden", className)}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.08),transparent_45%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.06),transparent_40%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:36px_36px] pointer-events-none" />

      <div className="relative z-10 max-w-5xl mx-auto px-6 sm:px-10 py-12 space-y-10">
        {backHref ? (
          <Button asChild variant="ghost" className="gap-2 text-slate-300 hover:text-white hover:bg-white/5">
            <Link href={backHref}>
              <ArrowLeft className="h-4 w-4" />
              {backLabel}
            </Link>
          </Button>
        ) : null}

        <div className="space-y-4">
          {badge ? (
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.25em] text-slate-300">
              {badge}
            </span>
          ) : null}
          <div className="space-y-2">
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight instrument">{title}</h1>
            {subtitle ? <p className="text-base sm:text-lg text-slate-300 mincho">{subtitle}</p> : null}
          </div>
        </div>

        {children}
      </div>
    </div>
  )
}
