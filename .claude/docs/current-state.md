# QA-Craft — Current State

Last assessed: 2026-07-02

> Reconciled against code on 2026-07-02 as part of the Fable-review Low remediation
> (L27). All High + Medium findings and the Low findings are fixed and merged.
> **`fable-review.md` (repo root) remains the authoritative tracker** for per-finding
> status; this file summarizes the working/known-limitation state.

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
- Test case accept/reject/reset actions (mutation failures surface via a global toast)
- Edit test case dialog (`EditTestCaseDialog`) and Edit feature dialog (`EditFeatureDialog`), both wired
- Manual test case creation dialog
- RefineActionBar (floating) with full-screen loading overlay, refinement counter badge, and warning after 3 iterations
- Export button (JSON/CSV with status filter)
- LinkManager for feature and test case linking
- TestCaseFilters with URL-persisted state
- Error boundaries on all route segments
- React Query caching (5 min stale, 30 min gc)

### Real LLM Mode (if API key provided)
- OpenAI (gpt-4o) via instructor
- Anthropic (claude-sonnet-5) via instructor
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

### ~~BUG-3: No environment example files~~ — RESOLVED (2026-07-02)

Both `backend/.env.example` and `frontend/.env.local.example` now exist and are tracked (created during the Fable-review H13 remediation — they had NOT actually been committed as of the 2026-04-28 assessment despite the earlier claim). The frontend file was previously caught by `frontend/.gitignore`'s `.env*` rule; an `!.env*.example` exemption was added so example templates are committed while real env files stay ignored.

---

## Known Limitations (Not Bugs)

| Item | Detail |
|------|--------|
| ~~Edit test case~~ | RESOLVED — `TestCaseCard` now opens `EditTestCaseDialog`; feature edit uses `EditFeatureDialog` |
| Delete from UI | Backend `DELETE` endpoints exist for features/test cases, but there is no delete affordance in the UI yet |
| Rate limiting | `slowapi` not installed; no rate limits on LLM endpoints |
| No tests | `backend/tests/` directory does not exist |
| No in-repo compose | No compose file inside this repo; the deployment compose lives at `/srv/dakis/apps/qa-ai-assistant/compose.yml` (services `qa-ai-assistant-api`/`-web`, ports 8010/3010) |
| ~~LLM model versions~~ | RESOLVED — defaults updated to current IDs (`gpt-4o`, `claude-sonnet-5`; validation `gpt-4o-mini`, `claude-haiku-4-5`) |

---

## Outdated Internal Documentation

| File | Problem |
|------|---------|
| `.cursor/context.md` | Reconciled 2026-07-02 (L28): fixed the `qa-ai-tool/` root name, flagged that `pytest`/`npm test` don't work yet, and documented the proxy/`BACKEND_URL` env design |
| `IMPLEMENTATION_PLAN.md` | Phases 1–5 tasks all show unchecked `[ ]` but most are completed |

---

## Ports (this server — dakis-server-v2)

> The old "Port Audit" here described the decommissioned host and is gone.

- **Docker deployment (default target):** frontend **3010**, backend **8010**
  (`/srv/dakis/apps/qa-ai-assistant/compose.yml`). Use these for browser testing.
- **Native dev (venv + `npm run dev`):** frontend **3000**, backend **8000**.
- Note: on this server **3000 is jira-rag**, so native dev and that service can't
  both run — prefer the Docker ports for testing.

---

## Dependency Notes

`backend/requirements.txt` is now **pinned to exact versions** (`==`) matching the
tested image (M25) — no longer open-ended `>=` floors. Bump deliberately and re-test.
`psycopg2-binary` is included for the PostgreSQL production path (H8).

Test dependencies (still not present — no test suite yet):
- `pytest`, `httpx` (for a FastAPI TestClient suite over the routers)
