import type React from "react"

import { cn } from "@/lib/utils"

type DashboardPageShellProps = {
  title: string
  subtitle?: string
  icon?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
  hideHeader?: boolean
}

export default function DashboardPageShell({
  title,
  subtitle,
  icon,
  actions,
  children,
  className,
  hideHeader,
}: DashboardPageShellProps) {
  return (
    <div className={cn("relative px-6 py-10 sm:px-10 lg:px-12", className)}>
      <div className="max-w-7xl mx-auto space-y-10">
        {!hideHeader && (
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              {icon ? (
                <div className="h-12 w-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-sm">
                  {icon}
                </div>
              ) : null}
              <div className="space-y-1">
                <h1 className="text-3xl sm:text-4xl font-bold text-foreground instrument tracking-tight">
                  {title}
                </h1>
                {subtitle ? <p className="text-sm text-muted-foreground mincho">{subtitle}</p> : null}
              </div>
            </div>
            {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}