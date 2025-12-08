"use client"

import { useState, useCallback } from "react"
import { useDropzone } from "react-dropzone"
import { Loader2, Upload, FileText, Check, Copy, AlertCircle, X, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { toast } from "sonner"
import { ExperimentDefinition, ObservedImageData } from "@/lib/caption-generation/types"

type ImageResult = {
    id: string
    file: File
    status: 'idle' | 'analyzing' | 'success' | 'error'
    caption: string | null
    experimentName: string | null
    observedData: ObservedImageData | null
    quantitativeComment?: string | null
}

export function CaptionGenerator() {
    const [pdfFile, setPdfFile] = useState<File | null>(null)
    const [definitions, setDefinitions] = useState<ExperimentDefinition | null>(null)
    const [analyzingPdf, setAnalyzingPdf] = useState(false)

    const [results, setResults] = useState<ImageResult[]>([])
    const [analyzingImages, setAnalyzingImages] = useState(false)

    const onDropPdf = useCallback((acceptedFiles: File[]) => {
        if (acceptedFiles.length > 0) {
            setPdfFile(acceptedFiles[0])
            setDefinitions(null)
        }
    }, [])

    const onDropImages = useCallback((acceptedFiles: File[]) => {
        if (acceptedFiles.length > 0) {
            const newResults: ImageResult[] = acceptedFiles.map(file => ({
                id: Math.random().toString(36).substring(7),
                file,
                status: 'idle',
                caption: null,
                experimentName: null,
                observedData: null
            }))
            setResults(prev => [...prev, ...newResults])
            // Do NOT auto-start analysis immediately to allow user to review list, 
            // OR auto-start if desired. Let's provide a button for batch start.
        }
    }, [])

    const { getRootProps: getPdfRootProps, getInputProps: getPdfInputProps } = useDropzone({
        onDrop: onDropPdf,
        accept: { "application/pdf": [".pdf"] },
        maxFiles: 1,
    })

    const { getRootProps: getImageRootProps, getInputProps: getImageInputProps } = useDropzone({
        onDrop: onDropImages,
        accept: { "image/*": [".png", ".jpg", ".jpeg"] },
        // maxFiles: undefined (default is unlimited)
    })

    const handleAnalyzePdf = async () => {
        if (!pdfFile) return
        setAnalyzingPdf(true)
        try {
            const formData = new FormData()
            formData.append("file", pdfFile)
            const res = await fetch("/api/caption-generation/analyze-pdf", {
                method: "POST",
                body: formData,
            })
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}))
                throw new Error(errData.error || "PDF analysis failed")
            }
            const data = await res.json()
            setDefinitions(data)
            toast.success("実験書の解析が完了しました")
        } catch (error) {
            console.error(error)
            toast.error("実験書の解析に失敗しました")
        } finally {
            setAnalyzingPdf(false)
        }
    }

    const processImage = async (item: ImageResult, defs: ExperimentDefinition): Promise<ImageResult> => {
        try {
            // 1. Analyze Image
            const formData = new FormData()
            formData.append("file", item.file)
            const resAnalyze = await fetch("/api/caption-generation/analyze-image", {
                method: "POST",
                body: formData,
            })
            if (!resAnalyze.ok) throw new Error("Image analysis failed")
            const observed = await resAnalyze.json()

            // 2. Generate Caption
            const resMatch = await fetch("/api/caption-generation/match", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ observed, definitions: defs }),
            })
            if (!resMatch.ok) throw new Error("Caption generation failed")
            const result = await resMatch.json()

            return {
                ...item,
                status: 'success',
                observedData: observed,
                caption: result.generated_caption,
                experimentName: result.experiment_name
            }
        } catch (error) {
            console.error(error)
            return { ...item, status: 'error' }
        }
    }

    const handleAnalyzeAllImages = async () => {
        if (!definitions) {
            toast.error("先に実験書を解析してください")
            return
        }
        setAnalyzingImages(true)

        // Process sequentially to avoid rate limits or overwhelming server
        // Use functional state update to ensure latest state interaction if needed, 
        // but here we just iterate the current list copy.

        const queue = [...results]
        const updatedResults = [...results]

        for (let i = 0; i < queue.length; i++) {
            if (queue[i].status === 'success' || queue[i].status === 'analyzing') continue;

            // Optimistic update for UI
            setResults(prev => prev.map(r => r.id === queue[i].id ? { ...r, status: 'analyzing' } : r))

            const processed = await processImage(queue[i], definitions)

            // Commit result
            setResults(prev => prev.map(r => r.id === processed.id ? processed : r))
        }

        setAnalyzingImages(false)
        toast.success("すべての画像の処理が完了しました")
    }

    const removeImage = (id: string) => {
        setResults(prev => prev.filter(r => r.id !== id))
    }

    const clearAllImages = () => {
        setResults([])
    }

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text)
        toast.success("クリップボードにコピーしました")
    }

    // Auto-numbering logic: Figures correspond to index + 1
    const getFigureLabel = (index: number) => `図${index + 1}: `

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>実験データ自動キャプション生成</CardTitle>
                    <CardDescription>
                        実験書(PDF)と実験結果(画像)から、適切なキャプションを自動生成します。<br />
                        複数の画像をアップロードすると、自動的に連番（図1, 図2...）が割り振られます。
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Step 1: PDF Upload */}
                    <div className="space-y-2">
                        <h3 className="text-sm font-medium">1. 実験指導書 (PDF)</h3>
                        {!definitions ? (
                            <div className="space-y-2">
                                <div
                                    {...getPdfRootProps()}
                                    className="border-2 border-dashed rounded-md p-6 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                                >
                                    <input {...getPdfInputProps()} />
                                    <FileText className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                                    <p className="text-sm text-muted-foreground">
                                        {pdfFile ? pdfFile.name : "PDFをドラッグ＆ドロップ、またはクリックして選択"}
                                    </p>
                                </div>
                                <Button
                                    onClick={handleAnalyzePdf}
                                    disabled={!pdfFile || analyzingPdf}
                                    className="w-full"
                                >
                                    {analyzingPdf && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    実験書を解析する
                                </Button>
                            </div>
                        ) : (
                            <Alert className="bg-green-50 border-green-200">
                                <Check className="h-4 w-4 text-green-600" />
                                <AlertTitle className="text-green-800">解析完了</AlertTitle>
                                <AlertDescription className="text-green-700">
                                    <div className="flex flex-col gap-2">
                                        <div className="flex justify-between items-center">
                                            <span>
                                                {definitions.experiment_title ?
                                                    `「${definitions.experiment_title}」の構造を抽出しました。` :
                                                    "実験のコンテキストを抽出しました。"}
                                            </span>
                                            <Button variant="link" size="sm" onClick={() => setDefinitions(null)} className="text-green-800 p-0 h-auto">
                                                リセット
                                            </Button>
                                        </div>

                                        {/* Hierarchical Display */}
                                        {definitions.methodology_structure && definitions.methodology_structure.length > 0 ? (
                                            <div className="mt-2 text-xs bg-white/50 p-2 rounded border border-green-200 max-h-60 overflow-y-auto">
                                                <p className="font-semibold mb-1">抽出された実験構造:</p>
                                                {definitions.methodology_structure.map((section, i) => (
                                                    <div key={i} className="mb-2">
                                                        <p className="font-bold text-green-900 mb-1">{section.section_number} {section.section_title}</p>
                                                        <ul className="list-disc list-inside space-y-1 pl-2">
                                                            {section.items.map((item, j) => (
                                                                <li key={j} className="text-green-800">
                                                                    <span className="font-medium">{item.item_number} {item.name}</span>
                                                                    {item.conditions && item.conditions.length > 0 && (
                                                                        <span className="text-green-600 ml-2 text-[10px]">
                                                                            ({item.conditions.join(", ")})
                                                                        </span>
                                                                    )}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : definitions.experiments && definitions.experiments.length > 0 ? (
                                            // Fallback for flat list
                                            <div className="mt-2 text-xs bg-white/50 p-2 rounded border border-green-200">
                                                <p className="font-semibold mb-1">抽出された実験リスト:</p>
                                                <ul className="list-disc list-inside space-y-1">
                                                    {definitions.experiments.map((exp, i) => (
                                                        <li key={i}>
                                                            <span className="font-medium">{exp.name}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ) : null}
                                    </div>
                                </AlertDescription>
                            </Alert>
                        )}
                    </div>

                    {/* Step 2: Image Upload & List */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-medium">2. 実験結果 (画像) - 複数アップロード可</h3>
                            {results.length > 0 && (
                                <Button variant="ghost" size="sm" onClick={clearAllImages} className="text-muted-foreground">
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    全て削除
                                </Button>
                            )}
                        </div>

                        <div
                            {...getImageRootProps()}
                            className="border-2 border-dashed rounded-md p-6 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                        >
                            <input {...getImageInputProps()} />
                            <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                            <p className="text-sm text-muted-foreground">
                                画像をここにドラッグ＆ドロップ (複数可)
                            </p>
                        </div>

                        {results.length > 0 && (
                            <div className="space-y-4">
                                <Button
                                    onClick={handleAnalyzeAllImages}
                                    disabled={!definitions || analyzingImages || results.every(r => r.status === 'success')}
                                    className="w-full"
                                >
                                    {analyzingImages && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    まとめて解析・キャプション生成
                                </Button>

                                {!definitions && (
                                    <p className="text-xs text-muted-foreground text-center text-red-500">
                                        ※先に実験書を解析してください
                                    </p>
                                )}

                                <div className="grid gap-4">
                                    {results.map((item, index) => (
                                        <Card key={item.id} className="overflow-hidden">
                                            <div className="flex flex-col md:flex-row">
                                                {/* Image Preview */}
                                                <div className="w-full md:w-48 bg-muted/30 p-4 flex items-center justify-center relative group">
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img
                                                        src={URL.createObjectURL(item.file)}
                                                        alt="preview"
                                                        className="h-32 object-contain"
                                                    />
                                                    <Button
                                                        variant="destructive"
                                                        size="icon"
                                                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            removeImage(item.id)
                                                        }}
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </Button>
                                                </div>

                                                {/* Content */}
                                                <div className="flex-1 p-4 space-y-3">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center space-x-2">
                                                            <span className="font-bold text-lg text-primary">
                                                                {getFigureLabel(index)}
                                                            </span>
                                                            <span className="text-sm text-muted-foreground truncate max-w-[200px]">
                                                                {item.file.name}
                                                            </span>
                                                        </div>
                                                        {item.status === 'success' && item.experimentName && (
                                                            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                                                                {item.experimentName}
                                                            </span>
                                                        )}
                                                        {item.status === 'analyzing' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                                                        {item.status === 'error' && <span className="text-xs text-red-500 font-bold">エラー</span>}
                                                    </div>

                                                    {item.status === 'success' ? (
                                                        <div className="space-y-4">
                                                            <div>
                                                                <p className="font-medium">
                                                                    {getFigureLabel(index)}{item.caption}
                                                                </p>
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    className="mt-2"
                                                                    onClick={() => item.caption && copyToClipboard(`${getFigureLabel(index)}${item.caption}`)}
                                                                >
                                                                    <Copy className="mr-2 h-4 w-4" />
                                                                    キャプションをコピー
                                                                </Button>
                                                            </div>

                                                            {/* Quantitative Comment Display */}
                                                            {item.quantitativeComment && (
                                                                <div className="bg-slate-50 p-3 rounded-md border text-sm">
                                                                    <div className="flex items-center gap-2 mb-1 text-slate-900 font-semibold">
                                                                        <AlertCircle className="h-4 w-4 text-blue-600" />
                                                                        AI定量的コメント
                                                                    </div>
                                                                    <p className="text-slate-700 leading-relaxed">
                                                                        {item.quantitativeComment}
                                                                    </p>
                                                                    <Button
                                                                        size="sm"
                                                                        variant="ghost"
                                                                        className="h-auto p-0 text-xs text-blue-600 hover:text-blue-800 mt-2"
                                                                        onClick={() => item.quantitativeComment && copyToClipboard(item.quantitativeComment)}
                                                                    >
                                                                        コメントをコピー
                                                                    </Button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="text-sm text-muted-foreground">
                                                            {item.status === 'idle' ? '解析待ち' : item.status === 'analyzing' ? '解析中...' : '生成失敗'}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
