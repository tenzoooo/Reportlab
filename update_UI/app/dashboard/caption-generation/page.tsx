import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import DashboardPageShell from "@/components/dashboard-page-shell"

export default function CaptionGenerationPage() {
    return (
        <DashboardPageShell
            title="キャプション自動生成"
            subtitle="実験書と実験結果からキャプションを自動生成します"
        >
            <Card className="bg-white/5 border-white/10">
                <CardHeader>
                    <CardTitle className="text-white">準備中</CardTitle>
                    <CardDescription className="text-slate-400">
                        キャプション自動生成機能は再構築のため一時停止しています。
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-slate-400">
                        新しいレポート生成フローの設計が固まり次第、この画面も作り直します。
                    </p>
                </CardContent>
            </Card>
        </DashboardPageShell>
    )
}
