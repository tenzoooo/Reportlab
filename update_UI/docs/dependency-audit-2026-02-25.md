# Dependency Audit (2026-02-25)

## Scope

- Target: `update_UI` (Next.js app) and `update_UI/report_backend` (FastAPI + LangGraph runtime modules).
- Excluded from analysis: `node_modules`, `.next`, virtualenvs, tests, cache folders, and archive code.
- Method: static import-graph scan + endpoint call-chain inspection.

## Runtime Chain (Current)

1. Browser pages/components call Supabase directly and/or call `/api/*` routes.
2. Next route handlers call Supabase server clients and (for report flows) `lib/server/report-agent.ts`.
3. `report-agent.ts` orchestrates:
   - Supabase `reports` / `experiment_data` tables
   - Supabase Storage bucket `experiment-files`
   - Report backend HTTP (`/jobs`, `/jobs/{id}/...`, `/render`)
4. FastAPI `routes_jobs.py` builds/invokes LangGraph via `graph.build_graph`.
5. `graph.build_graph` defaults to `update_mvp` and dispatches to `graph.update_mvp_flow.build_graph_update_mvp_flow`.

Reference path anchors:
- `next.config.mjs:9`
- `app/api/reports/generate/route.ts:5`
- `lib/server/report-agent.ts:924`
- `report_backend/app/api/routes_jobs.py:820`
- `report_backend/graph/build_graph.py:63`
- `report_backend/graph/update_mvp_flow/build_graph_update_mvp_flow.py:55`

## Frontend Import Graph Summary

- Files scanned: `151`
- Internal edges: `262`
- Detected cycles: `0`

### Bucket Edge Hotspots (edge count)

- `components/ui -> lib/utils.ts`: `51`
- `app/dashboard -> components/ui`: `23`
- `components/ui -> components/ui`: `22`
- `app/api/reports -> lib/server`: `15`
- `app/api/reports -> lib/supabase`: `11`

### UI-to-Data-Link Direct Imports

UI pages import data-link helpers directly (instead of app-service layer):

- `app/dashboard/layout.tsx` -> `@/lib/supabase/client`
- `app/dashboard/page.tsx` -> `@/lib/supabase/client`
- `app/dashboard/settings/page.tsx` -> `@/lib/supabase/client`
- `app/dashboard/profile/page.tsx` -> `@/lib/supabase/client`
- `app/dashboard/reports/page.tsx` -> `@/lib/supabase/client`, `@/lib/storage/get-file-url`
- `app/dashboard/reports/new/page.tsx` -> `@/lib/supabase/client`
- `app/dashboard/reports/[id]/page.tsx` -> `@/lib/supabase/client`, `@/lib/storage/get-file-url`
- `app/(auth)/register/page.tsx` -> `@/lib/supabase/client`
- `app/(auth)/update-password/page.tsx` -> `@/lib/supabase/client`
- `app/(auth)/forgot-password/page.tsx` -> `@/lib/supabase/client`
- `app/(auth)/login/page.tsx` -> `@/lib/supabase/client`
- `app/help/email/page.tsx` -> `@/lib/supabase/client`

### Large Frontend Files (line count)

- `app/dashboard/reports/new/page.tsx`: `1848`
- `app/dashboard/settings/page.tsx`: `999`
- `app/dashboard/reports/[id]/page.tsx`: `841`
- `app/dashboard/reports/page.tsx`: `430`

## Next API Route Coupling and Duplication

### Repeated auth helper

`getUserId(request)` is duplicated across at least 8 report route files:

- `app/api/reports/generate/route.ts:15`
- `app/api/reports/prepare/route.ts:15`
- `app/api/reports/extract/route.ts:15`
- `app/api/reports/[id]/analysis/route.ts:57`
- `app/api/reports/[id]/analysis/quant-comment/route.ts:17`
- `app/api/reports/[id]/agent-progress/route.ts:59`
- `app/api/reports/[id]/diagnostics/route.ts:10`
- `app/api/reports/[id]/experimental-results/stream/route.ts:23`

### Near-duplicate endpoints

Normalized text similarity:

- `extract/route.ts` <-> `generate/route.ts`: `0.975`
- `generate/route.ts` <-> `prepare/route.ts`: `0.899`
- `regenerate/from-cache/route.ts` <-> `regenerate/from-json/route.ts`: `0.933`

## `lib/server/report-agent.ts` as Orchestration Hub

- Main exported flows:
  - `runReportAgentFromSupabaseReport(...)` at `:924`
  - `prepareReportAgentFromSupabaseReport(...)` at `:1178`
  - `renderReportFromSupabaseAnalysis(...)` at `:1540`
- File handles many concerns in one module:
  - report ownership checks / status transitions
  - Supabase storage download/upload
  - conversion and upload of image/excel/table/past-report assets
  - backend API orchestration (`/jobs`, `/run`, `/intermediate`, `/artifact`, `/render`)
  - progress polling and persistence
  - analysis fallback shaping and relabeling

This is a central dependency hub and high-change-risk file.

## Backend Import Graph Summary (`report_backend` runtime code)

- Modules scanned: `247`
- Internal edges: `603`
- Detected cycles: `0`

### Fan-in hotspots

- `graph/state.py`: `148`
- `llm/client.py`: `63`
- `core/storage.py`: `59`
- `models/contracts.py`: `40`

### Fan-out hotspots

- `graph/build_graph.py`: `52`
- `llm/client.py`: `41`
- `graph/nodes/run_d_to_i_per_experiment.py`: `20`
- `graph/update_mvp_flow/nodes.py`: `15`
- `app/api/routes_jobs.py`: `10`

## Backend Layer Entanglement

### `routes_jobs.py` is broad

- Single file, `984` lines, `20` endpoints.
- Imports from `core`, `graph`, `llm`, `models`, and `templating` directly.
- Mixed concerns: HTTP transport, OCR helper, render endpoint, job lifecycle, graph invocation.

Path anchors:
- `report_backend/app/api/routes_jobs.py:1`
- `report_backend/app/api/routes_jobs.py:275`
- `report_backend/app/api/routes_jobs.py:656`
- `report_backend/app/api/routes_jobs.py:820`

### `graph/build_graph.py` imports legacy + current trees eagerly

- Top-level imports include many `graph.nodes*` and `graph.nodes_legacy*` modules.
- Runtime mode default immediately returns `build_graph_update_mvp(...)`.

Path anchors:
- `report_backend/graph/build_graph.py:10`
- `report_backend/graph/build_graph.py:63`
- `report_backend/graph/build_graph.py:68`

### Wrapper layer inside `graph/update_mvp`

- Detected pass-through wrapper files: `41`
- Pattern: thin re-export from `graph.nodes.*` or `graph.update_mvp.a_reiya.*`

Example:
- wrapper: `graph/update_mvp/B_reiya/map_result_numbers.py:3`
- implementation: `graph/nodes/map_result_numbers.py:5`

Also:
- wrapper: `graph/update_mvp/session_start.py:3`
- implementation: `graph/update_mvp/a_reiya/session_start.py:8`

This adds depth to dependency paths without adding behavior.

### Layer-risk edges

- `core/jobs.py` imports `graph.state` (`core -> graph`)
- `app/api/routes_jobs.py` imports `graph.build_graph` and `graph.state` (`api -> graph`)

## Cross-Service Boundary Notes

- Next rewrite sends `/api/:path((?!stripe).*)` to `NEXT_PUBLIC_BACKEND_URL` when set.
  - `next.config.mjs:9`
- Some pages call relative `/api/...`; others call `${NEXT_PUBLIC_BACKEND_URL}/api/...` explicitly.
  - `app/dashboard/reports/page.tsx:137`
  - `app/dashboard/reports/new/page.tsx:1403`
  - `app/dashboard/reports/[id]/page.tsx:256`
- `REPORT_AGENT_URL` resolution is duplicated in multiple server routes + `report-agent.ts`.
  - `lib/server/report-agent.ts:99`
  - `app/api/reports/[id]/agent-progress/route.ts:17`
  - `app/api/reports/[id]/diagnostics/route.ts:28`
  - `app/api/reports/[id]/experimental-results/stream/route.ts:18`

## Spaghetti Indicators (Dependency View)

1. Duplicate flows across route handlers and orchestrators.
2. Multiple thin wrapper layers in backend graph modules.
3. Very large hub files with mixed transport/business/integration concerns.
4. UI layer reaching directly into data-link modules in many pages.
5. Boundary config/path resolution duplicated across many files.

## Suggested First Refactor Cuts (Dependency-First)

1. Extract report route shared auth + report ownership check into one server utility.
2. Split `lib/server/report-agent.ts` into:
   - `report-agent-inputs.ts`
   - `report-agent-runner.ts`
   - `report-agent-artifacts.ts`
3. Collapse `graph/update_mvp` wrappers by importing implementations directly from one canonical namespace.
4. Move graph module imports in `graph/build_graph.py` to lazy imports by mode.
5. Add one app-service layer for UI pages (`lib/application/reports/*`) and stop direct UI imports from `lib/supabase` / `lib/storage`.
