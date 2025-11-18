"use client"

import { useMemo, useState, type ChangeEvent, type FormEvent } from "react"
import { MOCK_DIFY_OUTPUT } from "@/lib/mock/sample"

const SAMPLE_JSON = JSON.stringify(MOCK_DIFY_OUTPUT, null, 2)

const sanitizeFileName = (value: string) => {
  const fallback = value.trim() ? value.trim() : "report"
  const safe = fallback.replace(/[^a-zA-Z0-9_-]+/g, "_")
  return `${safe}_template.docx`
}

export default function TemplatePlaygroundPage() {
  const [title, setTitle] = useState("テンプレート検証レポート")
  const [jsonInput, setJsonInput] = useState(SAMPLE_JSON)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const parsedPayload = useMemo(() => {
    try {
      return JSON.parse(jsonInput)
    } catch {
      return null
    }
  }, [jsonInput])

  const experimentCount = useMemo(() => {
    if (!parsedPayload || typeof parsedPayload !== "object") {
      return null
    }
    const record = parsedPayload as Record<string, unknown>
    if (Array.isArray(record.experiments)) {
      return record.experiments.length
    }
    if (
      record.experiment &&
      typeof record.experiment === "object" &&
      Array.isArray((record.experiment as Record<string, unknown>).experiments)
    ) {
      return ((record.experiment as Record<string, unknown>).experiments as unknown[]).length
    }
    return null
  }, [parsedPayload])

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      setJsonInput(text)
      setError(null)
      setNotice(`ファイル "${file.name}" を読み込みました。`)
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : String(readError))
    } finally {
      event.target.value = ""
    }
  }

  const handleUseSample = () => {
    setJsonInput(SAMPLE_JSON)
    setNotice("サンプルデータをロードしました。")
    setError(null)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setNotice(null)

    if (!parsedPayload) {
      setError("JSONの構文が正しくありません。")
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch("/api/reports/generate/mock", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: title || "テンプレート検証レポート",
          difyOutput: parsedPayload,
        }),
      })

      const contentType = response.headers.get("content-type") ?? ""
      if (!response.ok || contentType.includes("application/json")) {
        let detail: string | undefined
        try {
          const payload = await response.json()
          detail = typeof payload?.error === "string" ? payload.error : undefined
        } catch {
          // ignore parse errors
        }
        throw new Error(detail ?? `テンプレート生成に失敗しました (HTTP ${response.status})`)
      }

      const blob = await response.blob()
      const fileName = sanitizeFileName(title)
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      setNotice("DOCXのダウンロードが開始されました。")
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-12">
        <header className="space-y-3">
          <p className="text-sm text-indigo-300">Template Debugger</p>
          <h1 className="text-3xl font-bold tracking-tight text-white">JSON からテンプレートを即時生成</h1>
          <p className="text-base text-slate-300">
            Dify の出力結果や手動で整形した JSON を貼り付けると、docxtemplater テンプレートへ直接差し込み、DOCX
            をダウンロードできます。複数の experiment ID がそのまま使われるかを確認する用途を想定しています。
          </p>
        </header>

        <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 shadow-2xl shadow-indigo-500/10 backdrop-blur">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-[2fr,1fr]">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-slate-200">レポートタイトル</span>
                <input
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="rounded-lg border border-white/10 bg-slate-900/80 px-4 py-2 text-base text-white outline-none ring-indigo-500/50 placeholder:text-slate-500 focus:ring-2"
                  placeholder="テンプレート検証レポート"
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-slate-200">JSONファイルを読み込む</span>
                <input
                  type="file"
                  accept="application/json"
                  onChange={handleFileUpload}
                  className="rounded-lg border border-dashed border-white/20 bg-slate-900/40 px-4 py-2 text-sm text-slate-300 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-600 file:px-3 file:py-1 file:text-white"
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleUseSample}
                className="rounded-full border border-indigo-500/30 px-4 py-2 text-sm font-semibold text-indigo-200 transition hover:border-indigo-400 hover:text-white"
              >
                サンプルJSONを読み込む
              </button>
              <div className="text-sm text-slate-400">
                {experimentCount !== null
                  ? `検出された実験エントリ: ${experimentCount} 件`
                  : parsedPayload
                    ? "experiment 配列が見つかりません"
                    : "JSONを正しく読み込むとここに統計が表示されます"}
              </div>
            </div>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-slate-200">テンプレートに渡す JSON</span>
              <textarea
                value={jsonInput}
                onChange={(event) => setJsonInput(event.target.value)}
                rows={18}
                spellCheck={false}
                className="min-h-[420px] rounded-2xl border border-white/10 bg-black/40 px-4 py-3 font-mono text-sm text-indigo-100 outline-none ring-indigo-500/40 focus:ring-2"
              />
            </label>

            {error && (
              <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>
            )}
            {notice && !error && (
              <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                {notice}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={isSubmitting || !parsedPayload}
                className="inline-flex items-center justify-center rounded-full bg-indigo-500 px-6 py-3 text-base font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-slate-700"
              >
                {isSubmitting ? "生成中..." : "DOCXを生成"}
              </button>
              <p className="text-sm text-slate-400">
                {parsedPayload
                  ? "送信すると /api/reports/generate/mock に POST し、生成済み DOCX をダウンロードします。"
                  : "JSON の構文エラーを解消してから送信してください。"}
              </p>
            </div>
          </form>
        </section>
      </div>
    </main>
  )
}
