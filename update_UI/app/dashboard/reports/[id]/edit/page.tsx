"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Reorder } from "framer-motion"
import { ArrowLeft, Save, FileText, ImageIcon, Loader2, GripVertical, Wand2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription, SheetHeader } from "@/components/ui/sheet"
import { ExperimentalResultsStreamCard } from "@/components/experimental-results-stream"
import { toast } from "sonner"

type AnalysisData = {
    experiments: Experiment[]
    image_order?: string[]
    [key: string]: any
}

type Experiment = {
    name: string
    figures: Figure[]
    tables: Table[]
    description_brief?: string
    summary?: string
    quant_comment?: QuantBlock[] | string
    [key: string]: any
}

type Figure = {
    label: string
    caption: string
    figure_image?: {
        file_name: string
    }
    [key: string]: any
}

type Table = {
    label: string
    caption: string
    [key: string]: any
}

type QuantBlock = { type: "text" | "math"; content: string }

type ImageFile = {
    file_name: string
    file_url: string
    uploaded_at: string
}

type FigureSlot = {
    key: string
    expIndex: number
    figIndex: number
    figure: Figure
    experimentName: string
}

type TableSlot = {
    key: string
    expIndex: number
    tblIndex: number
    table: Table
    experimentName: string
}

const rebuildDerivedLists = (analysis: any) => {
    const experiments = Array.isArray(analysis?.experiments) ? analysis.experiments : []
    const chapter = typeof analysis?.chapter === "number" ? analysis.chapter : Number(analysis?.chapter) || 4
    experiments.forEach((exp: any) => {
        const blocks = Array.isArray(exp?.blocks) ? exp.blocks : []
        const idx = typeof exp?.idx === "string" ? exp.idx : exp?.idx != null ? String(exp.idx) : ""
        const subidx = typeof exp?.subidx === "string" ? exp.subidx : exp?.subidx != null ? String(exp.subidx) : ""
        const parts = [String(chapter).trim(), idx.trim(), subidx.trim()].filter(Boolean)
        const path = parts.join(".")
        let figSeq = 1
        let tblSeq = 1
        blocks.forEach((b: any) => {
            if (!b || typeof b !== "object") return
            if (b.type === "figure" && b.figure && typeof b.figure === "object") {
                b.figure.label = `図 ${path}.${figSeq}`
                figSeq += 1
            } else if (b.type === "table" && b.table && typeof b.table === "object") {
                b.table.label = `表 ${path}.${tblSeq}`
                tblSeq += 1
            }
        })
        exp.figures = blocks.filter((b: any) => b?.type === "figure").map((b: any) => b.figure)
        exp.tables = blocks.filter((b: any) => b?.type === "table").map((b: any) => b.table)
    })
    return analysis
}

const moveBlockByLabel = (
    analysis: any,
    params: { type: "figure" | "table"; fromExpIndex: number; label: string; toExpIndex: number }
) => {
    const { type, fromExpIndex, label, toExpIndex } = params
    if (!analysis?.experiments || !Array.isArray(analysis.experiments)) return analysis
    if (fromExpIndex === toExpIndex) return analysis
    const experiments = analysis.experiments as any[]
    const from = experiments[fromExpIndex]
    const to = experiments[toExpIndex]
    if (!from || !to) return analysis
    if (!Array.isArray(from.blocks)) from.blocks = []
    if (!Array.isArray(to.blocks)) to.blocks = []

    const idx = from.blocks.findIndex((b: any) => {
        if (!b || typeof b !== "object") return false
        if (b.type !== type) return false
        const content = type === "figure" ? b.figure : b.table
        return content && typeof content === "object" && content.label === label
    })
    if (idx === -1) return analysis

    const [moved] = from.blocks.splice(idx, 1)
    to.blocks.push(moved)
    return rebuildDerivedLists(analysis)
}

export default function ReportEditorPage() {
    const params = useParams()
    const router = useRouter()
    const reportId = params.id as string

    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [generating, setGenerating] = useState(false)
    const [analysis, setAnalysis] = useState<AnalysisData | null>(null)
    const [images, setImages] = useState<ImageFile[]>([])
    const [orderedImages, setOrderedImages] = useState<ImageFile[]>([])
    const [quantLoading, setQuantLoading] = useState<Record<number, boolean>>({})

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch(`/api/reports/${reportId}/analysis`)
                if (!res.ok) throw new Error("Failed to fetch analysis data")
                const data = await res.json()

                // Extract the result_json from the wrapped response structure
                let resultJson = data.analysis?.dify_response
                if (resultJson?.output?.result_json) {
                    resultJson = resultJson.output.result_json
                } else if (resultJson?.outputs?.result_json) {
                    resultJson = resultJson.outputs.result_json
                } else if (resultJson?.result_json) {
                    resultJson = resultJson.result_json
                }

                setAnalysis(resultJson)
                setImages(data.images || [])
            } catch (error) {
                console.error(error)
                toast.error("データの読み込みに失敗しました")
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [reportId])

    useEffect(() => {
        if (images.length > 0) {
            if (analysis?.image_order && analysis.image_order.length > 0) {
                const orderIndicesByName = new Map<string, number[]>()
                analysis.image_order.forEach((name, index) => {
                    const list = orderIndicesByName.get(name) || []
                    list.push(index)
                    orderIndicesByName.set(name, list)
                })

                const decorated = images.map((img) => {
                    const list = orderIndicesByName.get(img.file_name)
                    const orderIndex = list && list.length > 0 ? list.shift()! : Number.MAX_SAFE_INTEGER
                    const parsedUploadedAt = Date.parse(img.uploaded_at)
                    const uploadedAtMs = Number.isFinite(parsedUploadedAt) ? parsedUploadedAt : 0
                    return { img, orderIndex, uploadedAtMs }
                })

                decorated.sort((a, b) => {
                    if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex
                    if (a.uploadedAtMs !== b.uploadedAtMs) return a.uploadedAtMs - b.uploadedAtMs
                    return a.img.file_url.localeCompare(b.img.file_url)
                })

                setOrderedImages(decorated.map((d) => d.img))
            } else {
                setOrderedImages(images)
            }
        }
    }, [images, analysis?.image_order])

    const figureSlots = useMemo<FigureSlot[]>(() => {
        if (!analysis?.experiments) return []
        const slots: FigureSlot[] = []
        analysis.experiments.forEach((exp, expIndex) => {
            exp.figures?.forEach((figure, figIndex) => {
                slots.push({
                    key: `${expIndex}-${figIndex}`,
                    expIndex,
                    figIndex,
                    figure,
                    experimentName: exp.name || `実験${expIndex + 1}`,
                })
            })
        })
        return slots
    }, [analysis?.experiments])

    const tableSlots = useMemo<TableSlot[]>(() => {
        if (!analysis?.experiments) return []
        const slots: TableSlot[] = []
        analysis.experiments.forEach((exp, expIndex) => {
            exp.tables?.forEach((table, tblIndex) => {
                slots.push({
                    key: `${expIndex}-${tblIndex}`,
                    expIndex,
                    tblIndex,
                    table,
                    experimentName: exp.name || `実験${expIndex + 1}`,
                })
            })
        })
        return slots
    }, [analysis?.experiments])

    const experimentOptions = useMemo(() => {
        const exps = analysis?.experiments || []
        return exps.map((exp: any, i: number) => ({ index: i, label: exp?.name || `実験${i + 1}` }))
    }, [analysis?.experiments])

    const handleSave = async (skipToast = false) => {
        if (!analysis) return
        setSaving(true)
        try {
            // Update image_order in analysis based on current orderedImages
            const currentOrder = orderedImages.map(img => img.file_name)
            const updatedAnalysis = { ...analysis, image_order: currentOrder }

            const res = await fetch(`/api/reports/${reportId}/analysis`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ dify_response: updatedAnalysis }),
            })

            if (!res.ok) throw new Error("Failed to save")

            // Update local state to reflect saved version
            setAnalysis(updatedAnalysis)

            if (!skipToast) toast.success("保存しました")
            return true
        } catch (error) {
            console.error(error)
            toast.error("保存に失敗しました")
            return false
        } finally {
            setSaving(false)
        }
    }

    const handleGenerate = async () => {
        const saved = await handleSave(true)
        if (!saved) return

        setGenerating(true)
        try {
            const res = await fetch("/api/reports/regenerate/from-json", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reportId }),
            })

            if (!res.ok) {
                const msg = await res.text()
                throw new Error(msg || "Generation failed")
            }

            toast.success("レポート生成を開始しました")
            router.push(`/dashboard/reports/${reportId}`)
        } catch (error) {
            console.error(error)
            toast.error("レポート生成に失敗しました")
            setGenerating(false)
        }
    }

    const handleGenerateQuantComment = async (expIndex: number) => {
        if (!analysis) return
        setQuantLoading((prev) => ({ ...prev, [expIndex]: true }))
        try {
            const res = await fetch(`/api/reports/${reportId}/analysis/quant-comment`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ experiment_index: expIndex }),
            })

            if (!res.ok) {
                const msg = await res.text()
                throw new Error(msg || "定量的コメントの生成に失敗しました")
            }

            const data = await res.json()
            const updated = data.result_json || analysis
            setAnalysis(updated)
            toast.success("定量的コメントを生成しました")
        } catch (error) {
            console.error(error)
            toast.error("定量的コメントの生成に失敗しました")
        } finally {
            setQuantLoading((prev) => ({ ...prev, [expIndex]: false }))
        }
    }

    const updateExperimentName = (index: number, value: string) => {
        if (!analysis) return
        const newExperiments = [...analysis.experiments]
        newExperiments[index] = { ...newExperiments[index], name: value }
        setAnalysis({ ...analysis, experiments: newExperiments })
    }

    const updateFigureCaption = (expIndex: number, figIndex: number, value: string) => {
        if (!analysis) return
        const newExperiments = [...analysis.experiments]
        const newFigures = [...newExperiments[expIndex].figures]
        newFigures[figIndex] = { ...newFigures[figIndex], caption: value }
        newExperiments[expIndex] = { ...newExperiments[expIndex], figures: newFigures }
        setAnalysis({ ...analysis, experiments: newExperiments })
    }

    const updateTableCaption = (expIndex: number, tblIndex: number, value: string) => {
        if (!analysis) return
        const newExperiments = [...analysis.experiments]
        const newTables = [...newExperiments[expIndex].tables]
        newTables[tblIndex] = { ...newTables[tblIndex], caption: value }
        newExperiments[expIndex] = { ...newExperiments[expIndex], tables: newTables }
        setAnalysis({ ...analysis, experiments: newExperiments })
    }

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    if (!analysis) {
        return (
            <div className="p-8 text-center">
                <p className="text-muted-foreground">データが見つかりませんでした</p>
                <Button variant="outline" className="mt-4" onClick={() => router.back()}>
                    戻る
                </Button>
            </div>
        )
    }

    return (
        <div className="container mx-auto max-w-4xl py-8 px-4">
            <div className="mb-8 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.back()}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <h1 className="text-2xl font-bold">レポート編集</h1>
                </div>
                <div className="flex gap-2">
                    <Sheet>
                        <SheetTrigger asChild>
                            <Button variant="outline" className="gap-2">
                                <Wand2 className="h-4 w-4" />
                                キャプション生成
                            </Button>
                        </SheetTrigger>
	                        <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
	                            <SheetHeader>
	                                <SheetTitle>キャプション自動生成</SheetTitle>
	                                <SheetDescription>
	                                    実験書と画像からキャプションを生成します。
	                                </SheetDescription>
	                            </SheetHeader>
	                            <div className="mt-6">
	                                <div className="rounded-md border p-4 text-sm text-muted-foreground">
	                                    キャプション自動生成機能は再構築のため一時停止しています。
	                                </div>
	                            </div>
	                        </SheetContent>
	                    </Sheet>
                    <Button variant="outline" onClick={() => handleSave()} disabled={saving || generating}>
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        保存
                    </Button>
                    <Button onClick={handleGenerate} disabled={saving || generating} className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white">
                        {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                        保存して生成
                    </Button>
                </div>
            </div>

            <div className="grid gap-8">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">実験名</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {analysis.experiments?.map((exp, expIndex) => (
                            <div key={expIndex} className="space-y-2 rounded-md border p-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-semibold text-muted-foreground">実験 {expIndex + 1}</span>
                                </div>
                                <Input
                                    value={exp.name}
                                    onChange={(e) => updateExperimentName(expIndex, e.target.value)}
                                    className="font-semibold"
                                />
                            </div>
                        ))}
                    </CardContent>
                </Card>

                <ExperimentalResultsStreamCard reportId={reportId} />

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <ImageIcon className="h-5 w-5" />
                            図とキャプションの一括管理
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            図ごとのキャプションと割り当て画像を同じリストで確認できます。行をドラッグすると画像の順序（＝図への割り当て）が入れ替わります。
                        </p>
                        {orderedImages.length === 0 ? (
                            <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">表示できる画像がありません。</p>
                        ) : (
                            <Reorder.Group axis="y" values={orderedImages} onReorder={setOrderedImages} className="space-y-3">
                                {orderedImages.map((image, index) => {
                                    const slot = figureSlots[index]
                                    return (
                                        <Reorder.Item
                                            key={`${image.file_name}::${image.uploaded_at}::${image.file_url}`}
                                            value={image}
                                            className="flex items-start gap-4 rounded-lg border bg-card p-3 shadow-sm cursor-grab active:cursor-grabbing"
                                        >
                                            <GripVertical className="mt-3 h-5 w-5 text-muted-foreground" />
                                            <div className="flex h-16 w-24 items-center justify-center overflow-hidden rounded bg-muted">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={image.file_url}
                                                    alt={image.file_name}
                                                    className="h-full w-full object-cover"
                                                    onError={(e) => {
                                                        (e.target as HTMLImageElement).style.display = "none"
                                                    }}
                                                />
                                            </div>
                                            <div className="flex-1 space-y-2">
                                                {slot ? (
                                                    <>
                                                        <div className="flex items-center justify-between gap-3">
                                                            <div>
                                                                <div className="text-sm font-semibold">{slot.figure.label}</div>
                                                                <div className="text-xs text-muted-foreground">{slot.experimentName}</div>
                                                            </div>
                                                            <div className="max-w-[220px] truncate text-xs text-muted-foreground">{image.file_name}</div>
                                                        </div>
                                                        <div className="flex items-center justify-between gap-2">
                                                            <Label className="text-xs text-muted-foreground">割り当て先</Label>
                                                            <select
                                                                className="h-7 rounded border bg-background px-2 text-[11px] text-foreground"
                                                                value={slot.expIndex}
                                                                onChange={(e) => {
                                                                    const nextExpIndex = Number(e.target.value)
                                                                    setAnalysis((prev) => {
                                                                        if (!prev) return prev
                                                                        const cloned = JSON.parse(JSON.stringify(prev))
                                                                        return moveBlockByLabel(cloned, {
                                                                            type: "figure",
                                                                            fromExpIndex: slot.expIndex,
                                                                            label: slot.figure.label,
                                                                            toExpIndex: nextExpIndex,
                                                                        })
                                                                    })
                                                                }}
                                                            >
                                                                {experimentOptions.map((o: any) => (
                                                                    <option key={o.index} value={o.index}>
                                                                        {o.label}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label className="text-xs text-muted-foreground">キャプション</Label>
                                                            <Input
                                                                value={slot.figure.caption}
                                                                onChange={(e) => updateFigureCaption(slot.expIndex, slot.figIndex, e.target.value)}
                                                            />
                                                            <div className="flex flex-wrap items-center gap-2 pt-1">
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    disabled={quantLoading[slot.expIndex] || generating}
                                                                    onClick={() => handleGenerateQuantComment(slot.expIndex)}
                                                                >
                                                                    {quantLoading[slot.expIndex] ? (
                                                                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                                                                    ) : null}
                                                                    定量的コメントを生成
                                                                </Button>
                                                                {(() => {
                                                                    const exp = analysis.experiments?.[slot.expIndex]
                                                                    const quant = Array.isArray(exp?.quant_comment) ? exp?.quant_comment : []
                                                                    const hasQuant = (Array.isArray(quant) && quant.length > 0) || (typeof exp?.quant_comment === "string" && exp?.quant_comment.trim() !== "")
                                                                    if (!hasQuant) return null
                                                                    const count = Array.isArray(quant) ? quant.length : 1
                                                                    return (
                                                                        <span className="text-xs text-muted-foreground">
                                                                            {count}件のコメントが保存されています
                                                                        </span>
                                                                    )
                                                                })()}
                                                            </div>
                                                            {(() => {
                                                                const exp = analysis.experiments?.[slot.expIndex]
                                                                if (!exp) return null
                                                                const quantRaw = exp.quant_comment
                                                                const quantBlocks: QuantBlock[] =
                                                                    Array.isArray(quantRaw)
                                                                        ? quantRaw
                                                                        : typeof quantRaw === "string" && quantRaw.trim()
                                                                            ? [{ type: "text", content: quantRaw }]
                                                                            : []
                                                                if (quantBlocks.length === 0) return null
                                                                return (
                                                                    <div className="mt-2 rounded-md border border-dashed bg-muted/50 p-2">
                                                                        <div className="mb-1 text-xs font-semibold text-muted-foreground">定量的コメントプレビュー</div>
                                                                        <div className="space-y-1 text-sm text-foreground">
                                                                            {quantBlocks.map((block, idx) => (
                                                                                <div key={idx} className="rounded bg-background px-2 py-1">
                                                                                    <span className="mr-2 inline-block rounded-full bg-muted px-2 py-[1px] text-[10px] font-semibold text-muted-foreground">
                                                                                        {block.type === "math" ? "MATH" : "TEXT"}
                                                                                    </span>
                                                                                    <span className="align-middle whitespace-pre-wrap break-words">{block.content}</span>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )
                                                            })()}
                                                        </div>
                                                    </>
                                                ) : (
                                                    <div className="flex w-full items-center justify-between gap-3">
                                                        <div>
                                                            <div className="text-sm font-semibold">未割り当ての画像</div>
                                                            <div className="text-xs text-muted-foreground">図の数より画像が多い場合はここに並びます</div>
                                                        </div>
                                                        <div className="max-w-[220px] truncate text-xs text-muted-foreground">{image.file_name}</div>
                                                    </div>
                                                )}
                                            </div>
                                        </Reorder.Item>
                                    )
                                })}
                            </Reorder.Group>
                        )}

                        {figureSlots.length > orderedImages.length && (
                            <div className="space-y-2">
                                <p className="text-xs font-semibold text-muted-foreground">画像が未割り当ての図</p>
                                {figureSlots.slice(orderedImages.length).map((slot) => (
                                    <div key={slot.key} className="flex items-start gap-4 rounded-lg border border-dashed bg-muted/50 p-3">
                                        <div className="flex h-16 w-24 items-center justify-center rounded bg-muted text-xs text-muted-foreground">画像なし</div>
                                        <div className="flex-1 space-y-1">
                                            <div className="text-sm font-semibold">{slot.figure.label}</div>
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="text-xs text-muted-foreground">{slot.experimentName}</div>
                                                <select
                                                    className="h-7 rounded border bg-background px-2 text-[11px] text-foreground"
                                                    value={slot.expIndex}
                                                    onChange={(e) => {
                                                        const nextExpIndex = Number(e.target.value)
                                                        setAnalysis((prev) => {
                                                            if (!prev) return prev
                                                            const cloned = JSON.parse(JSON.stringify(prev))
                                                            return moveBlockByLabel(cloned, {
                                                                type: "figure",
                                                                fromExpIndex: slot.expIndex,
                                                                label: slot.figure.label,
                                                                toExpIndex: nextExpIndex,
                                                            })
                                                        })
                                                    }}
                                                >
                                                    {experimentOptions.map((o: any) => (
                                                        <option key={o.index} value={o.index}>
                                                            {o.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <Label className="text-xs text-muted-foreground">キャプション</Label>
                                            <Input
                                                value={slot.figure.caption}
                                                onChange={(e) => updateFigureCaption(slot.expIndex, slot.figIndex, e.target.value)}
                                            />
                                        </div>
                                    </div>
                                ))}
                                <p className="text-xs text-muted-foreground">図の数に対して画像が不足しています。必要に応じて画像をアップロードしてください。</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <FileText className="h-5 w-5" />
                            表のキャプション
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {tableSlots.length === 0 ? (
                            <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">表は登録されていません。</p>
                        ) : (
                            tableSlots.map((slot) => (
                                <div key={slot.key} className="space-y-1 rounded-md border p-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <div className="text-sm font-semibold">{slot.table.label}</div>
                                            <div className="text-xs text-muted-foreground">{slot.experimentName}</div>
                                        </div>
                                        <select
                                            className="h-7 rounded border bg-background px-2 text-[11px] text-foreground"
                                            value={slot.expIndex}
                                            onChange={(e) => {
                                                const nextExpIndex = Number(e.target.value)
                                                setAnalysis((prev) => {
                                                    if (!prev) return prev
                                                    const cloned = JSON.parse(JSON.stringify(prev))
                                                    return moveBlockByLabel(cloned, {
                                                        type: "table",
                                                        fromExpIndex: slot.expIndex,
                                                        label: slot.table.label,
                                                        toExpIndex: nextExpIndex,
                                                    })
                                                })
                                            }}
                                        >
                                            {experimentOptions.map((o: any) => (
                                                <option key={o.index} value={o.index}>
                                                    {o.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <Label className="text-xs text-muted-foreground">キャプション</Label>
                                    <Input
                                        value={slot.table.caption}
                                        onChange={(e) => updateTableCaption(slot.expIndex, slot.tblIndex, e.target.value)}
                                    />
                                    <div className="flex flex-wrap items-center gap-2 pt-1">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={quantLoading[slot.expIndex] || generating}
                                            onClick={() => handleGenerateQuantComment(slot.expIndex)}
                                        >
                                            {quantLoading[slot.expIndex] ? (
                                                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                                            ) : null}
                                            定量的コメントを生成
                                        </Button>
                                        {(() => {
                                            const exp = analysis.experiments?.[slot.expIndex]
                                            const quant = Array.isArray(exp?.quant_comment) ? exp?.quant_comment : []
                                            const hasQuant = (Array.isArray(quant) && quant.length > 0) || (typeof exp?.quant_comment === "string" && exp?.quant_comment.trim() !== "")
                                            if (!hasQuant) return null
                                            const count = Array.isArray(quant) ? quant.length : 1
                                            return (
                                                <span className="text-xs text-muted-foreground">
                                                    {count}件のコメントが保存されています
                                                </span>
                                            )
                                        })()}
                                    </div>
                                    {(() => {
                                        const exp = analysis.experiments?.[slot.expIndex]
                                        if (!exp) return null
                                        const quantRaw = exp.quant_comment
                                        const quantBlocks: QuantBlock[] =
                                            Array.isArray(quantRaw)
                                                ? quantRaw
                                                : typeof quantRaw === "string" && quantRaw.trim()
                                                    ? [{ type: "text", content: quantRaw }]
                                                    : []
                                        if (quantBlocks.length === 0) return null
                                        return (
                                            <div className="mt-2 rounded-md border border-dashed bg-muted/50 p-2">
                                                <div className="mb-1 text-xs font-semibold text-muted-foreground">定量的コメントプレビュー</div>
                                                <div className="space-y-1 text-sm text-foreground">
                                                    {quantBlocks.map((block, idx) => (
                                                        <div key={idx} className="rounded bg-background px-2 py-1">
                                                            <span className="mr-2 inline-block rounded-full bg-muted px-2 py-[1px] text-[10px] font-semibold text-muted-foreground">
                                                                {block.type === "math" ? "MATH" : "TEXT"}
                                                            </span>
                                                            <span className="align-middle whitespace-pre-wrap break-words">{block.content}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )
                                    })()}
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
