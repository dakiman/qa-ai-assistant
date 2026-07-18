"""Rate limiting for the expensive LLM endpoints (generate / refine).

Uses slowapi with the default in-memory storage — correct for this single-
container deployment. If this ever scales to multiple backend processes, point
slowapi at a shared store (e.g. Redis) so the counters are global.

Threat model / trust boundary:
  - `X-API-Key` is only used as a rate-limit bucket key once it has been
    verified (constant-time compare) against the configured server key. An
    unverified key would let any caller mint a fresh, uncapped bucket per
    request just by sending a different (bogus) key value each time —
    trivially defeating the limiter.
  - `X-Forwarded-For` is entirely client-controlled unless something in front
    of this process is trusted to *set* (not merely append to) it. We have no
    such trusted reverse proxy in front of the backend today — the Next.js
    proxy is same-trust-boundary application code, not a network edge, and it
    deliberately does not forward the browser's XFF (see the proxy route
    handler). So XFF is ignored for keying purposes unless an operator
    explicitly opts in via `TRUST_X_FORWARDED_FOR=true` after actually putting
    a trusted, header-overwriting proxy in front of the app.
  - Fallback is always the TCP peer address (`request.client.host`), which
    cannot be spoofed by the caller at the application layer.
"""

import secrets

from slowapi import Limiter
from starlette.requests import Request

from config import get_settings

settings = get_settings()


def _client_key(request: Request) -> str:
    """Identify the caller for rate-limiting.

    Preference order:
      1. `X-API-Key` — but only once verified to match the configured server
         key via a constant-time comparison. A key that doesn't match is
         ignored entirely (falls through), so an attacker can't mint a new
         bucket per request just by varying an unverified header value.
      2. First hop of `X-Forwarded-For` — only honored when
         `settings.trust_x_forwarded_for` is true (i.e. a trusted, header-
         overwriting reverse proxy sits in front of this process).
      3. The peer address (`request.client.host`) — not spoofable by the
         caller, always the final fallback.

    Caveat: the Next proxy does not forward the client IP, so browser traffic
    collapses to the proxy's address. Without a verified API key, the limit
    then acts as a global cap on the browser path — which still guards
    against runaway generation and double-clicks (the primary goal), just not
    per-user.
    """
    api_key = request.headers.get("x-api-key")
    if api_key and settings.api_key and secrets.compare_digest(api_key, settings.api_key):
        return f"key:{api_key}"

    if settings.trust_x_forwarded_for:
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
