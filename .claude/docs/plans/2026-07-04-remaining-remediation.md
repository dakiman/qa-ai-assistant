# QA-Craft — Remaining Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out the last items from `fable-review.md` — regenerate the frontend API types cleanly (L19), add delete-from-UI for features and test cases (L21 product decision), and finish the unit-of-work / commit-once refactor (structural #2).

**Architecture:** Three independent workstreams (A, B, C). A and B are small and self-contained and may be picked up in parallel by different agents. C is a backend-only refactor and is the highest-risk item — do it **last** and verify every write path live. None of the three depend on each other.

**Tech Stack:** FastAPI + SQLModel (sync) / SQLite · Next.js 16 App Router + TanStack Query 5 + shadcn/ui · openapi-typescript v7 · slowapi (already integrated) · Docker (baked images).

## Global Constraints

- **No automated test suite exists, by the maintainer's choice.** Do **not** add pytest/jest. The verification method for every task is: rebuild the affected container, then run the live smoke check(s) given in the task, plus (for any frontend change) a clean `next build`. A green `next build` is the authoritative frontend typecheck — it fails on type errors.
- **Baked images — code changes need a rebuild.** From `/srv/dakis`:
  - Backend: `sg docker -c 'docker compose up -d --build qa-ai-assistant-api'`
  - Frontend: `sg docker -c 'docker compose up -d --build qa-ai-assistant-web'`
  - All `docker` calls on this host go through `sg docker -c '...'`.
  - After a rebuild, wait for health before testing: `curl -s http://localhost:8010/health` → `{"status":"healthy"}` and `curl -s -o /dev/null -w '%{http_code}' http://localhost:3010/` → `200`.
- **Ports:** Docker prod = frontend `3010`, backend `8010`. Backend list endpoints need a trailing slash (`/api/v1/features/`) — without it you get a 307.
- **Backend conventions:** route handlers and repo methods are `def`, not `async def`; raise custom exceptions from `backend/exceptions.py`, never bare `HTTPException`; use `get_logger(__name__)`, never `print()`; all datetimes timezone-aware.
- **Frontend conventions:** strict TypeScript, no `any`; all HTTP goes through `frontend/src/lib/api.ts`; all data fetching through hooks in `frontend/src/lib/queries.ts`; UI from `frontend/src/components/ui/` (there is **no** `alert-dialog` primitive — reuse `dialog.tsx`, as the Regenerate confirmation on the detail page already does).
- **Deps are pinned (`==`)** in `backend/requirements.txt` (M25). Any new dep must be pinned.
- **Every commit message** ends with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Update the tracker:** when a workstream completes, mark the corresponding item in `fable-review.md` (L19 note / L21 note / "Suggested improvements #2") and `CLAUDE.md`'s "Known Issues".
- Work on a branch, not `main`. Suggested: `fix/fable-remaining-<workstream>`.

---

## Workstream A — L19: regenerate `api-types.ts` and drop the hand-patches

**Why:** `frontend/src/lib/api-types.ts` is stale (missing `skip_llm_validation`), so `api.ts` hand-patches request types with intersections. Regenerating with openapi-typescript v7 naively marks default-valued request fields (`target_count`, `force_regenerate`, `skip_llm_validation`) as **required**, which is why regeneration was deferred. The fix is to regenerate with `defaultNonNullable: false` so only the OpenAPI `required` array drives required-ness, then remove the now-redundant patches.

### Task A1: Regenerate types with `defaultNonNullable: false`

**Files:**
- Modify: `frontend/scripts/generate-types.ts` (switch from the CLI shell-out to the programmatic API so the option is guaranteed supported)
- Regenerate: `frontend/src/lib/api-types.ts` (generated output — do not hand-edit after)

**Interfaces:**
- Produces: a regenerated `api-types.ts` where `components['schemas']['GenerateRequest']` has `target_count?`, `force_regenerate?`, `skip_llm_validation?` **optional**, and `FeatureCreate`/`FeatureUpdate` include an optional `skip_llm_validation`.

- [ ] **Step 1: Confirm the backend is running and the fields exist in the live schema**

Run:
```bash
curl -s http://localhost:8010/openapi.json | python3 -c "import sys,json; s=json.load(sys.stdin)['components']['schemas']; g=s['GenerateRequest']; print('GenerateRequest props:', list(g['properties'])); print('GenerateRequest required:', g.get('required'))"
```
Expected: `properties` includes `target_count`, `force_regenerate`, `skip_llm_validation`; `required` is `['feature_id']` (the three default-valued fields are NOT in `required`). This is the invariant the fix relies on.

- [ ] **Step 2: Rewrite `generate-types.ts` to use the programmatic API with `defaultNonNullable: false`**

Replace the body of `generateTypes()`'s try-block (the `execAsync('npx openapi-typescript ...')` call and the header-prepend) with a programmatic call. The full new file:

```ts
#!/usr/bin/env npx ts-node
/**
 * Generate TypeScript types from the backend OpenAPI spec.
 *
 * Usage:
 *   npm run generate-types
 *   npm run generate-types -- --url http://localhost:8010/openapi.json
 */

import openapiTS, { astToString } from 'openapi-typescript';
import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_OPENAPI_URL = 'http://localhost:8000/openapi.json';
const OUTPUT_FILE = path.join(__dirname, '../src/lib/api-types.ts');

async function generateTypes(): Promise<void> {
  const args = process.argv.slice(2);
  let openApiUrl = DEFAULT_OPENAPI_URL;
  const urlIndex = args.indexOf('--url');
  if (urlIndex !== -1 && args[urlIndex + 1]) {
    openApiUrl = args[urlIndex + 1];
  }

  console.log(`📡 Generating types from: ${openApiUrl}`);

  try {
    // defaultNonNullable: false → a schema property is only emitted as required
    // when it is in the OpenAPI `required` array. Without this, v7 marks fields
    // that merely have a default (target_count, force_regenerate,
    // skip_llm_validation) as required, breaking ergonomic generate() callers.
    const ast = await openapiTS(new URL(openApiUrl), { defaultNonNullable: false });
    const contents = astToString(ast);

    const header = `/**
 * This file is auto-generated from the backend OpenAPI spec.
 * Do not edit this file manually.
 *
 * To regenerate, run: npm run generate-types
 * (make sure the backend is running first)
 *
 * Generated from: ${openApiUrl}
 */

`;
    fs.writeFileSync(OUTPUT_FILE, header + contents);
    console.log('✅ Types generated successfully!');
  } catch (error) {
    console.error('❌ Failed to generate types:', error);
    process.exit(1);
  }
}

generateTypes();
```

- [ ] **Step 3: Run the generator against the running backend**

Run (from `frontend/`):
```bash
npm run generate-types -- --url http://localhost:8010/openapi.json
```
Expected: `✅ Types generated successfully!` and `src/lib/api-types.ts` is rewritten.

- [ ] **Step 4: Verify the three fields are optional in the output**

Run (from `frontend/`):
```bash
grep -nA12 "GenerateRequest:" src/lib/api-types.ts | grep -E "target_count|force_regenerate|skip_llm_validation|feature_id"
```
Expected: `feature_id:` has no `?` (required); `target_count?`, `force_regenerate?`, `skip_llm_validation?` each have a `?`. If any of the three is still required, the flag didn't take — stop and re-check Step 2 (do not proceed to A2).

- [ ] **Step 5: Commit**

```bash
git add frontend/scripts/generate-types.ts frontend/src/lib/api-types.ts
git commit -m "chore(types): regenerate api-types with defaultNonNullable=false (L19)"
```

### Task A2: Drop the redundant intersection patches in `api.ts`

**Files:**
- Modify: `frontend/src/lib/api.ts:32-73` (the type-alias/patch region)

**Interfaces:**
- Consumes: the regenerated `api-types.ts` from A1.
- Produces: `GenerateRequest`, `FeatureCreate`, `FeatureUpdate` exported as the bare generated schema types (no `& { ... }`), unchanged public names.

- [ ] **Step 1: Replace the patched aliases with bare generated types**

In `frontend/src/lib/api.ts`, change:

```ts
export type FeatureCreate = components['schemas']['FeatureCreate'] & {
  skip_llm_validation?: boolean;
};
export type FeatureUpdate = components['schemas']['FeatureUpdate'] & {
  skip_llm_validation?: boolean;
};
```
to:
```ts
export type FeatureCreate = components['schemas']['FeatureCreate'];
export type FeatureUpdate = components['schemas']['FeatureUpdate'];
```

and change:
```ts
export type GenerateRequest = components['schemas']['GenerateRequest'] & {
  skip_llm_validation?: boolean;
  target_count?: number;
  force_regenerate?: boolean;
};
```
to:
```ts
export type GenerateRequest = components['schemas']['GenerateRequest'];
```

- [ ] **Step 2: Typecheck via a production build**

Run (from `frontend/`):
```bash
npm run build
```
Expected: build succeeds. If it fails with a missing property (e.g. a caller sets `skip_llm_validation` on a Feature payload and the regenerated `FeatureCreate` lacks it), that means the backend schema genuinely omits the field — re-add **only** that one field as a minimal patch (`& { skip_llm_validation?: boolean }`) and note why in a comment. Do not restore the `target_count`/`force_regenerate` patches (those are the whole point of L19).

- [ ] **Step 3: Rebuild the web container and smoke-test generate end-to-end**

```bash
cd /srv/dakis && sg docker -c 'docker compose up -d --build qa-ai-assistant-web'
```
Wait for health, then in the browser (`http://localhost:3010`) create a feature and click Generate; confirm test cases appear. (Generation uses the mock/real provider per backend env; a 503 from a free openrouter model is the known environment caveat, not a types regression — the request must still be accepted, i.e. not a 4xx from a malformed body.)

- [ ] **Step 4: Update the tracker and commit**

In `fable-review.md`, change the L19 line from `⚠️ DEFERRED` to `✅ RESOLVED` with a one-line note (regenerated with `defaultNonNullable: false`; patches dropped). Then:
```bash
git add frontend/src/lib/api.ts fable-review.md
git commit -m "refactor(types): drop intersection patches now that api-types is correct (L19)"
```

---

## Workstream B — L21: delete features and test cases from the UI

**Why:** The backend has `DELETE /features/{id}` (cascade-deletes test cases + links, fixed in H1) and `DELETE /test-cases/{id}`, and `api.ts` already has `featureApi.delete(id)` and `testCaseApi.delete(id)`. But there is no UI, and the client hooks were removed as dead code. This workstream re-adds the hooks with real callers behind confirmation dialogs.

### Task B1: Test-case delete (per-card, with confirm)

**Files:**
- Modify: `frontend/src/lib/queries.ts` (re-add `useDeleteTestCase`)
- Modify: `frontend/src/components/TestCaseCard.tsx` (add a trash button + confirm dialog)

**Interfaces:**
- Produces: `useDeleteTestCase()` — a mutation whose `mutateAsync({ id, featureId }: { id: number; featureId: number })` deletes the case and invalidates that feature's `testCases` query.

- [ ] **Step 1: Re-add the `useDeleteTestCase` hook**

In `frontend/src/lib/queries.ts`, in the "Test Case Mutations" section (next to `useUpdateTestCase`), add:

```ts
export function useDeleteTestCase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, featureId }: { id: number; featureId: number }) =>
      testCaseApi.delete(id).then(() => featureId),
    onSuccess: (featureId) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.features.testCases(featureId),
      });
    },
  });
}
```
(`testCaseApi` and `queryKeys` are already imported in this file.)

- [ ] **Step 2: Add a delete button + confirm dialog to `TestCaseCard.tsx`**

Add imports at the top:
```ts
import { useState } from 'react';
import { Trash2, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useDeleteTestCase } from '@/lib/queries';
```
(merge the `lucide-react` and `@/lib/queries` imports with the existing ones on lines 8–9 rather than duplicating them.)

Inside `TestCaseCard`, after the existing mutation declarations (line ~22), add:
```ts
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const deleteMutation = useDeleteTestCase();

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync({ id: testCase.id, featureId: testCase.feature_id });
      setConfirmDeleteOpen(false);
    } catch (error) {
      // Surfaced by the global mutation-error toast (MutationCache.onError).
      console.error('Failed to delete test case:', error);
    }
  };
```

In the action-button row (the `<div className="flex gap-2">` around line 136), after the `<EditTestCaseDialog .../>` block, add a trash trigger:
```tsx
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            aria-label="Delete test case"
            onClick={() => setConfirmDeleteOpen(true)}
            disabled={loading || deleteMutation.isPending}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
```

At the end of the component, just before the closing `</Card>`, add the confirm dialog:
```tsx
      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this test case?</DialogTitle>
            <DialogDescription>
              &ldquo;{testCase.title}&rdquo; will be permanently removed. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setConfirmDeleteOpen(false)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Deleting...</>
              ) : (
                <><Trash2 className="w-4 h-4 mr-2" />Delete</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
```
(The `Dialog` sits inside the `<Card>` but renders in a portal, so placement is fine.)

- [ ] **Step 3: Typecheck**

Run (from `frontend/`): `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Rebuild and smoke-test**

```bash
cd /srv/dakis && sg docker -c 'docker compose up -d --build qa-ai-assistant-web'
```
Wait for health. In the browser open a feature with test cases, click the trash icon on a card → confirm dialog appears → Delete → the card disappears and the count drops. Cancel on another card leaves it intact.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/queries.ts frontend/src/components/TestCaseCard.tsx
git commit -m "feat(ui): delete a test case from its card, with confirm (L21)"
```

### Task B2: Feature delete (detail page, with cascade-aware confirm)

**Files:**
- Modify: `frontend/src/lib/queries.ts` (re-add `useDeleteFeature`)
- Modify: `frontend/src/app/features/[id]/page.tsx` (add a destructive button + confirm dialog; navigate away on success)

**Interfaces:**
- Consumes: `useRouter` (already imported in the page), `stats.total` (already computed in the page).
- Produces: `useDeleteFeature()` — `mutateAsync(id: number)` deletes the feature, removes its detail cache entry, and invalidates the features list.

- [ ] **Step 1: Re-add the `useDeleteFeature` hook**

In `frontend/src/lib/queries.ts`, in the "Feature Mutations" section (next to `useUpdateFeature`), add:
```ts
export function useDeleteFeature() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => featureApi.delete(id),
    onSuccess: (_, deletedId) => {
      queryClient.removeQueries({ queryKey: queryKeys.features.detail(deletedId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.features.all });
    },
  });
}
```

- [ ] **Step 2: Wire a delete action into the detail page**

In `frontend/src/app/features/[id]/page.tsx`:

Add `Trash2` to the existing `lucide-react` import (line 25) and `useDeleteFeature` to the `@/lib/queries` import (line 26).

Add state + handler next to the other mutations (near line 38):
```ts
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const deleteFeatureMutation = useDeleteFeature();

  const handleDeleteFeature = async () => {
    try {
      await deleteFeatureMutation.mutateAsync(featureId);
      router.push('/features');
    } catch (err) {
      // Global toast surfaces the failure.
      console.error('Failed to delete feature:', err);
    }
  };
```

In the header action cluster (the `<div className="flex items-center gap-3 shrink-0">` around line 199, after the `EditFeatureDialog`), add:
```tsx
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </Button>
```

Add the confirm dialog next to the existing Regenerate `<Dialog>` (near the bottom of the returned JSX, around line 372):
```tsx
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this feature?</DialogTitle>
            <DialogDescription>
              &ldquo;{feature.title}&rdquo; and its {stats.total} test case{stats.total === 1 ? '' : 's'}
              {' '}(plus any links) will be permanently deleted. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleteFeatureMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteFeature}
              disabled={deleteFeatureMutation.isPending}
            >
              {deleteFeatureMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Deleting...</>
              ) : (
                <><Trash2 className="w-4 h-4 mr-2" />Delete Feature</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
```
(`Loader2`, `Dialog*`, `Button`, `useState` are already imported in this file.)

- [ ] **Step 3: Typecheck**

Run (from `frontend/`): `npm run build` — expected: succeeds.

- [ ] **Step 4: Rebuild and smoke-test (create a throwaway feature to delete)**

```bash
cd /srv/dakis && sg docker -c 'docker compose up -d --build qa-ai-assistant-web'
```
Wait for health. In the browser: create a new feature, open it, click **Delete**, confirm the dialog names the correct test-case count, click Delete Feature → you're redirected to `/features` and the feature is gone from the list. Verify the backend agrees (should be 404):
```bash
# replace 99 with the deleted feature id
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8010/api/v1/features/99
```
Expected: `404`. (Confirms the H1 cascade fix works through the UI — no 500.)

- [ ] **Step 5: Update tracker and commit**

In `fable-review.md`, update the L21 note: delete UI now wired (test-case + feature, with confirm). In `CLAUDE.md` "Known Issues", drop the "Delete UI" open bullet. Then:
```bash
git add frontend/src/lib/queries.ts "frontend/src/app/features/[id]/page.tsx" fable-review.md CLAUDE.md
git commit -m "feat(ui): delete a feature from the detail page, cascade-aware confirm (L21)"
```

---

## Workstream C — structural #2: unit-of-work / commit-once

**Why:** Repositories commit per call (`base.py` + each repo), which is the root cause behind H3/M6. Generate/refine already defer commits via `commit=False` params, but everywhere else each write is its own transaction. The fix: the request-scoped session becomes a unit of work that commits once on success and rolls back on error; repositories only `add`/`flush`, never `commit`.

**RISK:** This touches every write path and there is **no test suite**. Do this workstream last, on its own branch, and run the full write-path smoke matrix in Task C3 before committing. The trickiest site is `link_repository`, which catches `IntegrityError` around its commit (the M7 → 409 mapping): `flush()` triggers integrity errors just like `commit()`, so the catch keeps working **only if** you replace `commit()` with `flush()` *inside the existing try/except*. Get that wrong and duplicate links will 500 instead of 409.

### Task C1: Make the session a commit-on-success unit of work

**Files:**
- Modify: `backend/database.py` (`get_session`)

**Interfaces:**
- Produces: `get_session()` still yields a `Session`, but now commits once when the handler returns without raising, and rolls back on any exception. Callers must no longer rely on repos having committed.

- [ ] **Step 1: Replace `get_session` with a UoW generator**

In `backend/database.py`, replace:
```python
def get_session():
    """Dependency for getting database sessions."""
    with Session(engine) as session:
        yield session
```
with:
```python
def get_session():
    """Request-scoped unit of work.

    Yields a session, then commits once if the request handler returned
    without raising, or rolls back if it raised. Repositories therefore only
    add/flush — they must not commit — so a whole request is one transaction.
    """
    session = Session(engine)
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
```

- [ ] **Step 2: Do not rebuild yet** — repos still commit, which is now redundant-but-harmless (double commit is a no-op on a clean session). The behavior change lands with C2. Proceed directly to C2 so you rebuild once with a consistent state.

- [ ] **Step 3: Commit the mechanism**

```bash
git add backend/database.py
git commit -m "refactor(db): make get_session a commit-on-success unit of work (structural #2)"
```

### Task C2: Repositories flush instead of commit; routers stop committing

**Files:**
- Modify: `backend/repositories/base.py` (lines 79–129: `create`, `update`, `delete`)
- Modify: `backend/repositories/feature_repository.py` (lines 44, 72, 83)
- Modify: `backend/repositories/test_case_repository.py` (lines 74, 91, 190, 221)
- Modify: `backend/repositories/link_repository.py` (lines 101/106, 174, 219/222, 271, 325)
- Modify: `backend/repositories/template_repository.py` (line 68)
- Modify: `backend/routers/generate.py` (line 127) and `backend/routers/refine.py` (line 114)

**Transformation rule (apply to every site above):**
1. Replace `self.session.commit()` with `self.session.flush()`. `flush()` sends INSERT/UPDATE/DELETE to the DB (assigning PKs and triggering integrity errors) **without** ending the transaction; the UoW from C1 commits at request end.
2. Keep every `self.session.refresh(obj)` — it works after `flush()`.
3. In `link_repository`, the `commit()` calls that live **inside a `try/except IntegrityError`** become `flush()` **in the same place** — do not move them out of the try (see the RISK note).
4. The `commit: bool = ...` parameters (`base.create`, `feature.increment_*`, `test_case.delete_drafts`, `test_case.create_from_draft`) become dead — the body no longer branches on them. Leave the parameters in the signatures as accepted-but-ignored **no-ops** to avoid touching call sites in `generate.py`/`refine.py`, OR remove them and update those two callers. Choose removal only if you also update the callers in the same commit. **Recommended: keep them as ignored no-ops** (smaller blast radius) and add a one-line comment that the UoW owns the commit.

- [ ] **Step 1: Convert `base.py`**

`create` (make flush unconditional; `commit` param ignored):
```python
    def create(self, obj: ModelType, commit: bool = True) -> ModelType:
        """Create a new entity.

        The request-scoped unit of work (get_session) owns the commit, so this
        only flushes to assign the PK. `commit` is accepted for call-site
        compatibility but ignored.
        """
        self.session.add(obj)
        self.session.flush()  # assigns PK without ending the transaction
        self.session.refresh(obj)
        return obj
```
`update`:
```python
        self.session.add(obj)
        self.session.flush()
        self.session.refresh(obj)
        return obj
```
`delete`:
```python
    def delete(self, obj: ModelType) -> None:
        self.session.delete(obj)
        self.session.flush()
```

- [ ] **Step 2: Convert the four repo files**

Apply the rule to each enumerated line. Concretely:
- `feature_repository.py:44` (`create`-style) → `flush()`. `increment_generation_count` (72) and `increment_refinement_count` (83): the `if commit: self.session.commit()` block → replace with a single `self.session.flush()` (drop the `if`), keep the `commit` param as ignored.
- `test_case_repository.py`: `update` (74), `update_status` (91), `bulk_update_status` (190) → `flush()`; `delete_drafts` (221) `if count > 0 and commit: self.session.commit()` → `self.session.flush()` (keep param, keep the `count>0` guard is unnecessary for flush — just `self.session.flush()`); `create_from_draft` delegates to `create`, no change beyond passing through.
- `link_repository.py`: at 101, 174, 219, 271, 325 replace `commit()` → `flush()`; the `rollback()` calls at 106/222 stay (rollback after a caught `IntegrityError` is still correct — it clears the failed flush before the UoW would otherwise try to commit). **Verify** each 101/219 `commit()` is inside its `try` so the `except IntegrityError` still catches it.
- `template_repository.py:68` → `flush()`.

- [ ] **Step 3: Remove the now-redundant explicit commits in the two routers**

In `backend/routers/generate.py`, delete line 127 `session.commit()` (the UoW commits on return). The following `session`-free response build is unaffected. If a `session.refresh(...)` follows a commit anywhere in the handler, replace the removed `commit()` with `session.flush()` so the refresh still sees assigned values — in `generate.py` there is no refresh after, so just delete.

In `backend/routers/refine.py`, replace line 114 `session.commit()` with `session.flush()` **because line 115 calls `session.refresh(feature)`** — the refresh needs the row flushed. (Do not delete it here.)

- [ ] **Step 4: Rebuild the API container**

```bash
cd /srv/dakis && sg docker -c 'docker compose up -d --build qa-ai-assistant-api'
```
Wait for `curl -s http://localhost:8010/health` → healthy. If the app crash-loops, check logs: `sg docker -c 'docker compose logs --tail=50 qa-ai-assistant-api'`.

- [ ] **Step 5: Commit**

```bash
git add backend/repositories/ backend/routers/generate.py backend/routers/refine.py
git commit -m "refactor(repos): flush instead of commit; UoW owns the transaction (structural #2)"
```

### Task C3: Full write-path smoke verification

**Files:** none (verification only). This is the regression net that substitutes for the missing test suite — run **all** of it and confirm each expected result before considering the workstream done.

- [ ] **Step 1: Feature CRUD round-trip**

```bash
# create
FID=$(curl -s -X POST http://localhost:8010/api/v1/features/ -H 'Content-Type: application/json' \
  -d '{"title":"UoW smoke","description":"tmp","raw_requirements":"Users can log in with a valid email and a password of at least 12 characters."}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
echo "created $FID"
# update
curl -s -o /dev/null -w "update -> %{http_code}\n" -X PATCH http://localhost:8010/api/v1/features/$FID \
  -H 'Content-Type: application/json' -d '{"title":"UoW smoke v2"}'
# read back the update actually persisted (commit happened)
curl -s http://localhost:8010/api/v1/features/$FID | python3 -c "import sys,json;print('persisted title:',json.load(sys.stdin)['title'])"
```
Expected: `update -> 200`; persisted title is `UoW smoke v2` (proves the UoW committed the PATCH — the key check that flush-not-commit didn't silently drop writes).

- [ ] **Step 2: Generate + test-case status transitions persist**

```bash
curl -s -o /dev/null -w "generate -> %{http_code}\n" -X POST http://localhost:8010/api/v1/generate/ \
  -H 'Content-Type: application/json' -d "{\"feature_id\":$FID}"
TC=$(curl -s "http://localhost:8010/api/v1/generate/feature/$FID/test-cases" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['id'])")
curl -s -o /dev/null -w "accept -> %{http_code}\n" -X POST http://localhost:8010/api/v1/test-cases/$TC/accept
# confirm it persisted as accepted
curl -s "http://localhost:8010/api/v1/generate/feature/$FID/test-cases" | python3 -c "import sys,json;d=json.load(sys.stdin);print('status of $TC:',[t['status'] for t in d if t['id']==$TC])"
```
Expected: `generate -> 200` (or the env's 503 if a real free model is configured — if 503, temporarily set `LLM_PROVIDER=mock` for this test); `accept -> 200`; the case reads back `accepted`.

- [ ] **Step 3: Manual create, update, bulk-status, delete**

```bash
NEW=$(curl -s -X POST http://localhost:8010/api/v1/test-cases/ -H 'Content-Type: application/json' \
  -d "{\"feature_id\":$FID,\"title\":\"manual\",\"steps\":[\"a\"],\"expected_result\":\"ok\",\"is_manual\":true}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
curl -s -o /dev/null -w "patch -> %{http_code}\n" -X PATCH http://localhost:8010/api/v1/test-cases/$NEW -H 'Content-Type: application/json' -d '{"title":"manual v2"}'
curl -s -o /dev/null -w "bulk -> %{http_code}\n" -X POST http://localhost:8010/api/v1/test-cases/bulk-status -H 'Content-Type: application/json' -d "{\"test_case_ids\":[$NEW],\"status\":\"rejected\"}"
curl -s -o /dev/null -w "delete tc -> %{http_code}\n" -X DELETE http://localhost:8010/api/v1/test-cases/$NEW
curl -s -o /dev/null -w "get deleted tc -> %{http_code}\n" http://localhost:8010/api/v1/test-cases/$NEW
```
Expected: `patch -> 200`, `bulk -> 200`, `delete tc -> 204`, `get deleted tc -> 404` (delete committed).

- [ ] **Step 4: Links — create, duplicate→409, delete (the IntegrityError path)**

```bash
# second feature to link to
FID2=$(curl -s -X POST http://localhost:8010/api/v1/features/ -H 'Content-Type: application/json' \
  -d '{"title":"UoW link target","raw_requirements":"Some other requirement text that is long enough to pass validation checks."}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
curl -s -o /dev/null -w "link create -> %{http_code}\n" -X POST http://localhost:8010/api/v1/features/$FID/links/feature \
  -H 'Content-Type: application/json' -d "{\"target_feature_id\":$FID2,\"link_type\":\"relates_to\"}"
# duplicate must be 409, NOT 500 (proves flush-in-try still catches IntegrityError)
curl -s -o /dev/null -w "link dup -> %{http_code}\n" -X POST http://localhost:8010/api/v1/features/$FID/links/feature \
  -H 'Content-Type: application/json' -d "{\"target_feature_id\":$FID2,\"link_type\":\"relates_to\"}"
```
Expected: `link create -> 201`, `link dup -> 409`. **If `link dup` is 500, the IntegrityError catch broke — Task C2 Step 2 for `link_repository` is wrong; fix before proceeding.**

- [ ] **Step 5: Feature cascade delete (H1) still works, then clean up**

```bash
curl -s -o /dev/null -w "delete feature -> %{http_code}\n" -X DELETE http://localhost:8010/api/v1/features/$FID
curl -s -o /dev/null -w "get deleted feature -> %{http_code}\n" http://localhost:8010/api/v1/features/$FID
curl -s -o /dev/null -w "cleanup FID2 -> %{http_code}\n" -X DELETE http://localhost:8010/api/v1/features/$FID2
```
Expected: `delete feature -> 204`, `get deleted feature -> 404`, `cleanup FID2 -> 204`. (Feature delete cascades to its test cases and links in one transaction.)

- [ ] **Step 6: Template CRUD**

```bash
TID=$(curl -s -X POST http://localhost:8010/api/v1/templates/ -H 'Content-Type: application/json' \
  -d '{"name":"UoW tmpl","system_instructions":"Be thorough."}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
curl -s -o /dev/null -w "tmpl patch -> %{http_code}\n" -X PATCH http://localhost:8010/api/v1/templates/$TID -H 'Content-Type: application/json' -d '{"name":"UoW tmpl v2"}'
curl -s -o /dev/null -w "tmpl delete -> %{http_code}\n" -X DELETE http://localhost:8010/api/v1/templates/$TID
```
Expected: all `200`/`204`. (If any endpoint path differs, confirm against `http://localhost:8010/docs`.)

- [ ] **Step 7: Update tracker and commit the verification note**

In `fable-review.md`, mark "Suggested improvements #2 (unit-of-work / commit-once)" as done, noting the full write-path smoke matrix passed. In `CLAUDE.md` "Known Issues", drop the unit-of-work open bullet and update Architectural Decision #1/repository notes if they claim per-call commits.
```bash
git add fable-review.md CLAUDE.md
git commit -m "docs: unit-of-work refactor complete; write-path smoke matrix verified (structural #2)"
```

---

## Self-Review notes (for the executing agent)

- **A before B/C is not required** — all three are independent. If parallelizing, give each workstream its own branch to avoid `queries.ts` / `fable-review.md` merge friction (B and C both touch `fable-review.md`; A and B both may touch `api.ts`/`queries.ts` — rebase or coordinate the tracker edits).
- **The `commit=` no-op decision (C2 Step 2):** keeping the params avoids editing `generate.py`/`refine.py` call sites; that's the recommended path. Only remove them if you update those callers in the same commit.
- **If generation returns 503** during any smoke step, that's the documented environment caveat (deployed backend may run a free openrouter model that fails instructor's tool-calling). Set `LLM_PROVIDER=mock` in the api service env for the duration of the test, or point at an openai/anthropic key. It is **not** a regression from these changes.
- **Rollback safety:** each workstream is independently revertible (separate commits/branch). If C3 surfaces a failure you can't quickly fix, revert Workstream C's commits — A and B are unaffected.
