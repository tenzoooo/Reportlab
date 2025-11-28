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
- **キー**: `NEXT_PUBLIC_STRIPE_PRICE_ID_CREDITS`
- **値**: クレジット定期購入（サブスク）のPrice ID
- **キー**: `STRIPE_PRICE_ID_CREDITS`（任意）
- **値**: サーバー側でも同じIDを参照したい場合にセット（クレジット定期購入）。未設定でも動作します。
- **キー**: `STRIPE_PRICE_ID_CREDIT_PACK`
- **値**: 100クレジット単位で購入する際のPrice ID（Checkout用・サーバーのみ）。**必ず one_time のPrice ID を指定**してください。
- **キー**: `NEXT_PUBLIC_STRIPE_PRICE_ID_CREDIT_PACK`（任意）
- **値**: UIで参照したい場合のみ設定。非公開でも動作しますが、環境変数を共有したい場合に使います。
- **キー**: `CREDITS_PER_UNIT` / `NEXT_PUBLIC_CREDITS_PER_UNIT`
- **値**: 1パックあたりの付与クレジット数（デフォルト100）。バックエンドとフロントで同じ値をセットしてください。
- **キー**: `STRIPE_SUCCESS_URL`（任意）
- **値**: 決済成功時のリダイレクト先URL（例: `https://your-project.vercel.app/dashboard/settings?tab=subscription&success=credits`）。クレジット購入のトーストを出したい場合は `success=credits` を付与してください。
    - *注*: コード内では `NEXT_PUBLIC_BASE_URL` を基に自動生成しているため、必須ではありませんが、明示的に指定したい場合は設定してください。

### 5. AI設定
AI機能（OpenAI）に必要です。
- **キー**: `OPENAI_API_KEY`
- **値**: OpenAIのAPIキー（`sk-...`）

> [!NOTE]
> 以前のDify設定（`DIFY_API_URL`, `DIFY_API_KEY`）は不要になりました。

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
