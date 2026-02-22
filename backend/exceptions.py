"""Custom exception classes for QA-Craft API.

This module provides a hierarchy of custom exceptions that:
- Ensure consistent error response format across the API
- Enable centralized exception handling via FastAPI handlers
- Improve error logging and debugging
"""


class QACraftException(Exception):
    """Base exception for all QA-Craft errors.
    
    All custom exceptions should inherit from this class to ensure
    they are caught by the global exception handler.
    
    Attributes:
        message: Human-readable error message
        status_code: HTTP status code to return (default: 500)
    """
    
    def __init__(self, message: str, status_code: int = 500):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class ResourceNotFoundError(QACraftException):
    """Raised when a requested resource does not exist.
    
    Examples:
        - Feature not found
        - Test case not found
        - Template not found
    """
    
    def __init__(self, resource: str, resource_id: int | str):
        super().__init__(
            message=f"{resource} with id {resource_id} not found",
            status_code=404
        )
        self.resource = resource
        self.resource_id = resource_id


class ResourceConflictError(QACraftException):
    """Raised when a resource operation conflicts with existing state.
    
    Examples:
        - Template name already exists
        - Duplicate entry
    """
    
    def __init__(self, message: str):
        super().__init__(message=message, status_code=409)


class ValidationError(QACraftException):
    """Raised when input validation fails beyond Pydantic's scope.
    
    Note: Most validation is handled by Pydantic (422 responses).
    Use this for business logic validation.
    """
    
    def __init__(self, message: str):
        super().__init__(message=message, status_code=400)


class LLMServiceError(QACraftException):
    """Raised when the LLM service encounters an error.
    
    This includes:
        - API connection failures
        - Rate limiting
        - Invalid responses from the LLM
        - Timeout errors
    """
    
    def __init__(self, message: str = "LLM service temporarily unavailable"):
        super().__init__(message=message, status_code=503)


class LLMConfigurationError(QACraftException):
    """Raised when LLM is not properly configured.
    
    Examples:
        - Missing API key
        - Invalid provider configuration
    """
    
    def __init__(self, message: str = "LLM service not configured"):
        super().__init__(message=message, status_code=503)


class AuthenticationError(QACraftException):
    """Raised when authentication fails.
    
    Note: Most auth errors are handled directly in auth.py.
    Use this for additional authentication-related errors.
    """
    
    def __init__(self, message: str = "Authentication required"):
        super().__init__(message=message, status_code=401)


class AuthorizationError(QACraftException):
    """Raised when a user lacks permission for an action."""
    
    def __init__(self, message: str = "Not authorized to perform this action"):
        super().__init__(message=message, status_code=403)


class RateLimitError(QACraftException):
    """Raised when rate limits are exceeded."""
    
    def __init__(self, message: str = "Rate limit exceeded. Please try again later."):
        super().__init__(message=message, status_code=429)


class DatabaseError(QACraftException):
    """Raised when a database operation fails unexpectedly.
    
    Note: Use this sparingly - most DB errors should result in 500s
    from the generic handler. Use this for specific, known DB issues.
    """
    
    def __init__(self, message: str = "Database operation failed"):
        super().__init__(message=message, status_code=500)

