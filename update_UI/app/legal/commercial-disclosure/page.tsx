import { Metadata } from "next"

export const metadata: Metadata = {
    title: "特定商取引法に基づく表記 | Reportlab",
    description: "Reportlabの特定商取引法に基づく表記です。",
}

export default function CommercialDisclosurePage() {
    return (
        <div className="min-h-screen bg-background py-20">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
                <h1 className="text-3xl font-bold text-foreground mb-8 text-center">特定商取引法に基づく表記</h1>

                <div className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
                    <dl className="divide-y divide-border">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6 hover:bg-muted/50 transition-colors">
                            <dt className="font-semibold text-foreground">販売業者</dt>
                            <dd className="sm:col-span-2 text-muted-foreground">
                                請求があったら遅滞なく開示します。
                            </dd>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6 hover:bg-muted/50 transition-colors">
                            <dt className="font-semibold text-foreground">運営統括責任者名</dt>
                            <dd className="sm:col-span-2 text-muted-foreground">請求があったら遅滞なく開示します。</dd>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6 hover:bg-muted/50 transition-colors">
                            <dt className="font-semibold text-foreground">所在地</dt>
                            <dd className="sm:col-span-2 text-muted-foreground">
                                請求があったら遅滞なく開示します。
                            </dd>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6 hover:bg-muted/50 transition-colors">
                            <dt className="font-semibold text-foreground">電話番号</dt>
                            <dd className="sm:col-span-2 text-muted-foreground">
                                請求があったら遅滞なく開示します。
                            </dd>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6 hover:bg-muted/50 transition-colors">
                            <dt className="font-semibold text-foreground">メールアドレス</dt>
                            <dd className="sm:col-span-2 text-muted-foreground">reportlab@outlook.jp</dd>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6 hover:bg-muted/50 transition-colors">
                            <dt className="font-semibold text-foreground">販売価格</dt>
                            <dd className="sm:col-span-2 text-muted-foreground">
                                各プランのページに記載されています。表示価格は税込みです。
                            </dd>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6 hover:bg-muted/50 transition-colors">
                            <dt className="font-semibold text-foreground">商品代金以外の必要料金</dt>
                            <dd className="sm:col-span-2 text-muted-foreground">
                                インターネット接続料金、通信料金等はお客様のご負担となります。
                            </dd>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6 hover:bg-muted/50 transition-colors">
                            <dt className="font-semibold text-foreground">お支払い方法</dt>
                            <dd className="sm:col-span-2 text-muted-foreground">
                                クレジットカード決済（Stripe）
                            </dd>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6 hover:bg-muted/50 transition-colors">
                            <dt className="font-semibold text-foreground">お支払い時期</dt>
                            <dd className="sm:col-span-2 text-muted-foreground">
                                <ul className="list-disc list-inside space-y-1">
                                    <li>都度課金：購入時</li>
                                    <li>定期課金：初回購入時、翌月以降は毎月同日に請求</li>
                                </ul>
                            </dd>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6 hover:bg-muted/50 transition-colors">
                            <dt className="font-semibold text-foreground">商品の引渡時期</dt>
                            <dd className="sm:col-span-2 text-muted-foreground">
                                決済完了後、直ちにご利用いただけます。
                            </dd>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6 hover:bg-muted/50 transition-colors">
                            <dt className="font-semibold text-foreground">返品・交換について</dt>
                            <dd className="sm:col-span-2 text-muted-foreground">
                                デジタルコンテンツの性質上、決済完了後の返品・キャンセルはお受けできません。
                                <br />
                                ただし、当社の責めに帰すべき事由により商品が利用できなかった場合はこの限りではありません。
                            </dd>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6 hover:bg-muted/50 transition-colors">
                            <dt className="font-semibold text-foreground">解約について</dt>
                            <dd className="sm:col-span-2 text-muted-foreground">
                                定期課金の解約は、設定画面よりいつでも行えます。
                                <br />
                                次回更新日の前日までに解約手続きを行った場合、次回の請求は発生しません。
                                <br />
                                解約後も、有効期限まではサービスをご利用いただけます。
                            </dd>
                        </div>
                    </dl>
                </div>
            </div>
        </div>
    )
}
