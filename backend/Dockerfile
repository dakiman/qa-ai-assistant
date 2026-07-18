FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Run as a non-root user whose uid matches the host bind-mount owner
# (/srv/dakis/data/qa-ai-assistant is uid 1000), so the container can write the
# SQLite DB at /data without running as root. App code is read-only at runtime
# (only /data needs appuser writes), so COPY --chown avoids a full-tree chown
# layer on top of the plain copy.
RUN useradd --create-home --uid 1000 appuser
COPY --chown=appuser:appuser . .
USER appuser

EXPOSE 8000

# Real container-level readiness signal for depends_on and the operator.
# python:slim has no curl, so probe with the stdlib.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
