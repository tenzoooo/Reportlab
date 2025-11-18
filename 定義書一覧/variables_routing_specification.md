# 実験レポート自動化ツール 変数・環境変数・ルーティング定義書

## 1. 環境変数

### 1.1. 必須環境変数

以下の環境変数は、アプリケーションの動作に必須です。`.env.local`ファイルに設定してください。

#### Supabase関連

| 変数名 | 説明 | 取得方法 | 使用箇所 |
|:---|:---|:---|:---|
| `NEXT_PUBLIC_SUPABASE_URL` | SupabaseプロジェクトのURL | Supabase Dashboard > Settings > API | クライアント、サーバー |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase匿名キー(公開可能) | Supabase Dashboard > Settings > API | クライアント、サーバー |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabaseサービスロールキー(秘密) | Supabase Dashboard > Settings > API | サーバーのみ(RLS回避) |

**使用例**:
```typescript
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

#### Stripe関連

| 変数名 | 説明 | 取得方法 | 使用箇所 |
|:---|:---|:---|:---|
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe公開可能キー | Stripe Dashboard > Developers > API keys | クライアント |
| `STRIPE_SECRET_KEY` | Stripeシークレットキー(秘密) | Stripe Dashboard > Developers > API keys | サーバーのみ |
| `STRIPE_WEBHOOK_SECRET` | Stripe Webhookシークレット | Stripe Dashboard > Developers > Webhooks | Webhook検証 |
| `STRIPE_PRICE_ID_PREMIUM` | PremiumプランのPrice ID | Stripe Dashboard > Products | サブスクリプション作成 |

**使用例**:
```typescript
// lib/stripe/client.ts
import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16'
})
```

#### Dify API関連

| 変数名 | 説明 | 取得方法 | 使用箇所 |
|:---|:---|:---|:---|
| `DIFY_API_URL` | Dify APIのベースURL | Difyダッシュボード | AI分析API呼び出し |
| `DIFY_API_KEY` | Dify APIキー(秘密) | Difyダッシュボード | AI分析API呼び出し |

**使用例**:
```typescript
// lib/dify/client.ts
import axios from 'axios'

export const difyClient = axios.create({
  baseURL: process.env.DIFY_API_URL,
  headers: {
    'Authorization': `Bearer ${process.env.DIFY_API_KEY}`
  }
})
```

#### Upstash QStash関連(ジョブキュー)

| 変数名 | 説明 | 取得方法 | 使用箇所 |
|:---|:---|:---|:---|
| `QSTASH_URL` | QStash API URL | Upstash Console | ジョブキュー |
| `QSTASH_TOKEN` | QStashトークン(秘密) | Upstash Console | ジョブキュー |
| `QSTASH_CURRENT_SIGNING_KEY` | 署名検証キー | Upstash Console | Webhook検証 |
| `QSTASH_NEXT_SIGNING_KEY` | 次の署名検証キー | Upstash Console | Webhook検証 |

**使用例**:
```typescript
// lib/queue/client.ts
import { Client } from '@upstash/qstash'

export const qstash = new Client({
  token: process.env.QSTASH_TOKEN!
})
```

#### アプリケーション設定

| 変数名 | 説明 | 設定値 | 使用箇所 |
|:---|:---|:---|:---|
| `NEXT_PUBLIC_APP_URL` | アプリケーションのURL | 本番: `https://yourdomain.com`<br>開発: `http://localhost:3000` | ジョブキューのコールバックURL |
| `CRON_SECRET` | Cron Job認証用シークレット | ランダムな文字列(32文字以上) | Cron Job認証 |

**使用例**:
```typescript
// app/api/jobs/process-report/route.ts
await qstash.publishJSON({
  url: `${process.env.NEXT_PUBLIC_APP_URL}/api/jobs/process-report`,
  body: { reportId }
})
```

---

### 1.2. オプション環境変数

以下の環境変数はオプションですが、設定することで機能が向上します。

#### エラー監視(Sentry)

| 変数名 | 説明 | 取得方法 | 使用箇所 |
|:---|:---|:---|:---|
| `SENTRY_DSN` | Sentry DSN | Sentry Dashboard | エラー監視 |
| `SENTRY_AUTH_TOKEN` | Sentryアップロードトークン | Sentry Dashboard | ソースマップアップロード |

#### 参考文献検索API

| 変数名 | 説明 | 取得方法 | 使用箇所 |
|:---|:---|:---|:---|
| `REFERENCE_API_URL` | 参考文献検索APIのURL | 既存APIから | 参考文献検索 |
| `REFERENCE_API_KEY` | 参考文献検索APIキー | 既存APIから | 参考文献検索 |

---

### 1.3. 環境変数テンプレート

以下を`.env.local`にコピーして使用してください。

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxxxx
STRIPE_SECRET_KEY=sk_test_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
STRIPE_PRICE_ID_PREMIUM=price_xxxxx

# Dify
DIFY_API_URL=https://api.dify.ai/v1
DIFY_API_KEY=dify_xxxxx

# Upstash QStash
QSTASH_URL=https://qstash.upstash.io
QSTASH_TOKEN=xxxxx
QSTASH_CURRENT_SIGNING_KEY=xxxxx
QSTASH_NEXT_SIGNING_KEY=xxxxx

# Application
NEXT_PUBLIC_APP_URL=http://localhost:3000
CRON_SECRET=your_random_secret_here

# Optional: Sentry
SENTRY_DSN=https://xxxxx@sentry.io/xxxxx
SENTRY_AUTH_TOKEN=xxxxx

# Optional: Reference API
REFERENCE_API_URL=https://api.reference.com
REFERENCE_API_KEY=xxxxx
```

---

## 2. グローバル定数

### 2.1. アプリケーション定数

以下の定数は`lib/constants.ts`に定義します。

```typescript
// lib/constants.ts

// ストレージ制限(バイト単位)
export const STORAGE_LIMITS = {
  FREE: 100 * 1024 * 1024, // 100MB
  PREMIUM: 1024 * 1024 * 1024, // 1GB
} as const

// レポート作成制限(月あたり)
export const REPORT_LIMITS = {
  FREE: 5,
  PREMIUM: Infinity,
} as const

// ファイルサイズ制限
export const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

// 対応ファイル形式
export const ALLOWED_FILE_TYPES = {
  EXCEL: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'],
  IMAGE: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  CODE: ['text/plain', 'text/x-python', 'application/javascript'],
} as const

// 画像圧縮設定
export const IMAGE_COMPRESSION = {
  MAX_WIDTH: 1920,
  MAX_HEIGHT: 1080,
  QUALITY: 80,
} as const

// Dify API設定
export const DIFY_CONFIG = {
  TIMEOUT: 120000, // 2分
  MAX_RETRIES: 3,
  RETRY_DELAY: 2000, // 2秒
} as const

// 自動削除設定
export const AUTO_DELETE_MONTHS = 6

// ページネーション
export const ITEMS_PER_PAGE = 10

// サブスクリプションプラン
export const SUBSCRIPTION_PLANS = {
  FREE: 'free',
  PREMIUM: 'premium',
} as const

// レポートステータス
export const REPORT_STATUS = {
  DRAFT: 'draft',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  ERROR: 'error',
} as const

// ファイルタイプ
export const FILE_TYPE = {
  EXCEL: 'excel',
  IMAGE: 'image',
  CODE: 'code',
  PAST_REPORT: 'past_report',
} as const
```

**使用例**:
```typescript
import { STORAGE_LIMITS, REPORT_LIMITS } from '@/lib/constants'

if (user.storage_used + fileSize > STORAGE_LIMITS[user.subscription_status.toUpperCase()]) {
  throw new Error('ストレージ容量の上限に達しました')
}
```

---

### 2.2. エラーメッセージ定数

```typescript
// lib/constants/errors.ts

export const ERROR_MESSAGES = {
  // 認証エラー
  AUTH_INVALID_CREDENTIALS: 'メールアドレスまたはパスワードが正しくありません',
  AUTH_EMAIL_ALREADY_EXISTS: 'このメールアドレスは既に登録されています',
  AUTH_WEAK_PASSWORD: 'パスワードは8文字以上で、大文字・小文字・数字を含む必要があります',
  
  // ファイルエラー
  FILE_TOO_LARGE: 'ファイルサイズが10MBを超えています',
  FILE_INVALID_TYPE: '対応していないファイル形式です',
  
  // ストレージエラー
  STORAGE_LIMIT_EXCEEDED: 'ストレージ容量の上限に達しました。Premiumプランにアップグレードするか、古いレポートを削除してください',
  
  // レポートエラー
  REPORT_LIMIT_EXCEEDED: '今月のレポート作成上限に達しました。Premiumプランにアップグレードしてください',
  REPORT_NOT_FOUND: 'レポートが見つかりません',
  REPORT_GENERATION_FAILED: 'レポート生成に失敗しました。もう一度お試しください',
  
  // API エラー
  DIFY_API_ERROR: 'AI分析中にエラーが発生しました',
  DIFY_API_TIMEOUT: 'AI分析がタイムアウトしました。もう一度お試しください',
  
  // 一般エラー
  UNKNOWN_ERROR: '予期しないエラーが発生しました',
  NETWORK_ERROR: 'ネットワークエラーが発生しました。インターネット接続を確認してください',
} as const
```

---

## 3. ルーティング定義

### 3.1. ページルート

以下は、Next.js App Routerのファイル構造とURLの対応です。

| URL | ファイルパス | 説明 | 認証 | 遷移元 |
|:---|:---|:---|:---|:---|
| `/` | `app/page.tsx` | ランディングページ | 不要 | - |
| `/login` | `app/(auth)/login/page.tsx` | ログインページ | 不要 | ランディング、登録ページ |
| `/register` | `app/(auth)/register/page.tsx` | 登録ページ | 不要 | ランディング、ログインページ |
| `/dashboard` | `app/(dashboard)/dashboard/page.tsx` | ダッシュボード | 必要 | ログイン後、サイドバー |
| `/reports` | `app/(dashboard)/reports/page.tsx` | レポート一覧 | 必要 | サイドバー、ダッシュボード |
| `/reports/new` | `app/(dashboard)/reports/new/page.tsx` | 新規レポート作成 | 必要 | ダッシュボード、レポート一覧 |
| `/reports/[id]` | `app/(dashboard)/reports/[id]/page.tsx` | レポート詳細 | 必要 | レポート一覧 |
| `/settings` | `app/(dashboard)/settings/page.tsx` | 設定 | 必要 | サイドバー、ユーザーメニュー |
| `/settings/subscription` | `app/(dashboard)/settings/subscription/page.tsx` | サブスクリプション管理 | 必要 | 設定ページ |

---

### 3.2. APIルート

以下は、API エンドポイントの定義です。

#### 認証API

| メソッド | エンドポイント | ファイルパス | 説明 | リクエスト | レスポンス |
|:---|:---|:---|:---|:---|:---|
| POST | `/api/auth/login` | `app/api/auth/login/route.ts` | ログイン | `{ email, password }` | `{ user, session }` |
| POST | `/api/auth/register` | `app/api/auth/register/route.ts` | 新規登録 | `{ email, password, name }` | `{ user, session }` |
| POST | `/api/auth/logout` | `app/api/auth/logout/route.ts` | ログアウト | - | `{ success: true }` |

**使用例**:
```typescript
// ログインボタンのonClick
const handleLogin = async () => {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })
  const data = await response.json()
  if (data.user) {
    router.push('/dashboard')
  }
}
```

#### レポートAPI

| メソッド | エンドポイント | ファイルパス | 説明 | リクエスト | レスポンス |
|:---|:---|:---|:---|:---|:---|
| GET | `/api/reports` | `app/api/reports/route.ts` | レポート一覧取得 | クエリ: `page`, `status` | `{ reports, total }` |
| POST | `/api/reports` | `app/api/reports/route.ts` | レポート作成 | `{ title, experiment_type }` | `{ report }` |
| GET | `/api/reports/[id]` | `app/api/reports/[id]/route.ts` | レポート詳細取得 | - | `{ report }` |
| DELETE | `/api/reports/[id]` | `app/api/reports/[id]/route.ts` | レポート削除 | - | `{ success: true }` |
| POST | `/api/reports/generate` | `app/api/reports/generate/route.ts` | レポート生成開始 | `{ reportId }` | `{ success: true }` |

**使用例**:
```typescript
// レポート生成ボタンのonClick
const handleGenerate = async () => {
  const response = await fetch('/api/reports/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportId })
  })
  // 非同期処理が開始される
  // Realtime購読で進捗を監視
}
```

#### ファイルアップロードAPI

| メソッド | エンドポイント | ファイルパス | 説明 | リクエスト | レスポンス |
|:---|:---|:---|:---|:---|:---|
| POST | `/api/upload` | `app/api/upload/route.ts` | ファイルアップロード | FormData: `file`, `reportId` | `{ success, path }` |
| DELETE | `/api/upload/[id]` | `app/api/upload/[id]/route.ts` | ファイル削除 | - | `{ success: true }` |

**使用例**:
```typescript
// ファイル選択後
const handleUpload = async (file: File) => {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('reportId', reportId)
  
  const response = await fetch('/api/upload', {
    method: 'POST',
    body: formData
  })
  const data = await response.json()
}
```

#### ジョブAPI(内部用)

| メソッド | エンドポイント | ファイルパス | 説明 | リクエスト | レスポンス |
|:---|:---|:---|:---|:---|:---|
| POST | `/api/jobs/process-report` | `app/api/jobs/process-report/route.ts` | レポート処理ジョブ | `{ reportId }` | `{ success: true }` |

**注意**: このAPIは、QStashから呼び出されるため、直接呼び出さないでください。

#### Stripe API

| メソッド | エンドポイント | ファイルパス | 説明 | リクエスト | レスポンス |
|:---|:---|:---|:---|:---|:---|
| POST | `/api/stripe/checkout` | `app/api/stripe/checkout/route.ts` | Checkout Session作成 | `{ priceId }` | `{ sessionId }` |
| POST | `/api/stripe/webhook` | `app/api/stripe/webhook/route.ts` | Stripe Webhook | Stripeイベント | `{ received: true }` |
| POST | `/api/stripe/portal` | `app/api/stripe/portal/route.ts` | Customer Portal作成 | - | `{ url }` |

**使用例**:
```typescript
// PremiumにアップグレードボタンのonClick
const handleUpgrade = async () => {
  const response = await fetch('/api/stripe/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_PREMIUM })
  })
  const { sessionId } = await response.json()
  
  // Stripe Checkoutにリダイレクト
  const stripe = await loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)
  await stripe.redirectToCheckout({ sessionId })
}
```

#### Cron Job API

| メソッド | エンドポイント | ファイルパス | 説明 | リクエスト | レスポンス |
|:---|:---|:---|:---|:---|:---|
| GET | `/api/cron/cleanup` | `app/api/cron/cleanup/route.ts` | 古いファイル削除 | ヘッダー: `Authorization` | `{ success, deletedReports }` |

**注意**: このAPIは、Vercel Cronから呼び出されるため、`CRON_SECRET`で認証されます。

---

### 3.3. ナビゲーションフロー

#### 初回訪問ユーザー

```
ランディングページ(/)
  ↓ [新規登録]ボタン
登録ページ(/register)
  ↓ 登録完了
ダッシュボード(/dashboard)
  ↓ [新規レポート作成]ボタン
新規レポート作成(/reports/new)
  ↓ ステップ1: 基本情報入力
  ↓ [次へ]ボタン
  ↓ ステップ2: データアップロード
  ↓ [次へ]ボタン
  ↓ ステップ3: 確認
  ↓ [生成開始]ボタン
レポート詳細(/reports/[id])
  ↓ 処理中(進捗表示)
  ↓ 完了
  ↓ [ダウンロード]ボタン
```

#### 既存ユーザー

```
ランディングページ(/)
  ↓ [ログイン]ボタン
ログインページ(/login)
  ↓ ログイン完了
ダッシュボード(/dashboard)
  ↓ サイドバー[レポート一覧]
レポート一覧(/reports)
  ↓ レポートをクリック
レポート詳細(/reports/[id])
```

#### サブスクリプション管理

```
ダッシュボード(/dashboard)
  ↓ サイドバー[設定]
設定(/settings)
  ↓ [サブスクリプション]タブ
サブスクリプション管理(/settings/subscription)
  ↓ [Premiumにアップグレード]ボタン
Stripe Checkout(外部)
  ↓ 支払い完了
サブスクリプション管理(/settings/subscription)
  ↓ プラン更新済み
```

---

## 4. データベーススキーマと変数

### 4.1. テーブル構造

#### usersテーブル

| カラム名 | 型 | 説明 | デフォルト値 |
|:---|:---|:---|:---|
| `id` | UUID | ユーザーID(主キー) | `gen_random_uuid()` |
| `email` | TEXT | メールアドレス | - |
| `name` | TEXT | 名前 | - |
| `subscription_status` | TEXT | サブスクリプションステータス | `'free'` |
| `stripe_customer_id` | TEXT | Stripe顧客ID | `NULL` |
| `storage_used` | BIGINT | 使用ストレージ(バイト) | `0` |
| `storage_limit` | BIGINT | ストレージ上限(バイト) | `104857600` |
| `created_at` | TIMESTAMP | 作成日時 | `now()` |

#### reportsテーブル

| カラム名 | 型 | 説明 | デフォルト値 |
|:---|:---|:---|:---|
| `id` | UUID | レポートID(主キー) | `gen_random_uuid()` |
| `user_id` | UUID | ユーザーID(外部キー) | - |
| `title` | TEXT | レポートタイトル | - |
| `status` | TEXT | ステータス | `'draft'` |
| `progress` | INTEGER | 進捗(0-100) | `0` |
| `processing_step` | TEXT | 処理ステップ | `NULL` |
| `error_message` | TEXT | エラーメッセージ | `NULL` |
| `file_url` | TEXT | 生成されたファイルのURL | `NULL` |
| `created_at` | TIMESTAMP | 作成日時 | `now()` |
| `updated_at` | TIMESTAMP | 更新日時 | `now()` |

#### experiment_dataテーブル

| カラム名 | 型 | 説明 | デフォルト値 |
|:---|:---|:---|:---|
| `id` | UUID | データID(主キー) | `gen_random_uuid()` |
| `report_id` | UUID | レポートID(外部キー) | - |
| `file_name` | TEXT | ファイル名 | - |
| `file_type` | TEXT | ファイルタイプ | - |
| `file_url` | TEXT | ファイルURL | - |
| `file_size` | BIGINT | ファイルサイズ(バイト) | - |
| `created_at` | TIMESTAMP | 作成日時 | `now()` |

---

### 4.2. TypeScript型定義

以下の型定義を`types/database.ts`に配置します。

```typescript
// types/database.ts

export type SubscriptionStatus = 'free' | 'premium'

export type ReportStatus = 'draft' | 'processing' | 'completed' | 'error'

export type FileType = 'excel' | 'image' | 'code' | 'past_report'

export interface User {
  id: string
  email: string
  name: string
  subscription_status: SubscriptionStatus
  stripe_customer_id: string | null
  storage_used: number
  storage_limit: number
  created_at: string
}

export interface Report {
  id: string
  user_id: string
  title: string
  status: ReportStatus
  progress: number
  processing_step: string | null
  error_message: string | null
  file_url: string | null
  created_at: string
  updated_at: string
}

export interface ExperimentData {
  id: string
  report_id: string
  file_name: string
  file_type: FileType
  file_url: string
  file_size: number
  created_at: string
}

export interface AnalysisResult {
  id: string
  report_id: string
  file_id: string
  dify_response: any
  created_at: string
}
```

**使用例**:
```typescript
import { Report, ReportStatus } from '@/types/database'

const report: Report = {
  id: '123',
  user_id: '456',
  title: '実験1のレポート',
  status: 'processing',
  progress: 45,
  processing_step: 'AI分析中',
  error_message: null,
  file_url: null,
  created_at: '2024-10-28T14:30:00Z',
  updated_at: '2024-10-28T14:35:00Z'
}
```

---

## 5. ボタンと遷移先の対応表

### 5.1. 認証画面

| ボタン名 | 配置場所 | 遷移先 | アクション |
|:---|:---|:---|:---|
| **ログイン** | ログインページ | `/dashboard` | API: `/api/auth/login` |
| **新規登録** | ログインページ | `/register` | ページ遷移 |
| **登録** | 登録ページ | `/dashboard` | API: `/api/auth/register` |
| **ログイン** | 登録ページ | `/login` | ページ遷移 |

### 5.2. ダッシュボード

| ボタン名 | 配置場所 | 遷移先 | アクション |
|:---|:---|:---|:---|
| **新規レポート作成** | ダッシュボード | `/reports/new` | ページ遷移 |
| **すべて見る** | 最近のレポート | `/reports` | ページ遷移 |
| **レポート行クリック** | 最近のレポート | `/reports/[id]` | ページ遷移 |

### 5.3. サイドバー

| ボタン名 | 配置場所 | 遷移先 | アクション |
|:---|:---|:---|:---|
| **ダッシュボード** | サイドバー | `/dashboard` | ページ遷移 |
| **レポート一覧** | サイドバー | `/reports` | ページ遷移 |
| **新規作成** | サイドバー | `/reports/new` | ページ遷移 |
| **設定** | サイドバー | `/settings` | ページ遷移 |
| **Premiumへ** | サイドバー | `/settings/subscription` | ページ遷移 |

### 5.4. ヘッダー

| ボタン名 | 配置場所 | 遷移先 | アクション |
|:---|:---|:---|:---|
| **プロフィール** | ユーザーメニュー | `/settings` | ページ遷移 |
| **設定** | ユーザーメニュー | `/settings` | ページ遷移 |
| **ログアウト** | ユーザーメニュー | `/login` | API: `/api/auth/logout` |

### 5.5. レポート一覧

| ボタン名 | 配置場所 | 遷移先 | アクション |
|:---|:---|:---|:---|
| **新規作成** | ページ上部 | `/reports/new` | ページ遷移 |
| **レポート行クリック** | テーブル | `/reports/[id]` | ページ遷移 |
| **詳細を見る** | 操作メニュー | `/reports/[id]` | ページ遷移 |
| **ダウンロード** | 操作メニュー | - | ファイルダウンロード |
| **削除** | 操作メニュー | - | API: `/api/reports/[id]` (DELETE) |

### 5.6. 新規レポート作成

| ボタン名 | 配置場所 | 遷移先 | アクション |
|:---|:---|:---|:---|
| **次へ** | ステップ1 | ステップ2 | 状態更新 |
| **次へ** | ステップ2 | ステップ3 | 状態更新 |
| **戻る** | ステップ2,3 | 前のステップ | 状態更新 |
| **生成開始** | ステップ3 | `/reports/[id]` | API: `/api/reports/generate` |
| **ファイルを選択** | ステップ2 | - | ファイル選択ダイアログ |
| **削除**(ゴミ箱) | ファイル一覧 | - | API: `/api/upload/[id]` (DELETE) |

### 5.7. レポート詳細

| ボタン名 | 配置場所 | 遷移先 | アクション |
|:---|:---|:---|:---|
| **レポート一覧に戻る** | ページ上部 | `/reports` | ページ遷移 |
| **ダウンロード** | 完了時 | - | ファイルダウンロード |
| **削除** | ページ下部 | `/reports` | API: `/api/reports/[id]` (DELETE) |
| **再試行** | エラー時 | - | API: `/api/reports/generate` |

### 5.8. 設定ページ

| ボタン名 | 配置場所 | 遷移先 | アクション |
|:---|:---|:---|:---|
| **Premiumにアップグレード** | プランカード | Stripe Checkout | API: `/api/stripe/checkout` |
| **サブスクリプションを管理** | Premiumユーザー | Stripe Portal | API: `/api/stripe/portal` |

---

## 6. まとめ

本ドキュメントには、以下の情報が含まれています。

- **環境変数**: 必須およびオプションの環境変数、取得方法、使用箇所
- **グローバル定数**: アプリケーション全体で使用する定数
- **ルーティング**: ページルート、APIルート、ナビゲーションフロー
- **データベーススキーマ**: テーブル構造、TypeScript型定義
- **ボタンと遷移**: 各ボタンの遷移先とアクション

Cursorで開発する際は、このドキュメントを参照して、正しい変数名、ルート、遷移先を使用してください。

以上
