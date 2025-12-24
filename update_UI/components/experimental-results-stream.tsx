"use client"

import { useMemo, useRef, useState } from "react"
import { Sparkles, Square } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type FinalPayload = {
  markdown: string
  sections?: Array<{ title?: string; markdown?: string }>
  elapsed_ms?: number
}

type SseMessage =
  | { event: "meta"; data: { started_at?: number; model?: string } }
  | { event: "delta"; data: { text?: string } }
  | { event: "final"; data: FinalPayload }
  | { event: "error"; data: { message?: string } }
  | { event: "done"; data: Record<string, never> }

const decodeSseMessages = (buffer: string) => {
  const messages: Array<{ raw: string; msg?: SseMessage }> = []
  const parts = buffer.split("\n\n")
  const rest = parts.pop() ?? ""

  for (const part of parts) {
    const lines = part.split("\n").filter(Boolean)
    let event = "message"
    const dataLines: string[] = []
    for (const line of lines) {
      if (line.startsWith("event:")) event = line.slice("event:".length).trim()
      else if (line.startsWith("data:")) dataLines.push(line.slice("data:".length).trim())
    }
    const dataRaw = dataLines.join("\n")
    if (!dataRaw) {
      messages.push({ raw: part })
      continue
    }
    try {
      const data = JSON.parse(dataRaw)
      messages.push({ raw: part, msg: { event, data } as SseMessage })
    } catch {
      messages.push({ raw: part })
    }
  }

  return { messages, rest }
}

const SimpleMarkdown = ({ markdown }: { markdown: string }) => {
  const blocks = useMemo(() => {
    const lines = (markdown || "").split(/\r?\n/)
    const out: Array<{ type: "h1" | "h2" | "h3" | "p" | "ul"; text?: string; items?: string[] }> = []
    let currentList: string[] | null = null

    const flushList = () => {
      if (currentList && currentList.length) out.push({ type: "ul", items: currentList })
      currentList = null
    }

    for (const lineRaw of lines) {
      const line = lineRaw.trimEnd()
      if (!line.trim()) {
        flushList()
        continue
      }
      if (line.startsWith("# ")) {
        flushList()
        out.push({ type: "h1", text: line.slice(2).trim() })
        continue
      }
      if (line.startsWith("## ")) {
        flushList()
        out.push({ type: "h2", text: line.slice(3).trim() })
        continue
      }
      if (line.startsWith("### ")) {
        flushList()
        out.push({ type: "h3", text: line.slice(4).trim() })
        continue
      }
      if (line.startsWith("- ")) {
        currentList = currentList ?? []
        currentList.push(line.slice(2).trim())
        continue
      }

      flushList()
      out.push({ type: "p", text: line.trim() })
    }

    flushList()
    return out
  }, [markdown])

  return (
    <div className="space-y-3">
      {blocks.map((b, idx) => {
        if (b.type === "h1") return <h2 key={idx} className="text-lg font-bold">{b.text}</h2>
        if (b.type === "h2") return <h3 key={idx} className="text-base font-semibold">{b.text}</h3>
        if (b.type === "h3") return <h4 key={idx} className="text-sm font-semibold text-muted-foreground">{b.text}</h4>
        if (b.type === "ul") {
          return (
            <ul key={idx} className="list-disc pl-5 space-y-1 text-sm">
              {(b.items || []).map((it, i) => <li key={i}>{it}</li>)}
            </ul>
          )
        }
        return <p key={idx} className="text-sm leading-relaxed whitespace-pre-wrap">{b.text}</p>
      })}
    </div>
  )
}

export function ExperimentalResultsStreamCard(props: { reportId: string }) {
  const { reportId } = props

  const [isStreaming, setIsStreaming] = useState(false)
  const [rawLiveText, setRawLiveText] = useState("")
  const [final, setFinal] = useState<FinalPayload | null>(null)
  const [ttftMs, setTtftMs] = useState<number | null>(null)
  const [chars, setChars] = useState(0)
  const [model, setModel] = useState<string>("")
  const [lastUpdateMs, setLastUpdateMs] = useState<number>(0)

  const abortRef = useRef<AbortController | null>(null)
  const startedAtRef = useRef<number>(0)
  const gotFirstTokenRef = useRef(false)

  const stop = () => {
    abortRef.current?.abort()
  }

  const start = async () => {
    if (isStreaming) return
    setIsStreaming(true)
    setRawLiveText("")
    setFinal(null)
    setTtftMs(null)
    setChars(0)
    setModel("")
    gotFirstTokenRef.current = false
    startedAtRef.current = performance.now()

    const controller = new AbortController()
    abortRef.current = controller

    let finalPayload: FinalPayload | null = null
    let modelName = ""

    try {
      const res = await fetch(`/api/reports/${reportId}/experimental-results/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        signal: controller.signal,
      })
      if (!res.ok || !res.body) {
        const msg = await res.text().catch(() => "")
        throw new Error(msg || `HTTP ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder("utf-8")
      let buffer = ""

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const { messages, rest } = decodeSseMessages(buffer)
        buffer = rest

        for (const m of messages) {
          const msg = m.msg
          if (!msg) continue
          if (msg.event === "meta") {
            modelName = msg.data?.model || ""
            setModel(modelName)
            continue
          }
          if (msg.event === "delta") {
            const t = msg.data?.text || ""
            if (!t) continue
            if (!gotFirstTokenRef.current) {
              gotFirstTokenRef.current = true
              setTtftMs(Math.round(performance.now() - startedAtRef.current))
            }
            setRawLiveText((prev) => prev + t)
            setChars((prev) => prev + t.length)
            setLastUpdateMs(performance.now())
            continue
          }
          if (msg.event === "final") {
            finalPayload = msg.data
            setFinal(msg.data)
            continue
          }
          if (msg.event === "error") {
            throw new Error(msg.data?.message || "stream error")
          }
        }
      }

      // Best-effort: save into analysis.json so it can be reused later.
      if (finalPayload?.markdown) {
        try {
          const analysisRes = await fetch(`/api/reports/${reportId}/analysis`)
          const analysisJson = await analysisRes.json().catch(() => ({}))
          let resultJson = analysisJson?.analysis?.dify_response
          if (resultJson?.output?.result_json) resultJson = resultJson.output.result_json
          else if (resultJson?.outputs?.result_json) resultJson = resultJson.outputs.result_json
          else if (resultJson?.result_json) resultJson = resultJson.result_json

          const next = {
            ...(resultJson && typeof resultJson === "object" ? resultJson : {}),
            experimental_results: {
              markdown: finalPayload.markdown,
              sections: finalPayload.sections || [],
              elapsed_ms: typeof finalPayload.elapsed_ms === "number" ? finalPayload.elapsed_ms : undefined,
              generated_at: new Date().toISOString(),
              model: modelName || undefined,
            },
          }

          await fetch(`/api/reports/${reportId}/analysis`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dify_response: next }),
          })
        } catch {
          // ignore
        }
      }

      toast.success("実験結果の生成が完了しました")
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        toast.message("停止しました（途中まで表示しています）")
      } else {
        toast.error(e instanceof Error ? e.message : String(e))
      }
    } finally {
      setIsStreaming(false)
      abortRef.current = null
    }
  }

  const liveMarkdown = final?.markdown || rawLiveText
  const elapsedMs = isStreaming ? Math.max(0, Math.round((lastUpdateMs || performance.now()) - startedAtRef.current)) : null
  const cps = isStreaming && elapsedMs ? Math.round((chars / Math.max(1, elapsedMs)) * 1000) : null
  const progress = isStreaming ? Math.min(95, Math.round(Math.log10(chars + 1) * 28)) : final?.markdown ? 100 : 0

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          実験結果（ストリーミング生成）
        </CardTitle>
        <div className="flex items-center gap-2">
          {isStreaming ? (
            <Button variant="outline" size="sm" onClick={stop}>
              <Square className="mr-2 h-4 w-4" />
              停止
            </Button>
          ) : (
            <Button size="sm" onClick={() => void start()}>
              生成する
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>状態: {isStreaming ? "生成中" : "待機"}</span>
          {model ? <span>モデル: {model}</span> : null}
          {ttftMs !== null ? <span>TTFT: {ttftMs}ms</span> : null}
          {isStreaming ? (
            <span className="inline-flex items-center gap-1">
              受信: {chars}文字{cps !== null ? ` (${cps}文字/秒)` : ""}
              <span className="inline-block h-3 w-2 rounded-sm bg-foreground/60 animate-pulse" />
            </span>
          ) : null}
        </div>

        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-[width] duration-150" style={{ width: `${progress}%` }} />
        </div>

        {isStreaming && !gotFirstTokenRef.current ? (
          <div className="text-sm text-muted-foreground">
            接続中（最初のトークンを待っています）…
          </div>
        ) : null}

        {liveMarkdown ? (
          <div className="rounded-md border bg-background p-3">
            <SimpleMarkdown markdown={liveMarkdown} />
          </div>
        ) : (
          <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            「生成する」を押すと、結果がリアルタイムに表示されます。
          </div>
        )}
      </CardContent>
    </Card>
  )
}
