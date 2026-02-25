"""Main FastAPI application for QA-Craft."""

# #region agent log
import json as _json_dbg
from datetime import datetime as _dt_dbg
_DBG_LOG_PATH = r"C:\Users\User\Projects\qa-ai-tool\debug-a8936c.log"
def _dbg_log(location: str, message: str, data: dict = None):
    try:
        with open(_DBG_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(_json_dbg.dumps({"sessionId": "a8936c", "location": location, "message": message, "data": data or {}, "timestamp": _dt_dbg.now().isoformat()}) + "\n")
    except Exception as e:
        print(f"DBG LOG ERROR: {e}", flush=True)
_dbg_log("main.py:module", "Main module loading", {"log_path": _DBG_LOG_PATH, "hypothesisId": "test"})
print(f"DBG: main.py loaded, log path: {_DBG_LOG_PATH}", flush=True)
# #endregion

from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import get_settings
from exceptions import QACraftException, LLMServiceError, RequirementsValidationException
from logging_config import setup_logging, get_logger, RequestIdMiddleware
from routers import features, templates, generate, test_cases, refine, export, links
from seed import seed_default_templates


settings = get_settings()

# Initialize logging before anything else
setup_logging(settings.log_level)
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler - runs on startup and shutdown."""
    logger.info("Starting QA-Craft API...")
    
    # Run database migrations
    # Note: For production, run migrations via CLI before deployment:
    #   alembic upgrade head
    # Auto-migration on startup is useful for development
    if settings.auto_migrate:
        from alembic.config import Config
        from alembic import command
        
        alembic_cfg = Config("alembic.ini")
        command.upgrade(alembic_cfg, "head")
        logger.info("Database migrations applied successfully")
    else:
        logger.debug("Auto-migration disabled, skipping database migrations")
    
    # Seed default templates if none exist
    if seed_default_templates():
        logger.info("Default templates seeded")
    else:
        logger.debug("Templates already exist, skipping seed")
    
    logger.info("QA-Craft API ready to accept requests")
    
    yield
    
    # Shutdown
    logger.info("Shutting down QA-Craft API...")


# Create FastAPI app
app = FastAPI(
    title="QA-Craft API",
    description="AI-Powered Test Management & Refinement Engine",
    version="0.1.0",
    lifespan=lifespan
)

# #region agent log
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest

class DebugRequestMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: StarletteRequest, call_next):
        _dbg_log("main.py:middleware", "Request received", {
            "method": request.method,
            "path": str(request.url.path),
            "hypothesisId": "D"
        })
        response = await call_next(request)
        _dbg_log("main.py:middleware", "Response completed", {
            "method": request.method,
            "path": str(request.url.path),
            "status": response.status_code,
            "hypothesisId": "D"
        })
        return response

app.add_middleware(DebugRequestMiddleware)
# #endregion

# Add request ID middleware for tracing (must be added before CORS)
app.add_middleware(RequestIdMiddleware)

# Configure CORS based on environment
if settings.is_production:
    # Strict production settings
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=settings.cors_allow_credentials,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-API-Key", "X-Request-ID"],
    )
    logger.info("CORS configured for production with origins: %s", settings.cors_origins_list)
else:
    # Relaxed development/staging settings
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=settings.cors_allow_credentials,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    logger.debug("CORS configured for %s with origins: %s", settings.environment, settings.cors_origins_list)

# Include routers
app.include_router(features.router, prefix=settings.api_v1_prefix)
app.include_router(templates.router, prefix=settings.api_v1_prefix)
app.include_router(generate.router, prefix=settings.api_v1_prefix)
app.include_router(test_cases.router, prefix=settings.api_v1_prefix)
app.include_router(refine.router, prefix=settings.api_v1_prefix)
app.include_router(export.router, prefix=settings.api_v1_prefix)
app.include_router(links.router, prefix=settings.api_v1_prefix)


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


# --- Exception Handlers ---

@app.exception_handler(RequirementsValidationException)
async def requirements_validation_handler(request: Request, exc: RequirementsValidationException):
    """
    Handle requirements content validation failures.

    Returns a structured 422 with issues and suggestions so the client
    can display actionable feedback to the user.
    """
    logger.warning(
        "Requirements validation failed (path=%s): %s",
        request.url.path,
        exc.issues,
    )
    return JSONResponse(
        status_code=422,
        content={
            "detail": {
                "type": "requirements_validation_error",
                "issues": exc.issues,
                "suggestions": exc.suggestions,
            }
        },
    )


@app.exception_handler(QACraftException)
async def qa_craft_exception_handler(request: Request, exc: QACraftException):
    """
    Handle all custom QA-Craft exceptions.
    
    Returns a consistent JSON error format for all custom exceptions.
    """
    logger.warning(
        "QACraftException: %s (status=%d, path=%s)",
        exc.message,
        exc.status_code,
        request.url.path
    )
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.message}
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    """
    Handle unexpected exceptions.
    
    Logs the full error for debugging but returns a generic message
    to avoid exposing internal details to clients.
    """
    logger.error(
        "Unhandled exception on %s: %s",
        request.url.path,
        str(exc),
        exc_info=True
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal error occurred"}
    )
