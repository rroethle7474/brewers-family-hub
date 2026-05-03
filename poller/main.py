"""
main.py — FastAPI application entry point for the Brewers live-game poller.

Exposes two endpoints:
  GET /healthz  — shallow health check (always 200 if the process is alive)
  GET /status   — current poller state (game, inning, score, WP, mode)

Lifespan:
  On startup: starts poller_loop as an asyncio background task.
  On shutdown: cancels the task and waits for clean exit.

SINGLE WORKER REQUIREMENT: Run with exactly one uvicorn worker.
The poller holds in-memory state (previous game snapshot, seen play IDs)
that is process-local. Multiple workers would maintain independent
snapshots, causing duplicate big_moment rows on every poll interval.

Boot command:
  uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1
"""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from config import settings
from poller_loop import poller_loop, get_current_state

# ---------------------------------------------------------------------------
# Logging setup — respects LOG_LEVEL env var
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=settings.log_level.upper(),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Lifespan — starts and stops the background polling task
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Brewers poller (BREWERS_TEAM_ID=%s)", settings.brewers_team_id)
    task = asyncio.create_task(poller_loop(), name="poller_loop")
    try:
        yield
    finally:
        logger.info("Shutting down poller loop…")
        task.cancel()
        try:
            await asyncio.wait_for(asyncio.shield(task), timeout=5.0)
        except (asyncio.CancelledError, asyncio.TimeoutError):
            pass
        logger.info("Poller loop stopped.")


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Brewers Family Hub — Live Game Poller",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/healthz", tags=["ops"])
async def healthz():
    """Shallow health check — returns 200 if the process is alive."""
    return {"ok": True}


@app.get("/status", tags=["ops"])
async def status():
    """Current poller state: mode (IDLE/ACTIVE), game info, last known score."""
    return get_current_state()
