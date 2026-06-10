# QA-Craft — Manual QA Script

> **No automated tests.** This is a manual verification harness. Walk every section in order on a fresh clone (or after `git pull`) to confirm that all features work end-to-end.
>
> **Modes covered:** desktop Chrome and DevTools mobile emulation (iPhone 14 viewport).
> **LLM provider:** mock (no API key required).

---

## §0 Prereqs

| # | Action | Expected | Assertion |
|---|--------|----------|-----------|
| 0.1 | `cp backend/.env.example backend/.env` | `.env` created | `cat backend/.env` shows `LLM_PROVIDER=mock` |
| 0.2 | `cp frontend/.env.local.example frontend/.env.local` | `.env.local` created | `cat frontend/.env.local` shows `NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1` |
| 0.3 | `lsof -i :8000` and `lsof -i :3000` | both empty | nothing listening |
| 0.4 | Backend deps installed | `python -c "import fastapi"` succeeds in `backend/venv` | — |
| 0.5 | Frontend deps installed | `frontend/node_modules/` exists | — |

---

## §1 Backend startup

| # | Action | Expected | Assertion |
|---|--------|----------|-----------|
| 1.1 | `cd backend && source venv/bin/activate && uvicorn main:app --reload --port 8000` | startup logs include Alembic migration + 3 default templates seeded; **no `DBG:` lines** | `curl -s localhost:8000/health` → `{"status":"ok"}` |
| 1.2 | Open `http://localhost:8000/docs` | Swagger UI renders | Endpoints visible: features, test-cases, templates, generate, refine, export, links |

---

## §2 Frontend startup

| # | Action | Expected | Assertion |
|---|--------|----------|-----------|
| 2.1 | `cd frontend && npm run dev` | Next dev server starts on `:3000`; no compile errors | — |
| 2.2 | Open `http://localhost:3000` | Dashboard renders with feature & template counts | Browser console clean (no CORS, no 404s) |
| 2.3 | View page source | `<meta name="viewport">` and `<meta name="theme-color">` present | (after C1 ships) |

---

## §3 Create a feature

| # | Action | Expected | Assertion |
|---|--------|----------|-----------|
| 3.1 | Click "New Feature" in sidebar | Multi-phase wizard appears | URL `/features/new`, phase 1 active |
| 3.2 | Fill: title "Login flow", description "User auth", requirements ≥30 chars (e.g. "User logs in with email and password. Wrong credentials show inline error. After 5 failures, lock for 15 minutes.") | Submit advances to phase 2 | — |
| 3.3 | Skip linking | Phase 3 (generate) appears | — |

**Negative case:** requirements <30 chars → 422 with validation message.

---

## §4 Generate (mock)

| # | Action | Expected | Assertion |
|---|--------|----------|-----------|
| 4.1 | Submit generate (default `target_count=10`) | ~10 draft cases appear, each with title/steps/expected_result | `feature.generation_count` badge shows 1 |
| 4.2 | All cases status = DRAFT | yellow badge on each card | Stats card "Draft: 10" |

---

## §5 409 guard on duplicate generate

| # | Action | Expected | Assertion |
|---|--------|----------|-----------|
| 5.1 | Without Regenerate button: `curl -X POST localhost:8000/api/v1/generate/ -H 'Content-Type: application/json' -d '{"feature_id":1}'` | HTTP 409 Conflict | response detail mentions `force_regenerate` |
| 5.2 | Same call with `"force_regenerate": true` | HTTP 200, drafts replaced | drafts re-issued, generation_count → 2 |

---

## §6 Regenerate via UI (force_regenerate flow)

> Requires A4 shipped.

| # | Action | Expected | Assertion |
|---|--------|----------|-----------|
| 6.1 | Click "Regenerate" button in feature header | Confirmation dialog opens | dialog body shows `{stats.draft}` count |
| 6.2 | Confirm | Dialog closes; drafts replaced with new ones | generation_count badge increments |
| 6.3 | Cancel from confirmation | Drafts unchanged, generation_count unchanged | — |
| 6.4 | When `generation_count === 0` (fresh feature) | Regenerate button disabled | hover tooltip: nothing to regenerate |

---

## §7 Curate cases

| # | Action | Expected | Assertion |
|---|--------|----------|-----------|
| 7.1 | Accept 3 cases | green badge, optimistic update (instant) | Stats: Accepted +3 |
| 7.2 | Reject 1 case | red badge | Stats: Rejected +1 |
| 7.3 | Reset 1 accepted case | back to DRAFT | Stats counters revert |
| 7.4 | "+ Add Test Case" → fill + save | manual case appears, auto-accepted | `is_manual=true` badge |

---

## §8 Filters with URL persistence

| # | Action | Expected | Assertion |
|---|--------|----------|-----------|
| 8.1 | Click status=accepted filter | grid shows only accepted | URL has `?status=accepted` |
| 8.2 | Add edge_case=true | further filtered | URL has `?status=accepted&is_edge_case=true` |
| 8.3 | Search "login" | client/server filter applied | URL has `&search=login` |
| 8.4 | Reload page | filters preserved from URL | filter chips reflect state |
| 8.5 | Clear all | URL params removed | grid shows everything |

---

## §9 Refinement (basic)

| # | Action | Expected | Assertion |
|---|--------|----------|-----------|
| 9.1 | Floating Refine bar visible | shows "N cases ready" badge | accepted + manual count |
| 9.2 | Click Refine | full-screen overlay "AI is hunting for edge cases..." | spinner visible |
| 9.3 | Wait for completion | new edge-case rows added (DRAFT, `is_edge_case=true`) | bar shows "Refinement 1" badge |
| 9.4 | Accept some, repeat refine | refinement_count = 2 | — |

---

## §10 Refinement warning at threshold

| # | Action | Expected | Assertion |
|---|--------|----------|-----------|
| 10.1 | Refine until count = 3 | bar shows amber warning "Consider reviewing before refining further" | warning + button still enabled |
| 10.2 | Refine again (count = 4) | warning persists, refine still works | — |

---

## §11 Export

| # | Action | Expected | Assertion |
|---|--------|----------|-----------|
| 11.1 | Click Export → JSON | file downloads | filename `feature_<id>_<title>.json`, valid JSON, includes all cases |
| 11.2 | Apply status=accepted, Export → CSV | file downloads | only accepted rows present, CSV opens cleanly |
| 11.3 | Empty filter result, Export | downloads empty list (not error) | — |

---

## §12 Templates CRUD

| # | Action | Expected | Assertion |
|---|--------|----------|-----------|
| 12.1 | `/templates` lists 3 default templates | "Standard Test Case", "API Testing", "UI/UX Testing" | seeded on first run |
| 12.2 | Create new template "Smoke" with system_instructions | appears in list | — |
| 12.3 | Edit "Smoke" → save | changes persist on reload | — |
| 12.4 | Generate new feature, check template dropdown | "Smoke" appears as option | — |
| 12.5 | Delete "Smoke" with confirmation | removed from list | confirmation dialog blocks accidental delete |

---

## §13 Feature-to-feature links

| # | Action | Expected | Assertion |
|---|--------|----------|-----------|
| 13.1 | On feature A, open LinkManager → "Add feature link" → pick feature B → type DEPENDS_ON | link appears under A | — |
| 13.2 | Open feature B | inverse link `BLOCKS A` shown automatically | bidirectional creation works |
| 13.3 | Delete one direction | both directions removed | — |

---

## §14 Test-case cross-references

| # | Action | Expected | Assertion |
|---|--------|----------|-----------|
| 14.1 | On feature A, "Add test case link" → pick a case from feature B | reference appears | — |
| 14.2 | Reference shows source feature title + case title | clickable to source | — |
| 14.3 | Delete reference | removed | — |

---

## §15 Error boundary

| # | Action | Expected | Assertion |
|---|--------|----------|-----------|
| 15.1 | Navigate to `/features/9999` | friendly error UI with "Try again" button | NOT a white screen, NOT a Next.js dev overlay in prod build |
| 15.2 | Hit a backend error (stop backend, then click any feature) | friendly error in UI, retry button | — |

---

## §16 API key authentication

| # | Action | Expected | Assertion |
|---|--------|----------|-----------|
| 16.1 | Set `API_KEY=test123` in `backend/.env`, restart backend | startup logs note auth enabled | — |
| 16.2 | Frontend without `NEXT_PUBLIC_API_KEY` → try to create feature | 401 Unauthorized | error toast surfaces 401 |
| 16.3 | Set `NEXT_PUBLIC_API_KEY=test123` in `frontend/.env.local`, restart Next | writes succeed again | reads also work (auth optional for reads in dev) |
| 16.4 | Unset both, restart | dev mode auto-bypass kicks in | writes work without key |

---

## §17 Mobile (DevTools "iPhone 14")

> Requires C1–C6 shipped.

| # | Action | Expected | Assertion |
|---|--------|----------|-----------|
| 17.1 | Open `/` at iPhone 14 viewport (390×844) | hamburger button top-left, sidebar hidden | no `ml-64` gap |
| 17.2 | Tap hamburger | drawer slides in from left with full nav | tap nav item → drawer closes, navigation occurs |
| 17.3 | Resize viewport to ≥768px | hamburger gone, fixed sidebar back | no flicker |
| 17.4 | Open feature detail | stats grid shows 2-column layout (not crushed 6-col) | numbers readable |
| 17.5 | RefineActionBar at bottom | fully visible above iOS home-indicator | not clipped under chrome |
| 17.6 | `/templates` and feature detail Link panel | edit/delete buttons visible without hover | thumb-tappable |
| 17.7 | No horizontal scroll on any page | viewport-width respected | `document.body.scrollWidth === window.innerWidth` |

---

## Definitive done state

A clean run through §0–§17, on (a) desktop Chrome and (b) DevTools iPhone 14 emulation, in mock mode, with **no console errors** in either environment. After a successful pass, flip the "Definition of Working POC" checkboxes in `.claude/docs/poc-improvement-plan.md` to `[x]`.
