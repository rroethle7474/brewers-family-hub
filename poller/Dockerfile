# Single-stage build for the FastAPI poller.
# uses Astral's official uv-on-Python image so uv is pre-installed.
# Coolify builds this, runs it as an always-on container, and we never
# expose it publicly — it talks outbound to MLB Stats API + Supabase.
#
# SINGLE WORKER REQUIREMENT: --workers 1 is non-negotiable. The poller
# holds previous-snapshot state and seen-play-ids in process-local memory.
# Multiple workers would cause duplicate big_moments rows on every poll.

FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim

WORKDIR /app

# Install dependencies first as a separate layer so it caches well across
# rebuilds. --frozen requires uv.lock to be up to date (fails the build
# rather than silently re-resolving). --no-dev drops pytest etc. since we
# don't run tests in production. --no-install-project means install ONLY
# the dependencies; we install the project itself after copying source.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# Copy source and install the project itself.
COPY . .
RUN uv sync --frozen --no-dev

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
