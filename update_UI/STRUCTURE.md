# Reportlab Update UI レイヤリング方針

Next.js ベースの `update_UI` をプレゼンテーション層・アプリケーション層・データリンク層に分離し、UI を単純化しつつ外部統合を隔離するための指針。Python の `report_backend` は別サービスとして既に分離済み。

## レイヤー定義
- **プレゼンテーション（表示・構成のみ）:** `app/` のルート、`components/` の UI パーツ、`styles/` のスタイル、`public/` のアセット。Supabase/Stripe/ファイル I/O は直接呼ばず、型付きアプリケーションサービスだけを呼ぶ。
- **アプリケーション（ユースケース・オーケストレーション）:** ワークフローを調整し、ビジネスルールを実施する層。可能な限り純関数で、プレーンなデータや Result を返す。配置は新設の `lib/application/**`、サーバー専用の調整は `lib/server/**`、外部 I/O を持たない UI 向けヘルパー/フックもここに寄せる。
- **データリンク（統合境界）:** Supabase、Stripe、ストレージ、その他の I/O・プロセス副作用を一手に引き受ける。`lib/supabase/**`、`lib/storage/**`、`lib/stripe/**`、SDK ラッパーや fetch ラッパーをここにまとめ、アプリケーション層が消費する狭いインターフェースだけを公開する。

## 現状マッピング（暫定）
- プレゼンテーション: `app/`、`components/`、`styles/`、`public/`
- アプリケーション候補: `lib/utils.ts`（純ヘルパー）、`lib/server/report-agent.ts`（ユースケースにラップ可能）、UI 限定の `hooks/`
- データリンク: `lib/supabase/*`、`lib/storage/*`、`lib/stripe/client.ts`、Supabase/Stripe に触れている `app/api/**`

## 最小移行ステップ
1) **契約を定義:** ワークフローごとに薄いアプリケーションサービスを作り、React/Next をインポートせずにプレーンデータを受け取り `Promise<Result<T, E>>` などを返す。例: `lib/application/auth/reset-password.ts` で Supabase のリセットメール送信をラップ。
2) **コンポーネントから I/O を外出し:** React コンポーネント内の Supabase/Stripe 呼び出し（例: `app/(auth)/forgot-password/page.tsx`）をアプリケーションサービス呼び出しに置き換え、コンポーネントはデータ入出力と UI 状態管理に専念させる。
3) **データリンクを孤立:** SDK クライアントとクエリはデータリンク配下に留め、`app/` や `components/` からの逆参照を禁止。ビジネスロジックを持っていた API ルートは、アプリケーションサービスを呼ぶ薄い HTTP アダプタにする。
4) **境界を強制:** 許可される向きは `presentation -> application -> data-link` のみ。逆方向の import を禁止する。必要なら ESLint の import ルールやパスエイリアス（例: `@/application/...`, `@/data/supabase/...`）でエッジを明示する。

## 推奨フォルダ構成（漸進的・依存追加なし）
```
update_UI/
  app/                 # プレゼンテーション（ルート/レイアウト）
  components/          # プレゼンテーション（純 UI）
  styles/              # プレゼンテーション（スタイルトークン）
  lib/
    application/       # ユースケース（例: auth, reports, billing）
    server/            # サーバー専用オーケストレーション
    supabase/          # データリンク: クライアント・クエリ・型
    storage/           # データリンク: ストレージアダプタ
    stripe/            # データリンク: 課金アダプタ
    utils.ts           # 純ヘルパー（アプリ層で安全）
  app/api/**           # HTTP アダプタ（アプリ層を呼ぶ）
```

## リファクタ例（パスワードリセット）
- `lib/application/auth/reset-password.ts` を作り、`sendResetEmail(email: string, origin: string)` を公開。
- アプリケーションサービスが依存するデータリンクヘルパー内で `createClient()` を使う（未整備なら追加）。
- `app/(auth)/forgot-password/page.tsx` をこのサービス呼び出しに置き換え、コンポーネントは成功/失敗メッセージ管理のみにする。

この分離により、Supabase/Stripe の詳細を小さなインターフェース背後に隠し、ビューコードを整理できる。新規依存は不要。
