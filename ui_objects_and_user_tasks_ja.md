# UI反映オブジェクト / ユーザータスク一覧（静的解析）

対象: `update_UI/`（Next.js UI）  
方法: `update_UI/app/**/page.tsx` と `update_UI/components/**` を静的走査し、UIで扱うデータ（=オブジェクト）と、ユーザーがUI上で実行できる操作（=タスク）を整理。

> 注意: 実行時の feature flag / A/B / 未リンク導線の存在は静的解析だけでは完全には保証できません。ここでは「コード上に存在し、UIに反映されていることが確認できたもの」を列挙します。

---

## 1) UIに反映されているオブジェクト（データ）

### 認証 / セッション
- `user` / `session`
  - 例: `email`, `id`, `access_token`, `created_at`
  - 主な利用箇所: ログイン・登録・ログアウト、API呼び出しの `Authorization: Bearer ...`
- パスワード再設定フローの `code`（クエリパラメータ）

### プロフィール / アカウント情報（Supabase）
- `profiles`
  - UIで参照/表示: `credits`, `plan`
  - UIで編集/保存: `full_name`, `university`, `department`, `grade`（UI上は「学籍番号」の入力にマッピング）
  - ストレージ使用量の表示に `get_storage_usage` RPC を利用（バイト値をMB表示）

### レポート（Supabase）
- `reports`
  - UIで参照/表示: `id`, `title`, `status`, `created_at`, `updated_at`, `file_url`
  - `status` は UI 上で `draft | processing | completed | error` として扱われる

### 実験データ / 添付ファイル（Supabase + Storage）
- `experiment_data`
  - UIで参照/表示: `file_name`, `file_type`, `file_url`, `uploaded_at`, `report_id`
  - UIでの用途:
    - レポート作成時のアップロード対象（PDF/画像/表など）
    - レポート詳細での「添付一覧」表示
    - レポート削除時の関連ファイル削除（ベストエフォート）
- ストレージバケット: `experiment-files`
  - UIでの用途:
    - アップロード
    - 削除（レポート削除時）
    - ダウンロードURL発行（`file_url` から `getFileUrl` 経由）

### レポート生成の進捗（バックエンド連携）
- `AgentProgress`（UI内型）
  - 例: `last_step`, `snapshots`, `stats`（pdf_pages/images_count/tables_count 等）, `previews`
  - UIでの用途:
    - 生成中のステップ表示
    - 詳細の開閉（進捗やプレビューの表示）

### 編集対象のAI結果（analysis）
- `analysis.ai_response` 相当（APIで取得/保存）
  - 例: `experiments[]`, `figures[]`, `tables[]`, `image_order`, `quant_comment` など
  - UIでの用途:
    - `edit` 画面での編集・保存
    - JSONから再生成（編集内容を反映してDOCX再生成）

### 通知
- `NotificationItem`（UI内型）
  - `id`, `category`, `title`, `message`, `time`, `link?`, `read`
  - `category`: `report | processing | storage | upload | announcement`
  - 取得: `/api/notifications`
  - UI内での既読/削除は主にローカル状態反映（永続化はコード上で必須ではない）

### 課金 / サブスク / クレジット
- `subscriptions`
  - UIで参照/表示: `status`, `cancel_at_period_end` など
  - UIタスク: Stripeチェックアウト開始、ポータル表示、解約/再開
- クレジット購入
  - UI入力: 購入セット数（`quantity`）
  - 決済開始: `/api/stripe/create-checkout-session`
- 価格ID（環境変数）
  - `NEXT_PUBLIC_STRIPE_PRICE_ID_STANDARD`, `NEXT_PUBLIC_STRIPE_PRICE_ID_PREMIUM`（UIで参照）

### フィードバック / サポート
- フィードバック送信ペイロード（UI内型）
  - `name`, `email`, `status(カテゴリ)`, `feedback(要件)`, `rating`
  - 送信: `/api/feedback`
- サポートチケット（Supabase）
  - `support_tickets`: `name`, `email`, `subject`, `message`, `user_id?`

### 検索（ヘッダー）
- `SearchResult`（UI内型）
  - 現状はモック配列をフィルタして表示（DB検索実装ではない）

---

## 2) ユーザータスク一覧（画面/ルート別）

### `/`（ランディング）
- 機能/使い方/料金の閲覧
- `ログイン`（`/login`）へ遷移
- `無料で始める`（`/register`）へ遷移

### `/login`
- メール+パスワードでログイン
- パスワード再設定（`/forgot-password`）へ遷移
- 新規登録（`/register`）へ遷移

### `/register`
- アカウント新規登録（確認メール送信）
- 確認メール再送
- ログインへ遷移

### `/forgot-password`
- パスワード再設定メールの送信

### `/update-password`
- 再設定リンクの `code` をセッションへ交換（復元）
- 新パスワード設定→ログインへ

### `/dashboard`（概要）
- 自分のレポート統計の閲覧（総数/今月/処理中）
- 最近のレポート一覧の閲覧→詳細へ遷移
- レポート一覧へ遷移

### ダッシュボード共通（`/dashboard/*` のレイアウト）
- サイドバーでページ遷移（ダッシュボード/レポート一覧/新規作成/設定 等）
- ストレージ使用量の確認
- クレジット残数の確認
- `Premiumへ`（設定のサブスクタブ）へ遷移
- フィードバック送信（`/feedback`）へ遷移
- 通知パネルで通知閲覧、通知一覧ページへ遷移（`/dashboard/notifications`）
- 検索ダイアログ（現状モック）で一覧へ遷移
- ログアウト

### `/dashboard/reports`（レポート一覧）
- レポート一覧の取得/表示
- 検索（タイトル）
- 絞り込み（すべて/完了/処理中）
- ページング
- 詳細を見る（`/dashboard/reports/[id]`）
- 編集（`/dashboard/reports/[id]/edit`）
- 下書き再開（`/dashboard/reports/new?reportId=...`）
- 再生成（キャッシュからの再生成リクエスト）
- DOCXダウンロード（完了時）
- 削除（関連ファイル削除をベストエフォートで実施）

### `/dashboard/reports/new`（新規作成 / 下書き再開）
- 実験書PDFの追加（必須）
- 追加ファイル（任意）
  - 画像（図）追加
  - 表ファイル追加（CSV/JSON/XLSX）
  - Excelのシート指定（表抽出対象）
  - Excel内の埋め込み画像プレビュー抽出（UIで確認）
- 表の貼り付け（任意・有料プラン制限UIあり）
- 画像の並べ替え（上/下）、削除
- 追加した表ファイルの削除、貼り付け表の削除
- タイトル入力
- `レポートを作成`（アップロード→生成開始）
- 生成中の進捗確認（ダイアログ/詳細）、キャンセル/強制停止
- 生成状態の復元（localStorage）と再開

### `/dashboard/reports/[id]`（レポート詳細）
- レポートの状態/タイトル/作成日/添付ファイル一覧の閲覧
- 生成中の進捗閲覧（エージェント詳細の開閉）
- 処理キャンセル
- AIで再生成
- JSONから再生成
- 詳細編集へ遷移
- DOCXダウンロード
- 削除

### `/dashboard/reports/[id]/edit`（レポート編集）
- AI結果（analysis）の取得/表示
- 編集（実験名/図キャプション/表キャプション）
- 図と画像割当の並べ替え（Reorder）
- 定量的コメント生成（実験単位）
- 保存
- 保存して生成（JSON→再生成）→詳細へ戻る
- 実験結果ストリーム生成の開始/停止（SSE）+ 結果の保存（ベストエフォート）

### `/dashboard/settings`
- プロフィール更新（名前/大学/学部）
- サブスク:
  - プラン確認（Free/Standard/Premium）
  - サブスク開始（Standard/Premium）
  - クレジット追加購入（数量指定→Stripe）
  - カスタマーポータル表示
  - 解約/解約取消
- 通知設定トグル（UI）
- セキュリティ（アカウント削除ボタンの導線）

### `/dashboard/profile`
- アカウント情報と利用統計の閲覧
- プロフィール編集/保存（名前/大学/学部/学籍番号 等）
- 最近のアクティビティ閲覧（直近レポート作成）

### `/dashboard/notifications`
- 通知一覧の取得/表示
- フィルタ（未読/既読/すべて）
- 既読化（単体/全件）
- 削除（UI上）
- 通知リンクから詳細へ遷移（ある場合）

### `/feedback`
- フィードバック送信（カテゴリ/満足度/要件）

### `/help`, `/help/email`, `/help/faq`
- FAQ検索/カテゴリ絞り込み/開閉
- メールサポート（チケット送信）

### `/legal/*`
- 規約/プライバシーポリシー/特商法の閲覧

### その他（存在はするが機能が限定/導線が非表示のもの）
- `/dashboard/caption-generation`: 準備中（説明表示のみ）
- `/dashboard/template-playground`: テンプレ検証ページ（サイドバー導線はコメントアウトだがURLは存在）

---

## 3) 再生成用コマンド（この一覧を更新するための手がかり）

- 画面一覧: `find update_UI/app -type f -name 'page.tsx' | sort`
- UIが触るテーブル推定: `rg -n "\\.from\\(\"" update_UI/app update_UI/components update_UI/lib -S`
- UIが叩くAPI推定: `rg -n "fetch\\(\"/api/" update_UI/app update_UI/components -S`

