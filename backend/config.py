"""Application configuration using Pydantic settings."""

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Database
    database_url: str = "sqlite:///./qa_craft.db"
    
    # API Keys
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    
    # LLM Provider: "openai", "anthropic", or "mock"
    llm_provider: str = "mock"
    
    # API Settings
    api_v1_prefix: str = "/api/v1"
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


