# QA-Craft — Claude Code Context

## What is this project?

QA-Craft is an AI-powered test case management system for QA engineers. It implements a "Human-in-the-Loop" workflow:

1. Engineer creates a **Feature** with raw requirements text
2. AI generates **Test Cases** from the requirements (DRAFT status)
3. Engineer curates: Accept, Reject, or manually add cases
4. Engineer triggers **Refinement** — AI analyzes accepted cases, finds gaps, adds edge cases
5. Engineer exports the finalized test suite (JSON or CSV)

The app works fully offline using a **mock LLM mode** — no API key required for development.

---

## Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Backend | FastAPI | 0.115+ |
| DB ORM | SQLModel (sync) | 0.0.22+ |
| Database | SQLite (dev) / PostgreSQL (prod) | — |
| AI | instructor + OpenAI/Anthropic | Latest |
| Migrations | Alembic | 1.13+ |
| Frontend | Next.js App Router | 16.1 |
| UI | shadcn/ui + Tailwind CSS v4 | — |
| State | TanStack React Query | 5+ |
| Language | Python 3.10+ / TypeScript 5 (strict) | — |

---

## Running Locally

**Confirmed free ports on this server:** 3000 (frontend), 8000 (backend)

```bash
# Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # edit as needed
uvicorn main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm install
cp .env.local.example .env.local   # edit as needed
npm run dev
```

- Frontend: http://localhost:3000
- API docs: http://localhost:8000/docs
- Health: http://localhost:8000/health

---

## Running with Docker (preferred on this server)

There is **no compose file inside this repo.** The app is deployed via a compose
file maintained outside the repo at **`/srv/dakis/apps/qa-ai-assistant/compose.yml`**,
which builds from this repo's `backend/` and `frontend/` dirs. It is the default
deploy target for browser-testing UI changes.

### Services (from the deployment compose)

| Service | Container | Purpose | Host port → container |
|---------|-----------|---------|-----------------------|
| `qa-ai-assistant-api` | `qa-ai-assistant-api` | Backend (baked image, `AUTO_MIGRATE=true`, SQLite on a `/srv/dakis/data` bind mount) | **8010** → 8000 |
| `qa-ai-assistant-web` | `qa-ai-assistant-web` | Frontend (baked image; proxies to the api service via `BACKEND_URL`) | **3010** → 3000 |

### Ports cheat sheet

- **Tailscale / docker prod**: frontend `:3010`, backend `:8010` — use these for browser tests on the server.
- **Native (venv + npm run dev)**: frontend `:3000`, backend `:8000`.

### Commands

```bash
# From the deployment dir (docker group workaround via sg):
cd /srv/dakis
sg docker -c 'docker compose up -d --build qa-ai-assistant-api qa-ai-assistant-web'   # rebuild + recreate
sg docker -c 'docker compose ps'
sg docker -c 'docker compose logs -f qa-ai-assistant-web'
sg docker -c 'docker compose down qa-ai-assistant-api qa-ai-assistant-web'
```

### **Code changes require a rebuild + restart**

Both images are baked at build time (standalone Next.js output + no `--reload`
uvicorn, no source bind-mount) — so **any change under `frontend/src/` or
`backend/` does not show up until you rebuild and recreate the container**. There
is no hot-reload compose; rebuild the affected service:

```bash
sg docker -c 'docker compose up -d --build qa-ai-assistant-web'   # frontend only
sg docker -c 'docker compose up -d --build qa-ai-assistant-api'   # backend only
```

After a rebuild, wait for both `http://localhost:8010/health` (returns
`{"status":"healthy"}`) and `http://localhost:3010/` (returns the dashboard HTML)
before testing.

---

## Environment Variables

### Backend (`backend/.env`)

See `backend/.env.example` for a copy-paste template.

| Variable | Default | Notes |
|----------|---------|-------|
| `LLM_PROVIDER` | `mock` | `mock`, `openai`, `anthropic`, or `openrouter` |
| `OPENAI_API_KEY` | — | Required if `LLM_PROVIDER=openai` |
| `ANTHROPIC_API_KEY` | — | Required if `LLM_PROVIDER=anthropic` |
| `OPENROUTER_API_KEY` | — | Required if `LLM_PROVIDER=openrouter` |
| `DATABASE_URL` | `sqlite:///./qa_craft.db` | SQLite for dev, PostgreSQL for prod (needs `psycopg2-binary`) |
| `ENVIRONMENT` | `development` | `development`, `staging`, `production` |
| `API_KEY` | — | Optional; if set, all writes require `X-API-Key` header (the frontend proxy injects it — must match) |
| `REQUIRE_AUTH_FOR_READS` | `false` | If `true`, read endpoints also require auth |
| `AUTO_MIGRATE` | `true` | Run Alembic migrations on startup |
| `VALIDATION_ENABLED` | `true` | Enable two-stage requirements validation |
| `CORS_ORIGINS` | `http://localhost:3000,...` | Comma-separated allowed origins |
| `LOG_LEVEL` | `INFO` | Python log level |

### Frontend (`frontend/.env.local`)

See `frontend/.env.local.example` for a copy-paste template.

| Variable | Default | Notes |
|----------|---------|-------|
| `NEXT_PUBLIC_API_URL` | `/api/v1` | Base URL for browser API calls. Relative → goes through the Next proxy (which injects the key server-side) |
| `BACKEND_URL` | `http://localhost:8000` | Where the proxy forwards requests (Docker: the api service). The only env var that matters for the Dockerized frontend |
| `API_KEY` | — | **Server-only** (no `NEXT_PUBLIC_` prefix). The proxy injects it as `X-API-Key`; must match the backend `API_KEY` |

---

## Directory Layout

```
qa-ai-assistant/
├── backend/
│   ├── main.py              # FastAPI app, lifespan, middleware, exception handlers
│   ├── config.py            # Pydantic settings (all env vars)
│   ├── database.py          # SQLModel engine + get_session() dependency
│   ├── models.py            # All SQLModel entities + Pydantic schemas
│   ├── exceptions.py        # Custom exception hierarchy
│   ├── logging_config.py    # Structured logging + RequestIdMiddleware
│   ├── auth.py              # X-API-Key verification dependencies
│   ├── seed.py              # Default template seeding on startup
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── alembic/versions/    # DB migration files
│   ├── repositories/        # Data access layer (CRUD + queries)
│   │   ├── base.py
│   │   ├── feature_repository.py
│   │   ├── test_case_repository.py
│   │   ├── template_repository.py
│   │   └── link_repository.py
│   ├── services/
│   │   ├── llm_service.py       # AI generation/refinement + mock mode
│   │   └── validation_service.py # Two-stage requirements validation
│   └── routers/
│       ├── features.py      # /api/v1/features
│       ├── test_cases.py    # /api/v1/test-cases
│       ├── templates.py     # /api/v1/templates
│       ├── generate.py      # /api/v1/generate
│       ├── refine.py        # /api/v1/features/{id}/refine
│       ├── export.py        # /api/v1/features/{id}/export
│       └── links.py         # /api/v1/features/{id}/links
│
├── frontend/src/
│   ├── app/                 # Next.js App Router pages
│   │   ├── page.tsx         # Dashboard
│   │   ├── features/        # Feature list, new, [id] detail
│   │   └── templates/       # Template list, new, [id] edit
│   ├── components/
│   │   ├── ui/              # shadcn/ui primitives
│   │   ├── layout/          # DashboardLayout, Sidebar
│   │   ├── TestCaseCard.tsx
│   │   ├── AddTestCaseDialog.tsx
│   │   ├── TestCaseFilters.tsx
│   │   ├── RefineActionBar.tsx
│   │   ├── ExportButton.tsx
│   │   ├── LinkManager.tsx
│   │   └── LinkSelectorDialog.tsx
│   ├── lib/
│   │   ├── api.ts           # HTTP client (all API calls)
│   │   ├── api-types.ts     # Auto-generated OpenAPI types
│   │   ├── queries.ts       # All TanStack Query hooks
│   │   └── utils.ts
│   └── providers/
│       └── QueryProvider.tsx
│
├── CLAUDE.md                # This file
├── README.md
├── IMPLEMENTATION_PLAN.md
└── .claude/docs/            # Deep-dive documentation
    ├── architecture.md
    ├── current-state.md
    ├── api-reference.md
    └── poc-improvement-plan.md
```

---

## Core Domain

### Entities

- **Feature** — software feature with `title`, `description`, `raw_requirements`, `generation_count`, `refinement_count`
- **TestCase** — `title`, `steps` (JSON list), `expected_result`, `status` (draft/accepted/rejected), `is_edge_case`, `is_manual`
- **Template** — named LLM system prompt (`name`, `system_instructions`)
- **FeatureLink** — bidirectional relationship between features (`RELATES_TO`, `DEPENDS_ON`/`BLOCKS`, `PARENT_OF`/`CHILD_OF`)
- **TestCaseLink** — reference from one feature to another feature's test case

### Workflow

```
Feature (raw_requirements)
    → POST /api/v1/generate              → TestCase[] (status=DRAFT)
        ├─ target_count controls how many cases (default 10, range 3-30)
        ├─ Returns 409 if already generated (use force_regenerate=true to replace drafts)
        └─ Increments feature.generation_count
    → PATCH /test-cases/{id}/accept or /reject
    → POST /api/v1/features/{id}/refine  → new TestCase[] (is_edge_case=True)
        ├─ max_new_cases controls limit (default 5, range 1-15)
        ├─ Increments feature.refinement_count
        └─ Frontend warns after 3 refinements
    → GET /api/v1/features/{id}/export   → JSON or CSV
```

---

## Key Architectural Decisions

1. **Synchronous DB operations** — SQLModel's async support is immature; sync routes with FastAPI's thread pool is the correct choice. All route handlers use `def`, not `async def`.

2. **Repository pattern** — All DB access goes through repository classes in `backend/repositories/`. Routers never touch the session directly.

3. **instructor library** — Forces LLM responses to match Pydantic schemas. If the LLM returns invalid JSON, instructor retries automatically (max 2).

4. **Mock mode** — `LLM_PROVIDER=mock` generates realistic keyword-aware test cases with zero API calls. The entire UI workflow is testable without an LLM key.

5. **Two-stage validation** — Requirements are validated before hitting the LLM: (1) rule-based (length, word count, alpha ratio, code detection), then (2) LLM semantic check using a cheap fast model (gpt-4o-mini or claude-3-haiku).

6. **Request ID tracing** — Every request gets a UUID injected via `RequestIdMiddleware` and propagated through all log lines and the `X-Request-ID` response header.

7. **Bidirectional feature links** — Creating `A → DEPENDS_ON → B` automatically creates the inverse `B → BLOCKS → A`.

8. **Generation guards** — `POST /generate/` returns 409 Conflict if `generation_count > 0` unless `force_regenerate=true`, which deletes existing drafts first. This prevents accidental mass-generation loops.

9. **Configurable generation counts** — `target_count` (3–30) controls how many test cases to generate; `max_new_cases` (1–15) controls refinement output. Mock generators respect these limits.

---

## Coding Conventions

### Backend (Python)
- Use `def` not `async def` for route handlers and repository methods
- Inject all dependencies via `Depends()` — no global mutable state
- Use `get_logger(__name__)` from `logging_config.py` — never `print()`
- Raise custom exceptions from `exceptions.py` — never bare `HTTPException` in routers
- Use `datetime.now(timezone.utc)` not `datetime.utcnow()` (deprecated in 3.12)
- All datetime fields must be timezone-aware

### Frontend (TypeScript)
- Strict TypeScript — no `any`
- All API calls go through `frontend/src/lib/api.ts`
- All data fetching uses hooks from `frontend/src/lib/queries.ts`
- UI primitives from `frontend/src/components/ui/` (shadcn/ui)
- URL query params for persistent filter state

---

## Known Issues

**The authoritative issue tracker is `fable-review.md`** (repo root) — a full-codebase
review with per-item ✅ RESOLVED / ⚠️ DEFERRED status. Start there before picking up
remediation work. As of 2026-07-02: **all High (H1–H13) and all Medium (M1–M26)
findings are fixed and merged**, plus a high-value Low subset (L4, L6, L7, L8, L12,
L15, L16, L18, L22, L24). See the "Handoff — remaining work" section at the top of
that file for exactly what is left.

**Still open (not yet started):**
- No backend test suite (`backend/tests/` doesn't exist) — suggested improvement #1.
- Rate limiting not implemented — suggested improvement #5.
- Remaining cosmetic/doc Low findings (L1–L3, L5, L9–L11, L13, L14, L17, L20, L21,
  L23, L25–L30) and the deferred L19 (openapi-typescript v7 required-field quirk).
- `.claude/docs/current-state.md` is partly stale (L27) — cross-check against code.

**Recently resolved (no longer issues):** debug logging artifacts; frontend port 8001;
the Edit-button placeholder; the feature-delete 500 (H1); `force_regenerate` destroying
manual cases (H2); the write key shipping in the browser bundle (H10); the naive-datetime
display skew (M2); silent mutation-error swallowing (M17, now a global toast); the dead
"Edit Feature" button (M16, now wired). A **Regenerate** button now exists on the feature
detail page.

---

## Deep-dive Docs

| File | Contents |
|------|----------|
| `.claude/docs/architecture.md` | Full architecture, data models, flow diagrams |
| `.claude/docs/current-state.md` | What works, what's broken, what's missing |
| `.claude/docs/api-reference.md` | Every endpoint with request/response schemas |
| `.claude/docs/poc-improvement-plan.md` | Prioritized fixes to reach working POC |
