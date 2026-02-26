# Cleanup candidates (no source removal)
List of files and directories that look safe to delete or regenerate. They are either build artifacts, local environments, AI-agent leftovers, or generated outputs; removing them should not affect the maintained source.

## High-confidence (recreated on install/build)
- `node_modules/` (root) — installs only `next-sitemap`/`stripe`; reinstall via `npm ci`.
- `update_UI/node_modules/` — recreated by `pnpm install` or `npm install`.
- `update_UI/.next/` — Next.js build cache/output.
- `update_UI/.venv/`, `.venv/` (root) — local Python virtualenvs.
- `update_UI/__pycache__/` — Python bytecode cache.
- `update_UI/tsconfig.tsbuildinfo` — TypeScript incremental cache.

## AI/agent tooling artifacts
- `update_UI/.agent/`, `update_UI/.agent_data/` — local agent workflows and job logs.
- `update_UI/report_backend/.agent_data/` — 538 MB of agent run outputs.
- `workflow.yml` (repo root) — Dify/LLM workflow spec; drop if the hosted agent is no longer used.
- `extract_docx.py` — helper that reads an agent artifact under `.agent_data`; safe to remove with the artifacts.

## Generated reports and images (safe to drop)
- `update_UI/Generated Image December 02, 2025 - 6_56PM.jpeg`
- `update_UI/report.docx`, `update_UI/report_fixed.docx`, `update_UI/report.md`, `update_UI/report_fixed.md`
- `update_UI/review.json`, `update_UI/reviewed.md`, `update_UI/raw.md`, `update_UI/test.pdf`, `update_UI/manual.pdf`
- `update_UI/report_backend/workspaces/replay/**` if only used for agent output playback.

## Large optional binaries
- `update_UI/stripe` (22 MB CLI binary) and `update_UI/stripe.tar.gz` — remove if Stripe CLI is not run locally.
- Root-level PDFs/Excel used as sample data only (e.g., `共振回路_2023.pdf`, `実験指導書_バイポーラトランジスタの静特性_2024年度版.pdf`, `利用規約.pdf`, `利用規約.txt`, `定義書一覧/`); delete if not needed as fixtures.
- `update_UI/バイポーラトランジスタの静特性.xlsx` — sample sheet, not referenced in code.

## One-off inventory files
- `filelist.txt` — 11k-line file inventory dump.
- `update_UI/components.json` if Vercel builder metadata is unused.

## Verification
After deletion, run:
- `du -sh node_modules update_UI/node_modules update_UI/.next update_UI/.agent_data update_UI/report_backend/.agent_data` to confirm space reclaimed.
- `npm ci && cd update_UI && pnpm install && pnpm lint` to ensure reinstall/build still works when needed.
