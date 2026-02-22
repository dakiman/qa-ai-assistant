# QA-Craft Implementation Plan

## Overview

This document contains a prioritized implementation plan for addressing technical debt, security issues, and architectural improvements identified in the QA-Craft codebase. Each phase contains specific tasks with file references and acceptance criteria.

---

## Phase 1: Critical Fixes (Pre-Production Blockers)

### Task 1.1: Fix Database Session Management

**Priority:** 🔴 Critical  
**Estimated Effort:** 30 minutes

**Problem:** The lifespan handler uses `next()` to manually consume the session generator, bypassing proper context management.

**Files to Modify:**
- `backend/main.py`

**Implementation:**
1. Refactor the lifespan function to use a proper session context
2. Create a separate `seed_default_templates()` function in a new `backend/seed.py` file
3. Use `with Session(engine) as session:` pattern instead of `next(get_session())`

**Acceptance Criteria:**
- [ ] Session is properly opened and closed in lifespan handler
- [ ] Template seeding is extracted to a separate module
- [ ] No `next(get_session())` usage anywhere in codebase

---

### Task 1.2: Implement Proper Async/Sync Decision

**Priority:** 🔴 Critical  
**Estimated Effort:** 2 hours

**Problem:** The codebase has `aiosqlite` installed but uses synchronous operations. Need to commit to one approach.

**Decision Point:** Since SQLModel doesn't have great async support yet, recommend **staying synchronous** but properly.

**Files to Modify:**
- `backend/requirements.txt` - Remove `aiosqlite`
- `backend/database.py` - Add explicit sync documentation

**Implementation:**
1. Remove `aiosqlite` from requirements.txt
2. Add docstring to `database.py` explaining the synchronous choice
3. Ensure all routes remain synchronous (`def` not `async def`)

**Acceptance Criteria:**
- [ ] `aiosqlite` removed from dependencies
- [ ] Clear documentation on sync vs async decision
- [ ] No mixed async/sync patterns

---

### Task 1.3: Add Structured Logging

**Priority:** 🔴 Critical  
**Estimated Effort:** 1 hour

**Problem:** Uses `print()` statements instead of proper logging.

**Files to Create:**
- `backend/logging_config.py`

**Files to Modify:**
- `backend/main.py`
- `backend/services/llm_service.py`
- `backend/database.py`

**Implementation:**
1. Create `logging_config.py` with structured JSON logging configuration
2. Replace all `print()` statements with appropriate log levels
3. Add request ID middleware for request tracing

**Code Template:**
```python
# backend/logging_config.py
import logging
import sys
from typing import Any

def setup_logging(log_level: str = "INFO") -> None:
    """Configure structured logging for the application."""
    logging.basicConfig(
        level=getattr(logging, log_level.upper()),
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
        handlers=[logging.StreamHandler(sys.stdout)]
    )

logger = logging.getLogger("qa_craft")
```

**Acceptance Criteria:**
- [ ] No `print()` statements in backend code
- [ ] All log messages use appropriate levels (DEBUG, INFO, WARNING, ERROR)
- [ ] Request tracing is possible via logs

---

### Task 1.4: Fix LLM Service Singleton Pattern

**Priority:** 🔴 Critical  
**Estimated Effort:** 45 minutes

**Problem:** Global mutable singleton is not thread-safe and hard to test.

**Files to Modify:**
- `backend/services/llm_service.py`
- `backend/routers/generate.py`
- `backend/routers/refine.py`

**Implementation:**
1. Convert `LLMService` to use FastAPI's dependency injection properly
2. Use `@lru_cache` for caching the service instance
3. Add a factory function that respects settings

**Code Template:**
```python
# backend/services/llm_service.py (at the end)
from functools import lru_cache

@lru_cache
def get_llm_service() -> LLMService:
    """Get cached LLM service instance."""
    return LLMService()
```

**Acceptance Criteria:**
- [ ] No global `_llm_service` variable
- [ ] Service is injected via FastAPI `Depends()`
- [ ] Service can be easily mocked in tests

---

### Task 1.5: Update Deprecated datetime.utcnow()

**Priority:** 🟡 Medium  
**Estimated Effort:** 15 minutes

**Problem:** `datetime.utcnow()` is deprecated in Python 3.12+.

**Files to Modify:**
- `backend/models.py`

**Implementation:**
Replace:
```python
created_at: datetime = Field(default_factory=datetime.utcnow)
```
With:
```python
from datetime import datetime, timezone

created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
```

**Acceptance Criteria:**
- [ ] No usage of `datetime.utcnow()` in codebase
- [ ] All datetime fields use timezone-aware UTC

---

### Task 1.6: Update Outdated Dependencies

**Priority:** 🔴 Critical  
**Estimated Effort:** 30 minutes

**Problem:** Several dependencies are significantly outdated.

**Files to Modify:**
- `backend/requirements.txt`

**Implementation:**
Update to these versions (verify compatibility):
```
fastapi>=0.115.0
uvicorn[standard]>=0.32.0
sqlmodel>=0.0.22
openai>=1.50.0
instructor>=1.5.0
anthropic>=0.40.0
pydantic>=2.9.0
pydantic-settings>=2.6.0
python-dotenv>=1.0.1
```

**Acceptance Criteria:**
- [ ] All dependencies updated to recent stable versions
- [ ] Application starts without errors
- [ ] LLM generation still works with updated instructor library

---

## Phase 2: Security Hardening

### Task 2.1: Environment-Based CORS Configuration

**Priority:** 🔴 Critical  
**Estimated Effort:** 30 minutes

**Files to Modify:**
- `backend/config.py`
- `backend/main.py`

**Implementation:**
1. Add CORS configuration to settings
2. Support multiple origins via comma-separated env var
3. Restrict methods and headers in production

**Code Template:**
```python
# backend/config.py additions
class Settings(BaseSettings):
    # ... existing fields ...
    
    # CORS
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    cors_allow_credentials: bool = True
    environment: str = "development"  # development, staging, production
    
    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",")]
```

**Acceptance Criteria:**
- [ ] CORS origins configurable via environment variable
- [ ] Production mode has stricter CORS settings
- [ ] Local development still works seamlessly

---

### Task 2.2: Add Basic API Authentication

**Priority:** 🔴 Critical  
**Estimated Effort:** 2-3 hours

**Files to Create:**
- `backend/auth.py`

**Files to Modify:**
- `backend/config.py`
- `backend/main.py`
- `backend/routers/*.py` (all router files)
- `frontend/src/lib/api.ts`

**Implementation:**
1. Implement simple API key authentication for MVP
2. Add `X-API-Key` header validation
3. Create auth dependency for protected routes
4. Update frontend to include API key in requests

**Code Template:**
```python
# backend/auth.py
from fastapi import HTTPException, Security, status
from fastapi.security import APIKeyHeader
from config import get_settings

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

async def verify_api_key(api_key: str = Security(api_key_header)) -> str:
    settings = get_settings()
    if settings.environment == "development" and not settings.api_key:
        return "dev-mode"  # Skip auth in dev if no key configured
    if not api_key or api_key != settings.api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key"
        )
    return api_key
```

**Acceptance Criteria:**
- [ ] All mutating endpoints require API key
- [ ] Read endpoints optionally require API key (configurable)
- [ ] Frontend sends API key with all requests
- [ ] Development mode works without API key for local testing

---

### Task 2.3: Add Rate Limiting

**Priority:** 🟡 Medium  
**Estimated Effort:** 1 hour

**Files to Create:**
- `backend/middleware/rate_limit.py`

**Files to Modify:**
- `backend/requirements.txt` (add `slowapi`)
- `backend/main.py`

**Implementation:**
1. Install slowapi: `slowapi==0.1.9`
2. Add rate limiting middleware
3. Configure different limits for different endpoint types

**Acceptance Criteria:**
- [ ] LLM generation endpoints limited to 10 requests/minute
- [ ] CRUD endpoints limited to 100 requests/minute
- [ ] Rate limit headers returned in responses
- [ ] 429 response when limit exceeded

---

### Task 2.4: Disable SQL Echo in Production

**Priority:** 🟡 Medium  
**Estimated Effort:** 15 minutes

**Files to Modify:**
- `backend/config.py`
- `backend/database.py`

**Implementation:**
```python
# config.py
class Settings:
    # ... 
    db_echo: bool = False  # Set via DB_ECHO env var

# database.py
engine = create_engine(
    settings.database_url,
    echo=settings.db_echo,
    connect_args={"check_same_thread": False}
)
```

**Acceptance Criteria:**
- [ ] SQL queries not logged in production
- [ ] Can enable SQL logging via environment variable for debugging

---

## Phase 3: Architecture Improvements

### Task 3.1: Implement Repository Pattern

**Priority:** 🟡 Medium  
**Estimated Effort:** 3-4 hours

**Files to Create:**
- `backend/repositories/__init__.py`
- `backend/repositories/base.py`
- `backend/repositories/feature_repository.py`
- `backend/repositories/test_case_repository.py`
- `backend/repositories/template_repository.py`

**Files to Modify:**
- `backend/routers/features.py`
- `backend/routers/test_cases.py`
- `backend/routers/templates.py`
- `backend/routers/generate.py`
- `backend/routers/refine.py`

**Implementation:**
1. Create base repository with common CRUD operations
2. Create specific repositories for each entity
3. Refactor routers to use repositories via dependency injection

**Code Template:**
```python
# backend/repositories/base.py
from typing import Generic, TypeVar, Optional, Sequence
from sqlmodel import Session, SQLModel, select

ModelType = TypeVar("ModelType", bound=SQLModel)

class BaseRepository(Generic[ModelType]):
    def __init__(self, model: type[ModelType], session: Session):
        self.model = model
        self.session = session
    
    def get(self, id: int) -> Optional[ModelType]:
        return self.session.get(self.model, id)
    
    def get_all(self, skip: int = 0, limit: int = 100) -> Sequence[ModelType]:
        statement = select(self.model).offset(skip).limit(limit)
        return self.session.exec(statement).all()
    
    def create(self, obj: ModelType) -> ModelType:
        self.session.add(obj)
        self.session.commit()
        self.session.refresh(obj)
        return obj
    
    def delete(self, obj: ModelType) -> None:
        self.session.delete(obj)
        self.session.commit()
```

**Acceptance Criteria:**
- [ ] All database operations go through repositories
- [ ] Routers only contain HTTP handling logic
- [ ] Repositories are injected via FastAPI dependencies
- [ ] Business logic can be easily unit tested

---

### Task 3.2: Add Database Migrations with Alembic

**Priority:** 🟡 Medium  
**Estimated Effort:** 1-2 hours

**Files to Create:**
- `backend/alembic.ini`
- `backend/alembic/env.py`
- `backend/alembic/versions/` (directory)

**Files to Modify:**
- `backend/requirements.txt` (add `alembic`)
- `backend/main.py` (remove `init_db()` call)

**Implementation:**
1. Install alembic: `alembic==1.13.0`
2. Initialize alembic: `alembic init alembic`
3. Configure alembic to use SQLModel metadata
4. Create initial migration from existing models
5. Update startup to run migrations instead of create_all

**Commands:**
```bash
cd backend
pip install alembic
alembic init alembic
# Edit alembic/env.py to import models
alembic revision --autogenerate -m "Initial migration"
alembic upgrade head
```

**Acceptance Criteria:**
- [ ] Alembic configured and working
- [ ] Initial migration created matching current schema
- [ ] `create_all()` removed from startup
- [ ] Migration runs automatically or via command

---

### Task 3.3: Add OpenAPI Type Generation for Frontend

**Priority:** 🟡 Medium  
**Estimated Effort:** 1 hour

**Files to Create:**
- `frontend/scripts/generate-types.ts`
- `frontend/src/lib/api-types.ts` (generated)

**Files to Modify:**
- `frontend/package.json`

**Implementation:**
1. Install openapi-typescript: `npm install -D openapi-typescript`
2. Create script to fetch OpenAPI spec and generate types
3. Add npm script: `"generate-types": "npx openapi-typescript http://localhost:8000/openapi.json -o src/lib/api-types.ts"`

**Acceptance Criteria:**
- [ ] TypeScript types generated from OpenAPI spec
- [ ] Frontend uses generated types instead of manual definitions
- [ ] Type generation included in build process

---

### Task 3.4: Add React Query for Data Fetching

**Priority:** 🟡 Medium  
**Estimated Effort:** 2-3 hours

**Files to Create:**
- `frontend/src/lib/queries.ts`
- `frontend/src/providers/QueryProvider.tsx`

**Files to Modify:**
- `frontend/package.json`
- `frontend/src/app/layout.tsx`
- `frontend/src/app/page.tsx`
- `frontend/src/app/features/page.tsx`
- `frontend/src/app/features/[id]/page.tsx`
- `frontend/src/app/features/new/page.tsx`

**Implementation:**
1. Install: `npm install @tanstack/react-query`
2. Create QueryProvider wrapper
3. Create query hooks for each API endpoint
4. Refactor pages to use React Query hooks
5. Add optimistic updates for status changes

**Code Template:**
```typescript
// frontend/src/lib/queries.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { featureApi, testCaseApi, type Feature } from './api';

export function useFeatures() {
  return useQuery({
    queryKey: ['features'],
    queryFn: featureApi.list,
  });
}

export function useFeature(id: number) {
  return useQuery({
    queryKey: ['features', id],
    queryFn: () => featureApi.get(id),
  });
}

export function useAcceptTestCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: testCaseApi.accept,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['features'] });
    },
  });
}
```

**Acceptance Criteria:**
- [ ] All data fetching uses React Query
- [ ] Data is cached between navigations
- [ ] Loading and error states handled consistently
- [ ] Optimistic updates for status changes

---

### Task 3.5: Add React Error Boundaries

**Priority:** 🟡 Medium  
**Estimated Effort:** 45 minutes

**Files to Create:**
- `frontend/src/components/ErrorBoundary.tsx`
- `frontend/src/app/error.tsx`
- `frontend/src/app/features/error.tsx`
- `frontend/src/app/features/[id]/error.tsx`

**Implementation:**
1. Create reusable ErrorBoundary component
2. Add Next.js error.tsx files for each route segment
3. Include retry functionality

**Code Template:**
```typescript
// frontend/src/app/error.tsx
'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Card className="max-w-md mx-auto mt-8 border-destructive/50">
      <CardHeader>
        <CardTitle className="text-destructive">Something went wrong</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground">{error.message}</p>
        <Button onClick={reset}>Try again</Button>
      </CardContent>
    </Card>
  );
}
```

**Acceptance Criteria:**
- [ ] Application doesn't crash on component errors
- [ ] Users see friendly error messages
- [ ] Retry functionality works
- [ ] Errors are logged for debugging

---

## Phase 4: Code Quality & Cleanup

### Task 4.1: Replace Inline SVGs with Lucide Icons

**Priority:** 🟢 Low  
**Estimated Effort:** 1-2 hours

**Files to Modify:**
- `frontend/src/app/page.tsx`
- `frontend/src/app/features/page.tsx`
- `frontend/src/app/features/new/page.tsx`
- `frontend/src/app/features/[id]/page.tsx`
- `frontend/src/components/TestCaseCard.tsx`
- `frontend/src/components/RefineActionBar.tsx`
- `frontend/src/components/AddTestCaseDialog.tsx`
- `frontend/src/components/layout/Sidebar.tsx`

**Implementation:**
1. Import icons from lucide-react
2. Replace all inline SVGs with Lucide components
3. Use consistent icon sizing

**Icon Mapping:**
- Plus icon → `<Plus />`
- Check icon → `<Check />`
- X icon → `<X />`
- Edit icon → `<Pencil />`
- Home icon → `<Home />`
- Box icon → `<Box />`
- Layout icon → `<LayoutTemplate />`
- Arrow left → `<ChevronLeft />`
- Arrow right → `<ChevronRight />`
- Star → `<Star />`
- Clipboard → `<ClipboardCheck />`
- Alert → `<AlertTriangle />`
- Refresh → `<RefreshCw />`
- Sparkle → `<Sparkles />`
- Info → `<Info />`
- Loader → `<Loader2 />` (with `animate-spin`)

**Acceptance Criteria:**
- [ ] No inline SVGs in component files
- [ ] All icons imported from lucide-react
- [ ] Consistent icon sizing across components

---

### Task 4.2: Add Comprehensive Error Handling

**Priority:** 🟡 Medium  
**Estimated Effort:** 1-2 hours

**Files to Create:**
- `backend/exceptions.py`

**Files to Modify:**
- `backend/main.py`
- `backend/services/llm_service.py`
- `backend/routers/*.py`

**Implementation:**
1. Create custom exception classes
2. Add global exception handler
3. Ensure consistent error response format
4. Remove silent fallbacks (log errors instead)

**Code Template:**
```python
# backend/exceptions.py
from fastapi import HTTPException, status

class QACraftException(Exception):
    """Base exception for QA-Craft."""
    def __init__(self, message: str, status_code: int = 500):
        self.message = message
        self.status_code = status_code
        super().__init__(message)

class LLMServiceError(QACraftException):
    """Raised when LLM service fails."""
    def __init__(self, message: str = "LLM service unavailable"):
        super().__init__(message, status_code=503)

class ResourceNotFoundError(QACraftException):
    """Raised when a resource is not found."""
    def __init__(self, resource: str, id: int):
        super().__init__(f"{resource} with id {id} not found", status_code=404)
```

**Acceptance Criteria:**
- [ ] All exceptions use custom exception classes
- [ ] Global exception handler returns consistent JSON format
- [ ] No silent error swallowing
- [ ] All errors are logged appropriately

---

### Task 4.3: Add Unit Tests for Critical Paths

**Priority:** 🔴 Critical  
**Estimated Effort:** 4-6 hours

**Files to Create:**
- `backend/tests/__init__.py`
- `backend/tests/conftest.py`
- `backend/tests/test_features.py`
- `backend/tests/test_test_cases.py`
- `backend/tests/test_generation.py`
- `backend/tests/test_refinement.py`
- `backend/pytest.ini`

**Files to Modify:**
- `backend/requirements.txt` (add `pytest`, `pytest-asyncio`, `httpx`)

**Implementation:**
1. Add test dependencies: `pytest`, `httpx`, `pytest-cov`
2. Create test fixtures for database and client
3. Write tests for CRUD operations
4. Write tests for LLM service (with mocks)
5. Add pytest configuration

**Code Template:**
```python
# backend/tests/conftest.py
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from main import app
from database import get_session

@pytest.fixture(name="session")
def session_fixture():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session

@pytest.fixture(name="client")
def client_fixture(session: Session):
    def get_session_override():
        return session
    
    app.dependency_overrides[get_session] = get_session_override
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()
```

**Acceptance Criteria:**
- [ ] Test coverage > 70% for backend
- [ ] All CRUD operations tested
- [ ] LLM service tested with mocks
- [ ] Tests run in CI pipeline

---

### Task 4.4: Fix TestCaseCard State Duplication

**Priority:** 🟢 Low  
**Estimated Effort:** 30 minutes

**Files to Modify:**
- `frontend/src/components/TestCaseCard.tsx`

**Implementation:**
1. Remove local `currentCase` state
2. Use `testCase` prop directly
3. Rely on parent to update state after API calls

**Acceptance Criteria:**
- [ ] No duplicate state between parent and child
- [ ] State updates correctly after accept/reject/reset

---

## Phase 5: Feature Additions

### Task 5.1: Add Test Case Export

**Priority:** 🟢 Low  
**Estimated Effort:** 2 hours

**Files to Create:**
- `backend/routers/export.py`
- `frontend/src/components/ExportButton.tsx`

**Files to Modify:**
- `backend/main.py`
- `frontend/src/app/features/[id]/page.tsx`

**Implementation:**
1. Create export endpoint supporting JSON and CSV formats
2. Add export button to feature detail page
3. Support filtering by status

**Acceptance Criteria:**
- [ ] Export to JSON works
- [ ] Export to CSV works
- [ ] Can filter exported cases by status
- [ ] File downloads with proper filename

---

### Task 5.2: Add Search and Filter Functionality

**Priority:** 🟢 Low  
**Estimated Effort:** 2-3 hours

**Files to Create:**
- `frontend/src/components/TestCaseFilters.tsx`
- `frontend/src/components/SearchInput.tsx`

**Files to Modify:**
- `backend/routers/test_cases.py`
- `frontend/src/app/features/[id]/page.tsx`

**Implementation:**
1. Add query parameters for filtering test cases
2. Create filter UI component
3. Add search by title functionality
4. Persist filter state in URL

**Acceptance Criteria:**
- [ ] Can filter by status (draft/accepted/rejected)
- [ ] Can filter by type (edge case, manual)
- [ ] Can search by title
- [ ] Filters persist in URL

---

### Task 5.3: Add Template Management UI

**Priority:** 🟢 Low  
**Estimated Effort:** 2-3 hours

**Files to Create:**
- `frontend/src/app/templates/new/page.tsx`
- `frontend/src/app/templates/[id]/page.tsx`
- `frontend/src/components/TemplateForm.tsx`

**Files to Modify:**
- `frontend/src/app/templates/page.tsx`
- `frontend/src/lib/api.ts`

**Implementation:**
1. Add create template page
2. Add edit template page
3. Add delete template functionality
4. Add template preview

**Acceptance Criteria:**
- [ ] Can create new templates
- [ ] Can edit existing templates
- [ ] Can delete templates (with confirmation)
- [ ] Template changes reflect in generation

---

## Execution Order

### Week 1: Critical Fixes
1. Task 1.1: Fix Database Session Management
2. Task 1.2: Implement Proper Async/Sync Decision
3. Task 1.3: Add Structured Logging
4. Task 1.4: Fix LLM Service Singleton Pattern
5. Task 1.5: Update Deprecated datetime.utcnow()
6. Task 1.6: Update Outdated Dependencies

### Week 2: Security
1. Task 2.1: Environment-Based CORS Configuration
2. Task 2.2: Add Basic API Authentication
3. Task 2.3: Add Rate Limiting
4. Task 2.4: Disable SQL Echo in Production

### Week 3: Architecture
1. Task 3.1: Implement Repository Pattern
2. Task 3.2: Add Database Migrations with Alembic
3. Task 4.3: Add Unit Tests for Critical Paths

### Week 4: Frontend & Polish
1. Task 3.3: Add OpenAPI Type Generation for Frontend
2. Task 3.4: Add React Query for Data Fetching
3. Task 3.5: Add React Error Boundaries
4. Task 4.1: Replace Inline SVGs with Lucide Icons
5. Task 4.2: Add Comprehensive Error Handling
6. Task 4.4: Fix TestCaseCard State Duplication

### Week 5+: Features (Post-MVP)
1. Task 5.1: Add Test Case Export
2. Task 5.2: Add Search and Filter Functionality
3. Task 5.3: Add Template Management UI

---

## Usage Instructions

To implement any task, copy the task section into a new Cursor prompt window with the following format:

```
Implement [Task Number]: [Task Name]

[Paste the task content here]

Additional Context:
- Project uses FastAPI backend and Next.js frontend
- Follow the patterns established in .cursorrules
- Run tests after implementation
```

---

## Notes

- Always create a git branch before implementing changes
- Run linting after each task: `cd frontend && npm run lint`
- Test backend changes: `cd backend && pytest`
- Update this document as tasks are completed




