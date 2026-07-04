"""Rate limiting for the expensive LLM endpoints (generate / refine).

Uses slowapi with the default in-memory storage — correct for this single-
container deployment. If this ever scales to multiple backend processes, point
slowapi at a shared store (e.g. Redis) so the counters are global.
"""

from slowapi import Limiter
from starlette.requests import Request

from config import get_settings

settings = get_settings()


def _client_key(request: Request) -> str:
    """Identify the caller for rate-limiting.

    Preference order:
      1. `X-API-Key` — a stable per-caller identity when auth is enabled.
      2. First hop of `X-Forwarded-For` — the real client if anything fronts
         the app and sets it.
      3. The peer address.

    Caveat: the Next proxy does not forward the client IP, so browser traffic
    collapses to the proxy's address. Without an API key, the limit then acts
    as a global cap on the browser path — which still guards against runaway
    generation and double-clicks (the primary goal), just not per-user.
    """
    api_key = request.headers.get("x-api-key")
    if api_key:
        return f"key:{api_key}"

    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return f"ip:{forwarded_for.split(',')[0].strip()}"

    client = request.client
    return f"ip:{client.host if client else 'unknown'}"


# Shared limiter instance. `enabled=False` (RATE_LIMIT_ENABLED=false) makes every
# decorated route a no-op, which is convenient for dev and tests.
limiter = Limiter(key_func=_client_key, enabled=settings.rate_limit_enabled)


def generate_limit() -> str:
    """Limit for POST /generate — read live so env changes apply on restart."""
    return settings.rate_limit_generate


def refine_limit() -> str:
    """Limit for POST /features/{id}/refine."""
    return settings.rate_limit_refine
