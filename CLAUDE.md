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

The Tailscale-exposed env on this server runs from `docker-compose.yml` (production-style image build, no bind-mount). It is the default deploy target for browser-testing UI changes.

### Compose files

| File | Purpose | Frontend host port | Backend host port | Container names |
|------|---------|--------------------|-------------------|-----------------|
| `docker-compose.yml` | Production-like; what's running on this server / Tailscale | **3010** → 3000 | **8010** → 8000 | `qa-frontend`, `qa-backend` |
| `docker-compose.dev.yml` | Local dev with backend hot-reload | 3000 → 3000 | 8000 → 8000 | `qa-craft-frontend-dev`, `qa-craft-backend-dev` |

Both can coexist (different container names + ports).

### Ports cheat sheet

- **Tailscale / docker prod**: frontend `:3010`, backend `:8010` — use these for browser tests on the server.
- **docker dev compose**: frontend `:3000`, backend `:8000`.
- **Native (venv + npm run dev)**: frontend `:3000`, backend `:8000`.

### Commands

```bash
# Production-like (what runs on the server):
docker compose up -d --build              # build + recreate; required after code changes
docker compose ps                         # check status
docker compose logs -f qa-frontend        # follow frontend logs
docker compose down                       # stop + remove containers

# Dev compose (backend hot-reload, frontend still rebuilt):
docker compose -f docker-compose.dev.yml up --build
docker compose -f docker-compose.dev.yml down
```

### **Code changes require a rebuild + restart**

The frontend `Dockerfile` builds the Next.js app at image-build time (standalone output, no source bind-mount) — so **any change under `frontend/src/` does not show up until you rebuild and recreate the container**:

```bash
docker compose up -d --build qa-frontend  # rebuild only the frontend service
# or
docker compose up -d --build              # rebuild both
```

The backend container in `docker-compose.yml` is also baked at build time (no `--reload`), so backend code changes likewise require `--build`. Only `docker-compose.dev.yml` bind-mounts `./backend` and runs `uvicorn --reload`, giving the backend hot-reload locally — the frontend is always image-baked.

After a rebuild, wait for both `http://localhost:8010/health` (returns `{"status":"healthy"}`) and `http://localhost:3010/` (returns the dashboard HTML) before testing.

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Default | Notes |
|----------|---------|-------|
| `LLM_PROVIDER` | `mock` | `mock`, `openai`, or `anthropic` |
| `OPENAI_API_KEY` | — | Required if `LLM_PROVIDER=openai` |
| `ANTHROPIC_API_KEY` | — | Required if `LLM_PROVIDER=anthropic` |
| `DATABASE_URL` | `sqlite:///./qa_craft.db` | SQLite for dev, PostgreSQL for prod |
| `ENVIRONMENT` | `development` | `development`, `staging`, `production` |
| `API_KEY` | — | Optional; if set, all writes require `X-API-Key` header |
| `AUTO_MIGRATE` | `true` | Run Alembic migrations on startup |
| `VALIDATION_ENABLED` | `true` | Enable two-stage requirements validation |
| `CORS_ORIGINS` | `http://localhost:3000,...` | Comma-separated allowed origins |
| `LOG_LEVEL` | `INFO` | Python log level |

### Frontend (`frontend/.env.local`)

| Variable | Default | Notes |
|----------|---------|-------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000/api/v1` | Backend base URL |
| `NEXT_PUBLIC_API_KEY` | — | Optional; sent as `X-API-Key` header |

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

See `.claude/docs/current-state.md` for the full issue list.

**Quick summary:**
- ~~Debug logging artifacts~~ — **RESOLVED** (removed from main.py, refine.py, RefineActionBar.tsx)
- ~~Frontend API port defaulted to 8001~~ — **RESOLVED** (api.ts now defaults to 8000)
- ~~Missing env example files~~ — **RESOLVED** (`backend/.env.example` and `frontend/.env.local.example` now tracked)
- ~~`Edit` button on TestCaseCard is a visual placeholder~~ — **RESOLVED** (`EditTestCaseDialog` wired up; edits title/steps/expected_result via `useUpdateTestCase`)
- No test suite yet (`backend/tests/` doesn't exist)
- Rate limiting not yet implemented
- No Generate/Regenerate button on feature detail page (generation happens in the new-feature flow)

---

## Deep-dive Docs

| File | Contents |
|------|----------|
| `.claude/docs/architecture.md` | Full architecture, data models, flow diagrams |
| `.claude/docs/current-state.md` | What works, what's broken, what's missing |
| `.claude/docs/api-reference.md` | Every endpoint with request/response schemas |
| `.claude/docs/poc-improvement-plan.md` | Prioritized fixes to reach working POC |
