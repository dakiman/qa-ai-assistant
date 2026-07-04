# QA-Craft — Full Codebase Review

**Date:** 2026-07-02
**Scope:** entire repository (backend, frontend, Docker/infra, docs) plus the deployed compose at `/srv/dakis/apps/qa-ai-assistant/compose.yml`.
**Method:** four parallel deep-review passes (backend core, backend API/services, frontend, infra/docs). Key backend findings were verified empirically by running the failing code paths inside the project's own `qa-ai-assistant-api` Docker image; the top findings were then independently re-verified against the source.

---

> **Resolution status (2026-07-02):** All 13 High-severity findings (H1–H13) **and all 26 Medium-severity findings (M1–M26)** are **fixed and verified**. High batch: merged in `fbb1c07`. Medium batch: merged in `db52166` (backend `a533d86`, frontend `46adb0e`, infra `a915c0c`) — verified via Alembic up/down migration cycle on SQLite, mock-mode router smoke tests (generation guard, force-regen preserving manual/accepted cases, cascade delete), a clean `next build` typecheck, and an end-to-end pass through the redeployed stack (create / null-PATCH→400 / CSV-injection escape / pagination bounds / cascade delete) against the real deployed DB with all data preserved; both containers report healthy. A high-value subset of the Low findings — **L4, L6, L7, L8, L12, L15, L16, L18, L22, L24** — was fixed earlier (branch `fix/fable-low-highvalue`). **As of this pass, every remaining Low is also resolved — L1–L3, L5, L9–L11, L13–L14, L17, L20–L21, L23, L25–L30**, and L19 is now resolved too (regenerated with `defaultNonNullable: false`), leaving only the structural suggestions. Backend Low fixes were verified live against the redeployed stack (X-Request-ID validation, export SQL status filter, bulk-status atomic 404, refine feature_id-mismatch 400); the frontend was verified by a clean production `next build`. Fixed items are marked ✅ RESOLVED below.

---

## Handoff — remaining work (for the next agent)

**Everything High and Medium is DONE and merged to `main`, and now ALL Low findings (L1–L30) are resolved.** History: `fbb1c07` (High) → `db52166` (Medium) → `a20fa9c` (high-value Lows) → this pass (remaining Lows L1–L3, L5, L9–L11, L13–L14, L17, L20–L21, L23, L25–L30). All changes are **local commits only — not pushed**. The deployed stack (`/srv/dakis/apps/qa-ai-assistant/compose.yml`, ports 8010/3010) was rebuilt this pass and both containers report healthy; backend fixes were smoke-tested live (see per-item notes).

**Still open — two structural suggestions and one product call (L19 is now RESOLVED):**

1. **Structural #1 — backend test suite.** `backend/tests/` still doesn't exist. Highest leverage: pytest over the routers with in-memory SQLite + mock LLM would lock in H1–H5, M5–M8, L13, rate limiting, and the migration behavior. All verified manually but with no regression net. *(Explicitly declined for now.)*
2. **Structural #2 — unit-of-work / commit-once.** Partially done: generate/refine now commit once (M6) via `commit=False` repo params, but the base repos still commit per-call elsewhere. A real UoW dependency would finish it. *(Planned: see `.claude/docs/plans/2026-07-04-remaining-remediation.md` Workstream C.)*
3. **Product decision (from L21):** the backend `DELETE` endpoints for features/test cases have no UI. The dead client hooks were removed; wiring delete UI (with confirm dialogs) is a deliberate, still-open product choice. *(Planned: same plan, Workstream B.)*

**Structural #5 — rate limiting — DONE:** `slowapi` (in-memory) now limits `POST /generate/` (default 10/min) and `POST /features/{id}/refine` (default 15/min), keyed API-key → `X-Forwarded-For` → peer address, env-configurable via `RATE_LIMIT_ENABLED`/`RATE_LIMIT_GENERATE`/`RATE_LIMIT_REFINE`, returning a 429 in the app's `{"detail": ...}` format. The Next proxy now forwards `x-forwarded-for`. Verified live: the 11th generate in a minute → 429 while refine kept its own bucket. This also blunts M5 (double-clicked generation).

**Environment caveat (not a code bug):** the deployed backend runs `LLM_PROVIDER=openrouter` on a free model that fails instructor's tool-calling structured output (503 on real generate/validate). Use a tool-calling-capable model (anthropic/openai) or `mock` to exercise real generation. Switching instructor to `Mode.JSON` for the openrouter branch would fix free models but was declined this pass.

## Executive summary

The architecture is sound (repository pattern, instructor-constrained LLM output, mock mode, structured logging, optional API-key auth — all consistently applied), but several **core workflows are broken in ways that lose user data or 500**:

1. **Deleting a feature that has test cases returns 500** — the ORM tries to null a NOT NULL FK. Since nearly every feature has test cases, feature deletion is effectively broken. *(verified empirically)*
2. **`force_regenerate=true` permanently deletes the engineer's hand-written manual test cases**, and it deletes all drafts *before* validation and the LLM call — so a failed regeneration leaves the feature with nothing. This contradicts the human-in-the-loop premise.
3. **With `AUTO_MIGRATE=true` (the default), Alembic's `fileConfig` disables all application logging at startup** — the app runs log-silent, defeating the entire structured-logging/request-ID design. *(verified empirically)*
4. **The documented PostgreSQL production path cannot start**: `check_same_thread` is passed to every driver, and no Postgres driver is in requirements.txt.
5. **`NEXT_PUBLIC_API_KEY` ships the backend write key in the public JS bundle** — the auth layer provides zero protection once the frontend is reachable, even though a server-side proxy exists that could hold the key.
6. **Export is broken in the default dev setup**: `ExportButton.tsx` still defaults to port **8001** (the bug CLAUDE.md marks resolved was only fixed in `api.ts`).
7. **CLAUDE.md/README document a Docker workflow that doesn't exist**: there is no `docker-compose.yml` or `docker-compose.dev.yml` anywhere in the repo or its history, and the claimed-tracked `.env.example` files were never created.

---

## Critical / High severity

### Backend — data loss & broken workflows

✅ **RESOLVED — H1. `DELETE /features/{id}` 500s for any feature with test cases** — `backend/models.py:56`, `backend/routers/features.py:90`
`Feature.test_cases` has no delete cascade, so `session.delete(feature)` makes SQLAlchemy null out `testcase.feature_id`, which is NOT NULL. Verified in the backend image: `IntegrityError: NOT NULL constraint failed: testcase.feature_id`.
**Fix:** add `cascade_delete=True` (or `sa_relationship_kwargs={"cascade": "all, delete-orphan"}`) to the relationship, and delete dependent `FeatureLink`/`TestCaseLink` rows in the delete path.

✅ **RESOLVED — H2. `force_regenerate` deletes manual test cases** — `backend/repositories/test_case_repository.py:187`
`delete_drafts` filters only `status == DRAFT`; manually added cases (`is_manual=true`) are created as DRAFT, so regeneration silently destroys the engineer's hand-written work.
**Fix:** add `TestCase.is_manual == False` to the where-clause.

✅ **RESOLVED — H3. Drafts are deleted (and committed) before validation and the LLM call** — `backend/routers/generate.py:57`
Order is delete → validate → LLM. If validation raises 422 or the LLM errors/times out, existing drafts are already gone and nothing replaces them. No transaction spans the endpoint (every repo method commits individually).
**Fix:** validate first, generate, then swap old drafts for new ones in a single transaction (repositories add without committing; the router commits once).

✅ **RESOLVED — H4. `PATCH /features/{id}` with `skip_llm_validation` in the body → 500** — `backend/repositories/feature_repository.py:31`
`FeatureUpdate` includes `skip_llm_validation`, but `repo.update` setattr's every key onto `Feature`, which has no such field. Verified: `ValueError: "Feature" object has no field "skip_llm_validation"`.
**Fix:** exclude the flag from the update dict (`model_dump(exclude={"skip_llm_validation"}, exclude_unset=True)`).

✅ **RESOLVED — H5. `target_count` / `max_new_cases` are not enforced on real LLM output** — `backend/services/llm_service.py:199, 321`
Only mock mode slices to the limit; the real provider paths return `response.test_cases` unbounded and the routers persist everything. The documented 3–30 / 1–15 guards only validate the *request*.
**Fix:** truncate LLM responses to the requested counts before returning.

✅ **RESOLVED — H6. Default Anthropic model is retired; real anthropic mode is dead on arrival** — `backend/config.py:28,36`
`claude-3-sonnet-20240229` was retired in 2025; `claude-3-haiku-20240307` (validation) is EOL; `gpt-4-turbo` is legacy. With `LLM_PROVIDER=anthropic`, every call 404s → 503.
**Fix:** update defaults to current model IDs (e.g. current Sonnet/Haiku generations).

### Backend — platform & startup

✅ **RESOLVED — H7. `AUTO_MIGRATE=true` (the default) silences all app logging** — `backend/alembic/env.py:36`
`command.upgrade()` runs `fileConfig(alembic.ini)` with the default `disable_existing_loggers=True`, disabling every already-created logger and replacing the root handler/formatter. Verified: after migration, even `logger.warning()` emits nothing.
**Fix:** `fileConfig(config.config_file_name, disable_existing_loggers=False)`, or skip `fileConfig` when the root logger already has handlers.

✅ **RESOLVED — H8. PostgreSQL production path cannot start** — `backend/database.py:37`, `backend/requirements.txt`
`connect_args={"check_same_thread": False}` is passed unconditionally (SQLite-only argument → TypeError on psycopg2), and no Postgres driver is listed in requirements.txt at all.
**Fix:** gate connect_args on the URL scheme (`if settings.database_url.startswith("sqlite")`), add `psycopg2-binary` (or `psycopg[binary]`), and consider `pool_pre_ping=True` for Postgres.

✅ **RESOLVED — H9. SQLite foreign keys are never enabled** — `backend/database.py:34`
No `PRAGMA foreign_keys=ON` listener, so the `ondelete='CASCADE'` FKs on the link tables are inert. Deleting test cases (or features, once H1 is fixed) leaves dangling link rows; `check_*_link_exists` still sees them, causing permanent spurious 409s when re-linking. Behavior silently diverges from a Postgres deployment.
**Fix:** add an engine `connect` event listener issuing `PRAGMA foreign_keys=ON` for SQLite.

### Frontend

✅ **RESOLVED — H10. `NEXT_PUBLIC_API_KEY` exposes the write key to every browser** — `frontend/src/lib/api.ts:11` (also `ExportButton.tsx:16`)
It's inlined into the public bundle at build time; anyone can extract the `X-API-Key` that authorizes all writes. The server-side proxy at `frontend/src/app/api/v1/[...path]/route.ts` is the right place for the secret but forwards client headers verbatim and never injects it.
**Fix:** drop `NEXT_PUBLIC_API_KEY`; have the proxy inject `X-API-Key` from a server-only env var, and point the client at the relative `/api/v1` base.

✅ **RESOLVED — H11. Export is broken in the default setup: port 8001 leftover** — `frontend/src/components/ExportButton.tsx:15`
`API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api/v1'` while `api.ts` defaults to 8000. CLAUDE.md marks the 8001 bug "RESOLVED" — only `api.ts` was fixed. The component also duplicates header/key logic, violating the "all API calls go through `lib/api.ts`" convention. Failure is silent (`console.error` only).
**Fix:** move the export call into `lib/api.ts` and delete the local constants.

✅ **RESOLVED — H12. Search/filter changes unmount the page and drop input focus, one request per keystroke** — `frontend/src/app/features/[id]/page.tsx:66-71,138`
Each keystroke rewrites the URL → new query key → no cached data → `isLoading` → the whole page (including `SearchInput`) is replaced by the skeleton. Search is effectively unusable against a non-instant backend.
**Fix:** `placeholderData: keepPreviousData` on the filtered query, debounce the URL sync, and gate the full-page skeleton on `featureLoading` only.

### Docs / infra

✅ **RESOLVED — H13. CLAUDE.md and README document nonexistent Docker files and env examples** — `CLAUDE.md:60-101,278`, `README.md:39,59,92-95`
No `docker-compose.yml` / `docker-compose.dev.yml` exists in the repo or its git history; the real deployment compose lives at `/srv/dakis/apps/qa-ai-assistant/compose.yml` with different service names (`qa-ai-assistant-api`/`qa-ai-assistant-web`). `backend/.env.example` and `frontend/.env.local.example` are claimed "now tracked" (also in `.claude/docs/current-state.md:70` and `poc-improvement-plan.md:28`) but were never created — only the `.gitignore` exemption was added. Every documented `cp .env.example` and `docker compose` command fails on a fresh clone.
**Fix:** either commit compose files matching the docs, or rewrite the Docker section to point at the real deployment path/names; create and commit the two env example files.

---

## Medium severity

### Backend

- ✅ **RESOLVED — M1. API key compared with `!=`** — `backend/auth.py:46`. Timing side-channel on a LAN/Tailscale-exposed write API. Use `secrets.compare_digest`. **Fixed:** now uses `secrets.compare_digest`.
- ✅ **RESOLVED — M2. `created_at` stored/read as naive datetimes** — `backend/models.py:51` + migrations. Columns lack `timezone=True`; verified round-trip gives `tzinfo=None`. Aware-vs-naive comparisons raise TypeError, and JSON serializes without `Z`, so browsers parse timestamps as local time (display skew = client's UTC offset). Violates the project's own "all datetimes timezone-aware" rule. **Fixed:** `sa_type=DateTime(timezone=True)` on all `created_at` columns, a Postgres-only alter migration, and a naive→UTC read-schema coercion so JSON always carries an offset (verified live: `...Z`).
- ✅ **RESOLVED — M3. Misconfigured provider silently falls back to mock** — `backend/services/llm_service.py:134,238` (and `validation_service.py:162`). `LLM_PROVIDER=openai` with a missing key (or a typo'd provider name) produces fake "AI-generated" cases with no error. Raise `LLMConfigurationError` instead. **Fixed:** only `mock` uses the fake generator; a real provider with no usable client now raises `LLMConfigurationError`.
- ✅ **RESOLVED — M4. CSV export formula injection** — `backend/routers/export.py:126`. LLM/user-controlled fields are written verbatim; `=HYPERLINK(...)`-style payloads execute in Excel/LibreOffice — the primary consumption path. Prefix `=`, `+`, `-`, `@`, tab, CR with `'`. **Fixed:** `_sanitize_csv_cell` prefixes those triggers (verified live: `'=cmd`).
- ✅ **RESOLVED — M5. `generation_count` guard is check-then-act across a multi-second LLM call** — `backend/routers/generate.py:50,103`. Concurrent/double-clicked requests both pass the guard and insert two full suites — exactly what the guard exists to prevent. Enforce atomically (`UPDATE ... WHERE generation_count = 0` + rowcount check). **Fixed:** `claim_initial_generation` does the conditional UPDATE and the loser is rejected 409.
- ✅ **RESOLVED — M6. Row-by-row commits with no transactional boundary in generate/refine** — `backend/routers/generate.py:91`, `refine.py:82`. Partial failure persists some drafts with the counter not incremented, so the next non-force generate appends a second suite. **Fixed:** repos add/flush with `commit=False`; the router commits the whole generate/refine batch once.
- ✅ **RESOLVED — M7. Link create is TOCTOU with no unique constraint; inverse delete only removes `.first()`** — `backend/routers/links.py:89`, `link_repository.py:156`. Duplicate pairs are possible and then leave a dangling one-directional inverse row that makes `check_feature_link_exists` return true forever. Add a unique constraint on (source, target), catch IntegrityError as 409, delete all matching inverse rows. **Fixed:** unique constraints on both link-pair tables (with a dedup migration), `IntegrityError`→409, and delete-all inverse rows.
- ✅ **RESOLVED — M8. Explicit JSON `null` in PATCH bodies → 500** — `backend/repositories/test_case_repository.py:63` (pattern shared by all update paths). `{"steps": null}` passes Pydantic and violates NOT NULL at commit (verified). Use `exclude_none=True` for non-nullable fields or reject nulls with validators. **Fixed:** shared `reject_null_fields` raises a 400 for null on NOT-NULL columns across all three update repos (verified live: 400).
- ✅ **RESOLVED — M9. Invalid `template_id` silently ignored on refine but 404s on generate** — `backend/routers/refine.py:52`. The user's template is silently not used. Raise `ResourceNotFoundError` to match `generate.py`. **Fixed:** refine now raises `ResourceNotFoundError` on an unknown template.
- ✅ **RESOLVED — M10. Instructor calls lack `max_retries`; Anthropic path merges system prompt into user message; fixed `max_tokens=4096`** — `backend/services/llm_service.py:177-193,309-316`. The documented "instructor retries (max 2)" only holds in validation_service's OpenAI path. Anthropic generate/refine should use the `system=` parameter; `max_tokens` should scale with `target_count` (30 structured cases will truncate → 503). **Fixed:** `max_retries=2` on all calls, anthropic uses `system=`, and `max_tokens` scales via `_max_tokens_for(count)`.
- ✅ **RESOLVED — M11. Pagination has no ORDER BY and unbounded skip/limit** — `backend/repositories/base.py:52`. Unstable page order (especially on Postgres); `limit=-1` on SQLite dumps the table. Add `.order_by(id)` and `Query(ge=0)`/`le=` bounds. **Fixed:** `get_all` orders by `id`; the router bounds `skip (ge=0)` / `limit (ge=1, le=200)` (verified live: `limit=0`→422).
- ✅ **RESOLVED — M12. Model FK metadata diverges from migrations** — `backend/models.py:87-121`. Link-table FKs omit `ondelete='CASCADE'` that migrations define; autogenerate will emit spurious diffs and `create_all`-based test schemas get different delete semantics. **Fixed:** link FKs now declare `ondelete="CASCADE"` in the models.
- ✅ **RESOLVED — M13. Alembic downgrades broken** — `2026_02_21` migration runs Postgres-only `DROP TYPE` (fails on SQLite mid-downgrade); the initial migration never drops `testcasestatus` (Postgres downgrade→upgrade cycle fails with DuplicateObject). Guard by dialect / use `sa.Enum(...).drop(bind, checkfirst=True)`. **Fixed:** `DROP TYPE` is dialect-guarded to Postgres and the initial downgrade drops `testcasestatus` on Postgres (verified: full down→up cycle on SQLite).

### Frontend

- ✅ **RESOLVED — M14. `refinement_count`/`generation_count` go stale — feature detail never invalidated** — `frontend/src/lib/queries.ts:339,356`. With `staleTime: 5min`, the "Gen X · Refine Y" badge and the ≥3-refinements warning use stale data. Invalidate `queryKeys.features.detail(feature_id)` in both mutations' `onSuccess`. **Fixed:** both `useGenerateTestCases` and `useRefineTestSuite` now invalidate the feature detail query.
- ✅ **RESOLVED — M15. `RefineActionBar` copies the count prop into state** — `frontend/src/components/RefineActionBar.tsx:22`. `useState(refinementCount)` ignores later prop changes; navigating away/back re-seeds from stale cache and suppresses the warning. Derive from the prop. **Fixed:** the local state is gone; the warning derives directly from the `refinementCount` prop.
- ✅ **RESOLVED — M16. "Edit Feature" button is a dead placeholder** — `frontend/src/app/features/[id]/page.tsx:201`. No handler; `useUpdateFeature` exists but is never called anywhere. Wire an edit dialog or remove the button. (Not listed in CLAUDE.md's known issues.) **Fixed:** new `EditFeatureDialog` wired to the button, calling `useUpdateFeature`.
- ✅ **RESOLVED — M17. Mutation errors swallowed to `console.error` across the app** — regenerate (`features/[id]/page.tsx:109`), accept/reject/reset (`TestCaseCard.tsx:32,41,50`), link create/delete (`LinkManager.tsx:63,74`, `LinkSelectorDialog.tsx:122`), template delete (`templates/page.tsx:41`), export (`ExportButton.tsx:76`). Users get no feedback on failure. Add inline errors or a shared toast. **Fixed:** a dependency-free toast store + `<Toaster/>` wired into `QueryClient`'s `MutationCache.onError` reports every failed mutation globally (validation errors excluded — forms show those inline); export gets an explicit toast.
- ✅ **RESOLVED — M18. Fake optimistic update on accept** — `frontend/src/lib/queries.ts:276`. `onMutate` cancels a query key nothing uses, returns "rollback" context with no `onError`, and writes no cache data. Delete it or implement a real optimistic update with rollback. **Fixed:** the no-op `onMutate` was removed.
- ✅ **RESOLVED — M19. Status-change handler patches only the unfiltered cache and can fabricate an empty list** — `features/[id]/page.tsx:85`. The `?? []` writes a fresh empty array with a new `dataUpdatedAt`, which can briefly render "No test cases generated yet". Return `old` unchanged when undefined; use `setQueriesData` over the key prefix. **Fixed:** now `setQueriesData` over the `testCases` key prefix and returns `old` untouched when empty.
- ✅ **RESOLVED — M20. Unfiltered test cases fetched twice; `enabled: hasActiveFilters` gate is dead code** — `features/[id]/page.tsx:70-77` + `queries.ts:395`. `useFeatureDetail` always mounts the unfiltered query internally. Use `useFeature` directly. **Fixed:** the page uses `useFeature`; the unfiltered query is now genuinely gated by `hasActiveFilters`.
- ✅ **RESOLVED — M21. Proxy route forwards all request headers verbatim and doesn't strip `content-length` from responses** — `frontend/src/app/api/v1/[...path]/route.ts:10,20-24`. Stale `content-length`/`host` forwarded upstream; undici decompresses but keeps the compressed `content-length`, so adding GZip on the backend would corrupt proxied responses. Forward an allowlist; strip `content-length` too. **Fixed:** the request allowlist was already in place (H10 batch); `content-length` is now also stripped from responses.
- ✅ **RESOLVED — M22. Filter chips are click-only `<span>`s** — `frontend/src/components/TestCaseFilters.tsx:101`. No keyboard access, no `aria-pressed`; keyboard/screen-reader users cannot filter. Also unlabeled icon-only buttons in `LinkManager.tsx:100,210,248` and unlabeled selects in `ExportButton.tsx:84,94`. Use real `<button aria-pressed>` elements and `aria-label`s. **Fixed:** filter chips are real `<button aria-pressed>` elements; `aria-label`s added to the link delete/expand buttons and the export selects.

### Infra

- ✅ **RESOLVED — M23. Both containers run as root with no HEALTHCHECK** — `backend/Dockerfile`, `frontend/Dockerfile:17`. The compose `depends_on` is ordering-only, and CLAUDE.md tells the operator to poll `/health` by hand. Add non-root users (`USER node` for the frontend) and HEALTHCHECKs. **Fixed:** backend runs as `appuser` (uid 1000, matching the `/srv/dakis/data` bind-mount owner) and frontend as `USER node`; both have HEALTHCHECKs. Note: Next standalone needed `HOSTNAME=0.0.0.0` and the probe uses `127.0.0.1` (in-container `localhost` resolves to IPv6 `::1` and is refused). Both containers verified `healthy`.
- ✅ **RESOLVED — M24. `backend/.dockerignore` omits `venv/`** — README instructs creating `backend/venv`, and the Dockerfile does `COPY . .` from exactly that directory, baking hundreds of MB of host-platform packages into every image. Add `venv/`, `.venv/`, `.pytest_cache/`, `*.db-journal`. **Fixed:** added `venv/`, `.venv/`, `.pytest_cache/`, `.mypy_cache/`, `.ruff_cache/`, and `*.db-journal/-wal/-shm`.
- ✅ **RESOLVED — M25. requirements.txt is all open-ended `>=` floors with no lock file** — every `--build` resolves the newest releases; a breaking `instructor`/`openai` major lands silently in the "production-like" image (frontend, by contrast, is fully locked). Pin or add a lock file. **Fixed:** pinned to the exact versions currently baked into the tested image (`==`).
- ✅ **RESOLVED — M26. Env-var docs incomplete** — CLAUDE.md/README omit the fully implemented `openrouter` provider (`backend/config.py:21-37`, `llm_service.py`) and `BACKEND_URL`, the only env var that matters for the Dockerized frontend proxy. **Fixed:** README now documents the `openrouter` provider/key and the `BACKEND_URL`+proxy design (CLAUDE.md already covered both).

---

## Low severity

### Backend

- ✅ **RESOLVED — L1.** Per-worker startup migrations + seeding race under `--workers N` — `backend/main.py:31`, `seed.py:19`. **Fixed:** seeding now catches `IntegrityError` (rollback + treat as already-seeded), and `main.py` documents that migrations serialize on the version table but should ideally run once via CLI under multi-worker.
- ✅ **RESOLVED — L2.** `Config("alembic.ini")` and `sqlite:///./qa_craft.db` are CWD-relative — starting uvicorn from the repo root breaks or silently creates a second empty DB. **Fixed:** the Alembic config and the default SQLite path are both anchored to `__file__` (backend dir).
- ✅ **RESOLVED — L3.** Deprecated pydantic v1-style `class Config` on BaseSettings — `backend/config.py:63`. **Fixed:** now `model_config = SettingsConfigDict(...)`.
- ✅ **RESOLVED — L4.** `X-Request-ID` (and `Content-Disposition`) not in CORS `expose_headers` — `backend/main.py:69` — so the frontend can't read the trace ID it was designed to receive, and `ExportButton`'s filename parsing (`ExportButton.tsx:56`) always falls back cross-origin. **Fixed:** both added to `expose_headers` (verified live).
- ✅ **RESOLVED — L5.** Client-supplied `X-Request-ID` trusted verbatim; generated IDs truncated to 8 hex chars — `backend/logging_config.py:32`. **Fixed:** incoming IDs must match `^[A-Za-z0-9._-]{1,64}$` (else a full `uuid4().hex` is generated). Verified live: a malformed header is replaced with a 32-char hex id; a valid token is echoed verbatim.
- ✅ **RESOLVED — L6.** `AuthenticationError` in exceptions.py is dead code (auth.py raises bare `HTTPException`); `main.py:9` imports `LLMServiceError` unused. **Fixed:** removed both.
- ✅ **RESOLVED — L7.** No index on `testcase.feature_id` — the hottest FK in the schema (every list/export/refine filters on it). Add `index=True` + migration. **Fixed:** `index=True` + migration `ix_testcase_feature_id` (verified present).
- ✅ **RESOLVED — L8.** `CORS_ORIGINS=*` with `allow_credentials=true` (default) is a config trap — Starlette mirrors the Origin with credentials allowed. Reject the combination at startup — `backend/config.py:54`. **Fixed:** a `model_validator` raises at startup for that combination (verified).
- ✅ **RESOLVED — L9.** `RefinementResponse.new_count` is actually the *total* case count — `backend/routers/refine.py:105`. **Fixed:** `new_count` now carries the number of newly-added cases (== `edge_cases_added`); the total remains derivable from `test_cases`.
- ✅ **RESOLVED — L10.** `RefinementRequest.feature_id` in the body is silently ignored in favor of the path param — `backend/models.py:300`. **Fixed:** a body `feature_id` that mismatches the path now raises a 400 (verified live: `feature_id:999999` on `/features/1/refine` → 400). The field is kept because the frontend uses it to build the URL.
- ✅ **RESOLVED — L11.** links router uses bare `HTTPException` six times, violating the custom-exception convention; the 403s at lines 141/237 also leak link existence where 404 is conventional — `backend/routers/links.py`. **Fixed:** all six now use `ValidationError`/`ResourceConflictError`/`ResourceNotFoundError`; a link that belongs to a different feature returns 404 (not 403), so existence isn't leaked.
- ✅ **RESOLVED — L12.** Title search: unescaped LIKE wildcards (`%`/`_`) and case-sensitivity that diverges between SQLite and Postgres — `backend/repositories/test_case_repository.py:121`. Use `icontains(search, autoescape=True)`. **Fixed:** now `icontains(search, autoescape=True)` (verified: `90%` matches only the literal).
- ✅ **RESOLVED — L13.** `bulk_update_status` silently drops nonexistent IDs and does N+1 refresh selects — `test_case_repository.py:160`. **Fixed:** one `IN (...)` fetch, atomic — any missing ID raises `ResourceNotFoundError` before committing (verified live: unknown id → 404), and results are re-selected in a single query instead of per-row refresh.
- ✅ **RESOLVED — L14.** Export filters status in Python instead of using the repository's SQL filter — `backend/routers/export.py:54`. **Fixed:** passes `status=` to `get_by_feature` (SQL filter). Verified live (`?status=accepted` → 200 total=8; `?status=bogus` → 422).
- ✅ **RESOLVED — L15.** Prompt-injection defenses only log; user-authored template `system_instructions` are entirely unsanitized, and linked-feature requirements enter the prompt, so one poisoned feature can steer generation for features that link to it — `backend/services/llm_service.py:23,139`. Wrap untrusted text in data delimiters; cap template length. **Fixed:** requirements are wrapped in explicit BEGIN/END data markers in both prompts; template name/instructions are length-capped (`max_length`) and the system prompt is defensively truncated.
- ✅ **RESOLVED — L16.** `RefinedTestCaseList` (gap_analysis/recommendations) is dead code — refinement uses plain `TestCaseList`, so the "based on gap analysis" response message isn't backed by anything — `llm_service.py:72,302`. **Fixed:** removed the dead `RefinedTestCase`/`RefinedTestCaseList` classes.
- ✅ **RESOLVED — L17.** Mock mode can return fewer than the minimum `target_count` and ignores template/linked context, diverging from real-mode behavior — `llm_service.py:575`. **Fixed (count):** mock now pads with generic filler cases up to `target_count` so it honors the same contract as the real providers (which are truncated to `target_count`). Mock still intentionally ignores template/linked context — it's a dev stub with no real model to steer.

### Frontend

- ✅ **RESOLVED — L18.** `npm run build` requires a live backend on :8000 (`generate-types` fetches openapi.json); the Dockerfile silently bypasses it with `npx next build`, so the canonical script and the shipped image use different builds — `frontend/package.json:7`. Make `build` just `next build`. **Fixed:** `build` is now `next build`.
- ✅ **RESOLVED — L19.** Regenerated `api-types.ts` with `defaultNonNullable: false` (via the programmatic `openapi-typescript` API in `scripts/generate-types.ts`) so only the OpenAPI `required` array drives required-ness — `target_count`/`force_regenerate`/`skip_llm_validation` are now correctly optional. The redundant intersection patches in `api.ts` were dropped; `next build` passes clean.
- ✅ **RESOLVED — L20.** Overlapping 5s refinement-message timers clear newer messages early; no unmount cleanup — `features/[id]/page.tsx:122`. **Fixed:** the timer moved into a `useEffect` keyed on the message value, so each new refinement resets it and it cleans up on unmount.
- ✅ **RESOLVED — L21.** Dead code hiding missing features: `useUpdateFeature`, `useDeleteFeature`, `useDeleteTestCase`, `featureApi.getStats` + `FeatureStats`, `BulkStatusUpdate`, `TestCaseCard.onDelete`. **Fixed (dead code removed):** `useUpdateFeature` is now genuinely used (`EditFeatureDialog`, M16) and kept; the truly-dead `useDeleteFeature`/`useDeleteTestCase` hooks, `getStats`+`FeatureStats`, the `BulkStatusUpdate` alias, and `TestCaseCard.onDelete` were deleted. **Note:** the backend `DELETE` endpoints for features/test cases still exist — wiring delete UI (with confirm dialogs) was deliberately *not* done here because it's a destructive product decision; asked the user, no response, so took the conservative path. Wire it later if desired.
- ✅ **RESOLVED — L22.** FastAPI 422 arrays collapse to the generic "Request failed" — `api.ts:188`. Join `detail.map(d => d.msg)`. **Fixed:** array `detail` is now joined into a readable message.
- ✅ **RESOLVED — L23.** Dashboard always appends "..." even for untruncated text; features list truncates invisibly — `app/page.tsx:133`, `features/page.tsx:81`. **Fixed:** both now render the full `description || raw_requirements` and let the existing CSS `line-clamp-2` truncate with a real ellipsis (no manual `.slice()`/`"..."`).
- ✅ **RESOLVED — L24.** Sidebar: two nav items active on `/features/new`; no `aria-current`; the "API Connected" pill is a hardcoded green dot with no health check behind it — `Sidebar.tsx:57,82-85`. **Fixed:** only the longest-prefix nav item is active, `aria-current="page"` added, and the pill now reflects a real `useApiHealth` probe (green/amber/red).
- ✅ **RESOLVED — L25.** `AddTestCaseDialog` doesn't reset error/form state on close (EditTestCaseDialog does) — `AddTestCaseDialog.tsx:85`. **Fixed:** a `handleOpenChange` resets form + error whenever the dialog closes (Cancel/Esc/overlay).
- ✅ **RESOLVED — L26.** Ad-hoc query key in `LinkSelectorDialog.tsx:85` (works only by accidental prefix overlap); shared `isPending` disables every row's delete button while any one delete runs — `LinkManager.tsx:143,162`. **Fixed:** the linking query key now derives from `queryKeys.features.testCases(...)` (+ a `forLinking` suffix); each row's delete button disables only when *that* link is in flight (`mutation.isPending && mutation.variables?.linkId === link.id`).

### Docs

- ✅ **RESOLVED — L27.** `.claude/docs/current-state.md` contradicts CLAUDE.md (Edit-button open, env examples, OpenAI default, old-host "Port Audit"). **Fixed:** reconciled against code (2026-07-02) — Edit dialogs marked resolved, env examples now genuinely exist and are noted, model defaults corrected, the "Port Audit" replaced with the real 3010/8010 (docker) / 3000/8000 (native) ports incl. the 3000=jira-rag caveat, and the dependency notes updated to the pinned `==` reality. Stale banner/date refreshed.
- ✅ **RESOLVED — L28.** `.cursor/context.md` documents non-working `pytest`/`npm test` commands and names the root `qa-ai-tool/`. **Fixed:** root renamed to `qa-ai-assistant/`, the Tests block flagged as not-yet-implemented, and the env section updated for the proxy/`BACKEND_URL` design + openrouter.
- ✅ **RESOLVED — L29.** `run-project.md` is Windows/PowerShell-first and never mentions Docker or ports 3010/8010. **Fixed:** added a top-of-file Docker deployment section (compose path, service/port table, rebuild caveat) and a note that native is dev-only; also added the openrouter provider to the env block.
- ✅ **RESOLVED — L30.** CLAUDE.md's directory tree omits the Dockerfiles, `run-project.md`, several components, `frontend/scripts/generate-types.ts`, and the API proxy `route.ts`. **Fixed:** the tree now includes all of them, and the proxy entry documents the `BACKEND_URL` + server-side `X-API-Key` injection design (the reason `NEXT_PUBLIC_API_URL` can be a relative `/api/v1`).

---

## Suggested improvements (beyond bug fixes)

1. **Add a test suite.** `backend/tests/` doesn't exist and there's no frontend test script. H1–H5 and M8 are exactly the class of bug a small pytest suite over the routers (with an in-memory SQLite + mock LLM) would have caught. This is the single highest-leverage improvement.
2. **Introduce a unit-of-work / commit-once pattern.** Repositories committing per-call (base.py) is the root cause of M6/H3. Have repositories `add`/`flush` and let the router (or a dependency) commit once per request.
3. **Consolidate the API base + auth into the proxy.** The `/api/v1/[...path]` proxy makes the deployed setup same-origin; leaning on it fully (client always uses relative `/api/v1`, proxy injects the API key server-side) removes the CORS config, the `expose_headers` issues (L4), and the key exposure (H10) in one move.
4. **Surface mutation errors globally.** A single toast provider wired into the TanStack mutation defaults (`onError` in `QueryProvider`) fixes M17 everywhere at once.
5. ✅ **DONE — Rate limiting.** `slowapi` limits `generate`/`refine` (env-configurable `RATE_LIMIT_*`), keyed API-key → XFF → peer, 429 in the app error format; also blunts M5. Verified live.
6. **Reconcile the three run documents** into README (native + real deployment path), and regenerate CLAUDE.md's tree/env tables from the code.

---

## Verified-clean areas

- No secrets, `.env`, `.db`, `node_modules`, `__pycache__`, or build artifacts are tracked (118 files, clean status); `.gitignore` is sound.
- Auth coverage is complete: every mutating route depends on `verify_api_key`; reads use `verify_api_key_optional` gated by `require_auth_for_reads` — the documented contract holds (the problem is key *distribution*, H10, not coverage).
- No XSS sinks in the frontend (`dangerouslySetInnerHTML` absent, all LLM output rendered as text); no `any` usage; the query-key factory is otherwise consistently applied.
- No SQL injection: all queries go through SQLModel/SQLAlchemy expressions; no raw SQL with interpolation.
- The Docker build-time `NEXT_PUBLIC_API_URL` concern is correctly solved (relative `/api/v1` baked as ARG default + runtime `BACKEND_URL` in the proxy); `next.config.ts` `output: "standalone"` matches the Dockerfile copy paths.
- SQLite persistence in the deployed compose is correct (`sqlite:////data/qa_craft.db` on a `/srv/dakis/data` bind mount); `AUTO_MIGRATE` works in-container (alembic.ini copied; `env.py:31` overrides the URL from settings).
- Enum storage is consistent between SQLModel and the migration (`'DRAFT'` names, verified empirically).
- Three of CLAUDE.md's "RESOLVED" claims are genuinely resolved in code: debug-logging removal, the `api.ts` port default, and the test-case Edit dialog.
