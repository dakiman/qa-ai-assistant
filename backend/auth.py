"""API Key authentication for QA-Craft."""

from fastapi import HTTPException, Security, status
from fastapi.security import APIKeyHeader

from config import get_settings
from logging_config import get_logger

logger = get_logger(__name__)

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def verify_api_key(api_key: str | None = Security(api_key_header)) -> str:
    """
    Verify API key from X-API-Key header.
    
    In development mode with no API key configured, authentication is skipped.
    In production or when an API key is set, valid authentication is required.
    
    Args:
        api_key: The API key from the X-API-Key header
        
    Returns:
        The validated API key or "dev-mode" if auth is skipped
        
    Raises:
        HTTPException: 401 if API key is invalid or missing
    """
    settings = get_settings()
    
    # Skip auth in development if no API key is configured
    if settings.environment == "development" and not settings.api_key:
        logger.debug("Auth skipped: development mode with no API key configured")
        return "dev-mode"
    
    # Validate the API key
    if not api_key:
        logger.warning("API request rejected: missing API key")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing API key. Include X-API-Key header.",
            headers={"WWW-Authenticate": "ApiKey"},
        )
    
    if api_key != settings.api_key:
        logger.warning("API request rejected: invalid API key")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
            headers={"WWW-Authenticate": "ApiKey"},
        )
    
    logger.debug("API key validated successfully")
    return api_key


async def verify_api_key_optional(api_key: str | None = Security(api_key_header)) -> str | None:
    """
    Optional API key verification for read endpoints.
    
    When require_auth_for_reads is False, read endpoints work without authentication.
    When require_auth_for_reads is True, authentication is required.
    
    Args:
        api_key: The API key from the X-API-Key header
        
    Returns:
        The validated API key, "dev-mode", or None if auth not required for reads
        
    Raises:
        HTTPException: 401 if authentication is required but key is invalid/missing
    """
    settings = get_settings()
    
    # If read auth is not required, allow through
    if not settings.require_auth_for_reads:
        return api_key  # Return whatever was provided (or None)
    
    # Otherwise, enforce authentication
    return await verify_api_key(api_key)




