"""
poller_loop.py — Async state machine for the live-game polling loop.

State machine:
  IDLE   → calls find_brewers_game_today() every IDLE_POLL_INTERVAL seconds.
           Transitions to ACTIVE when a non-Final game is found.
  ACTIVE → calls get_live_feed(gamePk) every ACTIVE_POLL_INTERVAL seconds.
           On each tick: maps feed to LiveGameStateRow, runs detectors,
           writes changes to Supabase, emits big moments.
           Transitions back to IDLE when game status is Final.

In-memory state is held in this module's module-level `_state` dict.
Do NOT add DB roundtrips to read previous state — that defeats the
purpose of in-memory tracking and risks duplicating big_moment writes.

SINGLE WORKER REQUIREMENT: The in-memory state is process-local.
Running more than one uvicorn worker (--workers N with N>1) would cause
each worker to maintain independent snapshots, leading to duplicate
big_moment rows on every poll. The Dockerfile and README both document
that exactly one worker is required.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from enum import Enum, auto
from typing import Optional, Any

from config import settings
from mlb_client import find_brewers_game_today, get_live_feed
from live_state import map_live_feed, LiveGameStateRow
from big_moments import (
    detect_home_run,
    detect_lead_change,
    detect_wp_swing,
    detect_walkoff,
    BigMomentRow,
    _play_id,
)
from supabase_client import supabase

logger = logging.getLogger(__name__)

BREWERS_TEAM_ID: int = settings.brewers_team_id


class PollerState(Enum):
    IDLE = auto()
    ACTIVE = auto()


# ---------------------------------------------------------------------------
# In-memory state — never persisted; reset on process restart.
# ---------------------------------------------------------------------------
_state: dict[str, Any] = {
    "mode": PollerState.IDLE,
    "game_pk": None,
    "prev_snapshot": None,       # LiveGameStateRow from the last successful poll
    "prev_game_status": None,    # string status from the last poll
    "prev_play_ids": set(),      # set of play IDs already processed for big_moments
}


def get_current_state() -> dict:
    """Return a JSON-serialisable copy of the current poller state (for /status)."""
    snap: Optional[LiveGameStateRow] = _state["prev_snapshot"]
    return {
        "mode": _state["mode"].name,
        "game_pk": _state["game_pk"],
        "game_status": _state["prev_game_status"],
        "inning": snap.inning if snap else None,
        "inning_state": snap.inning_state if snap else None,
        "home_score": snap.home_score if snap else None,
        "away_score": snap.away_score if snap else None,
        "win_probability": snap.win_probability if snap else None,
        "plays_seen": len(_state["prev_play_ids"]),
    }


# ---------------------------------------------------------------------------
# Main loop — called as an asyncio task from main.py lifespan.
# ---------------------------------------------------------------------------

async def poller_loop() -> None:
    """
    The main polling coroutine. Runs forever until cancelled.

    Structure:
      while True:
        if IDLE: check for a game; maybe transition to ACTIVE
        if ACTIVE: poll the live feed; detect + write big moments;
                   transition to IDLE when Final
        sleep(interval)
    """
    logger.info("Poller loop started (IDLE_POLL_INTERVAL=%ss, ACTIVE_POLL_INTERVAL=%ss)",
                settings.idle_poll_interval, settings.active_poll_interval)

    while True:
        try:
            if _state["mode"] == PollerState.IDLE:
                await _idle_tick()
                await asyncio.sleep(settings.idle_poll_interval)
            else:
                await _active_tick()
                await asyncio.sleep(settings.active_poll_interval)
        except asyncio.CancelledError:
            logger.info("Poller loop cancelled — shutting down cleanly.")
            raise
        except Exception as exc:
            # Log and continue; one bad tick shouldn't kill the loop.
            logger.exception("Unexpected error in poller loop: %s", exc)
            await asyncio.sleep(settings.active_poll_interval)


# ---------------------------------------------------------------------------
# IDLE tick
# ---------------------------------------------------------------------------

async def _idle_tick() -> None:
    """Check if a Brewers game is active today; transition to ACTIVE if so."""
    logger.debug("IDLE tick: checking for today's Brewers game")
    try:
        game_pk = await asyncio.to_thread(find_brewers_game_today)
    except Exception as exc:
        logger.warning("Could not fetch today's schedule: %s", exc)
        return

    if game_pk is None:
        logger.debug("No Brewers game today — staying IDLE")
        return

    # Check the game status before going ACTIVE
    try:
        feed = await asyncio.to_thread(get_live_feed, game_pk)
    except Exception as exc:
        logger.warning("Could not fetch live feed for gamePk=%s: %s", game_pk, exc)
        return

    game_status = _extract_game_status(feed)
    logger.info("Found game gamePk=%s status=%s", game_pk, game_status)

    final_statuses = {"Final", "Game Over", "Completed Early"}
    if game_status in final_statuses:
        logger.debug("Game %s is already Final — staying IDLE", game_pk)
        return

    # Transition to ACTIVE.
    # Seed prev_play_ids from the feed we just fetched so the first
    # _active_tick doesn't emit big_moments for plays that already happened
    # before the poller started watching (e.g., poller restarts mid-game
    # with several HRs already in the books).
    existing_plays = feed.get("liveData", {}).get("plays", {}).get("allPlays", [])
    _state["mode"] = PollerState.ACTIVE
    _state["game_pk"] = game_pk
    _state["prev_snapshot"] = None
    _state["prev_game_status"] = game_status
    _state["prev_play_ids"] = {_play_id(p) for p in existing_plays}
    logger.info(
        "Transitioned to ACTIVE for gamePk=%s (seeded with %d existing plays)",
        game_pk, len(_state["prev_play_ids"]),
    )

    # Do the first active tick immediately (don't wait for the next sleep)
    await _active_tick()


# ---------------------------------------------------------------------------
# ACTIVE tick
# ---------------------------------------------------------------------------

async def _active_tick() -> None:
    """Poll the live feed, run detectors, write to Supabase."""
    game_pk: int = _state["game_pk"]
    logger.debug("ACTIVE tick: polling gamePk=%s", game_pk)

    try:
        feed = await asyncio.to_thread(get_live_feed, game_pk)
    except Exception as exc:
        logger.warning("Live feed fetch failed for gamePk=%s: %s", game_pk, exc)
        return

    # Determine if Brewers are home for this game
    brewers_are_home = _is_brewers_home(feed)

    # Map the feed to our model
    try:
        curr_snapshot = map_live_feed(game_pk, feed, BREWERS_TEAM_ID)
    except Exception as exc:
        logger.exception("Failed to map live feed for gamePk=%s: %s", game_pk, exc)
        return

    curr_status = _extract_game_status(feed)
    prev_snapshot: Optional[LiveGameStateRow] = _state["prev_snapshot"]
    prev_status: Optional[str] = _state["prev_game_status"]

    # --- Detect big moments ---
    all_plays: list[dict] = _get_all_plays(feed)
    new_moments: list[BigMomentRow] = []

    # Home runs
    new_moments.extend(
        detect_home_run(
            prev_play_ids=_state["prev_play_ids"],
            all_plays=all_plays,
            game_id=game_pk,
            brewers_team_id=BREWERS_TEAM_ID,
        )
    )

    # Lead changes (only if we have a previous snapshot)
    if prev_snapshot is not None:
        new_moments.extend(
            detect_lead_change(
                prev_home_score=prev_snapshot.home_score,
                prev_away_score=prev_snapshot.away_score,
                curr_home_score=curr_snapshot.home_score,
                curr_away_score=curr_snapshot.away_score,
                game_id=game_pk,
                brewers_are_home=brewers_are_home,
                inning=curr_snapshot.inning,
                inning_state=curr_snapshot.inning_state,
                prev_wp=prev_snapshot.win_probability,
                curr_wp=curr_snapshot.win_probability,
            )
        )

        # WP swing
        new_moments.extend(
            detect_wp_swing(
                prev_wp=prev_snapshot.win_probability,
                curr_wp=curr_snapshot.win_probability,
                game_id=game_pk,
                threshold=settings.wp_swing_threshold,
                inning=curr_snapshot.inning,
                inning_state=curr_snapshot.inning_state,
            )
        )

    # Walk-off (check every tick so we don't miss the Final transition)
    new_moments.extend(
        detect_walkoff(
            prev_status=prev_status,
            curr_status=curr_status,
            all_plays=all_plays,
            game_id=game_pk,
            brewers_are_home=brewers_are_home,
            home_score=curr_snapshot.home_score,
            away_score=curr_snapshot.away_score,
            prev_wp=prev_snapshot.win_probability if prev_snapshot else None,
            curr_wp=curr_snapshot.win_probability,
        )
    )

    # --- Write to Supabase ---
    await _write_live_state(curr_snapshot)
    for moment in new_moments:
        await _write_big_moment(moment)

    # --- Update processed play IDs ---
    for play in all_plays:
        _state["prev_play_ids"].add(_play_id(play))

    # --- Update in-memory snapshot ---
    _state["prev_snapshot"] = curr_snapshot
    _state["prev_game_status"] = curr_status

    # --- Check for game end ---
    final_statuses = {"Final", "Game Over", "Completed Early"}
    if curr_status in final_statuses:
        logger.info("Game %s is Final — returning to IDLE", game_pk)
        _state["mode"] = PollerState.IDLE
        _state["game_pk"] = None
        # Keep prev_snapshot and prev_play_ids so /status still shows last state


# ---------------------------------------------------------------------------
# Supabase writes (async wrappers around sync client)
# ---------------------------------------------------------------------------

async def _write_live_state(snapshot: LiveGameStateRow) -> None:
    """Upsert the live_game_state row for this game."""
    data = snapshot.model_dump(exclude_none=False)
    # Stamp explicitly: column DEFAULT only fires on INSERT, but UPSERT-as-
    # UPDATE keeps the existing value unless we set it. We want every poll
    # tick to bump updated_at so Realtime subscribers see a row event even
    # when no other field changed.
    data["updated_at"] = datetime.now(timezone.utc).isoformat()

    try:
        await asyncio.to_thread(
            lambda: supabase.table("live_game_state")
            .upsert(data, on_conflict="game_id")
            .execute()
        )
        logger.debug("Wrote live_game_state for game_id=%s", snapshot.game_id)
    except Exception as exc:
        logger.error("Failed to write live_game_state for game_id=%s: %s",
                     snapshot.game_id, exc)


async def _write_big_moment(moment: BigMomentRow) -> None:
    """Insert a single big_moments row."""
    data = moment.model_dump(exclude_none=True)

    try:
        await asyncio.to_thread(
            lambda: supabase.table("big_moments")
            .insert(data)
            .execute()
        )
        logger.info(
            "Big moment written: type=%s game=%s inning=%s desc=%r",
            moment.moment_type, moment.game_id, moment.inning, moment.description
        )
    except Exception as exc:
        logger.error("Failed to write big_moment: %s | data=%s", exc, data)


# ---------------------------------------------------------------------------
# Feed helpers
# ---------------------------------------------------------------------------

def _extract_game_status(feed: dict) -> str:
    """Extract the detailedState string from a live feed dict."""
    return (
        feed.get("gameData", {})
        .get("status", {})
        .get("detailedState", "Unknown")
    )


def _is_brewers_home(feed: dict) -> bool:
    """Return True if the Brewers are the home team in this feed."""
    teams = feed.get("gameData", {}).get("teams", {})
    home_id = teams.get("home", {}).get("id")
    try:
        return int(home_id) == BREWERS_TEAM_ID
    except (TypeError, ValueError):
        return False


def _get_all_plays(feed: dict) -> list[dict]:
    """Extract allPlays from the live feed."""
    return feed.get("liveData", {}).get("plays", {}).get("allPlays", [])
