# QA-Craft Architecture

## Backend Layer Diagram

```
HTTP Request
    │
    ▼
CORSMiddleware
    │
RequestIdMiddleware  (generates UUID, injects into logs + X-Request-ID header)
    │
    ▼
Router (routers/*.py)
    │  validates HTTP input via Pydantic models
    │  injects dependencies via FastAPI Depends()
    ├─→ auth.py          (verify_api_key / verify_api_key_optional)
    ├─→ database.py      (get_session → SQLModel Session)
    ├─→ Repository       (repositories/*.py — all DB access)
    └─→ Service          (services/*.py — LLM, validation)
    │
    ▼
Exception Handler
    │  QACraftException → structured JSON
    │  RequirementsValidationException → 422 with issues/suggestions
    │  Exception (fallback) → 500 generic
    ▼
HTTP Response
```

---

## Database Schema

5 tables managed by Alembic migrations.

### `feature`
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| title | VARCHAR | Indexed |
| description | VARCHAR | Nullable |
| raw_requirements | VARCHAR | Required; input to LLM |
| created_at | DATETIME | UTC, auto-set |
| generation_count | INTEGER | Default 0; incremented each time /generate/ is called |
| refinement_count | INTEGER | Default 0; incremented each time /refine is called |

### `testcase`
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| feature_id | INTEGER FK | → feature.id, cascade delete |
| title | VARCHAR | |
| steps | VARCHAR | JSON-encoded list of strings |
| expected_result | VARCHAR | |
| is_edge_case | BOOLEAN | Default false |
| is_manual | BOOLEAN | Default false; true for user-created |
| refinement_notes | VARCHAR | Nullable; AI explanation |
| status | VARCHAR | ENUM: draft / accepted / rejected |

`TestCaseRead.steps_list` property decodes `steps` JSON back to `list[str]`.

### `template`
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| name | VARCHAR | Unique, indexed |
| system_instructions | VARCHAR | Full system prompt text |

3 templates are seeded on first startup: Standard Test Case, API Testing, UI/UX Testing.

### `feature_link`
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| source_feature_id | INTEGER FK | Indexed |
| target_feature_id | INTEGER FK | Indexed |
| link_type | VARCHAR | ENUM (see below) |
| notes | VARCHAR(1000) | Nullable |
| created_at | DATETIME | UTC, auto-set |

Creating one link automatically creates the inverse:
- `DEPENDS_ON` ↔ `BLOCKS`
- `PARENT_OF` ↔ `CHILD_OF`
- `RELATES_TO` ↔ `RELATES_TO` (symmetric)

### `test_case_link`
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| feature_id | INTEGER FK | The referencing feature |
| test_case_id | INTEGER FK | Must belong to a DIFFERENT feature |
| notes | VARCHAR(1000) | Nullable |
| created_at | DATETIME | UTC, auto-set |

---

## Enums

```python
class TestCaseStatus(str, Enum):
    DRAFT = "draft"
    ACCEPTED = "accepted"
    REJECTED = "rejected"

class FeatureLinkType(str, Enum):
    RELATES_TO = "relates_to"
    DEPENDS_ON = "depends_on"
    BLOCKS = "blocks"
    PARENT_OF = "parent_of"
    CHILD_OF = "child_of"

    def get_inverse(self) -> "FeatureLinkType":
        # DEPENDS_ON ↔ BLOCKS, PARENT_OF ↔ CHILD_OF, RELATES_TO ↔ RELATES_TO
```

---

## LLM Integration

### Flow

```
generate request
    │
    ▼
ValidationService.validate_requirements()
    ├─ Stage 1: rule-based (length, words, alpha ratio, code detection) — always runs
    └─ Stage 2: LLM semantic (gpt-4o-mini / claude-haiku-4-5) — skippable via skip_llm=True
    │
    ▼
Generation guard check:
    ├─ generation_count > 0 AND force_regenerate=false → 409 Conflict
    └─ force_regenerate=true → delete existing DRAFT cases first
    │
    ▼
LLMService.generate_initial_test_cases(target_count=N)
    ├─ provider=mock  → _generate_mock_test_cases() (keyword-aware, trims to target_count)
    ├─ provider=openai → instructor.from_openai().chat.completions.create()
    └─ provider=anthropic → instructor.from_anthropic().messages.create()
    │
    ▼ returns List[TestCaseDraft]
    │
TestCaseRepository.create_from_draft() × N
FeatureRepository.increment_generation_count()
    │
    ▼
GenerateResponse { test_cases: [...] }
```

### instructor Library

The `instructor` library wraps OpenAI/Anthropic clients and enforces a Pydantic response model. If the LLM returns malformed JSON, instructor retries (max 2 attempts).

Response models used:
- `TestCaseList` → wraps `list[TestCaseDraft]` — used for generation
- `TestCaseList` (same) — used for refinement (only new edge cases returned)

### Mock Mode

`LLM_PROVIDER=mock` triggers `_generate_mock_test_cases(target_count)`. It inspects the requirements text for keywords (`login`, `auth`, `search`, `form`, `submit`) and returns appropriate predefined `TestCaseDraft` objects. Falls back to 4 generic cases if no keywords match. Only keyword-matched cases are returned (no padding); results are trimmed to `target_count` if they exceed it.

Similarly, `_generate_mock_refinements(max_new_cases)` always adds network timeout + unauthorized access cases, with extra security cases if `password`/`login` keywords are detected. Results are trimmed to `max_new_cases`.

### Prompt Injection Protection

`sanitize_for_prompt()` in `llm_service.py`:
- Truncates to 10,000 chars
- Escapes triple-backtick code blocks
- Logs warnings if injection markers detected (`"ignore previous instructions"`, `"system:"`, etc.)

### RAG (Linked Context)

Before calling the LLM, `link_repository.get_linked_context(feature_id)` aggregates:
- Up to 5 linked features with their `raw_requirements`
- Up to 10 linked test cases from other features

This context is formatted by `LLMService.format_linked_context()` and prepended to the user prompt. Requirements truncated at 2000 chars, test case details at 1500 chars.

---

## Validation Service

File: `backend/services/validation_service.py`

```
Stage 1 (always): rule-based
  ├─ len(text) >= 30 chars
  ├─ word count >= 5
  ├─ alphabetic ratio > 30%  (rejects symbol/number dumps)
  └─ no code patterns (Python, JS, SQL, C++, etc.)

Stage 2 (LLM, skippable):
  └─ cheap model classifies input_type:
       requirements / code / random_text / off_topic / too_vague / other
     returns RequirementsValidation { is_valid, input_type, issues[], suggestions[] }
```

On failure: raises `RequirementsValidationException` → caught by global handler → 422 response:
```json
{
  "detail": {
    "type": "requirements_validation_error",
    "issues": ["..."],
    "suggestions": ["..."]
  }
}
```

---

## Authentication

File: `backend/auth.py`

Header: `X-API-Key`

Two dependency functions:
- `verify_api_key` — required for all write operations (POST, PATCH, DELETE)
- `verify_api_key_optional` — used for GETs; skips auth if `REQUIRE_AUTH_FOR_READS=false`

In development with no `API_KEY` configured → auth is bypassed, returns `"dev-mode"`.

---

## Logging

File: `backend/logging_config.py`

Format: `%(asctime)s | %(levelname)-8s | %(request_id)s | %(name)s | %(message)s`

- `RequestIdMiddleware` (Starlette `BaseHTTPMiddleware`): generates a UUID per request, stores in a `contextvars.ContextVar`, echoes in `X-Request-ID` response header
- `RequestIdFilter`: attaches the context var value to every log record
- Third-party log levels reduced (uvicorn access, httpx, openai, anthropic)

Usage in any module:
```python
from logging_config import get_logger
logger = get_logger(__name__)
```

---

## Frontend Architecture

### Data Flow

```
Page component
    │
    ▼
React Query hook (queries.ts)
    │  useQuery / useMutation
    │
    ▼
API client (api.ts)
    │  fetch() with base URL + optional X-API-Key header
    │
    ▼
Backend HTTP endpoint
```

### Query Key Hierarchy

```
queryKeys.features.all                    → ['features']
queryKeys.features.detail(id)             → ['features', id]
queryKeys.features.testCases(id, filters) → ['features', id, 'testCases', filters]
queryKeys.features.links(id)              → ['features', id, 'links']
queryKeys.templates.all                   → ['templates']
queryKeys.templates.detail(id)            → ['templates', id]
```

### Cache Strategy

- `staleTime`: 5 minutes
- `gcTime`: 30 minutes
- Mutations call `queryClient.invalidateQueries()` on parent keys after success
- Test case status mutations use optimistic updates (`onMutate` / `onError` rollback)

### State Persistence

Feature detail page (`/features/[id]`) stores active filters in URL query params:
- `?status=accepted&edge=true&manual=false&q=login`

This survives page refresh and is shareable.

---

## Startup Sequence

```
uvicorn main:app --reload --port 8000
    │
    ▼
setup_logging()
    │
    ▼
lifespan() startup:
    ├─ alembic upgrade head  (if AUTO_MIGRATE=true)
    └─ seed_default_templates()
    │
    ▼
Middleware stack (outer→inner):
    1. RequestIdMiddleware
    2. CORSMiddleware
    │
    ▼
Routers registered at /api/v1/...
    │
    ▼
Ready
```

---

## Migration History

| Revision | Date | Description |
|----------|------|-------------|
| `d3f7b66295cd` | 2025-12-21 | Initial migration — feature, template, testcase tables |
| `a1b2c3d4e5f6` | 2026-02-21 | Add feature and test case link tables |
| `b2c3d4e5f6g7` | 2026-03-25 | Add generation_count, refinement_count to feature table |
| `c3d4e5f6a7b8` | 2026-07-02 | Make created_at columns timezone-aware (Postgres only) |
| `d4e5f6a7b8c9` | 2026-07-02 | Add unique constraints on link pairs (dedupes existing rows first) |
| `e5f6a7b8c9d0` | 2026-07-02 | Add index on testcase.feature_id |
