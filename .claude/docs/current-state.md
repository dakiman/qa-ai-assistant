# QA-Craft — Current State

Last assessed: 2026-04-28

---

## What Works

### Backend
- FastAPI app starts with `uvicorn main:app --reload --port 8000`
- Alembic auto-migration runs on startup (creates all 5 tables)
- 3 default templates seeded on first run
- All CRUD endpoints: features, test cases, templates, feature links, test case links
- LLM generation in mock mode (no API key needed) with configurable `target_count` (3–30)
- LLM refinement in mock mode with configurable `max_new_cases` (1–15)
- Generation guards: 409 Conflict on duplicate generation; `force_regenerate` to replace drafts
- Generation and refinement counters tracked per feature (`generation_count`, `refinement_count`)
- Two-stage requirements validation (rule-based + LLM semantic, both skippable)
- Feature-to-feature bidirectional linking
- Feature-to-test-case reference linking
- RAG: linked context injected into LLM prompts
- JSON + CSV export with status filter
- Optional API key authentication (auto-bypassed in dev)
- Structured logging with per-request UUID tracing
- Custom exception hierarchy with consistent JSON error format
- Environment-aware CORS (strict in production, open in dev)

### Frontend
- Dashboard page with feature/template counts and recent features
- Feature list page
- Feature detail page with test case grid, stats cards, filters
- New feature page with multi-phase workflow (create → link → generate → review)
- Template list, create, and edit pages
- Test case accept/reject/reset actions with optimistic updates
- Manual test case creation dialog
- RefineActionBar (floating) with full-screen loading overlay, refinement counter badge, and warning after 3 iterations
- Export button (JSON/CSV with status filter)
- LinkManager for feature and test case linking
- TestCaseFilters with URL-persisted state
- Error boundaries on all route segments
- React Query caching (5 min stale, 30 min gc)

### Real LLM Mode (if API key provided)
- OpenAI (gpt-4-turbo-preview) via instructor
- Anthropic (claude-3-sonnet-20240229) via instructor
- Structured Pydantic response enforcement with auto-retry (max 2)
- Prompt injection detection + logging

---

## Critical Bugs (Blockers)

### ~~BUG-1: Debug artifacts~~ — RESOLVED (2026-03-25)

All `#region agent log` debug blocks have been removed from:
- `backend/main.py` (previously had `_dbg_log`, `DebugRequestMiddleware`)
- `backend/routers/refine.py` (previously had `_dbg_log` with Windows file path + 7 call sites)
- `frontend/src/components/RefineActionBar.tsx` (previously had `_dbgLog` HTTP beacon + `useEffect` logger)

No debug artifacts remain in the codebase.

---

### ~~BUG-2: Frontend API port mismatch~~ — RESOLVED (2026-04-28)

`frontend/src/lib/api.ts` line 10 now defaults to `http://localhost:8000/api/v1`. App connects without a `.env.local`.

---

### ~~BUG-3: No environment example files~~ — RESOLVED (2026-04-28)

Both `backend/.env.example` and `frontend/.env.local.example` exist and are tracked. The frontend file was previously caught by `frontend/.gitignore`'s `.env*` rule; an `!.env*.example` exemption was added so example templates are committed while real env files stay ignored.

---

## Known Limitations (Not Bugs)

| Item | Detail |
|------|--------|
| Edit test case | `Edit` button on `TestCaseCard.tsx` is rendered but has no handler — clicking does nothing |
| Bulk delete | No bulk delete endpoint or UI |
| Rate limiting | `slowapi` not installed; no rate limits on LLM endpoints |
| No tests | `backend/tests/` directory does not exist |
| No docker-compose | No container setup for QA-Craft itself (only parent server has docker-compose) |
| LLM model versions | `openai_model` defaults to `gpt-4-turbo-preview` (deprecated name); should use `gpt-4-turbo` |
| Anthropic model | `anthropic_model` defaults to `claude-3-sonnet-20240229`; newer versions available |

---

## Outdated Internal Documentation

| File | Problem |
|------|---------|
| `.cursor/context.md` | Lists `repositories/` as "TODO" — already fully implemented |
| `.cursor/context.md` | Lists `tests/` as "TODO" — still true but misleading alongside other "TODO"s |
| `IMPLEMENTATION_PLAN.md` | Phases 1–5 tasks all show unchecked `[ ]` but most are completed |

---

## Port Audit (this server)

Ports confirmed free: **3000** (frontend), **8000** (backend)

Ports in use by other services:
- 8080 — open-webui
- 8743 — dota2tracker web
- 5474 — dota2tracker postgres
- 11434 — Ollama
- 19999 — Netdata
- 3001, 8085, 8086, 8125, 8765 — other services

---

## Dependency Notes

All dependencies in `backend/requirements.txt` are current:
- `fastapi>=0.115.0` ✓
- `sqlmodel>=0.0.22` ✓
- `instructor>=1.5.0` ✓
- `openai>=1.50.0` ✓
- `anthropic>=0.40.0` ✓
- `alembic>=1.13.0` ✓

Missing test dependencies (if tests are added later):
- `pytest>=8.0`
- `httpx>=0.27`
