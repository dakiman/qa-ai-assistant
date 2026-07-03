# Running QA-Craft

> This project is **deployed on Linux via Docker** on dakis-server-v2. The Docker
> path below is the default target for browser-testing UI changes; the native
> two-terminal setup (further down) is for local development. The PowerShell
> snippets are provided for Windows dev machines — on Linux/macOS use the bash
> equivalents in the "macOS/Linux Commands" section.

## Docker deployment (default target on this server)

There is **no compose file inside this repo**. The deployment compose lives at
`/srv/dakis/apps/qa-ai-assistant/compose.yml` and builds from this repo's
`backend/` and `frontend/` dirs. Services and ports:

| Service | Container | Host port → container |
|---------|-----------|-----------------------|
| `qa-ai-assistant-api` | `qa-ai-assistant-api` | **8010** → 8000 |
| `qa-ai-assistant-web` | `qa-ai-assistant-web` | **3010** → 3000 |

```bash
cd /srv/dakis
sg docker -c 'docker compose up -d --build qa-ai-assistant-api qa-ai-assistant-web'
sg docker -c 'docker compose ps'
```

Both images are baked (no hot-reload) — **any `backend/` or `frontend/src/` change
needs a rebuild + recreate** of the affected service. After a rebuild, wait for
`http://localhost:8010/health` and `http://localhost:3010/` before testing.

---

## Quick Start (Two Terminals — native dev)

### Terminal 1: Backend (FastAPI)

```powershell
cd backend
.\venv\Scripts\Activate.ps1
uvicorn main:app --reload --port 8000
```

### Terminal 2: Frontend (Next.js)

```powershell
cd frontend
npm run dev
```

---

## Access Points

| Service | URL |
|---------|-----|
| Frontend App | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/docs |
| API Docs (ReDoc) | http://localhost:8000/redoc |
| Health Check | http://localhost:8000/health |

---

## First-Time Setup

### Backend Setup

```powershell
cd backend

# Create virtual environment (first time only)
python -m venv venv

# Activate virtual environment
.\venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Run database migrations
alembic upgrade head

# Start the server
uvicorn main:app --reload --port 8000
```

### Frontend Setup

```powershell
cd frontend

# Install dependencies (first time only)
npm install

# Start the development server
npm run dev
```

---

## Environment Configuration (Optional)

Create a `.env` file in the `backend/` directory to configure LLM providers:

```env
# LLM Provider: "openai", "anthropic", "openrouter", or "mock"
LLM_PROVIDER=mock

# OpenAI API Key (required if LLM_PROVIDER=openai)
OPENAI_API_KEY=your_openai_api_key_here

# Anthropic API Key (required if LLM_PROVIDER=anthropic)
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# OpenRouter API Key (required if LLM_PROVIDER=openrouter)
OPENROUTER_API_KEY=your_openrouter_api_key_here

# Database URL (defaults to SQLite)
DATABASE_URL=sqlite:///./qa_craft.db
```

> **Note:** The app works out of the box with `LLM_PROVIDER=mock`. No API keys required for testing.

---

## macOS/Linux Commands

### Backend

```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm run dev
```

---

## Troubleshooting

### Port Already in Use

If port 8000 or 3000 is already in use:

```powershell
# Find process using port 8000
netstat -ano | findstr :8000

# Kill process by PID
taskkill /PID <PID> /F
```

### Database Issues

Reset the database:

```powershell
cd backend
.\venv\Scripts\Activate.ps1
Remove-Item qa_craft.db
alembic upgrade head
```

### Regenerate API Types

If backend API changes, regenerate frontend types:

```powershell
cd frontend
npm run generate-types
```

> **Note:** Backend must be running on port 8000 for type generation to work.



