# 不要物リスト（削除候補の指針）
ソースを壊さず再生成できるもの、AIエージェント残渣、生成済み成果物のみを列挙します。ここに挙げたものは削除してもビルドやアプリの再構築で再生成できます。

## 再生成可能（安全度高）
- `node_modules/`（ルート）: `npm ci` で再生成。
- `update_UI/node_modules/`: `pnpm install` または `npm install` で再生成。
- `update_UI/.next/`: Next.js ビルドキャッシュ。
- `update_UI/.venv/`, `.venv/`（ルート）: ローカル仮想環境。
- `update_UI/__pycache__/`: Python バイトコード。
- `update_UI/tsconfig.tsbuildinfo`: TypeScript 増分キャッシュ。

## AI/エージェント系の残骸
- `update_UI/.agent/`, `update_UI/.agent_data/`: エージェントワークフローとジョブログ。
- `update_UI/report_backend/.agent_data/`: 538MB のエージェント出力。
- `workflow.yml`（リポジトリ直下）: Dify/LLM ワークフロー定義。ホスト側エージェントを使わないなら削除可。
- `extract_docx.py`: `.agent_data` にある成果物読み取り専用。成果物を消すなら併せて削除可。

## 生成レポート・画像
- `update_UI/Generated Image December 02, 2025 - 6_56PM.jpeg`
- `update_UI/report.docx`, `update_UI/report_fixed.docx`, `update_UI/report.md`, `update_UI/report_fixed.md`
- `update_UI/review.json`, `update_UI/reviewed.md`, `update_UI/raw.md`, `update_UI/test.pdf`, `update_UI/manual.pdf`
- `update_UI/report_backend/workspaces/replay/**`（エージェント出力の再生用のみなら削除可）。

## 大きな任意バイナリ
- `update_UI/stripe`（約22MBのCLI）と `update_UI/stripe.tar.gz`: ローカルでStripe CLIを使わないなら削除。
- ルート直下のPDF/Excelサンプル（例: `共振回路_2023.pdf`, `実験指導書_バイポーラトランジスタの静特性_2024年度版.pdf`, `利用規約.pdf`, `利用規約.txt`, `定義書一覧/`）: フィクスチャ不要なら削除。
- `update_UI/バイポーラトランジスタの静特性.xlsx`: サンプルシート。コード参照なし。

## 単発の在庫ファイル
- `filelist.txt`: 1.1万行のファイルインベントリダンプ。
- `update_UI/components.json`: Vercel ビルダー用メタデータ。未使用なら削除。

## 削除後の確認コマンド
- 使用容量確認: `du -sh node_modules update_UI/node_modules update_UI/.next update_UI/.agent_data update_UI/report_backend/.agent_data`
- ビルド確認: `npm ci && cd update_UI && pnpm install && pnpm lint`
