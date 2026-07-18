FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Run as a non-root user whose uid matches the host bind-mount owner
# (/srv/dakis/data/qa-ai-assistant is uid 1000), so the container can write the
# SQLite DB at /data without running as root.
RUN useradd --create-home --uid 1000 appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# Real container-level readiness signal for depends_on and the operator.
# python:slim has no curl, so probe with the stdlib.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# --no-proxy-headers: uvicorn's default (--proxy-headers, trusting XFF from
# 127.0.0.1) would let any caller reaching this process from a trusted peer
# rewrite request.client.host from a client-supplied X-Forwarded-For header —
# silently bypassing the application-level TRUST_X_FORWARDED_FOR gate in
# rate_limit.py, since that code trusts request.client.host as the untampered
# fallback. Disabling it here makes settings.trust_x_forwarded_for the one and
# only place XFF trust is decided.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--no-proxy-headers"]
