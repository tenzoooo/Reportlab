# Reportlab UI 現状監査（破壊的再設計のための棚卸し）

対象: `update_UI/`（Next.js App Router UI）

このドキュメントは「推測」ではなく、コード上に存在する実装・状態・文言・遷移のみを根拠に整理しています。  
完全な文字列・状態の機械抽出は以下の生成物を正とします（手作業の抜けを避けるため）:

- 文字列カタログ: `update_UI/docs/ui_audit/ui_text_catalog.json`
- 状態カタログ: `update_UI/docs/ui_audit/ui_state_catalog.json`

生成スクリプト:
- `update_UI/scripts/ui-audit/extract-ui-text.js`
- `update_UI/scripts/ui-audit/extract-ui-state.js`

---

## 0. UI構成（技術スタック / 接続先）

- フロント: Next.js App Router（`update_UI/app/`）
- 認証/DB/Storage: Supabase（`update_UI/lib/supabase/*`）
- 課金: Stripe（`update_UI/app/api/stripe/*` と `update_UI/lib/stripe/*`）
- レポート生成: Report Agent（FastAPI想定、`update_UI/lib/server/report-agent.ts` が HTTP 連携）
- ルート保護/リダイレクト: `update_UI/middleware.ts`

重要: `update_UI/next.config.mjs` は `NEXT_PUBLIC_BACKEND_URL` が設定されている場合、`/api/(?!stripe)` を外部バックエンドへ rewrite します。  
そのため「`/api/reports/...` が Next 側の `update_UI/app/api/reports/...` に到達するか」は環境変数で変わります（UIの挙動差の温床）。

---

## 1. 現行UI 画面構成の完全列挙（ルート / 主要画面コンポーネント）

### 1.1 ルート（ページ）一覧

出力形式: 画面ID / ファイルパス / 画面名 / 説明

| 画面ID | ファイルパス | 画面名 | 説明 |
|---|---|---|---|
| `/` | `update_UI/app/page.tsx` | LandingPage | マーケ/LP（機能紹介、料金、CTA）。framer-motion + 3Dコンポーネント（動的 import）。 |
| `/login` | `update_UI/app/(auth)/login/page.tsx` | LoginPage | Supabase `signInWithPassword`。成功時 `/dashboard/reports/new` に遷移。 |
| `/register` | `update_UI/app/(auth)/register/page.tsx` | RegisterPage | Supabase `signUp`。成功時「確認メール送信済み」画面に切替、再送UIあり。 |
| `/forgot-password` | `update_UI/app/(auth)/forgot-password/page.tsx` | ForgotPasswordPage | Supabase `resetPasswordForEmail` を実行し、案内文言表示。 |
| `/update-password` | `update_UI/app/(auth)/update-password/page.tsx` | UpdatePasswordPage | recovery link の `code` を `exchangeCodeForSession`。パスワード更新。 |
| `/dashboard` | `update_UI/app/dashboard/page.tsx` | DashboardPage | Supabase からレポート数/処理中/最近のレポートを集計して表示。 |
| `/dashboard/reports` | `update_UI/app/dashboard/reports/page.tsx` | ReportsPage | レポート一覧（検索/フィルタ/ページング/操作: 詳細/編集/再生成/DL/削除）。 |
| `/dashboard/reports/new` | `update_UI/app/dashboard/reports/new/page.tsx` | NewReportPage | 新規作成フロー（PDF/画像/表/貼り付け表、ドラッグ&ドロップ、Excel画像抽出、生成開始、進捗表示、再開）。 |
| `/dashboard/reports/[id]` | `update_UI/app/dashboard/reports/[id]/page.tsx` | ReportDetailPage | レポート詳細（ステータス、アップロードファイル一覧、DL、再生成、キャンセル）。処理中は polling。 |
| `/dashboard/reports/[id]/edit` | `update_UI/app/dashboard/reports/[id]/edit/page.tsx` | ReportEditorPage | analysis.json（TemplateContext）編集（実験名/図表キャプション/順序、保存、JSONから再生成、定量コメント(モック)、実験結果ストリーミング）。 |
| `/dashboard/profile` | `update_UI/app/dashboard/profile/page.tsx` | ProfilePage | プロフィール編集（Supabase profilesへ upsert）。統計表示（レポート数等）。一部ハードコードあり。 |
| `/dashboard/settings` | `update_UI/app/dashboard/settings/page.tsx` | SettingsPage | プロフィール/サブスク/通知/セキュリティ（Stripe checkout/portal/cancel/resume、credits購入）。 |
| `/dashboard/notifications` | `update_UI/app/dashboard/notifications/page.tsx` | NotificationsPage | 通知一覧（`/api/notifications`）。既読/削除はクライアント内のみ。 |
| `/dashboard/caption-generation` | `update_UI/app/dashboard/caption-generation/page.tsx` | CaptionGenerationPage | 「準備中」スタブ（再構築予定）。 |
| `/dashboard/template-playground` | `update_UI/app/dashboard/template-playground/page.tsx` | TemplatePlaygroundPage | テンプレ検証（UI存在、サイドバーリンクはコメントアウト）。 |
| `/help` | `update_UI/app/help/page.tsx` | HelpCenterPage | ヘルプセンター（FAQ抜粋/検索、メールサポート導線）。 |
| `/help/faq` | `update_UI/app/help/faq/page.tsx` | FAQPage | FAQ一覧（検索、カテゴリ絞り込み）。`/help/chat` へのリンクがあるがページ未実装。 |
| `/help/email` | `update_UI/app/help/email/page.tsx` | EmailSupportPage | 問い合わせ送信（Supabase `support_tickets` insert）。 |
| `/feedback` | `update_UI/app/feedback/page.tsx` | FeedbackPage | フィードバック送信（`/api/feedback`）。送信後は確認画面に切替。 |
| `/legal/terms` | `update_UI/app/legal/terms/page.tsx` | TermsPage | 利用規約（ページ内に静的文章）。 |
| `/legal/privacy-policy` | `update_UI/app/legal/privacy-policy/page.tsx` | PrivacyPage | プライバシーポリシー（ページ内に静的文章）。 |
| `/legal/commercial-disclosure` | `update_UI/app/legal/commercial-disclosure/page.tsx` | CommercialDisclosurePage | 特定商取引法表記（ページ内に静的文章）。 |

補足（レイアウト）:
- ルートレイアウト: `update_UI/app/layout.tsx`（Analytics挿入）
- ダッシュボードレイアウト: `update_UI/app/dashboard/layout.tsx`（Sidebar/Header/Notification/Search/UserMenu、Supabaseでユーザ/クレジット/ストレージ使用量取得）

補足（loading.tsx）:
- `update_UI/app/**/loading.tsx` は複数存在するが、すべて `return null`（スケルトン等なし）。

### 1.2 初期表示される画面はどれか（コード根拠）

- 初回アクセス（`/`）は LP 表示（`update_UI/app/page.tsx`）。
- `update_UI/middleware.ts` により:
  - `/dashboard/*` は未ログインなら `/login` にリダイレクト。
  - `/login` と `/register` はログイン済みなら `/dashboard` にリダイレクト。
- ログイン成功後の遷移先は `/dashboard/reports/new`（`update_UI/app/(auth)/login/page.tsx` の `router.push("/dashboard/reports/new")`）。

### 1.3 「画面級」コンポーネント（ルート外でUIを規定するもの）

| コンポーネントID | ファイルパス | 役割 |
|---|---|---|
| `DashboardLayout` | `update_UI/app/dashboard/layout.tsx` | 全ダッシュボード共通UI（サイドバー/ヘッダー/検索/通知/ユーザメニュー）。 |
| `NotificationPanel` | `update_UI/components/notification-panel.tsx` | ヘッダーの通知ドロップダウン（`/api/notifications`）。 |
| `NotificationsPage` | `update_UI/app/dashboard/notifications/page.tsx` | 通知一覧ページ（上と重複実装）。 |
| `SearchDialog` | `update_UI/components/search-dialog.tsx` | 検索ダイアログ（現状モックデータ）。 |
| `ReportProcessingSteps` | `update_UI/components/report-processing-steps.tsx` | 進捗UI（ダイアログ）。New/Detailの処理表示で使用。 |
| `ExperimentalResultsStreamCard` | `update_UI/components/experimental-results-stream.tsx` | SSEによるストリーミング生成UI（編集画面で使用）。 |

---

## 2. UI状態（State）の完全洗い出し

「完全」は `update_UI/docs/ui_audit/ui_state_catalog.json`（useState/useRef/localStorage の AST 抽出）を正とします。  
※ framer-motion の `useMotionValue` / `useScroll` のような “React state ではない状態” はこのカタログには含まれません（例: `update_UI/app/page.tsx`）。  
ここでは再設計に効く“画面遷移・非同期・生成フロー”に関係する状態を、型と使用画面を中心に再掲します。

### 2.1 ルート/画面に直接ぶら下がる状態（主要）

#### `/dashboard/reports/new`（新規作成）

ファイル: `update_UI/app/dashboard/reports/new/page.tsx`

- `experimentPdf`: `File | null`（入力PDF）
- `reportTitle`: `string`（レポートタイトル）
- `figureImages`: `File[]`（画像ファイル群）
- `tableFiles`: `File[]`（表ファイル群: csv/json/xlsx/xlsm）
- `pastedTables`: `{ id: string; rows: string[][] }[]`（貼り付けテーブル）
- `excelImagePreviews`: `ExcelImagePreview[]`（xlsx内画像のプレビューURL群）
- `excelZipMetaBySourceKey`: `Record<string, ExcelZipMeta>`（xlsx解析結果）
- `excelSheetNamesBySourceKey`: `Record<string, string[]>`（シート名候補）
- `excelSelectedSheetBySourceKey`: `Record<string, string>`（選択シート）
- `excelExtracting`: `Record<string, boolean>`（xlsxプレビュー抽出中フラグ）
- `excelExtractErrors`: `Record<string, string>`（xlsx抽出エラー）
- `existingPdf`: `{ name: string; path: string } | null`（既存ドラフトのPDF参照）
- `existingImages`: `{ name: string }[]`（既存ドラフトの画像一覧）
- `existingTables`: `{ name: string }[]`（既存ドラフトの表一覧）
- `isDragging`: `boolean`（PDF/全体領域 drag state）
- `isImageDragging`: `boolean`（画像領域 drag state）
- `isUploading`: `boolean`（アップロード/登録中）
- `progress`: `number`（進捗バー（時間ベース））
- `currentStep`: `number`（処理ステップindex（時間ベース））
- `isProcessing`: `boolean`（処理中UI表示フラグ）
- `processingDialogOpen`: `boolean`（進捗ダイアログ開閉）
- `error`: `string`（エラー表示）
- `processingStart`: `number | null`（開始時刻ms。localStorage復元あり）
- `processingReportId`: `string | null`（対象reportId。localStorage復元あり）
- `processingDestination`: `"edit"`（遷移先固定）
- `agentProgress`: `any | null`（agent progress JSON）
- `agentProgressError`: `string`（agent progress pollingエラー）
- `showAgentDetails`: `boolean`（進捗詳細の展開）
- `imagePreviews`: `string[]`（ローカル画像 preview URL）
- `subscriptionPlan`: `string | null`（profiles.plan から決定: premium/standard/free）

永続状態（localStorage）:
- `PROCESSING_STORAGE_KEY = "reportlab:processing-state"`  
  保存内容: `{ reportId: string; startedAt: number; destination: "edit" }`（`persistProcessingState`/`restoreProcessingState`）

#### `/dashboard/reports/[id]`（詳細）

ファイル: `update_UI/app/dashboard/reports/[id]/page.tsx`

- `status`: `"draft" | "processing" | "completed" | "error"`
- `title`: `string`
- `createdAt`: `string`
- `files`: `{ name: string; type: "excel" | "image" | "code" | "word"; uploaded_at?: string }[]`
- `isRegenerating`: `boolean`
- `progress`: `number`（処理中の疑似progress。3秒ごとに+3、上限95）
- `error`: `string`
- `fileUrl`: `string | null`（完成docxのstorage path）
- `mounted`: `boolean`（Hydration mismatch対策）
- `processingOverlayOpen`: `boolean`（進捗オーバーレイ）
- `processingSteps`: `ProcessingStep[]`（オーバーレイ表示用。agentStepsがある場合はそちら優先）
- `agentProgress`: `AgentProgress | null`（進捗polling）
- `agentProgressError`: `string`
- `showAgentDetails`: `boolean`
- `abortControllerRef`: `AbortController | null`（再生成/キャンセル用）

#### `/dashboard/reports/[id]/edit`（編集）

ファイル: `update_UI/app/dashboard/reports/[id]/edit/page.tsx`

- `loading`: `boolean`
- `saving`: `boolean`
- `generating`: `boolean`
- `analysis`: `AnalysisData | null`（analysis.jsonの `result_json` 相当）
- `images`: `ImageFile[]`（署名URL付き）
- `orderedImages`: `ImageFile[]`（並び替え結果）
- `quantLoading`: `Record<number, boolean>`（実験index→定量コメント生成中）

#### `/dashboard/settings`（設定）

ファイル: `update_UI/app/dashboard/settings/page.tsx`

- `activeTab`: `string`（`tab` クエリ）
- `showCancelDialog`: `boolean`
- `isCancelling`: `boolean`
- `isResuming`: `boolean`
- `loading`: `boolean`
- `profile`: `{ name: string; email: string; university: string; department: string; credits: number; plan: string }`
- `subscription`: `any | null`
- `isProcessing`: `boolean`（保存/決済/ポータル/購入など共通ロック）
- `creditQuantity`: `number`（クレジット購入数量）

#### `/dashboard/notifications`（通知一覧）

ファイル: `update_UI/app/dashboard/notifications/page.tsx`

- `filter`: `"all" | "unread" | "read"`
- `notifications`: `NotificationItem[]`
- `isLoading`: `boolean`
- `error`: `string | null`

#### `/help`, `/help/faq`, `/help/email`, `/feedback`

ファイル:
- `update_UI/app/help/page.tsx`: `searchQuery: string`, `expandedFAQ: string | null`
- `update_UI/app/help/faq/page.tsx`: `searchQuery: string`, `expandedFAQ: string | null`, `selectedCategory: string | null`
- `update_UI/app/help/email/page.tsx`: `formData: {name,email,subject,message}`, `isSubmitted: boolean`, `isSubmitting: boolean`
- `update_UI/app/feedback/page.tsx`: `rating: number`, `hoveredRating: number`, `submitted: boolean`, `formData: {...}`, `isSubmitting: boolean`, `errorMessage: string|null`, `submittedData: SubmittedFeedback|null`

### 2.2 画面横断の UI状態（主要コンポーネント）

- 通知パネル（ヘッダー）: `update_UI/components/notification-panel.tsx`
  - `isOpen: boolean`, `notifications: NotificationItem[]`, `isLoading: boolean`, `error: string|null`
  - 既読操作はローカルstate更新のみ（サーバへ write なし）

- 検索ダイアログ（ヘッダー）: `update_UI/components/search-dialog.tsx`
  - `isOpen: boolean`, `searchQuery: string`, `results: SearchResult[]`
  - データは `mockResults` 固定（サーバ検索は未実装）

- 実験結果ストリーミング: `update_UI/components/experimental-results-stream.tsx`
  - `isStreaming: boolean`, `rawLiveText: string`, `final: FinalPayload|null`, `ttftMs: number|null`, `chars: number`, `model: string`, `lastUpdateMs: number`
  - `AbortController` を `useRef` で保持

### 2.3 UIが依存している「外部状態」（Stateだが useState ではない）

- URL状態:
  - `/dashboard/settings?tab=...&success=...&canceled=...`（`useSearchParams`）
  - `/dashboard/reports/new?reportId=...`（ドラフト再開）
  - `/dashboard/reports/[id]`, `/dashboard/reports/[id]/edit`（`useParams`）
- Supabase auth/session:
  - 多くのページが `supabase.auth.getSession()`/`getUser()` を前提に分岐
- Storage/DB 状態:
  - `reports.status`（processing/completed/draft/error）
  - `reports.file_url`（docxのstorage path）
  - `experiment_data`（file_type, file_url, uploaded_at）
  - `profiles.plan/credits` 等

---

## 3. 状態遷移（State Transition）の明文化

ここでは “UIの見た目が変わる” 重要遷移のみを列挙します（全網羅は `ui_state_catalog.json` + 各ページの `onClick`/`useEffect` が根拠）。

### 3.1 認証

| Before State | Trigger | After State | UI上の変化 |
|---|---|---|---|
| `loading=false`, `error=""` | ログインフォーム submit | `loading=true`, `error=""` | ボタン文言が「ログイン中...」、disabled |
| `loading=true` | 入力不足（email/password空） | `error="メールアドレスとパスワードを入力してください"`, `loading=false` | エラー枠表示 |
| `loading=true` | Supabase signIn成功 | `loading=false` + `router.push("/dashboard/reports/new")` | 画面遷移 |
| Register: `emailSent=false` | signUp成功 | `emailSent=true` | 「確認メール送信」画面に切替（同一ページ内） |
| Forgot: `message=""` | resetPasswordForEmail成功 | `message="パスワード再設定用のメールを送信しました..."` | 成功メッセージ表示 |
| UpdatePassword: `code` あり | `exchangeCodeForSession` 成功 | （state変化なし） | エラーが出ない＝以降 updateUser 可能 |
| UpdatePassword: submit | updateUser成功 | `message="パスワードを更新しました..."` → 1.2s後 `/login` | 成功メッセージ→遷移 |

### 3.2 新規レポート作成（/dashboard/reports/new）

| Before State | Trigger | After State | UI上の変化 |
|---|---|---|---|
| `isUploading=false` | 「作成/開始」系 submit（`handleSubmit`） | `isUploading=true`, `error=""` | 入力UIがロックされ、処理中表示（実装依存） |
| PDF/表/画像が選択済み | Supabase storage upload + DB insert 完了 | `existingPdf/images/tables` 更新 or そのまま | ドラフト/既存表示が更新 |
| アップロード完了 | `fetch(${baseUrl}/api/reports/prepare)` 成功 | `processingReportId=reportId`, `processingStart=Date.now()`, `isProcessing=true`, `progress=0`, `currentStep=0` | 進捗UI（`ReportProcessingSteps` + スピナー）表示へ切替 |
| `isProcessing=true` | 2秒ごとの polling で progress.json取得 | `agentProgress` 更新 | 「最終ステップ/更新時刻/抽出候補」等の詳細が変化 |
| `isProcessing=true` | `startedAt` からの経過が `PROCESSING_TOTAL_DURATION` 超過 | `clearProcessingState()` + `router.push(/dashboard/reports/${id}/edit)` | 自動で編集画面へ遷移（※時間ベース） |
| `isProcessing=true` | キャンセル（confirm→`stopProcessing()`） | `isProcessing=false`, `processingDialogOpen=false`, `processingReportId=null`, `progress=0`... | 進捗UIが閉じる（サーバ cancel は best-effort） |
| 任意 | リロード | `restoreProcessingState()` が成功すれば復元 | 進捗UIが再表示され、処理継続前提のUIに戻る |

### 3.3 レポート一覧（/dashboard/reports）

| Before State | Trigger | After State | UI上の変化 |
|---|---|---|---|
| `activeFilter` 変更前 | タブクリック | `activeFilter` 更新 | `useEffect` により再 fetch、一覧が更新 |
| `searchQuery` 変更前 | 検索入力 | `searchQuery` 更新 | `useEffect` により再 fetch |
| `currentPage` | 前へ/次へ/番号 | `currentPage` 更新 | `useEffect` により再 fetch |
| report.status=`completed` | 「ダウンロード」 | （state変化なし） | `window.location.href` に署名URLを設定しDL開始 |
| 任意 | 「削除」confirm OK | （内部で fetch→`fetchReports()`） | 一覧から削除される |
| report.status!=`draft` | 「再生成」 | `regeneratingId=id`→null, `reports[].status="processing"` | スピナー表示、アラート表示、一覧更新 |
| report.status=`draft` | 「下書きを再開」 | URL遷移 `/dashboard/reports/new?reportId=...` | NewReport がドラフト読み込み |

### 3.4 レポート詳細（/dashboard/reports/[id]）

| Before State | Trigger | After State | UI上の変化 |
|---|---|---|---|
| 初期 | `useEffect(load)` | `title/status/files/fileUrl` 設定 | 詳細カードが埋まる |
| `status="processing"` | 3秒ごとの interval | `progress` が最大95まで増加、`load()`再実行 | 疑似progressが進む／status更新を拾う |
| `status="processing"` | agent-progress取得成功 | `agentProgress` 更新 | 進捗ステップ表示が agent ベースに切替/更新 |
| 任意 | 「JSONから再生成」 | `isRegenerating=true`, `processingOverlayOpen=true`, `fileUrl=null` | 進捗オーバーレイ表示、完了/失敗でアラート |
| 任意 | 「AIで再生成」confirm OK | 同上 + `status="processing"` | 同上 |
| 処理中 | 「停止」 | AbortController abort + `/api/reports/cancel` | オーバーレイ閉、`status="draft"`、アラート |

### 3.5 編集（/dashboard/reports/[id]/edit）

| Before State | Trigger | After State | UI上の変化 |
|---|---|---|---|
| `loading=true` | `/api/reports/${id}/analysis` 取得成功 | `analysis` 設定, `images` 設定, `loading=false` | 編集UI表示 |
| `orderedImages` | 画像並び替え | `analysis.image_order` は未更新（保存時に反映） | UI上の順序が変わる |
| `saving=false` | 「保存」 | `saving=true`→false | toast: 成功「保存しました」/失敗「保存に失敗しました」 |
| 保存成功 | 「生成」 | `generating=true`→（成功時遷移） | `/api/reports/regenerate/from-json` 実行、成功で詳細へ遷移 |
| `quantLoading[exp]=false` | 「定量的コメント生成」 | `quantLoading[exp]=true`→false, `analysis`更新 | toast: 成功/失敗。サーバ側はモック文言を保存 |
| `isStreaming=false` | 実験結果「生成する」 | `isStreaming=true` | SSEでテキストが増える、停止ボタン出現 |

### 3.6 通知/検索/ヘルプ（小粒だが画面遷移に効くもの）

| Before State | Trigger | After State | UI上の変化 |
|---|---|---|---|
| `NotificationPanel.isOpen=false` | ベル押下 | `isOpen=true` | 通知パネル表示（Backdropが `bg-white` で全画面白塗り） |
| `NotificationPanel.isOpen=true` | Backdrop click / X | `isOpen=false` | パネル閉 |
| `NotificationsPage.filter="all"` | フィルタボタン | `filter="unread"|"read"` | 一覧の表示がローカルフィルタで変わる |
| `SearchDialog.isOpen=false` | 検索ボタン | `isOpen=true` | 検索モーダル表示 |
| `SearchDialog.searchQuery=""` | 入力 | `searchQuery` 更新 | `results` が `mockResults` からフィルタされる |
| `Help.searchQuery` | 入力 | `searchQuery` 更新 | FAQの絞り込み |
| `Help.expandedFAQ=null` | FAQクリック | `expandedFAQ=<id>` | 該当FAQの回答が展開 |
| `FAQ.selectedCategory=null` | カテゴリクリック | `selectedCategory=<category>|null` | FAQカテゴリ絞り込み |

### 3.7 プロフィール（/dashboard/profile）

| Before State | Trigger | After State | UI上の変化 |
|---|---|---|---|
| `loading=true` | 初期 fetch 完了 | `loading=false`, `userData/stats/recentActivity` 設定 | プロフィール表示に切替 |
| `isEditing=false` | 「編集」押下 | `isEditing=true` | 入力欄が編集可能になる |
| `isEditing=true` | 「保存」押下 | `isEditing=false`（成功時） | Supabase `profiles.upsert` 実行、表示に戻る |

### 3.8 設定（/dashboard/settings）

| Before State | Trigger | After State | UI上の変化 |
|---|---|---|---|
| `loading=true` | 初期 `loadData()` 完了 | `loading=false`, `profile/subscription` 設定 | タブUIが表示される（ローディングスピナー解除） |
| 任意 | `?success=...` / `?canceled=...` で入場 | `toast.*` + `router.replace("/dashboard/settings?tab=subscription")` | トースト表示後、URLをsubscriptionタブへ置換 |
| `isProcessing=false` | プロフィール保存 | `isProcessing=true`→false | toast: 成功「プロフィールを保存しました」/失敗「プロフィールの保存に失敗しました」 |
| `isProcessing=false` | サブスク/クレジット購入ボタン | `isProcessing=true` | Stripe checkout URL に遷移（`window.location.href = data.url`） |
| 任意 | portal/cancel/resume | `isProcessing/isCancelling/isResuming` 更新 | 成功時 `window.location.reload()`（状態再取得をリロードに依存） |

---

## 4. 表示文言・UI表記の抽出

完全抽出（機械生成）: `update_UI/docs/ui_audit/ui_text_catalog.json`  
- `items[].source` は `JSXText/JSXAttr/ObjectProp/Toast/BrowserDialog` のいずれか  
- “UIとして見える可能性が高い文字列” を **過不足よりも抜けの少なさ** 優先で抽出しています（完全一致＝ユーザー可視とは限らない点は仕様）
  - 例: 法務ページ（利用規約/プライバシー/特商法）は本文が JSX に直書きのため、カタログに大量に含まれます（＝現状は i18n/文言管理の分離が無い）。

ここでは再設計で重要な「ローディング/エラー/完了」系の代表例のみ、表示条件と関連stateを明記します。

| 表示文言 | 表示条件 | 管理されている変数 |
|---|---|---|
| `ログイン中...` | Login submit中 | `loading`（login） |
| `メールアドレスとパスワードを入力してください` | Login入力不足 | `error`（login） |
| `確認メールを送信しました` | Register成功後 | `emailSent`（register） |
| `確認メールを再送しました...` / `メールの再送に失敗しました` | 再送結果 | `resendSuccess`/`resendError` |
| `送信中...` / `お問い合わせを送信しました` | EmailSupport送信中/成功 | `isSubmitting` + toast |
| `フィードバックの送信に失敗しました...` | Feedback API失敗 | `errorMessage`（feedback） |
| `AIがレポートを作成中です` / `AIが処理中です` | NewReportの進捗ダイアログ | `agentProgress`（new report） |
| `進捗取得エラー: ...` | agent-progress polling失敗 | `agentProgressError` |
| `レポートの再生成を開始しました...` | 一覧の再生成成功 | `alert(...)` |
| `AIで再生成しますか？（クレジットを消費する可能性があります）` | 詳細のAI再生成 confirm | `confirm(...)` |
| `分析JSONが見つかりません。先に抽出を実行してください。` | SSE開始前のanalysis未存在（API側） | （APIレスポンス） |

---

## 5. UIの構造的な問題点（容赦なく / コード根拠）

### 5.1 状態とUIが密結合している箇所

- NewReport が「アップロード」「Excel解析」「進捗UI」「ドラフト復元」「購読制限」「表貼り付け」まで単一ファイルで抱え、状態が多すぎる  
  - `update_UI/app/dashboard/reports/new/page.tsx`
- 通知が「ヘッダーパネル」と「一覧ページ」で二重実装され、read/delete がサーバに永続しない  
  - `update_UI/components/notification-panel.tsx`
  - `update_UI/app/dashboard/notifications/page.tsx`
- 設定ページが「Stripe遷移後クエリ処理」「プロファイル編集」「サブスク/クレジット購入」「通知/セキュリティUI」まで1画面内タブで密結合  
  - `update_UI/app/dashboard/settings/page.tsx`

### 5.2 「処理が進んでいるのに画面が変わらない」原因（コード上の具体）

1) NewReport の「処理中UI」は `prepare` API が返ってきてから開始する  
   - `handleSubmit` はアップロード→`fetch(${baseUrl}/api/reports/prepare)` を **await** → 成功後に `isProcessing=true`  
   - つまり `prepare` が重い環境では、ユーザー視点で「何も起きない/進捗が出ない」時間が発生する  
   - 根拠: `update_UI/app/dashboard/reports/new/page.tsx`

2) NewReport の完了遷移が “実処理完了” ではなく “経過時間” で発火する  
   - `PROCESSING_TOTAL_DURATION` 到達で `router.push(/edit)`（agent進捗/完了条件とは無関係）  
   - 根拠: `update_UI/app/dashboard/reports/new/page.tsx`（`tick` の `elapsed >= PROCESSING_TOTAL_DURATION`）

3) キャンセルが「本当の停止」ではなく、基本的に `reports.status` を `draft` に戻すだけ  
   - UIは「止まった」ように見えるが、バックエンド側のジョブ停止を保証していない  
   - 根拠: `update_UI/app/api/reports/cancel/route.ts` と各画面の cancel 呼び出し

### 5.3 UIが「1画面前提」になっている設計の痕跡

- `window.location.href = ...` を多用（ルータ/状態復元より「リロード/遷移」に依存）  
  - 例: DL、未ログイン時の `/login` 遷移、Stripe遷移など  
  - 根拠: `update_UI/app/dashboard/reports/page.tsx`, `update_UI/app/dashboard/reports/[id]/page.tsx` ほか
- Hydration mismatch 回避のために `mounted` を使って条件レンダリング（＝UIの正しさが実行タイミング依存）  
  - 根拠: `update_UI/app/dashboard/layout.tsx`, `update_UI/app/dashboard/reports/page.tsx`, `update_UI/app/dashboard/reports/[id]/page.tsx`

### 5.4 Chat UI / ストリーミングUIに移行しづらい理由（現状の壁）

- 主要な生成（prepare/generate）が「HTTPリクエスト完了まで待つ」同期API呼び出しに見える（UI側が await している）  
  - 根拠: `update_UI/app/dashboard/reports/new/page.tsx`, `update_UI/app/dashboard/reports/[id]/page.tsx`
- 進捗は `progress.json` を polling する設計で、イベントストリーム（SSE/WS）に統一されていない  
  - SSEは “実験結果” のみ別枠で存在: `update_UI/components/experimental-results-stream.tsx`
- 生成結果が「docx」という最終成果物中心で、途中成果（抽出/候補/修正）をメッセージ単位に分割するインターフェイスが薄い  
  - editor は analysis.json を直接編集する形で、会話ログ/イベントログに落ちていない

### 5.5 「UIが固まる理由」（技術的説明 / 根拠）

UIフリーズ（ブラウザが重くなる/操作を受け付けない）の主要因になり得る実装が NewReport にあります:

- Excel(.xlsx/.xlsm) の ZIP 展開と画像抽出を **ブラウザのメインスレッド** で実行している  
  - `pizzip` を動的import→`new PizZip(new Uint8Array(arrayBuffer))`→エントリ列挙→バイナリ変換（forループ）  
  - 画像が多い/サイズが大きいと、JSの同期処理が長時間走りレンダリング/入力が詰まる  
  - 根拠: `update_UI/app/dashboard/reports/new/page.tsx`（`extractExcelImagePreviews`）

- `setTimeout(tick, 100)` による 100ms 間隔の state 更新（`progress/currentStep`）が継続し、再レンダリング負荷を増やす  
  - 根拠: `update_UI/app/dashboard/reports/new/page.tsx`（`tick`）

加えて “固まったように見える” UX を誘発しやすい要素:
- NotificationPanel の Backdrop が `bg-white`（半透明ではなく完全白）で、パネルを閉じるまで画面が “白く覆われる”  
  - 根拠: `update_UI/components/notification-panel.tsx`
- `next.config.mjs` が `typescript.ignoreBuildErrors: true` のため、型エラーが潜んでもビルドが通る（＝実行時まで問題が露出しない）  
  - 根拠: `update_UI/next.config.mjs`

---

## 6. 再設計前提での要約

### 6.1 捨てるべき前提（現状コードが暗黙に置いているもの）

- 「生成進捗は時間で十分」前提（実ジョブ状態と無関係に `/edit` 遷移する）
- 「キャンセル＝停止」前提（実際は status 書き換え中心）
- 「画面単位で完結したローカルstateでよい」前提（NewReport/Settings等で肥大化）
- 「/api が常に同一のサーバに到達する」前提（環境変数で rewrite され得る）

### 6.2 状態管理で最優先に分離すべき責務

1) Auth/Session（Supabase）: “ログインしているか/トークン/ユーザーID”  
2) Report Domain: `reportId`, `reports.status`, `file_url`, `experiment_data` の同期と購読制約  
3) Upload Pipeline: 入力ファイル群、検証、アップロード、DB登録、リトライ/部分成功  
4) Job Lifecycle: prepare/generate/regenerate/cancel の状態（queued/running/succeeded/failed/canceled）と進捗イベント  
5) View State: ダイアログ開閉、検索クエリ、タブなど純UI状態

### 6.3 Chat型UIに移行する際の最小単位（イベント / メッセージ）

現状の実装（progress.json polling、analysis.json編集）を “会話/イベント” に落とすなら、最低限この粒度が必要です:

- User events:
  - `UPLOAD_PDF`, `UPLOAD_IMAGES`, `UPLOAD_TABLES`, `PASTE_TABLE`
  - `START_PREPARE(reportId)`, `START_GENERATE(reportId, mode=ai|json)`, `CANCEL_JOB(reportId)`
  - `APPLY_EDIT(reportId, patch)`（analysis.jsonの差分パッチ）
- Agent events:
  - `JOB_STARTED(jobId)`, `STEP_STARTED(step)`, `STEP_DONE(step)`, `STEP_ERROR(step, error)`
  - `EXTRACTED_METHOD_TREE(items)`, `EXTRACTED_PROMPTS(items)`, `ASSET_ASSIGNED(mapping)`
  - `ARTIFACT_READY(file_url)`
- System messages:
  - `AUTH_REQUIRED`, `PLAN_LIMIT_REACHED`, `STORAGE_LIMIT_REACHED`, `NETWORK_ERROR`

（現状の “SSE実験結果” はこのイベント体系の一部として統合しやすいが、prepare/generate も同等のイベント設計が必要。）
