"use client"

import { useMemo, useState, type ChangeEvent, type FormEvent, type ClipboardEvent as ReactClipboardEvent } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { ImageIcon, ArrowUp, ArrowDown, X } from "lucide-react"

const SAMPLE_JSON = JSON.stringify(
  {
    chapter: 5,
    experiments: [
      {
        idx: 1,
        name: "実験の概要",
        description_brief: "測定条件Aの下で得た結果を整理し、表5.1および図5.1に記載しました。",
        tables: [{ label: "表5.1", caption: "実験の概要" }],
        figures: [{ label: "図5.1", caption: "実験の概要" }],
      },
      {
        idx: 2,
        name: "実験準備",
        description_brief: "測定条件Bの下で得た結果を整理し、表5.2および図5.2に記載しました。",
        tables: [{ label: "表5.2", caption: "実験準備" }],
        figures: [{ label: "図5.2", caption: "実験準備" }],
      },
    ],
    consideration: {
      units: [
        {
          index: 1,
          discussion_active: "代表的なフィルタの特徴差を整理し、実験結果と紐づけて説明する。",
          answer: "",
        },
      ],
      reference_list_formatted: ["[1] フィルタの解析と設計 1997-11", "[2] 実験計測ガイド YYYY"],
    },
    summary: "低域フィルタの測定結果を整理し、主要な特性差を比較した。",
  },
  null,
  2
)

const sanitizeFileName = (value: string) => {
  const fallback = value.trim() ? value.trim() : "report"
  const safe = fallback.replace(/[^a-zA-Z0-9_-]+/g, "_")
  return `${safe}_template.docx`
}

const resolveMockEndpoint = () => {
  const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "")
  return baseUrl ? `${baseUrl}/api/reports/generate/mock` : "/api/reports/generate/mock"
}

type PlaygroundFigureImage = {
  id: string
  name: string
  size: number
  width: number
  height: number
  data: string
  previewUrl: string
}

type PastedTable = {
  id: string
  rows: string[][]
}

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const createId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)

const parseHtmlTable = (html: string): string[][] => {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, "text/html")
  const table = doc.querySelector("table")
  if (!table) return []

  const grid: string[][] = []
  const rows = Array.from(table.querySelectorAll("tr"))

  rows.forEach((tr, rowIndex) => {
    if (!grid[rowIndex]) grid[rowIndex] = []
    let colIndex = 0

    const cells = Array.from(tr.querySelectorAll("th,td"))
    cells.forEach((cell) => {
      // move to next free slot
      while (grid[rowIndex][colIndex] !== undefined) {
        colIndex += 1
      }

      const colspan = Math.max(1, Number(cell.getAttribute("colspan") || "1"))
      const rowspan = Math.max(1, Number(cell.getAttribute("rowspan") || "1"))
      const value = cell.textContent?.trim() ?? ""

      for (let r = 0; r < rowspan; r += 1) {
        const targetRow = rowIndex + r
        if (!grid[targetRow]) grid[targetRow] = []
        for (let c = 0; c < colspan; c += 1) {
          const targetCol = colIndex + c
          // Spread merged headers across all spanned cells to avoid misalignment.
          if (grid[targetRow][targetCol] === undefined) {
            grid[targetRow][targetCol] = value
          }
        }
      }

      colIndex += colspan
    })
  })

  return grid
}

const parsePlainTable = (text: string): string[][] => {
  if (!text.trim()) return []
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split("\t").map((cell) => cell.trim()))
}

const normalizeTableRows = (rows: string[][]): string[][] => {
  const cleaned = rows
    .map((row) => row.map((cell) => cell ?? "").map((cell) => cell.trim()))
    .filter((row) => row.some((cell) => cell.length > 0))
  return cleaned
}

const mergePastedTables = (payload: unknown, tablesToMerge: string[][][]): unknown => {
  if (!tablesToMerge || tablesToMerge.length === 0) return payload
  const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null

  try {
    const cloned = JSON.parse(JSON.stringify(payload))
    const experimentsContainer =
      Array.isArray((cloned as Record<string, unknown>)?.experiments) && (cloned as Record<string, unknown>).experiments
        ? { container: cloned as Record<string, any>, key: "experiments" as const }
        : (cloned as Record<string, unknown>)?.experiment &&
            typeof (cloned as Record<string, unknown>)?.experiment === "object" &&
            Array.isArray(((cloned as Record<string, unknown>)?.experiment as Record<string, unknown>).experiments)
          ? { container: (cloned as Record<string, unknown>).experiment as Record<string, any>, key: "experiments" as const }
          : null

    if (!experimentsContainer) {
      return payload
    }

    const experiments = experimentsContainer.container[experimentsContainer.key] as Array<Record<string, unknown>>
    if (!Array.isArray(experiments) || experiments.length === 0) {
      return payload
    }

    const chapter = typeof (cloned as Record<string, unknown>).chapter === "number" ? (cloned as Record<string, unknown>).chapter : 1
    let cursor = 0

    experiments.forEach((exp, expIdx) => {
      if (!isRecord(exp)) return
      const expTables = Array.isArray(exp.tables) ? [...(exp.tables as Array<Record<string, unknown>>)] : []

      // 既存テーブルの先頭に割り当て
      if (cursor < tablesToMerge.length) {
        if (expTables.length > 0) {
          expTables[0] = { ...expTables[0], rows: tablesToMerge[cursor] }
        } else {
          const seq = expTables.length + 1
          expTables.push({
            label: `表${chapter}.${exp.idx ?? expIdx + 1}.${seq}`,
            caption: expTables.length === 0 ? "貼り付けテーブル" : `貼り付けテーブル${seq}`,
            rows: tablesToMerge[cursor],
          })
        }
        cursor += 1
      }

      // 追加のテーブルがまだ余っている場合、2個目以降も順番で詰める
      let seq = expTables.length + 1
      for (let i = 1; i < expTables.length && cursor < tablesToMerge.length; i += 1) {
        expTables[i] = { ...expTables[i], rows: tablesToMerge[cursor] }
        cursor += 1
      }

      exp.tables = expTables
    })

    // まだ余りがある場合は最後の実験に追加する
    if (cursor < tablesToMerge.length) {
      const lastIdx = experiments.length - 1
      const lastExp = experiments[lastIdx]
      if (isRecord(lastExp)) {
        const expTables = Array.isArray(lastExp.tables) ? [...(lastExp.tables as Array<Record<string, unknown>>)] : []
        let seq = expTables.length + 1
        while (cursor < tablesToMerge.length) {
          expTables.push({
            label: `表${chapter}.${lastExp.idx ?? lastIdx + 1}.${seq}`,
            caption: expTables.length === 0 ? "貼り付けテーブル" : `貼り付けテーブル${seq}`,
            rows: tablesToMerge[cursor],
          })
          cursor += 1
          seq += 1
        }
        lastExp.tables = expTables
      }
    }

    experimentsContainer.container[experimentsContainer.key] = experiments
    return cloned
  } catch (error) {
    console.error("Failed to merge pasted tables", error)
    return payload
  }
}

export default function DashboardTemplatePlaygroundPage() {
  const [title, setTitle] = useState("テンプレート検証レポート")
  const [jsonInput, setJsonInput] = useState(SAMPLE_JSON)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [figureImages, setFigureImages] = useState<PlaygroundFigureImage[]>([])
  const [isProcessingImages, setIsProcessingImages] = useState(false)
  const [pastedTables, setPastedTables] = useState<PastedTable[]>([])

  const parsedPayload = useMemo(() => {
    try {
      return JSON.parse(jsonInput)
    } catch {
      return null
    }
  }, [jsonInput])

  const experimentCount = useMemo(() => {
    if (!parsedPayload || typeof parsedPayload !== "object") return null
    const record = parsedPayload as Record<string, unknown>
    if (Array.isArray(record.experiments)) return record.experiments.length
    if (
      record.experiment &&
      typeof record.experiment === "object" &&
      Array.isArray((record.experiment as Record<string, unknown>).experiments)
    ) {
      return ((record.experiment as Record<string, unknown>).experiments as unknown[]).length
    }
    return null
  }, [parsedPayload])

  const handleTablePaste = (event: ReactClipboardEvent<HTMLTextAreaElement>) => {
    const clipboard = event.clipboardData
    const html = clipboard?.getData("text/html") ?? ""
    const text = clipboard?.getData("text/plain") ?? ""
    let rows = normalizeTableRows(parseHtmlTable(html))
    if (rows.length === 0) {
      rows = normalizeTableRows(parsePlainTable(text))
    }
    if (rows.length > 0) {
      event.preventDefault()
      setPastedTables((prev) => [...prev, { id: createId(), rows }])
      setNotice(`表データを ${rows.length} 行で取り込みました。（表${pastedTables.length + 1}）`)
      setError(null)
    }
  }

  const clearTableRows = () => {
    setPastedTables([])
  }

  const removeTable = (id: string) => {
    setPastedTables((prev) => prev.filter((table) => table.id !== id))
  }

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      setJsonInput(text)
      setError(null)
      setNotice(`ファイル「${file.name}」を読み込みました。`)
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

  const processImageFile = (file: File): Promise<PlaygroundFigureImage> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(new Error("画像ファイルの読み込みに失敗しました。"))
      reader.onload = () => {
        if (typeof reader.result !== "string") {
          reject(new Error("画像の読み込み結果が不正です。"))
          return
        }
        const dataUrl = reader.result
        const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl
        const img = new Image()
        img.onload = () => {
          resolve({
            id: createId(),
            name: file.name,
            size: file.size,
            width: img.width || 0,
            height: img.height || 0,
            data: base64,
            previewUrl: dataUrl,
          })
        }
        img.onerror = () => reject(new Error("画像の読み込みに失敗しました。"))
        img.src = dataUrl
      }
      reader.readAsDataURL(file)
    })
  }

  const handleFigureImageSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : []
    event.target.value = ""
    if (files.length === 0) return
    setIsProcessingImages(true)
    try {
      const results = await Promise.allSettled(files.map((file) => processImageFile(file)))
      const fulfilled = results.filter((result): result is PromiseFulfilledResult<PlaygroundFigureImage> => result.status === "fulfilled")
      const rejected = results.length - fulfilled.length
      if (fulfilled.length > 0) {
        setFigureImages((prev) => [...prev, ...fulfilled.map((result) => result.value)])
        setNotice(`${fulfilled.length}件の画像を追加しました。`)
        setError(null)
      }
      if (rejected > 0) {
        setError(`${rejected}件の画像の読み込みに失敗しました。`)
      }
    } catch (imageError) {
      setError(imageError instanceof Error ? imageError.message : String(imageError))
    } finally {
      setIsProcessingImages(false)
    }
  }

  const removeFigureImage = (id: string) => {
    setFigureImages((prev) => prev.filter((item) => item.id !== id))
  }

  const moveFigureImage = (id: string, direction: "up" | "down") => {
    setFigureImages((prev) => {
      const index = prev.findIndex((item) => item.id === id)
      if (index === -1) return prev
      const targetIndex = direction === "up" ? index - 1 : index + 1
      if (targetIndex < 0 || targetIndex >= prev.length) return prev
      const next = [...prev]
      ;[next[index], next[targetIndex]] = [next[targetIndex], next[index]]
      return next
    })
  }

  const clearFigureImages = () => {
    setFigureImages([])
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
      const payloadWithTables = mergePastedTables(
        parsedPayload,
        pastedTables.map((table) => table.rows)
      )
      const response = await fetch(resolveMockEndpoint(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: title || "テンプレート検証レポート",
          difyOutput: payloadWithTables,
          figureImages: figureImages.map((image) => ({
            name: image.name,
            width: image.width,
            height: image.height,
            data: image.data,
          })),
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
    <div className="space-y-6 px-4 py-8 sm:px-8">
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">テンプレートデバッグ</p>
        <h1 className="text-3xl font-bold tracking-tight">JSON差し込みプレイグラウンド</h1>
        <p className="text-base text-muted-foreground">
          Dify からの result_json を貼り付けると、サーバーの docxtemplater テンプレートに差し込んだ DOCX を即ダウンロードできます。
          experiment ID が複数存在するパターンの検証に利用してください。
        </p>
      </div>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>JSON入力とDOCX生成</CardTitle>
          <CardDescription>
            JSONを貼り付けるかファイルを読み込み、「DOCXを生成」を押すと /api/reports/generate/mock を呼び出します。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-[2fr,1fr]">
              <label className="space-y-2">
                <span className="text-sm font-semibold text-foreground">レポートタイトル</span>
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="テンプレート検証レポート"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-semibold text-foreground">JSONファイルを読み込む</span>
                <Input type="file" accept="application/json" onChange={handleFileUpload} />
              </label>
            </div>

            <div className="space-y-3 rounded-lg border border-dashed border-muted-foreground/40 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">挿入する写真（任意）</p>
                  <p className="text-xs text-muted-foreground">
                    図の順番に合わせて画像を追加します。追加した順番でDOCXに挿入され、上下ボタンで並べ替えできます。
                  </p>
                </div>
                {figureImages.length > 0 && (
                  <Button type="button" variant="ghost" size="sm" onClick={clearFigureImages}>
                    すべて削除
                  </Button>
                )}
              </div>
              <Input
                type="file"
                accept="image/*"
                multiple
                disabled={isProcessingImages}
                onChange={handleFigureImageSelect}
              />
              {figureImages.length > 0 && (
                <div className="space-y-2">
                  {figureImages.map((image, index) => (
                    <div
                      key={image.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card/70 px-4 py-2"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-14 w-14 overflow-hidden rounded-md border bg-muted">
                          <img
                            src={image.previewUrl}
                            alt={image.name}
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-sm font-semibold text-foreground">
                            図{index + 1}: {image.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(image.size)} / {image.width}×{image.height}px
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          disabled={index === 0}
                          onClick={() => moveFigureImage(image.id, "up")}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          disabled={index === figureImages.length - 1}
                          onClick={() => moveFigureImage(image.id, "down")}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => removeFigureImage(image.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {figureImages.length === 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ImageIcon className="h-4 w-4" />
                  画像を追加するとここに一覧が表示されます。
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-lg border border-dashed border-muted-foreground/40 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">Excel表を貼り付け（任意）</p>
                  <p className="text-xs text-muted-foreground">
                    Excel やスプレッドシートで表をコピーしてここに貼り付けると、表ごとに追加されます。行数が多い場合は先頭数行のみプレビュー表示します。
                  </p>
                </div>
                {pastedTables.length > 0 && (
                  <Button type="button" variant="ghost" size="sm" onClick={clearTableRows}>
                    表データをクリア
                  </Button>
                )}
              </div>
              <Textarea
                rows={4}
                spellCheck={false}
                placeholder="Excel でコピーした表をここに貼り付けてください（Ctrl/Cmd + V）。"
                onPaste={handleTablePaste}
              />
              {pastedTables.length > 0 ? (
                <div className="space-y-3">
                  {pastedTables.map((table, tableIndex) => (
                    <div key={table.id} className="overflow-x-auto rounded-md border bg-card/60">
                      <div className="flex items-center justify-between border-b px-3 py-2 text-sm font-semibold">
                        <span>表 {tableIndex + 1}（{table.rows.length} 行）</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => removeTable(table.id)}
                        >
                          削除
                        </Button>
                      </div>
                      <table className="w-full border-collapse text-sm">
                        <tbody>
                          {table.rows.slice(0, 6).map((row, rowIndex) => (
                            <tr key={rowIndex} className="divide-x border-b last:border-b-0">
                              {row.map((cell, cellIndex) => (
                                <td key={cellIndex} className="px-2 py-1">
                                  {cell || <span className="text-muted-foreground">（空）</span>}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {table.rows.length > 6 && (
                        <p className="px-2 py-1 text-xs text-muted-foreground">
                          先頭 6 行を表示しています。全 {table.rows.length} 行。
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">ここに貼り付けると表データとして取り込みます。</p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <Button type="button" variant="outline" size="sm" onClick={handleUseSample}>
                サンプルJSONを読み込む
              </Button>
              {experimentCount !== null
                ? `検出された実験エントリ: ${experimentCount} 件`
                : parsedPayload
                  ? "experiment 配列が見つかりません"
                  : "JSONを正しく読み込むと件数が表示されます"}
            </div>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-foreground">テンプレートに渡す JSON</span>
              <Textarea
                value={jsonInput}
                onChange={(event) => setJsonInput(event.target.value)}
                rows={18}
                spellCheck={false}
                className="font-mono text-sm"
              />
            </label>

            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}
            {notice && !error && (
              <div className="rounded-md border border-emerald-300/40 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {notice}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={isSubmitting || !parsedPayload}>
                {isSubmitting ? "生成中..." : "DOCXを生成"}
              </Button>
              <p className="text-sm text-muted-foreground">
                {parsedPayload
                  ? "送信するとモック生成APIにPOSTし、結果DOCXを即ダウンロードします。"
                  : "JSONの構文エラーを解消するとボタンが有効になります。"}
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
