# 2026-07-18 Review Remediation Plan

> **STATUS: ✅ COMPLETE (2026-07-18).** All workstreams (A–D) merged to `main`, deployed via the
> /srv/dakis compose, live smoke matrix + headless Playwright pass green on :8010/:3010. B4 needed
> two follow-up commits beyond the plan (delete-race: `exact: true` list invalidate, then dropping
> the post-navigation `removeQueries` entirely); A4 gained one extra necessary fix (uvicorn
> `--no-proxy-headers`). Results recorded in `fable-review.md` § "2026-07-18 second-pass review".

> **For agentic workers:** This plan is designed for an orchestrator session (Fable) dispatching
> implementer subagents (Sonnet) per workstream. Steps use checkbox (`- [ ]`) syntax for tracking.
> Workstreams A–D are independent and can run in parallel; Phase E (build/deploy/docs) runs last,
> in the orchestrator session itself.

**Goal:** Fix everything found in the 2026-07-18 four-way review (backend correctness, frontend,
security, infra/docs) — 1 High, 4 Medium, ~18 Low findings plus selected improvements — then
rebuild, redeploy, smoke-test, and reconcile all docs.

**Architecture:** No structural changes. All fixes are localized: router/schema/repo tweaks on the
FastAPI backend, component/hook tweaks on the Next.js frontend, one proxy-route hardening, doc
edits. The unit-of-work model, repository pattern, and proxy design stay exactly as they are.

**Tech stack:** FastAPI + SQLModel (sync) + SQLite/Alembic · Next.js 16 App Router + TanStack Query 5 + shadcn/ui.

## Global constraints

- **Commits: NEVER add Claude/Anthropic attribution.** No `Co-Authored-By: Claude`, no
  "Generated with Claude Code" — in any commit, anywhere. (User's absolute rule.)
- Backend: `def` not `async def`; custom exceptions from `exceptions.py`, never bare
  `HTTPException`; `get_logger(__name__)`, never `print()`; repos `flush()` only, never `commit()`
  (the request-scoped UoW in `database.py` commits once).
- Frontend: strict TS, no `any`; API calls only via `lib/api.ts`; data fetching only via hooks in
  `lib/queries.ts`.
- There is **no backend test suite** (declined previously — do not add one). Verification is:
  targeted `curl` smoke tests against a locally running backend (`LLM_PROVIDER=mock`,
  `RATE_LIMIT_ENABLED` as noted per task) + a clean `npx next build` for the frontend + the Phase E
  live matrix.
- The deployed compose lives OUTSIDE this repo at `/srv/dakis/apps/qa-ai-assistant/compose.yml`.
  Docker commands need `sg docker -c '...'`. Compose edits are committed in `/srv/dakis` with
  `git -c user.email=dakiman@dakis-server-v2 -c user.name=dakiman commit`.
- Work on a branch per workstream (`fix/review-2026-07-18-<a|b|c|d>`), merge to `main` before Phase E.
- Playwright screenshots land in the cwd — delete them before committing.

## Explicit decisions (made during planning — do not re-litigate)

1. **Proxy = open writes on :3010 (security M2):** accepted as by-design for this homelab. Do NOT
   build app-level auth. Remediation is documentation (CLAUDE.md security note + compose comment)
   and the rate-limit hardening in A4. Network-layer control (ufw/Tailscale ACL) is the real gate.
2. **Backend test suite:** still declined. Skip.
3. **Template column-length migration (PG-only metadata drift):** deferred — note it in
   fable-review.md, don't write a migration. Schema-level caps land via Pydantic in A3.
4. **Frontend improvements I-F1/I-F2/I-F3:** IN scope (Workstream B, task B6) — they're cheap and
   round out backend parity. Base-image digest pinning: OUT (homelab, not worth the churn).

---

## Workstream A — Backend (one Sonnet implementer)

Branch: `fix/review-2026-07-18-a`. Verify each task with the listed curl before committing;
run the backend as `cd backend && source venv/bin/activate && LLM_PROVIDER=mock RATE_LIMIT_ENABLED=false uvicorn main:app --port 8000`
(create the venv per CLAUDE.md if absent).

### Task A1 (Medium): Refine silently ignores the selected template

**Files:** `backend/services/llm_service.py` (~lines 225–303), `backend/routers/refine.py:64-69` (context only).

`refine_test_suite()` accepts `template_content` but never uses it; the system prompt at
`llm_service.py:283` is hardcoded, so the template picked for refinement has zero effect (mock and
real providers alike).

- [x] In `refine_test_suite`, incorporate the template into the system prompt, mirroring how
  generation does it — prepend the capped template text when present, e.g.:

```python
system_prompt = REFINE_SYSTEM_PROMPT  # the existing hardcoded string
if template_content:
    system_prompt = (
        f"{template_content[:10000]}\n\n"
        f"--- REFINEMENT TASK ---\n{system_prompt}"
    )
```

  Apply to every provider branch AND mock mode (mock can simply log/accept it — but the parameter
  must flow so behavior matches the contract).
- [x] Verify: `POST /api/v1/features/{id}/refine` with a valid `template_id` returns 200 (mock),
  and with a bogus `template_id` still 404s. Add a temporary debug log to confirm the prompt
  includes the template text, then remove it.
- [x] Commit: `fix(refine): actually use the selected template in the refine prompt`

### Task A2 (Medium): `POST /test-cases/` with nonexistent `feature_id` → 500

**Files:** `backend/routers/test_cases.py:21-29`, `backend/exceptions.py` (read-only).

FK enforcement is on (H9 pragma), so the flush raises an uncaught `IntegrityError` → 500. Every
other feature-scoped endpoint 404s properly.

- [x] In the create handler, before calling the repo:

```python
feature = feature_repo.get(test_case.feature_id)
if not feature:
    raise ResourceNotFoundError("Feature", test_case.feature_id)
```

  (Match the router's existing dependency style — inject `FeatureRepository` the same way other
  routers do.)
- [x] Also force server-side workflow integrity on this endpoint: manual creation should always
  produce `is_manual=True`. First check `frontend/src/components/AddTestCaseDialog.tsx`'s payload
  and `TestCaseCreate` in `models.py`; if the client already sends `is_manual`/`status`, override
  `is_manual=True` server-side and keep `status` as sent only if the frontend legitimately sets it
  — otherwise default to DRAFT. Do not break the dialog.
- [x] Verify: `curl -X POST localhost:8000/api/v1/test-cases/ -H 'Content-Type: application/json' -d '{"title":"x","steps":["a"],"expected_result":"b","feature_id":999999}'` → **404** with `{"detail": ...}`.
- [x] Commit: `fix(test-cases): 404 on unknown feature_id instead of 500; force is_manual server-side`

### Task A3 (Low batch): sibling-gap fixes — bounds, ordering, caps, retries

Mechanical fixes where a prior remediation hit one router/schema but not its sibling:

- [x] `backend/routers/templates.py:34-42` — pagination bounds, mirroring features:
  `skip: int = Query(default=0, ge=0), limit: int = Query(default=100, ge=1, le=200)`.
- [x] `backend/repositories/test_case_repository.py:116-135` — append `.order_by(TestCase.id)`
  to `get_by_feature`'s statement (stable export/UI ordering on Postgres).
- [x] `backend/models.py` — `TemplateUpdate`: re-add the caps `TemplateBase` has
  (`name: max_length=200`, `system_instructions: max_length=10000`).
- [x] `backend/models.py:142-146,193-196` — `FeatureLinkCreate.notes` and
  `TestCaseLinkCreate.notes`: add `max_length=1000` (matches the VARCHAR(1000) columns; prevents a
  Postgres 500).
- [x] `backend/models.py` — add sane `max_length` to user text fields (security review: unbounded
  growth): `FeatureBase.title` ≤ 300, `description` ≤ 5000, `raw_requirements` ≤ 20000;
  `TestCaseBase.title` ≤ 500, `expected_result` ≤ 5000; steps: ≤ 50 items, each ≤ 2000 chars
  (validator on the create/update schemas). Apply on the API schemas (`*Create`/`*Update`), not the
  table models, so no migration is needed.
- [x] `backend/services/validation_service.py:271-290` — add `max_retries=2` to the Anthropic
  validation call (parity with the openai/openrouter branches).
- [x] Verify: `curl 'localhost:8000/api/v1/templates/?limit=-1'` → 422; a feature create with a
  25k-char `raw_requirements` → 422; normal create/list flows still 200/201.
- [x] Commit: `fix(backend): pagination bounds, deterministic ordering, length caps, anthropic retries`

### Task A4 (Medium): rate-limit identity hardening

**Files:** `backend/rate_limit.py:16-39`, `backend/config.py`, plus proxy change in
`frontend/src/app/api/v1/[...path]/route.ts` (coordinate — this one file is shared with
Workstream B; it's a 2-line change, do it here in Workstream A).

Problems: `_client_key` trusts an *unverified* `X-API-Key` header (bucket-mint per request) and
falls back to client-supplied `X-Forwarded-For` with no trusted-proxy concept; the Next proxy
forwards client XFF verbatim.

- [x] In `_client_key`: only use the `key:` bucket when the presented key actually matches
  `settings.api_key` via `secrets.compare_digest`; otherwise ignore it.
- [x] Add setting `trust_x_forwarded_for: bool = False` (env `TRUST_X_FORWARDED_FOR`) to
  `config.py`; only honor the XFF header when it's true. Fallback remains peer address.
- [x] In the Next proxy: remove `x-forwarded-for` from the client-forwarded header allowlist and
  instead SET it server-side from the incoming connection
  (`req.headers.get('x-forwarded-for')` must NOT pass through; use the request's real remote —
  in Next route handlers that's the incoming `x-forwarded-for` set by Node itself, so simplest
  correct behavior: take only the FIRST hop the Next server itself observed, or omit the header
  entirely and let the backend key on the proxy's peer address + injected API key, which is the
  normal deployed mode).
- [x] Update the docstring threat analysis in `rate_limit.py` to describe the new trust model.
- [x] Verify (run with `RATE_LIMIT_ENABLED=true RATE_LIMIT_GENERATE=3/minute`): 4 rapid
  `POST /api/v1/generate/` with rotating `X-Forwarded-For: 1.1.1.<n>` and rotating fake
  `X-API-Key` values → the 4th is **429** (buckets no longer mintable).
- [x] Commit: `fix(rate-limit): verify key before keying, gate XFF behind TRUST_X_FORWARDED_FOR, stop proxy XFF passthrough`

### Task A5 (Low): force-regenerate has no atomic claim

**Files:** `backend/routers/generate.py:99-113`, `backend/repositories/feature_repository.py:48-65`.

`claim_initial_generation` only guards the 0→1 path; two concurrent `force_regenerate=true`
requests double-insert suites and lose a `generation_count` update.

- [x] Extend the claim to the force path with the same compare-and-swap shape:

```python
def claim_generation(self, feature_id: int, observed_count: int) -> bool:
    """Atomically bump generation_count iff it still equals observed_count."""
    result = self.session.exec(
        update(Feature)
        .where(Feature.id == feature_id, Feature.generation_count == observed_count)
        .values(generation_count=observed_count + 1)
    )
    self.session.flush()
    return result.rowcount == 1
```

  In the router's force branch: read `feature.generation_count`, do the delete+insert, and claim
  with the observed count; on `False`, raise `ResourceConflictError` ("generation already in
  progress"). Keep `claim_initial_generation` delegating to this (or replace it) — preserve the
  existing 0→1 semantics exactly.
- [x] Verify: normal generate → 201/200; second generate without force → 409;
  `force_regenerate=true` → replaces drafts, count increments once.
- [x] Commit: `fix(generate): atomic claim for force_regenerate (concurrent double-suite guard)`

### Task A6 (Improvement): link-repo `rollback()` → savepoint

**Files:** `backend/repositories/link_repository.py:100-112,221-230`.

`self.session.rollback()` in the IntegrityError→409 path discards the whole request UoW, not just
the failed insert — a latent lost-work hazard.

- [x] Wrap each link insert in a savepoint so only it rolls back:

```python
try:
    with self.session.begin_nested():
        self.session.add(link)
        # inverse link add too, inside the same nested block
        self.session.flush()
except IntegrityError:
    raise ResourceConflictError(...)  # keep the existing 409 mapping
```

  Preserve exact current behavior: duplicate link → 409, self-link → 400, success → both
  directions created.
- [x] Verify: create link → 201; create the same link again → **409** (not 500); the inverse link
  exists; delete works.
- [x] Commit: `refactor(links): savepoint instead of session rollback in duplicate-link handling`

---

## Workstream B — Frontend (one Sonnet implementer)

Branch: `fix/review-2026-07-18-b`. Verify each task compiles via targeted `npx tsc --noEmit` or
component-level reasoning; run one clean `cd frontend && npx next build` at the end of the
workstream (catches all type errors). Live behavior is verified in Phase E.

### Task B1 (High): stranded features can never generate

**Files:** `frontend/src/app/features/[id]/page.tsx:221-229`.

The Regenerate button is disabled when `generation_count === 0`, and the creation wizard is the
only other generation trigger — so a feature that exits the wizard early (refresh, 429, validation
failure) is permanently un-generatable from the UI.

- [x] When `feature.generation_count === 0`: render the same button as an **enabled** "Generate
  Test Cases" that calls the existing generate mutation with `{ feature_id, force_regenerate: false }`
  and NO destructive confirm dialog (nothing to destroy). When `> 0`: keep the current
  Regenerate behavior (confirm dialog + `force_regenerate: true`) unchanged.
- [x] Commit: `fix(feature-detail): enable first-time generation for features with no prior generation`

### Task B2 (Medium): error/loading truthfulness

**Files:** `frontend/src/app/features/[id]/page.tsx:87-102,351-367`, `frontend/src/app/page.tsx:34-47,108-119`,
`frontend/src/app/features/page.tsx:33-40,55-69`, `frontend/src/app/templates/page.tsx:70-77,92-107`.

- [x] Detail page: destructure `isLoading`/`error` from `useFeatureTestCases`; render a skeleton
  while pending, an error card with a Retry button (`refetch`) on error, and the "No test cases
  generated yet" empty state ONLY when the query succeeded with zero rows.
- [x] Dashboard / features list / templates list: gate the empty-state CTA and stat tiles on
  `!error` so an API outage shows only the error banner, not "No features yet — create your first".
- [x] `page.tsx:56` (detail): validate the `?status=` URL param —
  `['draft','accepted','rejected'].includes(raw) ? raw as TestCaseStatus : null` — instead of a
  blind cast (a bogus param currently 422s and then masquerades as the empty state).
- [x] Commit: `fix(ui): stop rendering empty states over fetch errors; validate status URL param`

### Task B3 (Medium): dashboard "Recent Features" shows the oldest

**Files:** `frontend/src/app/page.tsx:120`.

- [x] `[...features].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)).slice(0, 4)`.
- [x] Commit: `fix(dashboard): sort Recent Features by created_at desc`

### Task B4 (Low): delete-flow correctness

**Files:** `frontend/src/lib/queries.ts:222-232`, `frontend/src/app/features/[id]/page.tsx:44-52`,
`frontend/src/lib/api.ts:220-228,313-321,395-403,471-479,496-504`,
`frontend/src/app/api/v1/[...path]/route.ts:32`.

- [x] Feature delete race: stop `useDeleteFeature` from `removeQueries`-ing the actively observed
  detail query before navigation. Move cache removal so it happens after `router.push('/features')`
  (e.g. hook only invalidates the list; the page removes the detail query after navigating), or
  `cancelQueries` first. Outcome: no 404 refetch, no error-card flash on delete.
- [x] All five `delete*` API methods: route through `handleResponse` (guard 204/empty body before
  `.json()`) so the global toast shows the backend's real `detail` instead of hardcoded strings.
- [x] Proxy: wrap the backend `fetch` in try/catch →
  `NextResponse.json({ detail: 'Backend unreachable' }, { status: 502 })` on rejection.
  **Coordination note:** Workstream A task A4 also edits this file (XFF headers). If A4 already
  merged, rebase; the changes don't overlap in code, only in file.
- [x] Commit: `fix(ui): delete-flow race, real delete error details, 502 on backend-unreachable`

### Task B5 (Low batch): polish

- [x] `SearchInput.tsx:33-38` — only sync internal state from the prop when no debounce timer is
  pending (prevents the in-flight keystroke revert).
- [x] `LinkSelectorDialog.tsx:409-415` — add a `DialogDescription` (only dialog missing one; Radix
  warns, screen readers get no context).
- [x] `features/[id]/page.tsx:129,136-143` — delete the redundant invalidate in `handleRegenerate`
  and the duplicated `setQueryData` in `handleRefinementComplete` (both already done by the hooks'
  `onSuccess`); keep only `setRefinementMessage`.
- [x] `features/new/page.tsx:230-245` — add a "None (default prompt)" item to the template Select
  so it can be cleared.
- [x] `layout/DashboardLayout.tsx:28-56` — mobile: `h-[calc(100vh-3.5rem)] md:h-screen` on the
  ScrollArea (kills the double-scroll under the 56px header).
- [x] `lib/api.ts:188-193` — `featureApi.list()`/`templateApi.list()` silently cap at the backend
  default `limit=100`: pass an explicit `limit=200` (the backend max after A3) so growth headroom
  doubles; real pagination stays deferred (POC scale).
- [x] Commit: `fix(ui): search debounce sync, dialog a11y, dead cache writes, clearable template, mobile scroll`

### Task B6 (Improvements): backend parity affordances

- [x] `EditFeatureDialog.tsx:70-77` — on LLM-validation rejection, show the same "Proceed anyway"
  checkbox the create wizard has, sending `skip_llm_validation: true` (currently a rejected edit is
  unsaveable).
- [x] Regenerate dialog (`features/[id]/page.tsx:122-134`): add a template picker (reuse the
  wizard's select, incl. the new "None" item) and a `target_count` number input (3–30, default 10).
  Refine bar (`RefineActionBar.tsx:38-49`): add a `max_new_cases` input (1–15, default 5).
- [x] `providers/QueryProvider.tsx:20-33` — honor `meta: { suppressGlobalToast: true }` in the
  MutationCache error handler; set that meta on the mutations that already render inline errors
  (RefineActionBar, Add/Edit dialogs, TemplateForm) to stop double-surfacing.
- [x] Commit: `feat(ui): validation bypass on edit, template+count controls for regenerate/refine, dedup error toasts`
- [x] End of workstream: `cd frontend && npx next build` → must pass clean.

---

## Workstream C — Infra (small; can ride with A or run separately)

Branch: `fix/review-2026-07-18-c` (repo changes) + a `/srv/dakis` commit (compose changes).

- [x] `frontend/package.json` — add `ts-node` to devDependencies (the `generate-types` script
  invokes it via bare `npx`, which downloads an unpinned latest at runtime). Run `npm install` to
  update the lockfile.
- [x] `backend/Dockerfile:13-14` — drop the `chown -R appuser:appuser /app` (or switch to
  `COPY --chown`); only `/data` needs appuser writes. Halves the app-layer duplication.
- [x] `/srv/dakis/apps/qa-ai-assistant/compose.yml` (OUTSIDE this repo — edit carefully, commit in
  /srv/dakis): change web's `depends_on` to
  `qa-ai-assistant-api: { condition: service_healthy }`; add a comment noting that if backend
  `API_KEY` is ever set, the web service needs a matching `API_KEY` env or all proxied writes 401.
- [x] Root `.gitignore` — add `*.png` at repo root (headless-playwright screenshots land in cwd).
- [x] Commit(s): `chore(infra): pin ts-node, slim backend image layer, ignore stray screenshots`
  and in /srv/dakis: `qa-ai-assistant: health-gated depends_on + API_KEY wiring note`

---

## Workstream D — Docs (one Sonnet implementer; fully parallel with A–C)

Branch: `fix/review-2026-07-18-d`. Every item below was verified against code by the review — cite
lines are in the review outputs; re-verify each claim against the code before editing.

- [x] `CLAUDE.md` — Workflow section: accept/reject are **POST** not PATCH; Key Decision #5:
  validation model is `claude-haiku-4-5` not "claude-3-haiku"; env table: note `DATABASE_URL`
  default is an absolute path anchored to the backend dir.
- [x] `.claude/docs/api-reference.md` — `POST /test-cases/bulk-status` returns `TestCaseRead[]`,
  not `{"updated": n}`; duplicate link → **409** (only self-link is 400); creates
  (features/test-cases/templates/links) return **201** not 200; document **429** on
  `POST /generate/` and `POST /features/{id}/refine`; after Workstream A merges, document the new
  404 on `POST /test-cases/` with unknown `feature_id` and the length caps.
- [x] `.claude/docs/current-state.md:87` — delete the stale "no delete affordance in the UI yet"
  claim (delete UI shipped).
- [x] `.claude/docs/architecture.md` — migration history: add the three missing 2026-07-02
  revisions (tz-aware `created_at`, link unique constraints, `ix_testcase_feature_id`); fix the
  validation model name at :129.
- [x] `README.md` — Node **20.9+** not 18+; state is "TanStack Query" (drop "React Context or");
  API-endpoints section: add test-cases/refine/export/links.
- [x] `CLAUDE.md` security note (decision #1 above): add a short paragraph to the Docker section —
  ":3010 provides unauthenticated write access by design (the proxy injects the key); access
  control is network-layer (ufw/Tailscale)."
- [x] Commit: `docs: reconcile api-reference/CLAUDE.md/README/architecture with code`

---

## Phase E — Build, deploy, verify, reconcile (orchestrator, after A–D merge to main)

- [x] Merge order: A, then B (rebase over A's proxy change), C, D. Resolve the one known overlap
  (`route.ts`: A4 headers vs B4 try/catch — both changes must survive).
- [x] Rebuild + recreate both services:
  `cd /srv/dakis && sg docker -c 'docker compose up -d --build qa-ai-assistant-api qa-ai-assistant-web'`
- [x] Wait for `curl -s localhost:8010/health` → `{"status":"healthy"}` and
  `curl -s localhost:3010/ | head -c 200` → dashboard HTML.
- [x] Live smoke matrix (against :8010 / :3010, mock or current provider):
  - create feature → **generate from the detail page on a fresh feature** (B1 — the High) →
    accept a case → refine **with a template selected** (A1) → export CSV+JSON.
  - `POST /test-cases/` with bogus `feature_id` → 404 (A2).
  - duplicate link → 409 (A6 savepoint held).
  - rate limit: burst generate with rotating `X-Forwarded-For`/fake `X-API-Key` → 429 still trips (A4).
  - delete a test case, delete a feature via UI → no error flash, redirect works (B4).
  - `?status=bogus` on a detail page → clean fallback, not fake-empty (B2).
- [x] Playwright (headless) pass over :3010: dashboard (Recent Features order), feature detail
  error/empty states, mobile viewport scroll (B5). Delete any screenshots from cwd afterward.
- [x] Update `fable-review.md`: add a "2026-07-18 second-pass review" section listing these
  findings with ✅ status, note the two deliberate deferrals (template column-length migration,
  proxy auth posture).
- [x] Update `CLAUDE.md` Known Issues to point at this plan's completion; keep "no backend test
  suite" as the sole open structural item.
- [x] Final commits on `main` in the repo; `/srv/dakis` commit for compose. **No Claude attribution.**
