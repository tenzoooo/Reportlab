# レポート生成バックエンド（旧）で使用していた環境変数

このドキュメントは、レポート生成機能を作り直すために、削除した旧バックエンドが参照していた環境変数名を控えておくものです。**値は絶対にここへ書かず**、`.env.local` / Vercel の Environment Variables に設定してください。

## OpenAI
- `OPENAI_API_KEY`: OpenAI APIキー
- `OPENAI_MODEL`: 使用モデル（例: `gpt-4o-mini`）

## Python（ローカル実行/デバッグ）
- `PYTHON_BIN`: Python実行バイナリ（例: `python3`）
- `PYTHON_DEBUG`: `1` のときPython例外のtracebackをJSONに含める

## レポート生成（旧）実行モード
- `USE_REMOTE_PYTHON`: `true` のとき、ローカル実行ではなくサーバレス関数を叩く想定（旧）
- `DOCX_DEBUG`: `1` のとき DOCX生成のデバッグログを出す（旧）
- `ENABLE_DIFY_DEBUG_LOG`: `true` のとき解析結果のデバッグログを出す（旧）

## URL / Vercel
- `NEXT_PUBLIC_BASE_URL`: 内部API呼び出しのベースURL（例: `https://xxx.vercel.app`）
- `VERCEL`: Vercelが自動設定（例: `1`）
- `VERCEL_URL`: Vercelが自動設定（`https://` なしのドメイン）
- `VERCEL_PROTECTION_BYPASS_TOKEN` / `VERCEL_DEPLOYMENT_PROTECTION_BYPASS_TOKEN` / `VERCEL_BYPASS_TOKEN` / `VERCEL_AUTOMATION_BYPASS_SECRET`: Vercel保護回避用（必要時のみ）

## Supabase（旧バックエンドが依存）
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service Role Key（サーバ側専用）

## Feature flags（旧の画像割当）
- `ENABLE_IMAGE_GROUPING_WITH_METHOD_CONTEXT`: `true` のとき実験方法テキストを画像割当に利用（旧）

## LangSmith（デバッグ・トレース）
LangGraph のノード実行・OpenAI呼び出しを LangSmith に送って可視化するための設定です（ローカル実行向け）。
- `LANGSMITH_API_KEY`: LangSmith の API Key
- `LANGSMITH_TRACING`: `true` でトレース有効
- `LANGSMITH_PROJECT`: 任意（例: `report-agent-dev`）
- `LANGSMITH_ENDPOINT`: 任意（通常不要）

## 既存の設定ガイド
- `update_UI/VERCEL_ENV_VARS.md` に、StripeやSupabaseなど全体設定のガイドがあります。
