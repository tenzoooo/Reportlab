import { Metadata } from "next"
import StandalonePageShell from "@/components/standalone-page-shell"

export const metadata: Metadata = {
    title: "特定商取引法に基づく表記 | Reportlab",
    description: "Reportlabの特定商取引法に基づく表記です。",
}

export default function CommercialDisclosurePage() {
    return (
        <StandalonePageShell
            title="特定商取引法に基づく表記"
            subtitle="販売条件・事業者情報・返品条件の開示"
            badge="Legal"
        >
            <div className="space-y-12">
                    {/* 1. 事業者情報 */}
                    <section>
                        <h2 className="text-xl font-semibold mb-4 border-b border-white/10 pb-2 text-white">1. 事業者情報</h2>
                        <div className="bg-white/5 rounded-2xl shadow-sm border border-white/10 overflow-hidden">
                            <dl className="divide-y divide-white/10">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6 hover:bg-white/5 transition-colors">
                                    <dt className="font-semibold text-white">販売業者</dt>
                                    <dd className="sm:col-span-2 text-slate-300">
                                        谷口天眞
                                        <br />
                                        <span className="text-xs text-slate-500">※法人名（登記通り）または個人事業主の氏名（戸籍上の氏名）</span>
                                    </dd>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6 hover:bg-white/5 transition-colors">
                                    <dt className="font-semibold text-white">運営統括責任者</dt>
                                    <dd className="sm:col-span-2 text-slate-300">
                                        谷口天眞
                                    </dd>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6 hover:bg-white/5 transition-colors">
                                    <dt className="font-semibold text-white">所在地</dt>
                                    <dd className="sm:col-span-2 text-slate-300">
                                        〒2200072
                                        <br />
                                        神奈川県横浜市西区浅間町1丁目4番3号ウィザードビル402
                                        <br />
                                        <span className="text-xs text-slate-500">※番地・建物名・部屋番号まで正確に記載してください</span>
                                    </dd>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6 hover:bg-white/5 transition-colors">
                                    <dt className="font-semibold text-white">電話番号</dt>
                                    <dd className="sm:col-span-2 text-slate-300">
                                        09074929341
                                        <br />
                                        <span className="text-xs text-slate-500">※確実に連絡が取れる番号（コンビニ決済利用時は携帯不可）</span>
                                    </dd>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6 hover:bg-white/5 transition-colors">
                                    <dt className="font-semibold text-white">メールアドレス</dt>
                                    <dd className="sm:col-span-2 text-slate-300">
                                        reportlab@outlook.jp
                                    </dd>
                                </div>
                            </dl>
                        </div>
                    </section>

                    {/* 2. 金銭に関する事項 */}
                    <section>
                        <h2 className="text-xl font-semibold mb-4 border-b border-white/10 pb-2 text-white">2. 金銭に関する事項</h2>
                        <div className="bg-white/5 rounded-2xl shadow-sm border border-white/10 overflow-hidden">
                            <dl className="divide-y divide-white/10">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6 hover:bg-white/5 transition-colors">
                                    <dt className="font-semibold text-white">販売価格</dt>
                                    <dd className="sm:col-span-2 text-slate-300">
                                        各商品ページに記載（表示価格は消費税込み）
                                    </dd>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6 hover:bg-white/5 transition-colors">
                                    <dt className="font-semibold text-white">商品代金以外の必要料金</dt>
                                    <dd className="sm:col-span-2 text-slate-300">
                                        インターネット接続料金、通信料金等は、お客様のご負担となります。
                                    </dd>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6 hover:bg-white/5 transition-colors">
                                    <dt className="font-semibold text-white">お支払い方法</dt>
                                    <dd className="sm:col-span-2 text-slate-300">
                                        クレジットカード決済（Stripe）
                                    </dd>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6 hover:bg-white/5 transition-colors">
                                    <dt className="font-semibold text-white">お支払い時期</dt>
                                    <dd className="sm:col-span-2 text-slate-300">
                                        <ul className="list-disc list-inside space-y-1">
                                            <li>都度課金：購入時（即時決済）</li>
                                            <li>定期課金：初回購入時、翌月以降は毎月同日に請求</li>
                                        </ul>
                                    </dd>
                                </div>
                            </dl>
                        </div>
                    </section>

                    {/* 3. サービス提供・返品ルール */}
                    <section>
                        <h2 className="text-xl font-semibold mb-4 border-b border-white/10 pb-2 text-white">3. サービス提供・返品ルール</h2>
                        <div className="bg-white/5 rounded-2xl shadow-sm border border-white/10 overflow-hidden">
                            <dl className="divide-y divide-white/10">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6 hover:bg-white/5 transition-colors">
                                    <dt className="font-semibold text-white">商品の引渡時期</dt>
                                    <dd className="sm:col-span-2 text-slate-300">
                                        決済完了後、直ちにご利用いただけます。
                                    </dd>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6 hover:bg-white/5 transition-colors">
                                    <dt className="font-semibold text-white">返品・交換について</dt>
                                    <dd className="sm:col-span-2 text-slate-300">
                                        <div className="space-y-4">
                                            <div>
                                                <span className="font-medium text-white block mb-1">お客様都合の返品・キャンセル</span>
                                                デジタルコンテンツの性質上、決済完了後の返品・キャンセルは原則としてお受けできません。予めご了承ください。
                                            </div>
                                            <div>
                                                <span className="font-medium text-white block mb-1">不良品の対応</span>
                                                当社の責めに帰すべき事由により商品が利用できなかった場合は、速やかに対応いたします。お問い合わせフォームまたはメールにてご連絡ください。
                                            </div>
                                            <div>
                                                <span className="font-medium text-white block mb-1">解約について（定期課金）</span>
                                                設定画面よりいつでも解約可能です。次回更新日の前日までに解約手続きを行った場合、次回の請求は発生しません。解約後も、有効期限まではサービスをご利用いただけます。
                                            </div>
                                        </div>
                                    </dd>
                                </div>
                            </dl>
                        </div>
                    </section>

                    {/* 4. その他 */}
                    <section>
                        <h2 className="text-xl font-semibold mb-4 border-b border-white/10 pb-2 text-white">4. その他</h2>
                        <div className="bg-white/5 rounded-2xl shadow-sm border border-white/10 overflow-hidden">
                            <dl className="divide-y divide-white/10">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6 hover:bg-white/5 transition-colors">
                                    <dt className="font-semibold text-white">動作環境</dt>
                                    <dd className="sm:col-span-2 text-slate-300">
                                        推奨ブラウザ：Google Chrome, Safari, Firefox, Microsoft Edge の最新版
                                        <br />
                                        ※JavaScriptが有効な状態でご利用ください。
                                    </dd>
                                </div>
                            </dl>
                        </div>
                    </section>
            </div>
        </StandalonePageShell>
    )
}
