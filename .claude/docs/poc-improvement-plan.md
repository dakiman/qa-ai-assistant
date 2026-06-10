# POC Improvement Plan

This plan brings QA-Craft from "architecturally complete but broken out of the box" to a clean, working POC.

---

## Tier 1 — Immediate Blockers

These must be done before the app can be properly demonstrated.

---

### ~~T1-1: Remove debug artifacts~~ ✅ DONE (2026-03-25)

All `#region agent log` debug blocks removed from:
- `backend/main.py` — `_dbg_log` function, `DebugRequestMiddleware`
- `backend/routers/refine.py` — `_dbg_log` function + 7 call sites
- `frontend/src/components/RefineActionBar.tsx` — `_dbgLog` HTTP beacon + `useEffect` logger

---

### ~~T1-2: Fix frontend API port~~ ✅ DONE (2026-04-28)

`frontend/src/lib/api.ts` line 10 defaults to `http://localhost:8000/api/v1`. `npm run dev` connects without a `.env.local`.

---

### ~~T1-3: Create environment example files~~ ✅ DONE (2026-04-28)

**Create `backend/.env.example`:**
```env
# LLM Provider: "mock" (no API key needed), "openai", or "anthropic"
LLM_PROVIDER=mock

# Uncomment and set if using real LLM
# OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=sk-ant-...

# Database (SQLite for dev, PostgreSQL for prod)
DATABASE_URL=sqlite:///./qa_craft.db

# Environment: development | staging | production
ENVIRONMENT=development

# Optional: API key to protect write endpoints (leave empty to disable auth)
# API_KEY=your-secret-key-here

# Run Alembic migrations on startup
AUTO_MIGRATE=true

# Validate requirements before LLM generation
VALIDATION_ENABLED=true

# Comma-separated allowed CORS origins
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

# Log level: DEBUG | INFO | WARNING | ERROR
LOG_LEVEL=INFO
```

**Create `frontend/.env.local.example`:**
```env
# Backend API base URL
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1

# Optional: API key (must match backend API_KEY if set)
# NEXT_PUBLIC_API_KEY=your-secret-key-here
```

**Acceptance criteria:** A developer can clone the repo, run `cp .env.example .env`, and start the backend without any manual configuration hunting.

**Note:** `frontend/.env.local.example` was initially blocked by `frontend/.gitignore`'s broad `.env*` pattern; an `!.env*.example` exemption was added so example templates ship with the repo while real env files stay ignored.

---

## Tier 2 — Core Workflow Verification

After Tier 1, manually verify the complete workflow:

1. Start backend: `cd backend && uvicorn main:app --reload --port 8000`
   - Check: no `DBG:` output, API docs at http://localhost:8000/docs
2. Start frontend: `cd frontend && npm run dev`
   - Check: no CORS errors in browser console
3. Open http://localhost:3000
4. Create a feature with at least 30 chars of requirements
5. Generate test cases (mock mode)
   - Verify approximately `target_count` cases are generated (default 10)
6. Try generating again without `force_regenerate` → expect 409 Conflict
7. Generate with `force_regenerate=true` → drafts replaced with new cases
8. Accept 2-3 test cases, reject 1
9. Click "Refine" in the floating action bar
   - Verify refinement counter badge shows "Refinement 1"
10. Refine 3 times → 4th shows warning ("Consider reviewing before refining further") but still allows proceeding
11. Verify `generation_count` and `refinement_count` are exposed in the feature API response
12. Export as CSV
13. Navigate to Templates, verify 3 default templates are present
14. Create a new template, verify it appears in the generation template dropdown

---

## Tier 3 — Polish

These improve the POC's presentation and developer experience.

---

### T3-1: Update stale documentation

**`README.md`:**
- Add note: "Copy `backend/.env.example` to `backend/.env` before running"
- Confirm backend port is 8000 in all examples

**`.cursor/context.md`:**
- Remove `# TODO` markers from `repositories/` line (already implemented)
- Remove `# TODO` marker from `tests/` (or change to `# TODO: add tests`)

**`IMPLEMENTATION_PLAN.md`:**
- Mark all completed tasks with `[x]` instead of `[ ]`:
  - Phase 1: all 6 tasks (session management, async/sync, logging, LLM singleton, datetime, deps)
  - Phase 2: tasks 2.1 (CORS) and 2.2 (auth) — done; 2.3 (rate limiting) remains
  - Phase 3: all 5 tasks (repository, migrations, type gen, react query, error boundaries)
  - Phase 4: all 4 tasks (icons, error handling, tests pending, state duplication)
  - Phase 5: all 3 tasks (export, search/filter, template UI)

---

### T3-2: Add docker-compose for QA-Craft

**Create `qa-ai-assistant/docker-compose.yml`:**

```yaml
services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "8000:8000"          # free on this server
    environment:
      LLM_PROVIDER: mock
      DATABASE_URL: sqlite:///./qa_craft.db
      AUTO_MIGRATE: "true"
    volumes:
      - ./backend:/app
    command: uvicorn main:app --host 0.0.0.0 --port 8000

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "3000:3000"          # free on this server
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:8000/api/v1
    depends_on:
      - backend
```

Also needs `backend/Dockerfile` and `frontend/Dockerfile`.

**Note:** Ports 8000 and 3000 are confirmed free on this server. Do not use 8080, 8743, 5474, 11434, or 19999 — those are taken.

---

## Definition of "Working POC"

The app is at working POC state when:

- [x] Backend starts cleanly with no debug output
- [x] Frontend connects to backend without manual `.env` setup
- [x] Full workflow completes in mock mode: create feature → generate → curate → refine → export *(API smoke-tested 2026-04-28; browser walkthrough still recommended)*
- [x] All 3 default templates available on first run *(verified 2026-04-28: "Standard Test Case", "API Testing", "UI/UX Testing")*
- [x] Template CRUD works (create, edit, delete)
- [x] Feature linking UI works (feature-to-feature and feature-to-test-case)
- [x] URL filter persistence works on feature detail page
- [x] Error boundaries catch and display failures gracefully
- [x] Generation guards prevent accidental re-generation (409 without force_regenerate)
- [x] Refinement counter and warning displayed after 3 iterations

---

## Out of Scope for POC

- Rate limiting (slowapi)
- Inline test case editing (Edit button is a placeholder)
- Bulk delete
- Docker containerization
- CI/CD pipeline
- Production PostgreSQL setup
- Generate/Regenerate button on feature detail page (currently generation is triggered from the new-feature flow)
- Bulk accept/reject with floating action bar
- Lightweight duplicate detection for LLM-generated cases
