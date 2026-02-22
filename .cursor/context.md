# QA-Craft Project Context

## What is QA-Craft?

QA-Craft is an AI-powered test case management and generation system designed for QA engineers. It uses large language models (LLM) to:

1. **Generate Test Cases** - Automatically create comprehensive test cases from requirements
2. **Refine Test Suites** - Analyze existing test cases and find gaps/edge cases
3. **Curate Test Cases** - Allow QA engineers to accept, reject, or modify generated cases
4. **Manage Features** - Organize test cases by feature/requirement

## Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Backend Framework | FastAPI | 0.115+ |
| Database ORM | SQLModel | 0.0.22+ |
| Database | SQLite (dev) / PostgreSQL (prod) | - |
| AI Integration | instructor + OpenAI/Anthropic | Latest |
| Frontend Framework | Next.js (App Router) | 16+ |
| UI Components | shadcn/ui + Tailwind CSS | Latest |
| State Management | React Query | 5+ |
| Icons | Lucide-React | Latest |

## Core Domain Concepts

### Feature
A software feature or requirement to be tested. Contains:
- Title and description
- Raw requirements text (input for AI)
- Associated test cases

### Test Case
A single test case with:
- Title
- Steps (ordered list)
- Expected result
- Status (draft/accepted/rejected)
- Flags (is_edge_case, is_manual)
- Refinement notes (AI explanation)

### Template
Customizable system prompts for AI generation:
- Standard Test Case template
- API Testing template
- UI/UX Testing template
- Custom templates

### Workflow
1. User creates a Feature with requirements
2. AI generates initial test cases (DRAFT status)
3. User curates: Accept, Reject, or add Manual cases
4. User triggers Refinement to find gaps
5. AI analyzes accepted cases and adds edge cases
6. User curates new suggestions
7. Export finalized test suite

## Directory Structure

```
qa-ai-tool/
├── backend/
│   ├── main.py           # FastAPI app entry point
│   ├── config.py         # Pydantic settings
│   ├── database.py       # SQLModel engine/session
│   ├── models.py         # All SQLModel entities
│   ├── routers/          # HTTP route handlers
│   ├── services/         # Business logic (LLM)
│   ├── repositories/     # Data access layer (TODO)
│   └── tests/            # Pytest tests (TODO)
├── frontend/
│   ├── src/
│   │   ├── app/          # Next.js pages
│   │   ├── components/   # React components
│   │   └── lib/          # Utilities, API client
│   └── package.json
├── .cursor/              # Cursor AI rules
│   ├── rules/            # Domain-specific rules
│   ├── prompts/          # Common task prompts
│   └── context.md        # This file
├── .cursorrules          # Main rules file
└── IMPLEMENTATION_PLAN.md
```

## API Endpoints Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/features | List all features |
| POST | /api/v1/features | Create feature |
| GET | /api/v1/features/{id} | Get feature details |
| PATCH | /api/v1/features/{id} | Update feature |
| DELETE | /api/v1/features/{id} | Delete feature |
| GET | /api/v1/features/{id}/stats | Get test case stats |
| POST | /api/v1/features/{id}/refine | Trigger AI refinement |
| POST | /api/v1/generate | Generate test cases |
| GET | /api/v1/test-cases/{id} | Get test case |
| PATCH | /api/v1/test-cases/{id} | Update test case |
| POST | /api/v1/test-cases/{id}/accept | Accept test case |
| POST | /api/v1/test-cases/{id}/reject | Reject test case |
| GET | /api/v1/templates | List templates |

## Current State & Known Issues

See `IMPLEMENTATION_PLAN.md` for:
- Technical debt items
- Security concerns
- Architecture improvements needed
- Prioritized implementation tasks

## Development Commands

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend
cd frontend
npm install
npm run dev

# Tests
cd backend && pytest
cd frontend && npm test
```

## Environment Variables

```bash
# Backend (.env)
DATABASE_URL=sqlite:///./qa_craft.db
LLM_PROVIDER=mock  # or openai, anthropic
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
ENVIRONMENT=development
API_KEY=your-api-key

# Frontend (.env.local)
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

## Coding Principles

1. **Repository Pattern** - Separate data access from HTTP handlers
2. **Dependency Injection** - Use FastAPI's Depends() everywhere
3. **Type Safety** - Full type hints in Python, strict TypeScript
4. **Structured LLM Output** - Always use instructor library
5. **Environment Configuration** - All config via Pydantic Settings
6. **Consistent Error Handling** - Custom exceptions, proper HTTP codes
7. **Component Reuse** - shadcn/ui for all UI primitives

## Getting Help

1. Check `.cursorrules` for coding standards
2. Check `.cursor/rules/` for domain-specific guidance
3. Check `.cursor/prompts/common-tasks.md` for task templates
4. Check `IMPLEMENTATION_PLAN.md` for current priorities




