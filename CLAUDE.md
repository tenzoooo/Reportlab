# CLAUDE.md - Reportlab Project Guide

## Project Overview

Reportlab is an AI-powered report generation tool for science/engineering students. It converts experimental procedure PDFs and Excel data files into structured academic reports (DOCX format). The primary language for documentation and UI text is Japanese.

## Architecture

```
[Browser] → [Next.js Frontend (Vercel)] → [FastAPI Backend (Python)]
                  ↕                              ↕
           [Supabase DB/Auth]              [LangGraph Workflow]
           [Stripe Payments]               [OpenAI API]
           [OpenAI API]                    [PDF/Excel/DOCX Processing]
```

- **Frontend**: `update_UI/` — Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui
- **Backend**: `update_UI/report_backend/` — FastAPI, LangGraph, OpenAI, PyMuPDF, docxtpl
- **Database**: Supabase (PostgreSQL with RLS)
- **Payments**: Stripe (subscriptions + credit packs)
- **Deployment**: Vercel (frontend), standalone Uvicorn (backend)

## Frontend (update_UI/)

### Tech Stack
- Next.js 16.0.7, React 19.2.0, TypeScript 5
- Tailwind CSS 4.1.9 + shadcn/ui (Radix UI)
- Supabase SSR (`@supabase/ssr`) for auth
- Stripe SDK for payments
- pnpm as package manager

### 3-Layer Architecture (see STRUCTURE.md)
- **Presentation**: `app/`, `components/`, `styles/`, `public/` — no direct DB/API calls
- **Application**: `lib/application/`, `lib/server/`, `hooks/` — business logic, use cases
- **Data Link**: `lib/supabase/`, `lib/storage/`, `lib/stripe/` — external service adapters
- Dependency direction: `presentation → application → data-link` only

### Key Directories
```
update_UI/
├── app/                    # Next.js routes and API handlers
│   ├── (auth)/             # Login, register, forgot-password
│   ├── dashboard/          # Protected user pages
│   └── api/                # HTTP API routes
│       ├── reports/        # Report generation endpoints
│       └── stripe/         # Payment endpoints
├── components/             # React components
│   └── ui/                 # shadcn/ui base components
├── lib/
│   ├── application/        # Use cases (being built out)
│   ├── server/             # Server-side orchestration (report-agent.ts)
│   ├── supabase/           # DB client, auth middleware, types
│   ├── storage/            # File storage helpers
│   ├── stripe/             # Stripe client
│   └── utils.ts            # cn() tailwind merge helper
├── hooks/                  # React hooks (use-toast, use-mobile)
├── e2e/                    # Playwright tests
├── supabase/               # DB schema, migrations, SQL patches
├── middleware.ts            # Auth route protection
└── templates/              # DOCX templates
```

### Path Alias
`@/*` maps to `./update_UI/*` (see tsconfig.json)

### Commands
```bash
pnpm dev          # Start dev server
pnpm build        # Production build
pnpm lint         # ESLint
pnpm start        # Start production server
```

### API Route Rewrites
When `NEXT_PUBLIC_BACKEND_URL` is set, all `/api/*` routes (except `/api/stripe/*`) are proxied to the Python backend via Next.js rewrites.

## Backend (update_UI/report_backend/)

### Tech Stack
- Python 3.12, FastAPI, LangGraph (workflow DAG)
- OpenAI API (GPT-4o, GPT-4o-mini)
- PyMuPDF (PDF parsing), openpyxl (Excel), docxtpl (DOCX templating)
- pytest for testing

### Key Directories
```
report_backend/
├── app/                    # FastAPI app & route handlers
│   ├── main.py             # App factory
│   └── api/routes_jobs.py  # Job lifecycle endpoints
├── graph/                  # LangGraph workflow
│   ├── build_graph.py      # Graph construction
│   ├── state.py            # Pydantic state models (AgentState)
│   ├── nodes/              # ~71 processing nodes
│   └── update_mvp/         # MVP workflow variant
├── llm/
│   ├── client.py           # OpenAI wrapper with retry
│   ├── prompts/            # ~27 prompt templates
│   └── schemas/            # ~24 Pydantic response schemas
├── core/                   # Domain logic (PDF, Excel, storage, etc.)
├── models/contracts.py     # Data contracts (ImageAsset, TableAsset)
├── templating/renderer.py  # docxtpl + Jinja2 rendering
├── tools/                  # Utility functions
├── tests/                  # pytest tests (~29 files)
└── requirements.txt        # Python dependencies
```

### Commands
```bash
cd update_UI/report_backend
pip install -r requirements.txt
uvicorn app.main:app --reload       # Start dev server
pytest tests/                       # Run tests
```

## Database (Supabase)

### Core Tables
- `profiles` — user preferences, credit balance
- `subscriptions` — Stripe subscription state
- `credit_transactions` — credit spend/grant audit trail
- Row-Level Security (RLS) enforced: users only access own data

### Schema Files
- `update_UI/supabase/schema.sql`
- `update_UI/supabase/patch_increment_credits.sql`

## Environment Variables

### Frontend (.env.local in update_UI/)
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_STRIPE_PRICE_ID_PREMIUM
NEXT_PUBLIC_STRIPE_PRICE_ID_STANDARD
STRIPE_PRICE_ID_CREDIT_PACK
CREDITS_PER_UNIT
OPENAI_API_KEY
REPORT_AGENT_URL
REPORT_GENERATION_MODE          # mock | live
NEXT_PUBLIC_BASE_URL
NEXT_PUBLIC_BACKEND_URL         # Enables API rewrites to Python backend
```

### Backend (.env.local in report_backend/)
```
OPENAI_API_KEY
STORAGE_BACKEND                 # local | s3
STORAGE_DIR
REPORT_AGENT_ENABLE_LANGSMITH   # true | false
LANGSMITH_API_KEY
LANGSMITH_PROJECT
```

## Engineering Principles (from AGENTS.md)

1. **Correctness over speed** — no "just make it work" patches
2. **Deep Modularity** — simple interfaces, powerful internals (Ousterhout)
3. **Simple over Easy** — avoid complecting state/time/control flow (Hickey)
4. **Zero Unknown Unknowns** — changes must not cascade unpredictably
5. **No magic** — no magic numbers, no implicit state sharing
6. **Data over Objects** — prefer transparent data structures
7. **Comment "Why"** — explain design rationale, not what code does
8. **YAGNI** — never add unrequested features
9. **No dependency expansion** without explicit permission
10. **HALT on ambiguity** — stop and ask when requirements are unclear

## Decision Priority (when requirements conflict)
1. System Stability & Safety
2. Manageable Complexity
3. Local Simplicity
4. Consistency with existing codebase
5. Performance (only when measured)

## Report Generation Flow (MVP)
1. User uploads PDF (experiment procedures) + Excel (data)
2. PDF parsing via PyMuPDF OCR
3. LLM selects relevant experiment
4. Excel table extraction + ranking by relevance
5. Excel image extraction
6. DOCX rendering via docxtpl template
7. Markdown generation for structured report
8. Artifacts stored: DOCX + Markdown + JSON state

## Testing
- **Frontend E2E**: Playwright (`update_UI/e2e/`)
- **Backend unit**: pytest (`update_UI/report_backend/tests/`)

## Key Files
- `update_UI/lib/server/report-agent.ts` — Main report generation orchestration (1600+ lines)
- `update_UI/report_backend/graph/build_graph.py` — LangGraph workflow definition
- `update_UI/report_backend/graph/state.py` — Agent state model
- `update_UI/middleware.ts` — Auth route protection
- `update_UI/next.config.mjs` — API rewrites config
- `update_UI/STRUCTURE.md` — Detailed layering guide
- `update_UI/AGENTS.md` — Full engineering principles

## Notes
- TypeScript build errors are currently ignored (`ignoreBuildErrors: true` in next.config.mjs)
- Output language for docs and agent responses should be Japanese
- The project uses `@/*` path aliases throughout TypeScript code
