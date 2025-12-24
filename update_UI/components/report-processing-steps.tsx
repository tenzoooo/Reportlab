import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { AlertCircle, CheckCircle, Clock3, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type React from "react"

export type ProcessingStepStatus = "pending" | "active" | "done" | "error"

export type ProcessingStep = {
  key: string
  label: string
  description?: string
  status: ProcessingStepStatus
}

type Props = {
  open: boolean
  onOpenChange?: (open: boolean) => void
  title?: string
  headerStatusLabel?: string
  steps: ProcessingStep[]
  details?: React.ReactNode
  footerNote?: string
  onCancel?: () => void
  cancelLabel?: string
}

const statusIcon = (status: ProcessingStepStatus) => {
  switch (status) {
    case "done":
      return <CheckCircle className="h-4 w-4 text-emerald-500" />
    case "active":
      return <Loader2 className="h-4 w-4 text-primary animate-spin" />
    case "error":
      return <AlertCircle className="h-4 w-4 text-destructive" />
    case "pending":
    default:
      return <Clock3 className="h-4 w-4 text-muted-foreground" />
  }
}

const statusLabel = (status: ProcessingStepStatus) => {
  switch (status) {
    case "done":
      return "完了"
    case "active":
      return "実行中"
    case "error":
      return "エラー"
    case "pending":
    default:
      return "待機"
  }
}

export function ReportProcessingSteps({
  open,
  onOpenChange,
  title = "AIが処理中です",
  headerStatusLabel = "処理中",
  steps,
  details,
  footerNote,
  onCancel,
  cancelLabel = "処理を停止",
}: Props) {
  const total = steps.length || 1
  const completed = steps.filter((s) => s.status === "done").length
  const progress = Math.round((completed / total) * 100)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-white" overlayClassName="bg-white">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{title}</span>
            <Badge variant="outline" className="text-xs">
              {headerStatusLabel}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">進行状況</span>
            <span className="text-sm font-semibold text-foreground">{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />

          <div className="space-y-3">
            {steps.map((step) => (
              <div
                key={step.key}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-3",
                  step.status === "active" ? "border-primary/60 bg-primary/5" : "border-border",
                  step.status === "error" ? "border-destructive/60 bg-destructive/5" : ""
                )}
              >
                <div className="mt-0.5">{statusIcon(step.status)}</div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-foreground">{step.label}</p>
                    <Badge
                      variant={step.status === "error" ? "destructive" : step.status === "active" ? "default" : "outline"}
                      className="text-[11px]"
                    >
                      {statusLabel(step.status)}
                    </Badge>
                  </div>
                  {step.description && <p className="text-xs text-muted-foreground leading-relaxed">{step.description}</p>}
                </div>
              </div>
            ))}
          </div>

          {details ? <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">{details}</div> : null}

          <div className="flex items-center justify-between gap-3">
            {footerNote ? <p className="text-xs text-muted-foreground">{footerNote}</p> : <span />}
            {onCancel && (
              <Button variant="outline" size="sm" onClick={onCancel}>
                {cancelLabel}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
