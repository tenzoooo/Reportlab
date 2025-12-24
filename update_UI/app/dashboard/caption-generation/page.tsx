import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function CaptionGenerationPage() {
    return (
        <div className="container mx-auto py-8 px-4 max-w-4xl">
            <div className="mb-8">
                <h1 className="text-2xl font-bold mb-2">キャプション自動生成</h1>
                <p className="text-muted-foreground">
                    実験書(PDF)と実験結果(画像)から、適切なキャプションを自動生成します。
                    生成されたキャプションはコピーしてレポートに使用できます。
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>準備中</CardTitle>
                    <CardDescription>キャプション自動生成機能は再構築のため一時停止しています。</CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">
                        新しいレポート生成フローの設計が固まり次第、この画面も作り直します。
                    </p>
                </CardContent>
            </Card>
        </div>
    )
}
