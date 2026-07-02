"""Application configuration using Pydantic settings."""

from pydantic import model_validator
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Environment
    environment: str = "development"  # development, staging, production
    
    # Database
    database_url: str = "sqlite:///./qa_craft.db"
    db_echo: bool = False  # SQL query logging
    auto_migrate: bool = True  # Run Alembic migrations on startup (disable in production)
    
    # API Keys
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    openrouter_api_key: str | None = None

    # LLM Provider: "openai", "anthropic", "openrouter", or "mock"
    llm_provider: str = "mock"

    # LLM Model Selection (current, non-retired IDs)
    openai_model: str = "gpt-4o"
    anthropic_model: str = "claude-sonnet-5"
    # Must be a real OpenRouter slug that supports tool calling (instructor needs it).
    openrouter_model: str = "meta-llama/llama-3.3-70b-instruct:free"

    # Validation (pre-LLM requirements quality gate) — cheap/fast models
    validation_enabled: bool = True
    validation_min_words: int = 5
    validation_min_chars: int = 30
    openai_validation_model: str = "gpt-4o-mini"
    anthropic_validation_model: str = "claude-haiku-4-5"
    openrouter_validation_model: str = "meta-llama/llama-3.3-70b-instruct:free"
    
    # API Settings
    api_v1_prefix: str = "/api/v1"
    
    # Authentication
    api_key: str | None = None  # Set via API_KEY env var for production
    require_auth_for_reads: bool = False  # If True, read endpoints also require auth
    
    # CORS
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    cors_allow_credentials: bool = True
    
    # Logging
    log_level: str = "INFO"  # DEBUG, INFO, WARNING, ERROR, CRITICAL
    
    @property
    def cors_origins_list(self) -> list[str]:
        """Parse comma-separated CORS origins into a list."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]
    
    @property
    def is_production(self) -> bool:
        """Check if running in production environment."""
        return self.environment.lower() == "production"

    @model_validator(mode="after")
    def _reject_wildcard_origins_with_credentials(self) -> "Settings":
        """Fail fast on an insecure CORS combination.

        With `allow_credentials=True`, Starlette reflects the request Origin back
        instead of honoring a literal `*`, effectively allowing any origin to make
        credentialed requests. Reject the combination at startup rather than
        shipping a silently-permissive policy.
        """
        if self.cors_allow_credentials and "*" in self.cors_origins_list:
            raise ValueError(
                "CORS_ORIGINS='*' cannot be combined with cors_allow_credentials=true. "
                "List explicit origins, or set cors_allow_credentials=false."
            )
        return self
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


