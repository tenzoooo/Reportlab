# Vercel 環境変数設定ガイド

Vercelにデプロイする際は、**Project Settings > Environment Variables** セクションで以下の環境変数を設定する必要があります。

## 必須の変数

### 1. Base URL
Stripeのリダイレクトや内部API呼び出しに使用されます。
- **キー**: `NEXT_PUBLIC_BASE_URL`
- **値**: VercelのデプロイURL（例: `https://your-project.vercel.app`）
    - *注*: Previewデプロイの場合は相対パスに依存することも可能ですが、Stripeは絶対URLを要求します。本番環境（Production）では、カスタムドメインまたは本番URLを設定してください。

### 2. Backend URL
フロントエンドがAPIルートを呼び出すために使用します。
- **キー**: `NEXT_PUBLIC_BACKEND_URL`
- **値**: Base URLと同じ（例: `https://your-project.vercel.app`）

### 3. Supabase設定
データベースアクセスと認証に必要です。
- **キー**: `NEXT_PUBLIC_SUPABASE_URL`
- **値**: あなたのSupabaseプロジェクトURL
- **キー**: `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **値**: あなたのSupabase Anon Key
- **キー**: `SUPABASE_SERVICE_ROLE_KEY`
- **値**: あなたのSupabase Service Role Key（これは秘密情報です！NEXT_PUBLICを付けないでください）

### 4. Stripe設定
決済機能に必要です。
- **キー**: `STRIPE_SECRET_KEY`
- **値**: StripeのSecret Key（本番モード用）
- **キー**: `STRIPE_WEBHOOK_SECRET`
- **値**: StripeのWebhook Secret（本番モード用）
- **キー**: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- **値**: StripeのPublishable Key（本番モード用）
- **キー**: `NEXT_PUBLIC_STRIPE_PRICE_ID_PREMIUM`
- **値**: Stripe本番環境でのPremiumプランのPrice ID

## システム変数（自動設定）
Vercelが自動的に設定するため、手動で追加する**必要はありません**：
- `VERCEL`: "1"
- `VERCEL_URL`: 現在のデプロイのドメイン（例: `project-git-branch-user.vercel.app`）。
    - *注*: `VERCEL_URL` には `https://` が含まれていません。コード側でこれを処理していますが、明示的な設定として `NEXT_PUBLIC_BASE_URL` の使用を推奨します。

## 推奨事項
現在コード内で使用されている `localhost` のURL（例: `http://localhost:3000`）については、環境変数が設定されていない場合のフォールバックとして機能するように実装されています。

```typescript
const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"
```

そのため、Vercel側で `NEXT_PUBLIC_BASE_URL` を設定するだけで、自動的に `localhost` の設定が上書きされ、本番URLが使用されるようになります。
