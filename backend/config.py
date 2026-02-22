"""Application configuration using Pydantic settings."""

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
    
    # LLM Provider: "openai", "anthropic", or "mock"
    llm_provider: str = "mock"
    
    # LLM Model Selection
    openai_model: str = "gpt-4-turbo-preview"
    anthropic_model: str = "claude-3-sonnet-20240229"
    
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
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


