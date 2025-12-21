"""Main FastAPI application for QA-Craft."""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from database import init_db
from routers import features, templates, generate, test_cases, refine


settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler - runs on startup and shutdown."""
    # Startup: Initialize database
    print("[*] Starting QA-Craft API...")
    init_db()
    print("[OK] Database initialized")
    
    # Seed default templates if none exist
    from database import get_session
    from sqlmodel import select
    from models import Template
    
    session = next(get_session())
    existing_templates = session.exec(select(Template)).first()
    
    if not existing_templates:
        default_templates = [
            Template(
                name="Standard Test Case",
                system_instructions="""You are an expert QA Engineer. Generate comprehensive test cases that:
- Cover all functional requirements
- Include positive and negative scenarios
- Have clear, numbered steps
- Specify exact expected results"""
            ),
            Template(
                name="API Testing",
                system_instructions="""You are an API testing specialist. Generate test cases that cover:
- HTTP methods and status codes
- Request/response validation
- Authentication and authorization
- Error handling and edge cases
- Rate limiting and performance"""
            ),
            Template(
                name="UI/UX Testing",
                system_instructions="""You are a UI/UX testing expert. Generate test cases that cover:
- User interface elements and layouts
- User workflows and navigation
- Form validation and error messages
- Accessibility requirements
- Responsive design across devices"""
            ),
        ]
        for template in default_templates:
            session.add(template)
        session.commit()
        print("[OK] Default templates seeded")
    
    yield
    
    # Shutdown
    print("[*] Shutting down QA-Craft API...")


# Create FastAPI app
app = FastAPI(
    title="QA-Craft API",
    description="AI-Powered Test Management & Refinement Engine",
    version="0.1.0",
    lifespan=lifespan
)

# Configure CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # Next.js dev server
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(features.router, prefix=settings.api_v1_prefix)
app.include_router(templates.router, prefix=settings.api_v1_prefix)
app.include_router(generate.router, prefix=settings.api_v1_prefix)
app.include_router(test_cases.router, prefix=settings.api_v1_prefix)
app.include_router(refine.router, prefix=settings.api_v1_prefix)


@app.get("/")
def root():
    """Root endpoint - API health check."""
    return {
        "name": "QA-Craft API",
        "version": "0.1.0",
        "status": "running",
        "docs": "/docs"
    }


@app.get("/health")
def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


