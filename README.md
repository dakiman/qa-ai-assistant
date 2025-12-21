# QA-Craft: AI-Powered Test Management & Refinement Engine

## 1. Overview
QA-Craft is a specialized tool for QA engineers to bridge the gap between raw requirements and actionable test suites. It features a "Human-in-the-Loop" workflow where AI generates drafts, humans curate them, and a secondary "Refinement Pass" ensures edge cases and logic gaps are filled.

## 2. Tech Stack
- **Backend:** Python 3.10+, FastAPI
- **Frontend:** Next.js (App Router), Tailwind CSS, shadcn/ui
- **Database:** SQLite (for POC) or PostgreSQL (Production) using SQLModel
- **AI Integration:** OpenAI/Anthropic via the `instructor` library (for strict Pydantic validation)
- **State Management:** React Context or TanStack Query

## 3. Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+
- npm

### Backend Setup

```bash
# Navigate to backend directory
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run the server
uvicorn main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`
- API Docs: `http://localhost:8000/docs`
- Health Check: `http://localhost:8000/health`

### Frontend Setup

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Run the development server
npm run dev
```

The frontend will be available at `http://localhost:3000`

### Environment Variables (Optional)

Create a `.env` file in the `backend/` directory:

```env
# LLM Provider: "openai", "anthropic", or "mock"
LLM_PROVIDER=mock

# OpenAI API Key (optional - will use mock if not provided)
OPENAI_API_KEY=your_openai_api_key_here

# Anthropic API Key (optional - alternative to OpenAI)
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Database URL
DATABASE_URL=sqlite:///./qa_craft.db
```

> **Note:** The app works out of the box with mock LLM responses. To use real AI generation, set `LLM_PROVIDER` to `openai` or `anthropic` and provide the corresponding API key.

## 4. Core Architecture & Data Model

### Entities
- **Feature:** `id, title, description, raw_requirements, created_at`
- **Template:** `id, name, system_instructions`
- **TestCase:** `id, feature_id, title, steps, expected_result, is_edge_case (bool), status (draft/accepted/rejected)`

### Workflow Logic
1. **Initial Generation:** LLM parses `raw_requirements` + `Template` -> Returns `List[TestCase]`.
2. **Curation:** User updates `TestCase.status` via UI.
3. **Refinement:** Sends `raw_requirements` + `List[Accepted TestCases]` -> LLM returns a polished, finalized suite including new "Edge Cases."

## 5. API Endpoints

### Features
- `GET /api/v1/features/` - List all features
- `POST /api/v1/features/` - Create a feature
- `GET /api/v1/features/{id}` - Get a feature
- `PATCH /api/v1/features/{id}` - Update a feature
- `DELETE /api/v1/features/{id}` - Delete a feature

### Templates
- `GET /api/v1/templates/` - List all templates
- `POST /api/v1/templates/` - Create a template
- `GET /api/v1/templates/{id}` - Get a template
- `PATCH /api/v1/templates/{id}` - Update a template
- `DELETE /api/v1/templates/{id}` - Delete a template

### Generation
- `POST /api/v1/generate/` - Generate test cases for a feature
- `GET /api/v1/generate/feature/{id}/test-cases` - Get test cases for a feature

## 6. Implementation Milestones

### ✅ Milestone 1: Foundation (Backend & DB)
- Set up FastAPI with SQLModel.
- Create endpoints for `Feature` and `Template` CRUD.
- Implement the `LLMService` using `instructor` to ensure all AI responses strictly follow a `TestCase` Pydantic schema.

### ✅ Milestone 2: The Generation UI
- Build a "New Feature" form.
- Implement a requirement text area and a template selector.
- Design the "Drafting Canvas" where generated test cases appear as **Cards**.

### Milestone 3: Curation & Interaction
- Implement card actions: `Accept`, `Reject`, and `Edit`.
- Add a "Manual Case" button to let users inject their own logic into the list.

### Milestone 4: The Refinement Engine
- Implement the `/refine` endpoint. This prompt should:
    - Compare accepted cases against requirements to find gaps.
    - Specifically generate cases for: Boundary analysis, Error handling, and Security.
    - Set `is_edge_case=True` for any new cases it creates.

### Milestone 5: Export & Tools
- Add a "Bug Report" tool: Convert a text description into a structured bug report.
- Export finalized test cases to Markdown or CSV.

## 7. Future Roadmap
- **Jira Integration:** Push finalized cases directly to Jira tickets.
- **Auto-Automation:** Generate Playwright/Cypress code snippets for each test case.
- **Screenshot-to-Steps:** Upload a screenshot to generate the initial requirement text.
