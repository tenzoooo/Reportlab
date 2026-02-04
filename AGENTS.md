# AGENTS.md — Codex向け設計書

## 目的
- Codexがこのリポジトリで作業する際の役割、編集可能範囲、コーディング規約を共有し、迷いなく安全に実装できるようにする。
- 変更前に構成・要件を参照するドキュメント: `update_UI/定義書.md`（フロント構成）、`update_UI/codex指示書`（レポートエージェント要件）、`update_UI/VERCEL_ENV_VARS.md`（環境変数）。

## Codexの役割
- Next.jsフロント（`update_UI`）と FastAPI + LangGraph バックエンド（`update_UI/report_backend`）のペアエンジニア。小さな差分で安全に改善する。
- 既存要件を崩さないリファクタとバグ修正を優先し、新規実装は上記ドキュメントの制約を必ず踏まえる。
- LLM・テンプレート周りは「すべてのLLM出力をJSON化」「caption 15文字以内」「description_briefは方法→結果の2部構成」など、`update_UI/codex指示書`の強制事項を守る。

## 触っていい範囲
- 変更可（主要コード）: `update_UI/app/**`, `update_UI/components/**`, `update_UI/hooks/**`, `update_UI/lib/**`, `update_UI/styles/**`, `update_UI/report_backend/{app,core,graph,llm,models,templating,templates,tests,workspaces}/**`, `update_UI/scripts/**`, `lib/**`.
- 参照のみ原則: `update_UI/定義書.md`, `update_UI/VERCEL_ENV_VARS.md`, `update_UI/codex指示書`, `update_UI/templates/*.docx`（内容を変える場合は理由を明記）、`report_fixed*.{md,docx}`（成果物）。
- 触らない/破壊禁止: `update_UI/node_modules`, `update_UI/.next`, 各種`.pdf`/`.xlsx`/`.tar.gz`/`.docx`バイナリ、`共振回路_2023.pdf`など資料系。不要な削除やlargeファイル更新を避ける。

## コーディング規約
### 共通
- 既存の型/関数を再利用し、型注釈とエラーハンドリングを明示する。意味のある1行コメントのみ（複雑な処理の前後）で、冗長な説明は避ける。
- 秘密情報は環境変数で扱う。新しい設定は `update_UI/VERCEL_ENV_VARS.md` に追記する。
- テストやlintを可能な範囲で実行する（例: `cd update_UI && npm run lint`、`cd update_UI/report_backend && pytest`）。実行できない場合は理由と推奨コマンドを記載。

### フロントエンド（Next.js 16 / React 19 / Tailwind v4）
- App Router前提。クライアントコンポーネントは先頭に`"use client"`を置く。`@/`エイリアスと `@/lib/utils` の`cn`を使ってクラス結合する。
- UIはshadcn/Radixベース（`@/components/ui/*`）を優先し、スタイルは `app/globals.css` のトークン・ユーティリティを流用。インラインスタイルや魔法数は避け、必要ならCSS変数を追加。
- 文言は原則日本語で統一し、APIキーやURLを直書きしない。データ取得や副作用は`useEffect`/`useState`など標準Hooksを用い、Promiseは`async/await`で扱う。
- ルート構成やファイル配置は `update_UI/定義書.md` に従い、新規ページ/コンポーネント追加時は該当セクションのルールに合わせる。

### バックエンド（FastAPI + LangGraph + docxtpl）
- Pythonは型ヒント必須。設定は`core.config.load_settings`経由で取得し、Path/環境変数の解決ロジックに合わせる。ストレージは`core.storage.Storage`インターフェース経由で扱う。
- Graphノードは`graph/state.py`の構造と`JobStatus`に従い、副作用はStorage/LLMクライアントに閉じ込める。LLM呼び出しは`llm.client.LLMClient`を通し、出力JSONをスキーマで検証する。
- テンプレ/レンダリングは`templating/renderer.py`・`templates/chapter_fixed_docxtpl_ready.docx`を前提に、フィルタの追加は`templating/filters.py`へ。テンプレ本体を変える場合は理由と差分を明示。
- `update_UI/codex指示書`の制約（caption長、description_brief追記、belongs_toスコア保持、中間JSON保存など）を壊す変更は禁止。再試行/バリデーションは`graph/nodes/validate.py`系の方針に合わせる。

### API/インテグレーション
- フロント⇔エージェント間は `REPORT_AGENT_URL`/`REPORT_GENERATION_MODE` で接続/モックを切替。URLやトークンは必ず環境変数化し、デフォルト`localhost`フォールバックは残す。
- Supabase/Stripe設定は `update_UI/VERCEL_ENV_VARS.md` のキー名を踏襲し、互換性のため既存の公開環境変数を削らない。

## 作業の流儀
- 影響範囲が小さい差分を心がけ、関連ドキュメントやテストの更新を忘れない。
- 既存ファイルを読む前にディレクトリガイド（`update_UI/定義書.md`）を確認し、ファイルの意図を外さないようにする。
- 迷ったときは `update_UI/codex指示書` の要件優先で判断し、逸脱が必要な場合は理由を記述したうえで最小限の変更に留める。
## Language
- All explanations, reviews, and summaries must be written in Japanese.
- Do not use English unless explicitly requested.
- Use technical Japanese appropriate for a university-level engineering project.
-ターミナル上では日本語を使いなさい。

