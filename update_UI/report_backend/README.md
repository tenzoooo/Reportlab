# report_backend (MVP)

## MVP: PDF + Excel → 実験1ページ（JSON + DOCX）

MVPモードは `mode=mvp` で、次を最小で行います:
- PDFの「実験方法」から実験ユニット抽出 → LLMで「最初の実験」を1つ選定
- Excel(.xlsx/.xlsm)から結果表を1つ選択（チャート参照を優先、なければ数値ブロック候補から選ぶ）
- 表をDOCXに差し込み、表から簡易グラフPNGを生成して図として差し込み
- 上記の内容をすべて含むMarkdownを生成し、そのMarkdownからDOCXを生成（テンプレ不要）
- 生成過程は `state.mvp` と snapshots に残る（デバッグ重視）

## API（FastAPI）

1) Job作成（PDFアップロード）
- `POST /jobs`（multipart: `pdf`）

2) Excelアップロード
- `POST /jobs/{job_id}/excel`（multipart: `excel`）

3) 実行
- `POST /jobs/{job_id}/run?mode=mvp`

4) JSON取得（デバッグ）
- `GET /jobs/{job_id}` もしくは `GET /jobs/{job_id}/intermediate`

5) DOCX取得
- `GET /jobs/{job_id}/artifact`

6) Markdown取得
- `GET /jobs/{job_id}/artifact/markdown`

## デバッグの見どころ

- `update_UI/report_backend/.agent_data/jobs/{job_id}/snapshots/*` に各ノードのstateスナップショット
- `state.mvp` に「最初の実験」選定理由、Excelの選択（sheet/range or chart）、抽出表markdown等
