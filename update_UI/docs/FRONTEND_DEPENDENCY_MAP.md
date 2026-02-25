# Frontend Dependency Map

最終更新日: 2026-02-25
対象: `update_UI` のブラウザ実行層（`app/**`, `components/**`, `lib/**` のフロント利用部）

---

## 1. 境界

- Frontend本体: App Router の Page/Layout と UI Components
- 直接依存先:
  - Supabase Browser Client (`lib/supabase/client.ts`)
  - Next API Routes (`/api/**`)
  - 署名URLヘルパ (`lib/storage/get-file-url.ts`)

```mermaid
flowchart LR
  Page[app/**/page.tsx] --> Comp[components/**]
  Page --> SupaClient[lib/supabase/client.ts]
  Page --> API[/api/**]
  API --> NextServer[Next.js Server Routes]
```

---

## 2. ルート構成（UI）

### 認証

- `/login` -> `app/(auth)/login/page.tsx`
- `/register` -> `app/(auth)/register/page.tsx`
- `/forgot-password` -> `app/(auth)/forgot-password/page.tsx`
- `/update-password` -> `app/(auth)/update-password/page.tsx`

### ダッシュボード

- `/dashboard` -> `app/dashboard/page.tsx`
- `/dashboard/reports` -> `app/dashboard/reports/page.tsx`
- `/dashboard/reports/new` -> `app/dashboard/reports/new/page.tsx`
- `/dashboard/reports/[id]` -> `app/dashboard/reports/[id]/page.tsx`
- `/dashboard/settings` -> `app/dashboard/settings/page.tsx`
- `/dashboard/profile` -> `app/dashboard/profile/page.tsx`
- `/dashboard/notifications` -> `app/dashboard/notifications/page.tsx`
- `/dashboard/template-playground` -> `app/dashboard/template-playground/page.tsx`

### その他

- `/feedback` -> `app/feedback/page.tsx`
- `/help` -> `app/help/page.tsx`
- `/help/faq` -> `app/help/faq/page.tsx`
- `/help/email` -> `app/help/email/page.tsx`

---

## 3. 画面ごとの主依存

| 画面 | 主な依存 | 主な外部呼び先 |
|---|---|---|
| `dashboard/layout.tsx` | `createClient`, `SearchDialog`, `NotificationPanel` | Supabase `profiles`, RPC `get_storage_usage`, `/api/stripe/create-customer` |
| `dashboard/reports/new/page.tsx` | `createClient`, `ReportGenerationLiveView` | Supabase `reports`/`experiment_data`/Storage, `/api/reports/generate`, `/api/reports/cancel`, `/api/reports/{id}/agent-progress` |
| `dashboard/reports/[id]/page.tsx` | `createClient`, `getFileUrl`, `ReportGenerationLiveView` | Supabase `reports`/`experiment_data`, `/api/reports/generate`, `/api/reports/cancel`, `/api/reports/regenerate/from-json`, `/api/reports/{id}/agent-progress` |
| `dashboard/reports/page.tsx` | `createClient`, `getFileUrl` | Supabase `reports`, `/api/reports/regenerate/from-cache` |
| `dashboard/settings/page.tsx` | `createClient`, `useTheme` | Supabase `profiles`/`subscriptions`, `/api/stripe/*` |
| `dashboard/notifications/page.tsx` | Fetch only | `/api/notifications` |
| `feedback/page.tsx` | Fetch only | `/api/feedback` |
| `components/experimental-results-stream.tsx` | Fetch only | `/api/reports/{id}/experimental-results/stream`, `/api/reports/{id}/analysis` |

---

## 4. Frontendが叩く Next API 一覧

### Reports系

- `POST /api/reports/generate`
- `POST /api/reports/prepare`
- `POST /api/reports/extract`
- `POST /api/reports/regenerate/from-cache`
- `POST /api/reports/regenerate/from-json`
- `POST /api/reports/cancel`
- `GET /api/reports/{id}/analysis`
- `PUT /api/reports/{id}/analysis`
- `POST /api/reports/{id}/analysis/quant-comment`
- `GET /api/reports/{id}/agent-progress`
- `POST /api/reports/{id}/experimental-results/stream`
- `GET /api/reports/{id}/diagnostics`

### Stripe/その他

- `POST /api/stripe/checkout`
- `POST /api/stripe/create-checkout-session`
- `POST /api/stripe/create-customer`
- `POST /api/stripe/portal`
- `POST /api/stripe/cancel-subscription`
- `POST /api/stripe/resume-subscription`
- `POST /api/feedback`
- `GET /api/notifications`

---

## 5. 共有ライブラリ依存

| モジュール | 役割 | 依存先 |
|---|---|---|
| `lib/supabase/client.ts` | ブラウザ用 Supabase クライアント | `@supabase/ssr`, `fetch`, `localStorage` |
| `lib/supabase/server.ts` | サーバー用 Supabase クライアント | `@supabase/ssr`, `@supabase/supabase-js`, `cookies()` |
| `lib/supabase/middleware.ts` | 認証セッション更新 | `createServerClient`, Next middleware cookies |
| `lib/storage/get-file-url.ts` | Storage 署名URL生成 | Supabase Storage bucket `experiment-files` |

---

## 6. フロントの高変更リスク箇所

- `app/dashboard/reports/new/page.tsx`（大規模・アップロード/進捗/生成が集中）
- `app/dashboard/settings/page.tsx`（課金/購読/テーマ/プロフィールが集中）
- `app/dashboard/reports/[id]/page.tsx`（状態遷移と生成操作が集中）

---

## 7. 更新ルール（Frontend）

次の変更があったらこのファイルを更新すること。

1. `app/**/page.tsx` の追加・削除
2. 画面から叩く `/api/**` の追加・変更
3. 画面からの Supabase 直接アクセス先テーブル変更
4. `lib/supabase/*` と `lib/storage/get-file-url.ts` の責務変更
5. 大規模ページの分割や責務変更

更新時の最小作業:

1. このファイルの「最終更新日」を更新
2. 「画面ごとの主依存」と「API一覧」の該当行を更新
3. 影響パスを `docs/PROGRAM_DEFINITION.md` 側にも反映

