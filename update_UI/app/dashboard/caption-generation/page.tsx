import { CaptionGenerator } from "@/components/caption-generator/CaptionGenerator"
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

            <CaptionGenerator />
        </div>
    )
}
