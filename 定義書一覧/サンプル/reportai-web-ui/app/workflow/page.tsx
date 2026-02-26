"use client"

import type React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  FileText,
  ImageIcon,
  Loader2,
  CheckCircle2,
  Sparkles,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Table,
} from "lucide-react"

export default function WorkflowPage() {
  const router = useRouter()
  const [pdfFiles, setPdfFiles] = useState<File[]>([])
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [excelData, setExcelData] = useState("")
  const [memo, setMemo] = useState("")
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [logOpen, setLogOpen] = useState(true)

  const [useRemoteUrl, setUseRemoteUrl] = useState(false)
  const [usePastReport, setUsePastReport] = useState(false)
  const [skipExperimentComment, setSkipExperimentComment] = useState(false)

  const [pastReportFiles, setPastReportFiles] = useState<File[]>([])

  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [tablePreview, setTablePreview] = useState<string[][]>([])

  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setPdfFiles(Array.from(e.target.files))
    }
  }

  const handlePastReportUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setPastReportFiles(Array.from(e.target.files))
    }
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      setImageFiles(Array.from(e.target.files))

      const reader = new FileReader()
      reader.onload = (event) => {
        setImagePreview(event.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleExcelPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedData = e.clipboardData.getData("text")
    setExcelData(pastedData)

    const rows = pastedData.split("\n").map((row) => row.split("\t"))
    setTablePreview(rows)
  }

  const handleExecute = async () => {
    setProcessing(true)
    setProgress(0)

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval)
          setTimeout(() => {
            router.push("/history")
          }, 1000)
          return 100
        }
        return prev + 10
      })
    }, 500)
  }

  const tags = ["実験1-概要2", "図1版", "温度1-1", "温度2-1", "解析1"]

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 relative overflow-hidden">
      <Header />

      {/* Organic blob shapes */}
      <div className="blob-purple w-[500px] h-[500px] top-0 right-0 translate-x-1/3 -translate-y-1/3" />
      <div className="blob-yellow w-[400px] h-[400px] bottom-0 left-0 -translate-x-1/3 translate-y-1/3" />
      <div className="blob-pink w-[300px] h-[300px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-30" />

      {/* Floating dots */}
      <div className="floating-dot bg-purple-600 top-1/4 left-1/4" style={{ animationDelay: "0s" }} />
      <div className="floating-dot bg-yellow-400 top-1/3 right-1/4" style={{ animationDelay: "1s" }} />
      <div className="floating-dot bg-pink-400 bottom-1/3 right-1/3" style={{ animationDelay: "2s" }} />
      <div className="floating-dot bg-green-400 top-2/3 left-1/3" style={{ animationDelay: "3s" }} />

      <main className="container mx-auto px-4 py-4 relative z-10">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold mb-1">
                <span className="text-purple-600">ReportAI</span> Workflow Runner
              </h1>
              <p className="text-sm text-muted-foreground">PDFと図表画像から要約・OCR・定量コメントを自動生成</p>
            </div>
            <Button variant="outline" className="rounded-full gap-2 bg-white/80 backdrop-blur text-sm">
              <HelpCircle className="h-4 w-4" />
              使い方ガイド
            </Button>
          </div>

          <div className="mb-3">
            <Collapsible open={logOpen} onOpenChange={setLogOpen}>
              <Card className="rounded-3xl shadow-xl border-2 border-gray-200 bg-white/80 backdrop-blur">
                <CollapsibleTrigger className="w-full">
                  <CardHeader className="cursor-pointer hover:bg-gray-50 transition-colors rounded-t-3xl py-3 px-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">実行ログ</CardTitle>
                      {logOpen ? (
                        <ChevronUp className="h-5 w-5 text-gray-600" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-gray-600" />
                      )}
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0 pb-3 px-4">
                    <div className="bg-gray-900 rounded-2xl p-3 font-mono text-xs text-green-400">
                      <p>10:21:28 - pandoc を検出しました (JunikacoMiyazono)</p>
                      <p>10:21:29 - システム準備完了</p>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          </div>

          {!processing ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              // Reduced space-y from space-y-6 to space-y-4
              <div className="lg:col-span-2 space-y-4">
                {/* Step 1: PDF Upload */}
                <Card className="rounded-3xl shadow-xl border-2 border-blue-200 bg-white/80 backdrop-blur">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">
                        1
                      </div>
                      <div>
                        <CardTitle className="text-lg">PDFを取り込む</CardTitle>
                        <CardDescription className="text-xs">
                          アップロードまたは設定から実験資料を取り込みます。
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    <div>
                      <Label className="text-base font-semibold mb-2 block">PDFファイル</Label>
                      <div className="border-2 border-dashed border-blue-300 rounded-2xl p-6 text-center hover:border-blue-600 transition-colors bg-blue-50/50">
                        <Input
                          id="pdf-upload"
                          type="file"
                          accept=".pdf"
                          multiple
                          onChange={handlePdfUpload}
                          className="hidden"
                        />
                        <label htmlFor="pdf-upload" className="cursor-pointer">
                          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-3">
                            <FileText className="h-6 w-6 text-white" />
                          </div>
                          <p className="font-medium mb-1">クリックまたはファイルをここにドラッグ＆ドロップ</p>
                          <p className="text-sm text-muted-foreground">複数ファイル OK / 現在は先頭のみ処理</p>
                        </label>
                      </div>
                      {pdfFiles.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {pdfFiles.map((file, index) => (
                            <div
                              key={index}
                              className="flex items-center gap-2 p-3 bg-blue-50 rounded-xl border border-blue-200"
                            >
                              <FileText className="h-4 w-4 text-blue-600" />
                              <span className="text-sm">{file.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200">
                      <Label className="text-sm font-semibold mb-2 block">コピーベースで追加</Label>
                      <p className="text-xs text-muted-foreground mb-3">
                        ここをクリックしてコピーした内容を貼り付け (Ctrl+V / ⌘+V)
                      </p>
                      <Textarea
                        placeholder="貼り付けられた内容は自動的に処理されます。"
                        className="min-h-[80px] rounded-xl"
                      />
                    </div>

                    <div className="space-y-3">
                      <Label className="text-sm font-semibold">オプション</Label>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="remote-url"
                          checked={useRemoteUrl}
                          onCheckedChange={(checked) => setUseRemoteUrl(checked as boolean)}
                        />
                        <label
                          htmlFor="remote-url"
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          remote_urlを使って直接参照する
                        </label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="past-report"
                          checked={usePastReport}
                          onCheckedChange={(checked) => setUsePastReport(checked as boolean)}
                        />
                        <label
                          htmlFor="past-report"
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          過去レポートを使用する
                        </label>
                      </div>

                      {usePastReport && (
                        <div className="mt-3 border-2 border-dashed border-blue-300 rounded-2xl p-4 bg-blue-50/30">
                          <Input
                            id="past-report-upload"
                            type="file"
                            accept=".pdf,.docx"
                            multiple
                            onChange={handlePastReportUpload}
                            className="hidden"
                          />
                          <label htmlFor="past-report-upload" className="cursor-pointer">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center">
                                <FileText className="h-5 w-5 text-white" />
                              </div>
                              <div>
                                <p className="font-medium text-sm">過去レポートをアップロード</p>
                                <p className="text-xs text-muted-foreground">PDF または DOCX ファイル</p>
                              </div>
                            </div>
                          </label>
                          {pastReportFiles.length > 0 && (
                            <div className="mt-3 space-y-2">
                              {pastReportFiles.map((file, index) => (
                                <div
                                  key={index}
                                  className="flex items-center gap-2 p-2 bg-white rounded-lg border border-blue-200"
                                >
                                  <FileText className="h-4 w-4 text-blue-600" />
                                  <span className="text-xs">{file.name}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Step 2: Image Upload */}
                <Card className="rounded-3xl shadow-xl border-2 border-yellow-200 bg-white/80 backdrop-blur">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-yellow-500 text-white flex items-center justify-center font-bold">
                        2
                      </div>
                      <div>
                        <CardTitle className="text-lg">図や画像を追加</CardTitle>
                        <CardDescription className="text-xs">
                          実験コメント対象を数値抽出し、比較や統計コメントをグループ化できます。
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    <div>
                      <Label className="text-base font-semibold mb-2 block">図面画像（任意）</Label>
                      <div className="border-2 border-dashed border-yellow-300 rounded-2xl p-6 text-center hover:border-yellow-600 transition-colors bg-yellow-50/50">
                        <Input
                          id="image-upload"
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={handleImageUpload}
                          className="hidden"
                        />
                        <label htmlFor="image-upload" className="cursor-pointer">
                          <div className="w-12 h-12 bg-yellow-500 rounded-xl flex items-center justify-center mx-auto mb-3">
                            <ImageIcon className="h-6 w-6 text-white" />
                          </div>
                          <p className="font-medium mb-1">クリックまたは画像をここにドラッグ＆ドロップ</p>
                          <p className="text-sm text-muted-foreground">
                            アップロード後に画像の順序を入れ替えられます。
                          </p>
                        </label>
                      </div>
                      {imageFiles.length > 0 && (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          {imageFiles.map((file, index) => (
                            <div
                              key={index}
                              className="flex items-center gap-2 p-3 bg-yellow-50 rounded-xl border border-yellow-200"
                            >
                              <ImageIcon className="h-4 w-4 text-yellow-600" />
                              <span className="text-sm truncate">{file.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="skip-comment"
                        checked={skipExperimentComment}
                        onCheckedChange={(checked) => setSkipExperimentComment(checked as boolean)}
                      />
                      <label
                        htmlFor="skip-comment"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        実験コメント追加を省略にする
                      </label>
                    </div>

                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200">
                      <Label className="text-sm font-semibold mb-2 block">コピーベースで追加</Label>
                      <p className="text-xs text-muted-foreground mb-3">
                        ここをクリックしてコピーした画像を貼り付け (Ctrl+V / ⌘+V)
                      </p>
                      <Textarea
                        placeholder="貼り付けられた画像は自動的に処理されます。"
                        className="min-h-[80px] rounded-xl"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Step 3: Excel Table */}
                <Card className="rounded-3xl shadow-xl border-2 border-green-200 bg-white/80 backdrop-blur">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-green-600 text-white flex items-center justify-center font-bold">
                        3
                      </div>
                      <div>
                        <CardTitle className="text-lg">Excelを表を取り込む</CardTitle>
                        <CardDescription className="text-xs">
                          貼り付けた表をプレビューで確認を表示します。
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    <div>
                      <Label className="text-base font-semibold mb-2 block">Excel表（任意）</Label>
                      <p className="text-sm text-muted-foreground mb-3">
                        Excel からコピーして貼り付けるとプレビューで確認できます。
                      </p>
                      <Textarea
                        placeholder="Excelからコピーした表をここに貼り付け (Ctrl+V / ⌘+V)"
                        value={excelData}
                        onChange={(e) => setExcelData(e.target.value)}
                        onPaste={handleExcelPaste}
                        className="min-h-[120px] rounded-xl font-mono text-sm"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Step 4: Memo */}
                <Card className="rounded-3xl shadow-xl border-2 border-pink-200 bg-white/80 backdrop-blur">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-pink-500 text-white flex items-center justify-center font-bold">
                        4
                      </div>
                      <div>
                        <CardTitle className="text-lg">メモ・補足を整理</CardTitle>
                        <CardDescription className="text-xs">
                          必要に応じて名前を入れてください。過去レポートを利用する場合は空欄でも構いません。
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    <div>
                      <Label className="text-base font-semibold mb-2 block">メモ・補足（任意）</Label>
                      <p className="text-sm text-muted-foreground mb-3">
                        実験ごとの詳細や補足情報を記入できます。適切なタグを選択してください。
                      </p>
                      <Textarea
                        placeholder="メモや補足情報を入力..."
                        value={memo}
                        onChange={(e) => setMemo(e.target.value)}
                        className="min-h-[150px] rounded-xl"
                      />
                    </div>

                    <div>
                      <Label className="text-sm font-semibold mb-2 block">タグ</Label>
                      <div className="flex flex-wrap gap-2">
                        {tags.map((tag) => (
                          <Badge
                            key={tag}
                            variant="outline"
                            className="rounded-full px-3 py-1 cursor-pointer hover:bg-pink-100 transition-colors"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Execute Button */}
                <div className="flex justify-center pt-2">
                  <Button
                    onClick={handleExecute}
                    disabled={pdfFiles.length === 0}
                    size="lg"
                    className="rounded-full px-12 py-6 text-lg bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 shadow-2xl"
                  >
                    <Sparkles className="h-5 w-5 mr-2" />
                    Workflowを実行
                  </Button>
                </div>

                {/* PDF Preview - kept at bottom */}
                <Collapsible open={previewOpen} onOpenChange={setPreviewOpen}>
                  <Card className="rounded-3xl shadow-xl border-2 border-purple-200 bg-white/80 backdrop-blur">
                    <CollapsibleTrigger className="w-full">
                      <CardHeader className="cursor-pointer hover:bg-purple-50/50 transition-colors rounded-t-3xl py-3 px-4">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg">PDF要約プレビュー</CardTitle>
                          {previewOpen ? (
                            <ChevronUp className="h-5 w-5 text-purple-600" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-purple-600" />
                          )}
                        </div>
                        <CardDescription className="text-xs text-left">
                          PDFを選択すると、要約が自動生成されます。
                        </CardDescription>
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="pt-0 pb-3 px-4">
                        <div className="bg-purple-50 rounded-2xl p-3 border border-purple-200">
                          <p className="text-xs text-muted-foreground">要約がここに表示されます...</p>
                        </div>
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              </div>
              <div className="lg:col-span-1 space-y-4">
                <div className="sticky top-8 space-y-4">
                  {/* Image preview section */}
                  <Card className="rounded-3xl shadow-xl border-2 border-purple-200 bg-white/80 backdrop-blur">
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold">
                          1
                        </div>
                        <div>
                          <CardTitle className="text-base flex items-center gap-2">
                            <ImageIcon className="h-4 w-4 text-purple-600" />
                            画像プレビュー
                          </CardTitle>
                          <CardDescription className="text-xs">
                            ドラッグ＆ドロップまたはボタンで画像を選択して確認できます。
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {imagePreview ? (
                        <div className="border-2 border-purple-300 rounded-2xl p-3 bg-purple-50/50">
                          <img
                            src={imagePreview || "/placeholder.svg"}
                            alt="Preview"
                            className="w-full h-auto rounded-xl"
                          />
                        </div>
                      ) : (
                        <div className="border-2 border-dashed border-purple-300 rounded-2xl p-6 text-center bg-purple-50/50">
                          <ImageIcon className="h-8 w-8 text-purple-300 mx-auto mb-2" />
                          <p className="text-xs text-muted-foreground">画像が選択されていません</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Table preview section */}
                  <Card className="rounded-3xl shadow-xl border-2 border-green-200 bg-white/80 backdrop-blur">
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-green-600 text-white flex items-center justify-center font-bold">
                          2
                        </div>
                        <div>
                          <CardTitle className="text-base flex items-center gap-2">
                            <Table className="h-4 w-4 text-green-600" />
                            表プレビュー
                          </CardTitle>
                          <CardDescription className="text-xs">
                            Excelからコピーした表をプレビューで確認できます。
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {tablePreview.length > 0 ? (
                        <div className="border-2 border-green-300 rounded-2xl p-3 bg-green-50/50 overflow-x-auto max-h-64 overflow-y-auto">
                          <table className="w-full text-xs">
                            <tbody>
                              {tablePreview.map((row, i) => (
                                <tr key={i} className="border-b border-green-200 last:border-0">
                                  {row.map((cell, j) => (
                                    <td key={j} className="p-1.5 border-r border-green-200 last:border-0">
                                      {cell}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="border-2 border-dashed border-green-300 rounded-2xl p-6 text-center bg-green-50/50">
                          <Table className="h-8 w-8 text-green-300 mx-auto mb-2" />
                          <p className="text-xs text-muted-foreground">表が選択されていません</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          ) : (
            <Card className="rounded-3xl shadow-2xl border-2">
              <CardHeader>
                <CardTitle className="text-2xl">処理中...</CardTitle>
                <CardDescription className="text-base">
                  レポートを生成しています。しばらくお待ちください。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span>進捗状況</span>
                    <span className="font-bold">{progress}%</span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-4">
                    <div
                      className="bg-gradient-to-r from-purple-600 to-pink-400 h-4 rounded-full transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-4 bg-purple-50 rounded-xl border-2 border-purple-200">
                    {progress >= 33 ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <Loader2 className="h-5 w-5 text-purple-600 animate-spin" />
                    )}
                    <span>PDF要約生成</span>
                  </div>
                  <div className="flex items-center gap-3 p-4 bg-yellow-50 rounded-xl border-2 border-yellow-200">
                    {progress >= 66 ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : progress >= 33 ? (
                      <Loader2 className="h-5 w-5 text-yellow-600 animate-spin" />
                    ) : (
                      <div className="h-5 w-5 rounded-full bg-gray-200" />
                    )}
                    <span>図表OCR処理</span>
                  </div>
                  <div className="flex items-center gap-3 p-4 bg-pink-50 rounded-xl border-2 border-pink-200">
                    {progress >= 100 ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : progress >= 66 ? (
                      <Loader2 className="h-5 w-5 text-pink-600 animate-spin" />
                    ) : (
                      <div className="h-5 w-5 rounded-full bg-gray-200" />
                    )}
                    <span>テンプレート出力</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}
