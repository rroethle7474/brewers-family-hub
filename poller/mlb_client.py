"""
mlb_client.py — THE single wrapper for all MLB Stats API calls.

Rule: ONLY this module may import `statsapi` or make calls to
statsapi.mlb.com. All other modules call functions defined here.

Retries are handled by tenacity: up to 3 attempts with exponential
backoff on any network error or 5xx response. The MLB Stats API is
generally reliable but does occasionally return 503s during high-traffic
games; a brief retry is better than failing loudly.

Endpoints used:
  - statsapi.schedule()      — find today's Brewers game
  - statsapi.get()           — fetch the live feed for a gamePk
    endpoint: "game_linescore" and "game_live" (via game/{gamePk}/feed/live)
"""

import logging
from typing import Optional

import httpx
import statsapi
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
    before_sleep_log,
)

from config import settings

logger = logging.getLogger(__name__)

BREWERS_TEAM_ID: int = settings.brewers_team_id


# ---------------------------------------------------------------------------
# Retry decorator — wrap any network-sensitive call with this.
# Restricted to network/transient errors only. Programming bugs (TypeError,
# AttributeError, etc.) should fail fast on the first attempt; retrying them
# wastes time and floods logs.
# ---------------------------------------------------------------------------
_retry_policy = retry(
    retry=retry_if_exception_type((
        ConnectionError,
        TimeoutError,
        httpx.HTTPError,
    )),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True,
)


@_retry_policy
def find_brewers_game_today() -> Optional[int]:
    """
    Return the gamePk of today's Brewers game if one exists (any status),
    or None if the Brewers are off today.

    Checks today's schedule via the MLB Stats API schedule endpoint.
    Returns the first game found for BREWERS_TEAM_ID today; in practice
    there is at most one game per day (doubleheaders have two gamePks —
    we return the first unless it's Final, in which case we return the
    second if present).
    """
    import datetime

    today = datetime.date.today().strftime("%m/%d/%Y")
    try:
        # MLB-StatsAPI uses `team`, not `teamId` (caught at first boot).
        schedule = statsapi.schedule(
            date=today,
            team=BREWERS_TEAM_ID,
        )
    except Exception as exc:
        logger.error("MLB API schedule call failed: %s", exc)
        raise

    if not schedule:
        logger.debug("No Brewers game today (%s)", today)
        return None

    # For doubleheaders: prefer a non-Final game; fall back to the first.
    for game in schedule:
        if game.get("status") not in ("Final", "Game Over", "Completed Early"):
            logger.info(
                "Found active Brewers game today: gamePk=%s status=%s",
                game["game_id"],
                game.get("status"),
            )
            return game["game_id"]

    # All games today are Final — return the last one so the poller can
    # write the final state if it hasn't already.
    game = schedule[-1]
    logger.info(
        "All Brewers games today are Final: returning gamePk=%s",
        game["game_id"],
    )
    return game["game_id"]


@_retry_policy
def get_live_feed(game_pk: int) -> dict:
    """
    Fetch the full live game feed for a given gamePk.

    Returns the raw dict from the MLB Stats API
    (`/api/v1.1/game/{gamePk}/feed/live`). Callers should treat the
    returned dict as the authoritative live snapshot and extract only the
    fields they need.

    Keys of interest in the returned dict:
      gameData.status.abstractGameState  — "Live", "Final", "Preview"
      gameData.status.detailedState      — "In Progress", "Final", etc.
      liveData.linescore.*               — inning, outs, balls, strikes,
                                           offense.first/second/third,
                                           teams.home/away.runs
      liveData.plays.allPlays            — list of all plays this game
      liveData.plays.currentPlay         — the most recent play
      liveData.decisions.*               — winning/losing pitcher (Final)
    """
    try:
        feed = statsapi.get("game", {"gamePk": game_pk, "hydrate": "probablePitcher"})
    except Exception as exc:
        logger.error("MLB API live feed call failed for gamePk=%s: %s", game_pk, exc)
        raise

    return feed
