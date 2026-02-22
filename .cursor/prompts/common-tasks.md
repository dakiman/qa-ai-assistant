# Common Task Prompts for QA-Craft

Copy and paste these prompts when performing common development tasks.

---

## Adding a New API Endpoint

```
Add a new API endpoint: [DESCRIBE ENDPOINT]

Requirements:
1. Follow the repository pattern established in the codebase
2. Create appropriate Pydantic schemas in models.py
3. Add the route handler in the appropriate router file
4. Use proper HTTP status codes (201 for create, 204 for delete)
5. Include proper error handling with HTTPException
6. Add docstrings for OpenAPI documentation
7. Follow the URL naming convention (kebab-case)

Reference the existing patterns in:
- backend/routers/features.py
- backend/models.py
- .cursor/rules/api-design.mdc
```

---

## Creating a New React Component

```
Create a new React component: [DESCRIBE COMPONENT]

Requirements:
1. Use TypeScript with proper interface definitions
2. Use shadcn/ui components (Button, Card, etc.) from @/components/ui
3. Use Lucide-React icons, NOT inline SVGs
4. Implement loading and error states
5. Use cn() utility for conditional classes
6. Add proper props interface with JSDoc
7. Follow the component patterns in .cursor/rules/frontend-react.mdc

Reference existing components:
- frontend/src/components/TestCaseCard.tsx
- frontend/src/components/AddTestCaseDialog.tsx
```

---

## Adding a Database Migration

```
Add a database migration for: [DESCRIBE CHANGE]

Steps:
1. Update the SQLModel in backend/models.py
2. Run: alembic revision --autogenerate -m "description"
3. Review the generated migration in backend/alembic/versions/
4. Test with: alembic upgrade head
5. Test rollback with: alembic downgrade -1

Follow the patterns in .cursor/rules/database.mdc
```

---

## Adding a New Feature (Full Stack)

```
Add a new feature: [DESCRIBE FEATURE]

This requires changes to:

## Backend:
1. Add SQLModel entities in models.py if needed
2. Create Alembic migration if schema changes
3. Add repository in repositories/ directory
4. Add router in routers/ directory
5. Update main.py to include new router

## Frontend:
1. Add types to lib/api.ts (or generate from OpenAPI)
2. Add API functions to lib/api.ts
3. Add React Query hooks to lib/queries.ts
4. Create page in app/ directory
5. Create components in components/ directory
6. Add to navigation in components/layout/Sidebar.tsx

Follow all rules in .cursor/rules/ directory.
```

---

## Writing Tests

```
Write tests for: [DESCRIBE WHAT TO TEST]

Backend (pytest):
1. Create test file in backend/tests/
2. Use fixtures from conftest.py (session, client)
3. Mock external services (LLM)
4. Test happy paths and error cases
5. Follow patterns in .cursor/rules/testing.mdc

Frontend (Jest):
1. Create test file with .test.tsx extension
2. Use React Testing Library
3. Mock API calls with MSW
4. Test user interactions
5. Test loading and error states
```

---

## Adding Authentication to an Endpoint

```
Add authentication to endpoint: [ENDPOINT PATH]

Requirements:
1. Import the auth dependency from backend/auth.py
2. Add Depends(require_api_key) to the endpoint
3. Update frontend API call to include X-API-Key header
4. Handle 401 errors in frontend

Reference .cursor/rules/security.mdc for patterns.
```

---

## Refactoring to Repository Pattern

```
Refactor this router to use the repository pattern: [FILE PATH]

Steps:
1. Create a repository class in backend/repositories/
2. Inherit from BaseRepository
3. Move all database operations to repository
4. Create a get_[entity]_repository dependency
5. Update router to inject repository via Depends()
6. Keep only HTTP handling in router

Reference:
- .cursor/rules/backend-python.mdc (Repository Pattern section)
- backend/repositories/base.py (if exists)
```

---

## Adding Form Validation

```
Add validation to form: [DESCRIBE FORM]

Frontend:
1. Add client-side validation messages
2. Disable submit button when invalid
3. Show inline error messages
4. Validate on blur and submit

Backend:
1. Use Pydantic Field() with constraints
2. Add custom validators if needed
3. Return 422 with detailed errors

Follow patterns in .cursor/rules/frontend-react.mdc
```

---

## Debugging LLM Issues

```
Debug LLM integration issue: [DESCRIBE ISSUE]

Checklist:
1. Check if API key is set in .env
2. Check LLM_PROVIDER setting (openai/anthropic/mock)
3. Check logs for error messages
4. Verify instructor library version compatibility
5. Test with mock mode first
6. Check response structure matches Pydantic model

Reference .cursor/rules/llm-integration.mdc
```

---

## Performance Optimization

```
Optimize performance for: [DESCRIBE ISSUE]

Backend:
1. Add indexes for frequently queried columns
2. Use selectinload for eager loading relationships
3. Add pagination if loading large lists
4. Check for N+1 queries

Frontend:
1. Use React Query for caching
2. Implement virtualization for long lists
3. Add loading skeletons
4. Debounce search inputs

Reference .cursor/rules/database.mdc
```

---

## Adding Environment Configuration

```
Add new environment configuration: [DESCRIBE CONFIG]

Steps:
1. Add field to Settings class in backend/config.py
2. Set default value appropriate for development
3. Add to .env.example
4. Document in README or IMPLEMENTATION_PLAN.md
5. Use via get_settings().field_name

For frontend:
1. Add NEXT_PUBLIC_ prefix for client-side vars
2. Add to frontend/.env.local
3. Access via process.env.NEXT_PUBLIC_VAR_NAME
```




