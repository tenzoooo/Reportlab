# Cursor (ChatGPT Code) 向け 実験レポート自動化ツール 開発手順書

## プロジェクト概要

理系大学生の実験レポート作成を自動化するWebアプリケーションを開発します。AI(Dify API)を活用して、実験データの分析からWord形式のレポート生成までを自動化し、レポート作成時間を10〜12時間から2〜3時間に短縮することを目指します。

## 技術スタック

| カテゴリ | 技術 |
| --- | --- |
| **フロントエンド** | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS |
| **バックエンド** | Next.js API Routes (サーバーレス関数) |
| **データベース** | Supabase (PostgreSQL) |
| **認証** | Supabase Auth |
| **ファイルストレージ** | Supabase Storage |
| **課金システム** | Stripe (Checkout, Webhooks) |
| **AI分析** | Dify API (既存) |
| **Word生成** | docx (npm package) |
| **ホスティング** | Vercel |
| **開発ツール** | Cursor (ChatGPT Code) |

## プロジェクト構成

```
experiment-report-automation/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── register/
│   │   │   └── page.tsx
│   │   └── layout.tsx
│   ├── (dashboard)/
│   │   ├── dashboard/
│   │   │   └── page.tsx
│   │   ├── reports/
│   │   │   ├── page.tsx
│   │   │   ├── new/
│   │   │   │   └── page.tsx
│   │   │   └── [id]/
│   │   │       └── page.tsx
│   │   └── layout.tsx
│   ├── api/
│   │   ├── auth/
│   │   │   └── route.ts
│   │   ├── reports/
│   │   │   ├── route.ts
│   │   │   ├── [id]/
│   │   │   │   └── route.ts
│   │   │   └── generate/
│   │   │       └── route.ts
│   │   ├── upload/
│   │   │   └── route.ts
│   │   ├── dify/
│   │   │   └── route.ts
│   │   └── stripe/
│   │       ├── checkout/
│   │       │   └── route.ts
│   │       └── webhook/
│   │           └── route.ts
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── ui/
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Card.tsx
│   │   └── ...
│   ├── FileUpload.tsx
│   ├── ReportList.tsx
│   ├── ReportPreview.tsx
│   └── ProgressBar.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts
│   │   ├── server.ts
│   │   └── types.ts
│   ├── stripe/
│   │   └── client.ts
│   ├── dify/
│   │   └── client.ts
│   ├── docx/
│   │   └── generator.ts
│   └── utils.ts
├── types/
│   ├── report.ts
│   ├── experiment.ts
│   └── user.ts
├── public/
├── .env.local
├── next.config.js
├── package.json
├── tsconfig.json
└── tailwind.config.js
```

---

## フェーズ1: プロジェクトセットアップ(1日目)

### ステップ1.1: Next.jsプロジェクトの初期化

**Cursorへの指示**:

```
Next.js 14のプロジェクトを作成してください。以下の設定で初期化します:
- TypeScriptを使用
- App Routerを使用
- Tailwind CSSを使用
- ESLintを有効化
- src/ディレクトリは使用しない(app/ディレクトリを直接使用)

プロジェクト名: experiment-report-automation
```

**実行コマンド**:

```bash
npx create-next-app@latest experiment-report-automation --typescript --tailwind --app --eslint --no-src-dir
cd experiment-report-automation
```

### ステップ1.2: 必要なパッケージのインストール

**Cursorへの指示**:

```
以下のパッケージをインストールしてください:

1. Supabase関連:
   - @supabase/supabase-js (最新版)
   - @supabase/auth-helpers-nextjs (最新版)

2. Stripe関連:
   - stripe (最新版)
   - @stripe/stripe-js (最新版)

3. Word文書生成:
   - docx (最新版)

4. UI/UX関連:
   - @radix-ui/react-dialog
   - @radix-ui/react-dropdown-menu
   - @radix-ui/react-toast
   - lucide-react (アイコン)
   - class-variance-authority
   - clsx
   - tailwind-merge

5. フォーム処理:
   - react-hook-form
   - zod (バリデーション)
   - @hookform/resolvers

6. ファイルアップロード:
   - react-dropzone

7. ユーティリティ:
   - date-fns
   - axios
```

**実行コマンド**:

```bash
npm install @supabase/supabase-js @supabase/auth-helpers-nextjs stripe @stripe/stripe-js docx @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-toast lucide-react class-variance-authority clsx tailwind-merge react-hook-form zod @hookform/resolvers react-dropzone date-fns axios
```

### ステップ1.3: 環境変数の設定

**Cursorへの指示**:

```
.env.localファイルを作成し、以下の環境変数のテンプレートを追加してください:

NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret

DIFY_API_KEY=your_dify_api_key
DIFY_API_URL=your_dify_api_url

NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**ファイル**: `.env.local`

### ステップ1.4: Supabaseクライアントの設定

**Cursorへの指示**:

```
lib/supabase/client.tsファイルを作成し、ブラウザ用のSupabaseクライアントを設定してください。
createClientComponentClientを使用して、クライアントコンポーネント用のクライアントを作成します。
```

**ファイル**: `lib/supabase/client.ts`

```typescript
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { Database } from './types'

export const createClient = () => createClientComponentClient<Database>()
```

**Cursorへの指示**:

```
lib/supabase/server.tsファイルを作成し、サーバーサイド用のSupabaseクライアントを設定してください。
createServerComponentClientとcreateRouteHandlerClientを使用します。
```

**ファイル**: `lib/supabase/server.ts`

```typescript
import { createServerComponentClient, createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { Database } from './types'

export const createServerClient = () => {
  const cookieStore = cookies()
  return createServerComponentClient<Database>({ cookies: () => cookieStore })
}

export const createRouteClient = () => {
  const cookieStore = cookies()
  return createRouteHandlerClient<Database>({ cookies: () => cookieStore })
}
```

---

## フェーズ2: データベース設計とSupabase設定(1日目)

### ステップ2.1: Supabaseプロジェクトの作成

**手動作業**:

1. [Supabase](https://supabase.com)にアクセスし、新規プロジェクトを作成

1. プロジェクト名: `experiment-report-automation`

1. データベースパスワードを設定

1. リージョンを選択(日本の場合: Northeast Asia (Tokyo))

1. プロジェクトURLとAPIキーを`.env.local`にコピー

### ステップ2.2: データベーススキーマの作成

**Cursorへの指示**:

```
Supabaseのダッシュボードで実行するSQLスクリプトを作成してください。以下のテーブルを作成します:

1. usersテーブル(Supabase Authと連携):
   - id (uuid, primary key, references auth.users)
   - email (text)
   - full_name (text)
   - subscription_status (text) - 'free', 'premium'
   - created_at (timestamp)
   - updated_at (timestamp)

2. reportsテーブル:
   - id (uuid, primary key, default uuid_generate_v4())
   - user_id (uuid, foreign key to users.id)
   - title (text)
   - status (text) - 'draft', 'processing', 'completed', 'error'
   - template_data (jsonb) - Jinja2テンプレート用のデータ
   - file_url (text) - 生成されたWord文書のURL
   - created_at (timestamp)
   - updated_at (timestamp)

3. experiment_dataテーブル:
   - id (uuid, primary key)
   - report_id (uuid, foreign key to reports.id)
   - file_name (text)
   - file_type (text) - 'excel', 'image', 'code'
   - file_url (text) - Supabase Storageのパス
   - uploaded_at (timestamp)

4. analysis_resultsテーブル:
   - id (uuid, primary key)
   - report_id (uuid, foreign key to reports.id)
   - dify_response (jsonb) - Dify APIからのレスポンス
   - statistics (jsonb) - 統計データ
   - graphs (jsonb) - グラフデータ
   - created_at (timestamp)

Row Level Security (RLS)を有効化し、ユーザーは自分のデータのみアクセスできるようにしてください。
```

**SQLスクリプト**: `supabase/schema.sql`

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (extends Supabase Auth)
CREATE TABLE public.users (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT,
  subscription_status TEXT DEFAULT 'free' CHECK (subscription_status IN ('free', 'premium')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Reports table
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'processing', 'completed', 'error')),
  template_data JSONB,
  file_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Experiment data table
CREATE TABLE public.experiment_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id UUID REFERENCES public.reports(id) ON DELETE CASCADE NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('excel', 'image', 'code', 'word')),
  file_url TEXT NOT NULL,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Analysis results table
CREATE TABLE public.analysis_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id UUID REFERENCES public.reports(id) ON DELETE CASCADE NOT NULL,
  dify_response JSONB,
  statistics JSONB,
  graphs JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiment_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_results ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users
CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- RLS Policies for reports
CREATE POLICY "Users can view own reports" ON public.reports
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own reports" ON public.reports
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reports" ON public.reports
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own reports" ON public.reports
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for experiment_data
CREATE POLICY "Users can view own experiment data" ON public.experiment_data
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.reports
      WHERE reports.id = experiment_data.report_id
      AND reports.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own experiment data" ON public.experiment_data
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.reports
      WHERE reports.id = experiment_data.report_id
      AND reports.user_id = auth.uid()
    )
  );

-- RLS Policies for analysis_results
CREATE POLICY "Users can view own analysis results" ON public.analysis_results
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.reports
      WHERE reports.id = analysis_results.report_id
      AND reports.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own analysis results" ON public.analysis_results
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.reports
      WHERE reports.id = analysis_results.report_id
      AND reports.user_id = auth.uid()
    )
  );

-- Create indexes
CREATE INDEX idx_reports_user_id ON public.reports(user_id);
CREATE INDEX idx_reports_status ON public.reports(status);
CREATE INDEX idx_experiment_data_report_id ON public.experiment_data(report_id);
CREATE INDEX idx_analysis_results_report_id ON public.analysis_results(report_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reports_updated_at BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### ステップ2.3: Supabase Storageの設定

**手動作業**:

1. Supabaseダッシュボードで「Storage」に移動

1. 新しいバケットを作成:
  - バケット名: `experiment-files`
  - Public: false (プライベート)

1. バケットのポリシーを設定:
  - ユーザーは自分のファイルのみアップロード・閲覧可能

**Cursorへの指示**:

```
Supabase Storageのポリシー設定用SQLを作成してください。
ユーザーは {user_id}/ フォルダ配下に自分のファイルのみアップロード・閲覧できるようにします。
```

**SQLスクリプト**:

```sql
-- Storage policies for experiment-files bucket
CREATE POLICY "Users can upload own files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'experiment-files' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can view own files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'experiment-files' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete own files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'experiment-files' AND
  (storage.foldername(name))[1] = auth.uid()::text
);
```

### ステップ2.4: TypeScript型定義の生成

**Cursorへの指示**:

```
Supabase CLIを使用して、データベーススキーマからTypeScript型定義を生成してください。
生成された型定義をlib/supabase/types.tsに保存します。
```

**実行コマンド**:

```bash
npx supabase gen types typescript --project-id your_project_id > lib/supabase/types.ts
```

---

## フェーズ3: 認証機能の実装(2日目)

### ステップ3.1: 認証レイアウトの作成

**Cursorへの指示**:

```
app/(auth)/layout.tsxを作成してください。
認証ページ用のシンプルなレイアウトで、中央にカードを配置します。
背景はグラデーションを使用し、モダンなデザインにしてください。
```

**ファイル**: `app/(auth)/layout.tsx`

### ステップ3.2: ログインページの実装

**Cursorへの指示**:

```
app/(auth)/login/page.tsxを作成してください。

機能:
- メールアドレスとパスワードでのログイン
- react-hook-formとzodを使用したフォームバリデーション
- Supabase Authを使用した認証処理
- ログイン成功後は/dashboardにリダイレクト
- エラーメッセージの表示
- 「アカウントを持っていない場合」の登録ページへのリンク

デザイン:
- Tailwind CSSを使用
- モダンで使いやすいUI
- レスポンシブ対応
```

**ファイル**: `app/(auth)/login/page.tsx`

### ステップ3.3: 登録ページの実装

**Cursorへの指示**:

```
app/(auth)/register/page.tsxを作成してください。

機能:
- メールアドレス、パスワード、名前での新規登録
- react-hook-formとzodを使用したフォームバリデーション
- パスワードの強度チェック(最低8文字、大文字・小文字・数字を含む)
- Supabase Authを使用した登録処理
- 登録成功後、確認メールの送信を通知
- エラーメッセージの表示
- 「既にアカウントを持っている場合」のログインページへのリンク

デザイン:
- ログインページと統一されたデザイン
- レスポンシブ対応
```

**ファイル**: `app/(auth)/register/page.tsx`

### ステップ3.4: 認証ミドルウェアの実装

**Cursorへの指示**:

```
middleware.tsをプロジェクトルートに作成してください。

機能:
- /dashboard以下のルートは認証必須
- 未認証の場合は/loginにリダイレクト
- 認証済みユーザーが/login, /registerにアクセスした場合は/dashboardにリダイレクト
- Supabase Authのセッション管理
```

**ファイル**: `middleware.ts`

---

## フェーズ4: ダッシュボードとレポート一覧(2日目)

### ステップ4.1: ダッシュボードレイアウトの作成

**Cursorへの指示**:

```
app/(dashboard)/layout.tsxを作成してください。

機能:
- サイドバー(ナビゲーション)
  - ダッシュボード
  - レポート一覧
  - 設定
  - ログアウト
- ヘッダー
  - ユーザー名表示
  - プロフィールドロップダウン
- メインコンテンツエリア

デザイン:
- モダンなダッシュボードUI
- レスポンシブ(モバイルではハンバーガーメニュー)
- Lucide Reactのアイコンを使用
```

**ファイル**: `app/(dashboard)/layout.tsx`

### ステップ4.2: ダッシュボードページの実装

**Cursorへの指示**:

```
app/(dashboard)/dashboard/page.tsxを作成してください。

機能:
- ユーザーの統計情報を表示
  - 作成したレポート数
  - 今月作成したレポート数
  - 処理中のレポート数
- 最近のレポート一覧(最新5件)
- 「新規レポート作成」ボタン
- Supabaseからデータを取得(Server Component)

デザイン:
- カードレイアウト
- グラフやチャートは後で追加可能なように設計
```

**ファイル**: `app/(dashboard)/dashboard/page.tsx`

### ステップ4.3: レポート一覧ページの実装

**Cursorへの指示**:

```
app/(dashboard)/reports/page.tsxを作成してください。

機能:
- ユーザーの全レポートを一覧表示
- 各レポートの情報:
  - タイトル
  - ステータス(draft, processing, completed, error)
  - 作成日時
- レポートをクリックすると詳細ページに遷移
- 「新規作成」ボタン
- 検索・フィルタ機能(ステータスで絞り込み)
- ページネーション(10件ずつ表示)
- Supabaseからデータを取得

デザイン:
- テーブルまたはカードレイアウト
- ステータスごとに色分け
```

**ファイル**: `app/(dashboard)/reports/page.tsx`

### ステップ4.4: レポート一覧取得APIの実装

**Cursorへの指示**:

```
app/api/reports/route.tsを作成してください。

GET /api/reports:
- クエリパラメータ:
  - page (number): ページ番号
  - limit (number): 1ページあたりの件数
  - status (string): ステータスフィルタ
- 認証チェック
- Supabaseからレポート一覧を取得
- ページネーション処理
- レスポンス形式:
  {
    reports: Report[],
    total: number,
    page: number,
    limit: number
  }

POST /api/reports:
- 新規レポートの作成
- リクエストボディ: { title: string }
- 認証チェック
- Supabaseにレポートを作成(status: 'draft')
- 作成したレポートを返す
```

**ファイル**: `app/api/reports/route.ts`

---

## フェーズ5: ファイルアップロード機能(3日目)

### ステップ5.1: ファイルアップロードコンポーネントの作成

**Cursorへの指示**:

```
components/FileUpload.tsxを作成してください。

機能:
- react-dropzoneを使用したドラッグ&ドロップアップロード
- 複数ファイルのアップロード対応
- 対応ファイル形式:
  - Excel: .xlsx, .xls
  - 画像: .jpg, .jpeg, .png
  - Word: .docx (過去レポート用)
  - コード: .py, .c, .cpp, .txt
- ファイルサイズ制限: 10MB/ファイル
- アップロード進捗表示
- アップロード済みファイルの一覧表示
- ファイルの削除機能
- プレビュー機能(画像のみ)

デザイン:
- ドラッグ&ドロップエリアを視覚的に分かりやすく
- アップロード中はローディングアニメーション
```

**ファイル**: `components/FileUpload.tsx`

### ステップ5.2: ファイルアップロードAPIの実装

**Cursorへの指示**:

```
app/api/upload/route.tsを作成してください。

POST /api/upload:
- multipart/form-dataでファイルを受信
- クエリパラメータ: reportId (uuid)
- 認証チェック
- ファイルのバリデーション(形式、サイズ)
- Supabase Storageにアップロード
  - パス: {user_id}/{report_id}/{file_name}
- experiment_dataテーブルにレコードを作成
- レスポンス:
  {
    id: string,
    file_name: string,
    file_type: string,
    file_url: string
  }

エラーハンドリング:
- ファイル形式が不正
- ファイルサイズ超過
- ストレージエラー
```

**ファイル**: `app/api/upload/route.ts`

### ステップ5.3: 新規レポート作成ページの実装

**Cursorへの指示**:

```
app/(dashboard)/reports/new/page.tsxを作成してください。

機能:
1. レポートタイトルの入力
2. 実験データのアップロード(FileUploadコンポーネントを使用)
3. 過去レポートのアップロード(オプション)
4. 「レポートを生成」ボタン
5. 生成開始後、処理状況ページにリダイレクト

フロー:
1. ページ読み込み時に新規レポート(draft)を作成
2. ファイルをアップロード
3. 「レポートを生成」ボタンクリックで生成APIを呼び出し
4. /reports/[id]にリダイレクト

デザイン:
- ステップバイステップのUI
- 各ステップの完了状態を表示
```

**ファイル**: `app/(dashboard)/reports/new/page.tsx`

---

## フェーズ6: Dify API連携とレポート生成(4日目)

### ステップ6.1: Dify APIクライアントの実装

**Cursorへの指示**:

```
lib/dify/client.tsを作成してください。

機能:
- Dify APIへのHTTPリクエストを送信
- エンドポイント: POST /v1/workflows/run (例)
- リクエストボディ:
  {
    inputs: {
      experiment_data: {...},
      files: [...]
    }
  }
- レスポンスのパース
- エラーハンドリング(タイムアウト、APIエラー)
- リトライロジック(最大3回)

環境変数:
- DIFY_API_KEY
- DIFY_API_URL
```

**ファイル**: `lib/dify/client.ts`

### ステップ6.2: Dify API呼び出しエンドポイントの実装

**Cursorへの指示**:

```
app/api/dify/route.tsを作成してください。

POST /api/dify:
- リクエストボディ: { reportId: string }
- 認証チェック
- Supabaseから実験データを取得
- Dify APIにデータを送信
- レスポンスをanalysis_resultsテーブルに保存
- レポートのステータスを'processing'に更新
- レスポンス: { success: boolean, analysisId: string }

エラーハンドリング:
- Dify APIエラー時はレポートステータスを'error'に更新
```

**ファイル**: `app/api/dify/route.ts`

### ステップ6.3: Word文書生成ロジックの実装

**Cursorへの指示**:

```
lib/docx/generator.tsを作成してください。

機能:
- docxパッケージを使用してWord文書を生成
- Jinja2テンプレート形式のデータを受け取る
- テンプレート構造(提供されたtotal_template_fixed.docxを参考):
  1. 実験結果セクション
     - 各実験の名前、説明
     - 表の挿入
     - 図(グラフ、画像)の挿入
     - 定量的コメント
  2. 考察セクション
     - 考察項目の基盤のみ(学生が記入する部分)
  3. まとめセクション
     - サマリー文
  4. 参考文献セクション
     - 参考文献リスト

関数:
- generateReport(templateData: TemplateData): Promise<Buffer>
- insertTable(table: TableData): void
- insertImage(image: ImageData): void
- applyStyles(): void

スタイル:
- フォント: MS明朝またはヒラギノ明朝
- 見出し: ゴシック体、太字
- 本文: 10.5pt
```

**ファイル**: `lib/docx/generator.ts`

### ステップ6.4: レポート生成APIの実装

**Cursorへの指示**:

```
app/api/reports/generate/route.tsを作成してください。

POST /api/reports/generate:
- リクエストボディ: { reportId: string }
- 認証チェック
- フロー:
  1. Dify APIを呼び出してAI分析を実行
  2. 分析結果を取得
  3. テンプレートデータを構築
  4. Word文書を生成
  5. Supabase Storageにアップロード
  6. reportsテーブルのfile_urlを更新
  7. ステータスを'completed'に更新
- レスポンス: { success: boolean, fileUrl: string }

エラーハンドリング:
- 各ステップでエラーが発生した場合、ステータスを'error'に更新
- エラーメッセージをログに記録
```

**ファイル**: `app/api/reports/generate/route.ts`

---

## フェーズ7: レポート詳細ページと進捗表示(4日目)

### ステップ7.1: 進捗バーコンポーネントの作成

**Cursorへの指示**:

```
components/ProgressBar.tsxを作成してください。

機能:
- レポート生成の進捗を表示
- ステップ:
  1. データアップロード完了
  2. AI分析中
  3. レポート生成中
  4. 完了
- 各ステップの状態: pending, active, completed, error
- アニメーション付き

デザイン:
- 横並びのステップインジケーター
- 現在のステップをハイライト
- 完了したステップにチェックマーク
```

**ファイル**: `components/ProgressBar.tsx`

### ステップ7.2: レポート詳細ページの実装

**Cursorへの指示**:

```
app/(dashboard)/reports/[id]/page.tsxを作成してください。

機能:
- レポートの詳細情報を表示
- ステータスに応じた表示:
  - draft: 「ファイルをアップロードしてください」
  - processing: 進捗バーと現在の処理状況
  - completed: プレビューとダウンロードボタン
  - error: エラーメッセージと再試行ボタン
- アップロード済みファイルの一覧
- 「レポートを生成」ボタン(draftの場合)
- 「ダウンロード」ボタン(completedの場合)
- 「削除」ボタン

データ取得:
- Supabaseからレポート情報を取得(Server Component)
- processingの場合は定期的にポーリング(Client Component)

デザイン:
- カードレイアウト
- ステータスごとに適切なUIを表示
```

**ファイル**: `app/(dashboard)/reports/[id]/page.tsx`

### ステップ7.3: レポート詳細取得APIの実装

**Cursorへの指示**:

```
app/api/reports/[id]/route.tsを作成してください。

GET /api/reports/[id]:
- 認証チェック
- Supabaseからレポート詳細を取得
- 関連する実験データと分析結果も取得
- レスポンス:
  {
    report: Report,
    experimentData: ExperimentData[],
    analysisResult: AnalysisResult | null
  }

PUT /api/reports/[id]:
- レポート情報の更新(タイトルなど)
- 認証チェック
- Supabaseのレポートを更新

DELETE /api/reports/[id]:
- レポートの削除
- 認証チェック
- Supabase Storageからファイルを削除
- Supabaseのレポートを削除(カスケード削除)
```

**ファイル**: `app/api/reports/[id]/route.ts`

---

## フェーズ8: Stripe課金システムの実装(5日目)

### ステップ8.1: Stripeクライアントの設定

**Cursorへの指示**:

```
lib/stripe/client.tsを作成してください。

機能:
- サーバーサイド用Stripeクライアント
- Stripe Checkoutセッションの作成
- サブスクリプション管理
- Webhookイベントの処理

環境変数:
- STRIPE_SECRET_KEY
- NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
```

**ファイル**: `lib/stripe/client.ts`

### ステップ8.2: Stripe製品とプランの作成

**手動作業**:

1. [Stripe Dashboard](https://dashboard.stripe.com)にログイン

1. 「商品」→「商品を追加」

1. プラン作成:
  - **Freeプラン**: 月0円、レポート作成5件まで
  - **Premiumプラン**: 月980円、レポート作成無制限

### ステップ8.3: Checkout APIの実装

**Cursorへの指示**:

```
app/api/stripe/checkout/route.tsを作成してください。

POST /api/stripe/checkout:
- リクエストボディ: { priceId: string }
- 認証チェック
- Stripe Checkoutセッションを作成
  - mode: 'subscription'
  - success_url: /dashboard?success=true
  - cancel_url: /dashboard?canceled=true
  - customer_email: ユーザーのメールアドレス
  - metadata: { userId: string }
- レスポンス: { sessionId: string }
```

**ファイル**: `app/api/stripe/checkout/route.ts`

### ステップ8.4: Stripe Webhookの実装

**Cursorへの指示**:

```
app/api/stripe/webhook/route.tsを作成してください。

POST /api/stripe/webhook:
- Stripeからのwebhookイベントを受信
- 署名検証(STRIPE_WEBHOOK_SECRET)
- イベントタイプに応じた処理:
  - checkout.session.completed: サブスクリプション開始
    - usersテーブルのsubscription_statusを'premium'に更新
  - customer.subscription.deleted: サブスクリプション終了
    - usersテーブルのsubscription_statusを'free'に更新
  - customer.subscription.updated: サブスクリプション更新
- レスポンス: { received: true }

セキュリティ:
- 署名検証を必ず実施
- 不正なリクエストは拒否
```

**ファイル**: `app/api/stripe/webhook/route.ts`

### ステップ8.5: サブスクリプション管理ページの実装

**Cursorへの指示**:

```
app/(dashboard)/settings/page.tsxを作成してください。

機能:
- 現在のサブスクリプションステータスを表示
- Freeプランの場合:
  - 今月のレポート作成数 / 5件
  - 「Premiumにアップグレード」ボタン
- Premiumプランの場合:
  - 「サブスクリプションを管理」ボタン(Stripe Customer Portal)
- アップグレードボタンクリックでStripe Checkoutに遷移

デザイン:
- プランの比較表
- 現在のプランをハイライト
```

**ファイル**: `app/(dashboard)/settings/page.tsx`

---

## フェーズ9: 参考文献自動検索機能(5日目)

### ステップ9.1: 参考文献検索APIの実装

**Cursorへの指示**:

```
app/api/references/route.tsを作成してください。

POST /api/references:
- リクエストボディ: { keywords: string[] }
- 認証チェック
- 外部API(Google Scholar API、Crossref APIなど)を使用して参考文献を検索
- 検索結果をフォーマット:
  {
    id: string,
    title: string,
    authors: string[],
    year: number,
    url: string
  }
- レスポンス: { references: Reference[] }

代替案:
- 既存の参考文献検索APIがある場合はそれを使用
- なければ、手動入力のみに対応
```

**ファイル**: `app/api/references/route.ts`

### ステップ9.2: 参考文献コンポーネントの作成

**Cursorへの指示**:

```
components/ReferenceManager.tsxを作成してください。

機能:
- キーワード入力フィールド
- 「検索」ボタン
- 検索結果の一覧表示
- 各文献の「追加」ボタン
- 追加済み文献の一覧
- 文献の削除機能
- 手動で文献を追加する機能

デザイン:
- 検索結果と追加済み文献を並べて表示
- ドラッグ&ドロップで並び替え可能
```

**ファイル**: `components/ReferenceManager.tsx`

---

## フェーズ10: テストとデバッグ(6日目)

### ステップ10.1: 単体テストの作成

**Cursorへの指示**:

```
Jestとtesting-libraryを使用して、主要コンポーネントの単体テストを作成してください。

テスト対象:
- components/FileUpload.tsx
- components/ProgressBar.tsx
- lib/docx/generator.ts
- lib/dify/client.ts

テストケース:
- 正常系: 期待通りの動作
- 異常系: エラーハンドリング
- エッジケース: 境界値
```

### ステップ10.2: E2Eテストの作成

**Cursorへの指示**:

```
Playwrightを使用して、主要フローのE2Eテストを作成してください。

テストシナリオ:
1. ユーザー登録→ログイン
2. 新規レポート作成→ファイルアップロード→生成→ダウンロード
3. レポート一覧→詳細→削除
4. サブスクリプション購入(テストモード)

実行コマンド:
npm run test:e2e
```

### ステップ10.3: バグ修正とリファクタリング

**Cursorへの指示**:

```
テストで発見されたバグを修正してください。
また、コードの重複や複雑な部分をリファクタリングしてください。

重点項目:
- エラーハンドリングの強化
- ローディング状態の適切な管理
- レスポンシブデザインの確認
- アクセシビリティの改善
```

---

## フェーズ11: デプロイと運用設定(7日目)

### ステップ11.1: Vercelへのデプロイ

**手動作業**:

1. [Vercel](https://vercel.com)にログイン

1. 「New Project」をクリック

1. GitHubリポジトリを接続

1. 環境変数を設定:
  - NEXT_PUBLIC_SUPABASE_URL
  - NEXT_PUBLIC_SUPABASE_ANON_KEY
  - SUPABASE_SERVICE_ROLE_KEY
  - NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  - STRIPE_SECRET_KEY
  - STRIPE_WEBHOOK_SECRET
  - DIFY_API_KEY
  - DIFY_API_URL
  - NEXT_PUBLIC_APP_URL

1. 「Deploy」をクリック

### ステップ11.2: Stripe Webhookの設定

**手動作業**:

1. Stripe Dashboardで「開発者」→「Webhook」

1. 「エンドポイントを追加」

1. URL: `https://your-domain.vercel.app/api/stripe/webhook`

1. イベントを選択:
  - checkout.session.completed
  - customer.subscription.deleted
  - customer.subscription.updated

1. Webhook署名シークレットを`.env.local`と Vercelの環境変数に追加

### ステップ11.3: カスタムドメインの設定

**手動作業**:

1. Vercelの「Settings」→「Domains」

1. カスタムドメインを追加

1. DNSレコードを設定

1. SSL証明書の自動発行を確認

### ステップ11.4: エラー監視の設定

**Cursorへの指示**:

```
Sentryを統合して、エラーを自動的に追跡してください。

手順:
1. @sentry/nextjsをインストール
2. sentry.client.config.tsとsentry.server.config.tsを作成
3. next.config.jsにSentryの設定を追加
4. エラー発生時にSentryに送信

環境変数:
- NEXT_PUBLIC_SENTRY_DSN
```

---

## フェーズ12: ドキュメントと最終確認(7日目)

### ステップ12.1: README.mdの作成

**Cursorへの指示**:

```
プロジェクトルートにREADME.mdを作成してください。

内容:
- プロジェクト概要
- 技術スタック
- セットアップ手順
- 環境変数の説明
- 開発コマンド
- デプロイ手順
- ライセンス
```

**ファイル**: `README.md`

### ステップ12.2: API仕様書の作成

**Cursorへの指示**:

```
docs/API.mdを作成し、全てのAPIエンドポイントを文書化してください。

各エンドポイントの情報:
- メソッドとパス
- 認証要否
- リクエストパラメータ
- リクエストボディ
- レスポンス形式
- エラーレスポンス
- 使用例
```

**ファイル**: `docs/API.md`

### ステップ12.3: 最終動作確認

**チェックリスト**:

- [ ] ユーザー登録・ログインが正常に動作

- [ ] ファイルアップロードが正常に動作

- [ ] Dify APIとの連携が正常に動作

- [ ] Word文書が正しく生成される

- [ ] レポート一覧・詳細が正常に表示

- [ ] Stripe決済が正常に動作

- [ ] Webhookが正常に受信される

- [ ] レスポンシブデザインが適切

- [ ] エラーハンドリングが適切

- [ ] パフォーマンスが良好(Lighthouse スコア80以上)

---

## 開発のベストプラクティス

### Cursorの効果的な使い方

1. **明確な指示**: 「〜を作成してください」と具体的に指示

1. **段階的な開発**: 一度に全てを作らず、機能ごとに分割

1. **コンテキストの提供**: 関連するファイルを開いた状態で指示

1. **レビューと修正**: 生成されたコードを必ずレビューし、必要に応じて修正を依頼

### コミット規約

```
feat: 新機能
fix: バグ修正
docs: ドキュメント
style: フォーマット
refactor: リファクタリング
test: テスト
chore: その他

例: feat: ファイルアップロード機能を実装
```

### ブランチ戦略

- `main`: 本番環境

- `develop`: 開発環境

- `feature/*`: 機能開発

- `fix/*`: バグ修正

---

## トラブルシューティング

### よくある問題と解決方法

**問題1: Supabase接続エラー**

- 環境変数が正しく設定されているか確認

- Supabaseプロジェクトが起動しているか確認

**問題2: Stripe Webhookが動作しない**

- Webhook署名シークレットが正しいか確認

- VercelのログでWebhookリクエストを確認

**問題3: Word文書生成エラー**

- docxパッケージのバージョンを確認

- テンプレートデータの形式が正しいか確認

**問題4: ファイルアップロードが遅い**

- ファイルサイズを確認

- Supabase Storageのリージョンを確認

---

## まとめ

この手順書に従って開発を進めることで、7日間で実験レポート自動化ツールのMVP(Minimum Viable Product)を完成させることができます。

**開発スケジュール**:

- 1日目: プロジェクトセットアップ、データベース設計

- 2日目: 認証機能、ダッシュボード

- 3日目: ファイルアップロード

- 4日目: Dify連携、レポート生成

- 5日目: Stripe課金、参考文献検索

- 6日目: テストとデバッグ

- 7日目: デプロイと最終確認

各ステップをCursorに指示しながら、着実に開発を進めてください。不明点があれば、この手順書を参照しながら進めることをお勧めします。

以上
