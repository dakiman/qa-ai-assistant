"""Main FastAPI application for QA-Craft."""

from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from slowapi.errors import RateLimitExceeded

from config import get_settings
from exceptions import QACraftException, RequirementsValidationException
from logging_config import setup_logging, get_logger, RequestIdMiddleware
from rate_limit import limiter
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
    # Auto-migration on startup is useful for development. Under `--workers N`
    # every worker runs this concurrently; Alembic serializes on the version
    # table so it is safe, but prefer running migrations once via CLI at deploy
    # time and leaving AUTO_MIGRATE for single-process dev.
    if settings.auto_migrate:
        from pathlib import Path
        from alembic.config import Config
        from alembic import command

        # Anchor to this file's directory so migrations resolve regardless of
        # the CWD uvicorn was launched from.
        alembic_cfg = Config(str(Path(__file__).parent / "alembic.ini"))
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

# Rate limiter (slowapi) — the decorated routes look it up via app.state.
app.state.limiter = limiter

# Add request ID middleware for tracing (must be added before CORS)
app.add_middleware(RequestIdMiddleware)

# Configure CORS based on environment
# Headers the browser should be allowed to READ off cross-origin responses:
# the trace id the request-id design hands back, and the export filename.
_EXPOSE_HEADERS = ["X-Request-ID", "Content-Disposition"]

if settings.is_production:
    # Strict production settings
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=settings.cors_allow_credentials,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-API-Key", "X-Request-ID"],
        expose_headers=_EXPOSE_HEADERS,
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
        expose_headers=_EXPOSE_HEADERS,
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

@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    """Return a 429 in the app's consistent error format.

    slowapi's default handler uses a different body shape; reshape it to
    ``{"detail": ...}`` like every other error response.
    """
    logger.warning(
        "Rate limit exceeded on %s (limit=%s)", request.url.path, exc.detail
    )
    return JSONResponse(
        status_code=429,
        content={"detail": "Rate limit exceeded. Please try again later."},
    )


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
