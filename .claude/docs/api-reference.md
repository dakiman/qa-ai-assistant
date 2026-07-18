# QA-Craft API Reference

Base URL: `http://localhost:8000/api/v1`

Auth header (when `API_KEY` is set): `X-API-Key: <key>`
In development without `API_KEY` set, auth is bypassed for all requests.

---

## Features

### `GET /features/`
List all features.

**Auth:** optional
**Query params:** `skip=0`, `limit=100`

**Response 200:**
```json
[
  {
    "id": 1,
    "title": "User Login",
    "description": "...",
    "raw_requirements": "...",
    "created_at": "2026-01-01T00:00:00Z",
    "generation_count": 1,
    "refinement_count": 2
  }
]
```

---

### `POST /features/`
Create a feature. Validates requirements through two-stage validation before saving.

**Auth:** required
**Body:**
```json
{
  "title": "User Login",
  "description": "Optional description",
  "raw_requirements": "Users should be able to login with email and password...",
  "skip_llm_validation": false
}
```
Length caps: `title` ≤300, `description` ≤5000, `raw_requirements` ≤20000 chars.

**Response 201:** FeatureRead
**Response 422:** Validation failed
```json
{
  "detail": {
    "type": "requirements_validation_error",
    "issues": ["Requirements appear to be code, not text"],
    "suggestions": ["Describe what the feature should do in plain English"]
  }
}
```

---

### `GET /features/{feature_id}`
Get a single feature.

**Auth:** optional
**Response 200:** FeatureRead | **404** if not found

---

### `PATCH /features/{feature_id}`
Update a feature. Re-validates requirements if `raw_requirements` is changed.

**Auth:** required
**Body:** (all fields optional)
```json
{
  "title": "Updated Title",
  "description": "...",
  "raw_requirements": "...",
  "skip_llm_validation": false
}
```

**Response 200:** FeatureRead

---

### `DELETE /features/{feature_id}`
Delete a feature and all its test cases and links.

**Auth:** required
**Response 204** | **404**

---

### `GET /features/{feature_id}/stats`
Get test case statistics for a feature.

**Auth:** optional
**Response 200:**
```json
{
  "feature_id": 1,
  "total": 12,
  "draft": 5,
  "accepted": 6,
  "rejected": 1,
  "edge_cases": 3,
  "manual": 2,
  "ready_for_refinement": 8
}
```

---

## Test Cases

### `POST /test-cases/`
Create a manual test case.

**Auth:** required
**Body:**
```json
{
  "feature_id": 1,
  "title": "Verify login with valid credentials",
  "steps": ["Navigate to /login", "Enter valid email", "Click Submit"],
  "expected_result": "User is redirected to dashboard",
  "is_edge_case": false,
  "is_manual": true,
  "refinement_notes": null
}
```
Length caps: `title` ≤500, `expected_result` ≤5000, `steps` ≤50 items × 2000 chars each.

**Response 201:** TestCaseRead
**Response 404:** `feature_id` does not reference an existing feature

---

### `GET /test-cases/{test_case_id}`
Get a single test case.

**Auth:** optional
**Response 200:** TestCaseRead | **404**

---

### `PATCH /test-cases/{test_case_id}`
Update a test case.

**Auth:** required
**Body:** (all fields optional) — same shape as create
**Response 200:** TestCaseRead

---

### `DELETE /test-cases/{test_case_id}`
Delete a test case.

**Auth:** required
**Response 204** | **404**

---

### `POST /test-cases/{test_case_id}/accept`
Set status → `accepted`.

**Auth:** required
**Response 200:** TestCaseRead

---

### `POST /test-cases/{test_case_id}/reject`
Set status → `rejected`.

**Auth:** required
**Response 200:** TestCaseRead

---

### `POST /test-cases/{test_case_id}/reset`
Set status → `draft`.

**Auth:** required
**Response 200:** TestCaseRead

---

### `POST /test-cases/bulk-status`
Update status for multiple test cases at once.

**Auth:** required
**Body:**
```json
{
  "test_case_ids": [1, 2, 3],
  "status": "accepted"
}
```

**Response 200:** `TestCaseRead[]` — the full updated test cases, not a count

---

## TestCaseRead Schema

```json
{
  "id": 1,
  "feature_id": 1,
  "title": "Verify login",
  "steps": ["Step 1", "Step 2"],
  "expected_result": "User is logged in",
  "is_edge_case": false,
  "is_manual": false,
  "refinement_notes": null,
  "status": "draft"
}
```

---

## Templates

### `GET /templates/`
**Auth:** optional | **Query params:** `skip=0`, `limit=100` (1–200) | **Response 200:** `TemplateRead[]`

### `POST /templates/`
**Auth:** required
**Body:** `{ "name": "API Testing", "system_instructions": "You are a QA engineer..." }`
Length caps: `name` ≤200, `system_instructions` ≤10000 chars.
**Response 201:** TemplateRead | **409** if name already exists

### `GET /templates/{template_id}`
**Auth:** optional | **Response 200:** TemplateRead | **404**

### `PATCH /templates/{template_id}`
**Auth:** required | **Body:** `{ "name"?: "...", "system_instructions"?: "..." }` | **Response 200:** TemplateRead

### `DELETE /templates/{template_id}`
**Auth:** required | **Response 204** | **404**

---

## Generation

### `POST /generate/`
Generate test cases from requirements using AI.

**Auth:** required
**Body:**
```json
{
  "feature_id": 1,
  "template_id": 2,
  "skip_llm_validation": false,
  "target_count": 10,
  "force_regenerate": false
}
```

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `feature_id` | int | required | |
| `template_id` | int \| null | null | Optional template for system prompt |
| `skip_llm_validation` | bool | false | Skip LLM semantic validation |
| `target_count` | int | 10 | Approximate number of test cases (range 3–30) |
| `force_regenerate` | bool | false | If true, deletes existing DRAFT cases and regenerates |

**Response 200:**
```json
{
  "feature_id": 1,
  "test_cases": [
    {
      "title": "Verify login with valid credentials",
      "steps": ["..."],
      "expected_result": "...",
      "is_edge_case": false,
      "refinement_notes": null
    }
  ],
  "message": "Successfully generated 10 test cases"
}
```

**Response 409:** Test cases already generated (set `force_regenerate=true` to replace drafts)
**Response 422:** Requirements validation failed (see POST /features/ above)
**Response 429:** Rate limit exceeded (`RATE_LIMIT_GENERATE`, default `10/minute`)
**Response 503:** LLM service unavailable

---

### `GET /generate/feature/{feature_id}/test-cases`
Get test cases for a feature with optional filtering.

**Auth:** optional
**Query params:**
- `status`: `draft` | `accepted` | `rejected`
- `is_edge_case`: `true` | `false`
- `is_manual`: `true` | `false`
- `search`: string (matches against title)
- `skip`: int (default 0)
- `limit`: int (default 100)

**Response 200:** `TestCaseRead[]`

---

## Refinement

### `POST /features/{feature_id}/refine`
Analyze the accepted test suite and generate gap-filling edge cases.

**Auth:** required
**Body:**
```json
{
  "feature_id": 1,
  "template_id": null,
  "max_new_cases": 5
}
```

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `feature_id` | int | required | |
| `template_id` | int \| null | null | Optional template for styling consistency |
| `max_new_cases` | int | 5 | Maximum new edge cases to generate (range 1–15) |

**Response 200:**
```json
{
  "feature_id": 1,
  "original_count": 6,
  "new_count": 10,
  "edge_cases_added": 4,
  "refinement_count": 2,
  "test_cases": [...],
  "message": "Refinement complete! Added 4 new edge cases based on gap analysis."
}
```

| Field | Notes |
|-------|-------|
| `original_count` | Number of accepted/manual cases before refinement |
| `new_count` | Total test cases after refinement |
| `edge_cases_added` | Number of new edge cases added in this round |
| `refinement_count` | Feature's cumulative refinement count (incremented each call) |

**Response 429:** Rate limit exceeded (`RATE_LIMIT_REFINE`, default `15/minute`)
**Response 503:** LLM service unavailable

---

## Export

### `GET /features/{feature_id}/export`
Export test cases.

**Auth:** optional
**Query params:**
- `format`: `json` (default) | `csv`
- `status`: `draft` | `accepted` | `rejected` (omit for all)

**Response 200 (JSON):** `Content-Type: application/json`, file download
**Response 200 (CSV):** `Content-Type: text/csv`, file download

CSV columns: `id`, `title`, `steps`, `expected_result`, `is_edge_case`, `is_manual`, `status`, `refinement_notes`

---

## Links

### `GET /features/{feature_id}/links`
Get all links for a feature (both feature links and test case links).

**Auth:** optional
**Response 200:**
```json
{
  "feature_id": 1,
  "feature_links": [
    {
      "id": 1,
      "source_feature_id": 1,
      "target_feature_id": 2,
      "link_type": "depends_on",
      "notes": null,
      "created_at": "...",
      "target_feature_title": "OAuth Provider"
    }
  ],
  "test_case_links": [
    {
      "id": 1,
      "feature_id": 1,
      "test_case_id": 5,
      "notes": null,
      "created_at": "...",
      "test_case_title": "Verify OAuth token refresh",
      "test_case_feature_id": 2,
      "test_case_feature_title": "OAuth Provider"
    }
  ]
}
```

---

### `POST /features/{feature_id}/links/feature`
Create a bidirectional feature link. Automatically creates the inverse relationship.

**Auth:** required
**Body:**
```json
{
  "target_feature_id": 2,
  "link_type": "depends_on",
  "notes": "This feature requires OAuth to be implemented first"
}
```
Length cap: `notes` ≤1000 chars.

**link_type values:** `relates_to`, `depends_on`, `blocks`, `parent_of`, `child_of`

**Response 201:** `FeatureLinkRead`
**Response 400:** Self-link attempt (source == target)
**Response 404:** Target feature not found
**Response 409:** Link between these two features already exists

---

### `DELETE /features/{feature_id}/links/feature/{link_id}`
Delete a feature link (also deletes the inverse).

**Auth:** required | **Response 204** | **404**

---

### `POST /features/{feature_id}/links/test-case`
Reference a test case from another feature.

**Auth:** required
**Body:**
```json
{
  "test_case_id": 5,
  "notes": "Reuse this scenario for regression"
}
```
Length cap: `notes` ≤1000 chars.

**Response 201:** `TestCaseLinkRead`
**Response 400:** Test case belongs to this feature (can't self-reference)
**Response 404:** Test case not found
**Response 409:** Link to this test case already exists

---

### `DELETE /features/{feature_id}/links/test-case/{link_id}`
**Auth:** required | **Response 204** | **404**

---

## Health

### `GET /`
```json
{ "name": "QA-Craft API", "version": "0.1.0", "status": "running", "docs": "/docs" }
```

### `GET /health`
```json
{ "status": "healthy" }
```

---

## Common Error Shapes

```json
// 404
{ "detail": "Feature with id 99 not found" }

// 409
{ "detail": "Template with name 'API Testing' already exists" }

// 401
{ "detail": "Invalid or missing API key" }

// 422 (requirements validation)
{
  "detail": {
    "type": "requirements_validation_error",
    "issues": ["Input appears to be code rather than requirements"],
    "suggestions": ["Describe the feature behavior in plain English"]
  }
}

// 503
{ "detail": "LLM service unavailable" }

// 500
{ "detail": "An internal error occurred" }
```
