"""
live_state.py — Maps an MLB live-feed dict to a LiveGameStateRow pydantic model.

PURE module: no I/O, no DB calls, no MLB API calls. Takes a raw dict
(from mlb_client.get_live_feed) and returns a structured model matching
the live_game_state table columns exactly.

The `recent_plays` field stores the last N plays as a compact list of
dicts for the win-probability sparkline on the frontend.
"""

from __future__ import annotations

from typing import Any, Optional
import logging

from pydantic import BaseModel

logger = logging.getLogger(__name__)

RECENT_PLAYS_COUNT = 30  # how many plays to keep in recent_plays jsonb (matches Home WP sparkline window)


class LiveGameStateRow(BaseModel):
    """
    Matches the live_game_state table schema exactly.
    Column names are snake_case per the DB convention.
    """

    game_id: int
    inning: Optional[int] = None
    inning_state: Optional[str] = None  # Top | Middle | Bottom | End
    outs: Optional[int] = None
    balls: Optional[int] = None
    strikes: Optional[int] = None
    bases: Optional[dict] = None          # {first: int|None, second: ..., third: ...}
    current_batter_id: Optional[int] = None
    current_pitcher_id: Optional[int] = None
    home_score: Optional[int] = None
    away_score: Optional[int] = None
    win_probability: Optional[float] = None  # 0.0–1.0, Brewers' perspective
    recent_plays: Optional[list] = None      # last N plays for WP sparkline


def map_live_feed(game_pk: int, feed: dict, brewers_team_id: int) -> LiveGameStateRow:
    """
    Map a raw MLB live-feed dict to a LiveGameStateRow.

    The MLB live feed dict has two top-level keys:
      - gameData   — static/slow-changing data (teams, venue, status)
      - liveData   — fast-changing live data (score, plays, linescore)

    Win probability is stored from Brewers' perspective (0.0–1.0):
      - If Brewers are the home team: use homeWinProbability directly
      - If Brewers are the away team: use 1 - homeWinProbability
    """
    game_data: dict = feed.get("gameData", {})
    live_data: dict = feed.get("liveData", {})
    linescore: dict = live_data.get("linescore", {})
    plays: dict = live_data.get("plays", {})

    # Determine if Brewers are home or away
    teams_data = game_data.get("teams", {})
    home_team_id = _safe_int(teams_data.get("home", {}).get("id"))
    brewers_are_home = home_team_id == brewers_team_id

    # --- Inning state ---
    inning = _safe_int(linescore.get("currentInning"))
    inning_state = linescore.get("inningState")  # "Top" | "Middle" | "Bottom" | "End"

    # --- Count ---
    outs = _safe_int(linescore.get("outs"))
    balls = _safe_int(linescore.get("balls"))
    strikes = _safe_int(linescore.get("strikes"))

    # --- Baserunners ---
    offense = linescore.get("offense", {})
    bases = {
        "first": _safe_player_id(offense.get("first")),
        "second": _safe_player_id(offense.get("second")),
        "third": _safe_player_id(offense.get("third")),
    }

    # --- Current batter / pitcher ---
    current_batter_id = _safe_player_id(offense.get("batter"))
    defense = linescore.get("defense", {})
    current_pitcher_id = _safe_player_id(defense.get("pitcher"))

    # --- Score ---
    teams_score = linescore.get("teams", {})
    home_score = _safe_int(teams_score.get("home", {}).get("runs"))
    away_score = _safe_int(teams_score.get("away", {}).get("runs"))

    # --- Win probability (Brewers perspective) ---
    win_probability = _extract_brewers_wp(plays, brewers_are_home)

    # --- Recent plays for sparkline ---
    recent_plays = _extract_recent_plays(plays, brewers_are_home)

    return LiveGameStateRow(
        game_id=game_pk,
        inning=inning,
        inning_state=inning_state,
        outs=outs,
        balls=balls,
        strikes=strikes,
        bases=bases,
        current_batter_id=current_batter_id,
        current_pitcher_id=current_pitcher_id,
        home_score=home_score,
        away_score=away_score,
        win_probability=win_probability,
        recent_plays=recent_plays,
    )


# ---------------------------------------------------------------------------
# Helpers — all pure, no side effects.
# ---------------------------------------------------------------------------

def _safe_int(value: Any) -> Optional[int]:
    """Convert a value to int, returning None on failure."""
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _safe_player_id(player_obj: Any) -> Optional[int]:
    """
    Extract an integer player ID from an MLB player object.
    MLB returns player references as dicts: {"id": 123, "fullName": "..."}.
    """
    if player_obj is None:
        return None
    if isinstance(player_obj, dict):
        return _safe_int(player_obj.get("id"))
    return _safe_int(player_obj)


def _extract_brewers_wp(plays: dict, brewers_are_home: bool) -> Optional[float]:
    """
    Extract the current Brewers win probability from the plays dict.

    The MLB API stores win probability on the current play's about object.
    homeWinProbability is always from the home team's perspective.
    We flip it if Brewers are away.
    """
    current_play = plays.get("currentPlay", {})
    about = current_play.get("about", {})

    raw_wp = about.get("homeWinProbability")
    if raw_wp is None:
        # Try to get it from the last play in allPlays
        all_plays = plays.get("allPlays", [])
        if all_plays:
            last_play = all_plays[-1]
            raw_wp = last_play.get("about", {}).get("homeWinProbability")

    if raw_wp is None:
        return None

    try:
        wp_home = float(raw_wp) / 100.0  # MLB API returns 0–100
        return wp_home if brewers_are_home else (1.0 - wp_home)
    except (TypeError, ValueError):
        return None


def _extract_recent_plays(plays: dict, brewers_are_home: bool) -> Optional[list]:
    """
    Build a compact list of recent plays for the WP sparkline.

    Each entry: {"inning": int, "inningState": str, "brewersWP": float,
                 "description": str}

    Returns None if no plays have win probability data yet (pre-game).
    """
    all_plays: list = plays.get("allPlays", [])
    if not all_plays:
        return None

    result = []
    for play in all_plays:
        about = play.get("about", {})
        raw_wp = about.get("homeWinProbability")
        if raw_wp is None:
            continue
        try:
            wp_home = float(raw_wp) / 100.0
            brewers_wp = wp_home if brewers_are_home else (1.0 - wp_home)
        except (TypeError, ValueError):
            continue

        result_event = play.get("result", {})
        result.append({
            "inning": about.get("inning"),
            "inningState": about.get("halfInning", "").capitalize(),
            "brewersWP": round(brewers_wp, 4),
            "description": result_event.get("description", ""),
        })

    if not result:
        return None

    # Keep only the most recent N plays
    return result[-RECENT_PLAYS_COUNT:]
