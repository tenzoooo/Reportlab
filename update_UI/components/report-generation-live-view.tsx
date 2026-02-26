import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { CheckCircle2, Clock3, FileText, Loader2 } from "lucide-react"
import { useMemo } from "react"

export type LiveSnapshot = {
  step?: string
  storage_key?: string
}

export type LiveStats = {
  pdf_pages?: number | null
  method_tree_count?: number
  experiments_count?: number
  images_count?: number
  tables_count?: number
  prompts_count?: number
}

export type LivePreviews = {
  method_text?: string
  discussion_text?: string
  prompts?: string[]
  method_tree?: string[]
  experiment_names?: string[]
}

export type AgentProgressLike = {
  status?: string
  updated_at?: string
  last_step?: string
  snapshots?: LiveSnapshot[]
  stats?: LiveStats
  previews?: LivePreviews
  ui?: {
    phase?: string
    detail?: string
    current_experiment?: string
  }
}

type StepStatus = "pending" | "active" | "done"

type Props = {
  title: string
  reportTitle?: string
  percent: number
  currentLabel?: string
  progress?: AgentProgressLike | null
  stepLabels?: Record<string, string>
  fileNames?: string[]
  note?: string
  onCancel?: () => void
  cancelLabel?: string
  className?: string
}

type LayerFlow = {
  id: string
  label: string
  watchKeys: string[]
  displaySteps: string[]
}

const LAYER_FLOWS: LayerFlow[] = [
  {
    id: "a",
    label: "Aレイヤー",
    watchKeys: ["session_start", "ingest", "normalize_inputs", "classify_assets"],
    displaySteps: ["セッション開始", "準備", "入力正規化"],
  },
  {
    id: "b",
    label: "Bレイヤー",
    watchKeys: ["map_result_numbers", "normalize_ommlify_formula"],
    displaySteps: ["結果番号対応付け", "理論式正規化"],
  },
  {
    id: "c",
    label: "Cレイヤー",
    watchKeys: ["bc_layer_parallel"],
    displaySteps: ["過去レポート構造ヒント抽出"],
  },
  {
    id: "d_to_i",
    label: "D-Iレイヤー",
    watchKeys: ["run_d_to_i_per_experiment"],
    displaySteps: ["実験単位処理", "表計算解析", "図表生成"],
  },
  {
    id: "n_to_k",
    label: "N-Kレイヤー",
    watchKeys: ["n_build_discussion_summary", "m_compose_footer", "j_merge_payload", "k_compose_markdown"],
    displaySteps: ["考察/まとめ生成", "統合", "Markdown化"],
  },
  {
    id: "l",
    label: "Lレイヤー",
    watchKeys: ["l_render_docx", "l_emit_outputs"],
    displaySteps: ["DOCX出力", "成果物保存"],
  },
]

const ALL_WATCH_KEYS = LAYER_FLOWS.flatMap((layer) => layer.watchKeys)

const formatTs = (value?: string) => {
  if (!value) return "-"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "-"
  return d.toLocaleTimeString()
}

const computeActiveKey = (done: Set<string>, lastStep?: string) => {
  if (lastStep && !done.has(lastStep)) return lastStep
  for (const key of ALL_WATCH_KEYS) {
    if (!done.has(key)) return key
  }
  return ""
}

const iconFor = (status: StepStatus) => {
  if (status === "done") return <CheckCircle2 className="h-4 w-4 text-blue-600" />
  if (status === "active") return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
  return <Clock3 className="h-4 w-4 text-black/50 dark:text-white/50" />
}

export function ReportGenerationLiveView({
  title,
  percent,
  currentLabel,
  progress,
  stepLabels,
  fileNames,
  note,
  onCancel,
  cancelLabel = "キャンセル",
  className,
}: Props) {
  const snapshots = Array.isArray(progress?.snapshots) ? progress.snapshots : []
  const doneSet = useMemo(() => {
    const set = new Set<string>()
    for (const item of snapshots) {
      if (typeof item?.step === "string" && item.step) set.add(item.step)
    }
    return set
  }, [snapshots])

  const activeKey = useMemo(() => computeActiveKey(doneSet, progress?.last_step), [doneSet, progress?.last_step])

  const computedPercent = useMemo(() => {
    const total = ALL_WATCH_KEYS.length || 1
    const doneCount = ALL_WATCH_KEYS.filter((k) => doneSet.has(k)).length
    const fromSteps = Math.round((doneCount / total) * 100)
    const fromProp = Math.max(0, Math.min(100, Math.round(percent)))
    return Math.max(fromSteps, fromProp)
  }, [doneSet, percent])

  const flowStates = useMemo(() => {
    return LAYER_FLOWS.map((layer) => {
      const doneCount = layer.watchKeys.filter((k) => doneSet.has(k)).length
      const isDone = doneCount >= layer.watchKeys.length
      const isActive = !isDone && (layer.watchKeys.includes(activeKey) || doneCount > 0)
      const status: StepStatus = isDone ? "done" : isActive ? "active" : "pending"
      return { ...layer, status }
    })
  }, [activeKey, doneSet])

  const activeLayerIndex = flowStates.findIndex((layer) => layer.status === "active")
  const doneLayerCount = flowStates.filter((layer) => layer.status === "done").length
  const revealUntil = Math.min(
    flowStates.length - 1,
    Math.max(activeLayerIndex >= 0 ? activeLayerIndex : doneLayerCount, doneLayerCount)
  )
  const visibleFlows = flowStates.filter((_, idx) => idx <= revealUntil)
  const hiddenFlowCount = Math.max(0, flowStates.length - visibleFlows.length)
  const previewMarkdown = useMemo(() => {
    const method = progress?.previews?.method_text?.trim() || ""
    if (method) return method
    const prompts = Array.isArray(progress?.previews?.prompts) ? progress?.previews?.prompts : []
    if (prompts.length > 0) return prompts.map((line) => `- ${line}`).join("\n")
    return ""
  }, [progress?.previews?.method_text, progress?.previews?.prompts])

  const experimentNames = useMemo(() => {
    const names = Array.isArray(progress?.previews?.experiment_names) ? progress.previews.experiment_names : []
    return names.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
  }, [progress?.previews?.experiment_names])

  return (
    <div className={cn("grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,7fr)]", className)}>
      <section className="flex min-h-[640px] flex-col gap-2 bg-transparent text-black dark:text-white">
        <div className="rounded-xl border border-blue-300 bg-blue-50 px-3 py-2 shadow-sm shadow-blue-100 dark:border-blue-500/40 dark:bg-slate-900 dark:shadow-none">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-bold text-black dark:text-white">実行中</h2>
            <div className="inline-flex items-center gap-2">
              <span data-testid="header-divider-progress" aria-hidden className="h-5 w-px bg-blue-300 dark:bg-blue-500/60" />
              <Badge className="bg-blue-600 text-white">{computedPercent}%</Badge>
            </div>
          </div>
          <Progress value={computedPercent} className="mt-2 h-1.5 bg-blue-100 dark:bg-slate-700" />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-blue-300 bg-blue-50 px-3 py-2 shadow-sm shadow-blue-100 dark:border-blue-500/40 dark:bg-slate-900 dark:shadow-none">
          <p className="mb-2 text-[11px] font-semibold text-blue-700 dark:text-blue-300">処理中</p>
          <p className="mb-2 text-xs text-black/70 dark:text-white/80">{currentLabel || (activeKey ? stepLabels?.[activeKey] || activeKey : "処理中")}</p>

          <div className="space-y-2">
            {visibleFlows.map((flow) => (
              <div key={flow.id} className="rounded-lg border border-blue-200 bg-white/60 px-3 py-2 dark:border-blue-500/30 dark:bg-slate-800/70">
                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-2">
                    {iconFor(flow.status)}
                    <span className="text-sm font-semibold text-black dark:text-white">{flow.label}</span>
                  </div>
                  <span className="text-[11px] text-blue-700 dark:text-blue-300">
                    {flow.status === "done" ? "完了" : flow.status === "active" ? "実行中" : "待機"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-black/60 dark:text-white/70">{flow.displaySteps.join(" -> ")}</p>
                {flow.id === "d_to_i" && experimentNames.length > 0 ? (
                  <div className="mt-2 rounded border border-blue-200 bg-white/70 px-2 py-1 dark:border-blue-500/30 dark:bg-slate-900/60">
                    <p className="text-[10px] font-semibold text-blue-700 dark:text-blue-300">実験名</p>
                    <p className="mt-1 text-[11px] text-black/70 dark:text-white/75">{experimentNames.join(" / ")}</p>
                  </div>
                ) : null}
              </div>
            ))}

            {hiddenFlowCount > 0 ? <p className="text-xs text-black/50 dark:text-white/60">次の工程を準備中（残り {hiddenFlowCount}）</p> : null}
          </div>
        </div>

        <div className="rounded-xl border border-blue-300 bg-blue-50 px-3 py-2 shadow-sm shadow-blue-100 dark:border-blue-500/40 dark:bg-slate-900 dark:shadow-none">
          <div className="space-y-1.5">
            {fileNames && fileNames.length > 0 ? (
              <div>
                <p className="mb-0.5 text-[11px] text-black/50 dark:text-white/60">参照ファイル</p>
                <p className="truncate text-xs text-black dark:text-white">{fileNames.join(" / ")}</p>
              </div>
            ) : null}

            {note ? <p className="text-[10px] text-black/45 dark:text-white/55">自動継続・完了後に遷移</p> : null}

            {onCancel ? (
              <div className="pt-0.5">
                <Button variant="outline" size="sm" className="text-blue-700 dark:text-blue-300 dark:border-blue-500/40 dark:bg-slate-900" onClick={onCancel}>
                  {cancelLabel}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="bg-transparent text-black dark:text-white">
        <div className="space-y-3 rounded-xl border border-white bg-blue-50 px-3 py-3 shadow-sm shadow-blue-100 dark:border-blue-500/40 dark:bg-slate-900 dark:shadow-none">
          <div className="pb-1">
            <div className="flex items-center justify-between gap-2">
              <h2 className="inline-flex items-center gap-2 text-base font-bold text-black dark:text-white">
                <FileText className="h-4 w-4 text-blue-600 dark:text-blue-300" />
                プレビュー
              </h2>
              <div className="inline-flex items-center gap-2">
                <span data-testid="header-divider-preview" aria-hidden className="h-5 w-px bg-blue-300 dark:bg-blue-500/60" />
                <Badge className="bg-blue-600 text-white">LIVE</Badge>
              </div>
            </div>
            <p className="text-xs text-black/60 dark:text-white/70">{title}</p>
          </div>

          <div className="mx-auto w-full max-w-[420px]">
            <div className="aspect-[210/297] w-full bg-white shadow-[0_12px_30px_rgba(0,0,0,0.08)] dark:bg-[#f7f7f5] dark:shadow-[0_12px_24px_rgba(0,0,0,0.45)]">
              <div className="h-full overflow-y-auto px-6 py-7 font-serif text-[12px] leading-6 text-black/80 whitespace-pre-wrap dark:text-black/85">
                {previewMarkdown}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
