"""
conftest.py — Synthetic fixtures for big_moments and live_state tests.

All fixtures are pure Python — no MLB API calls, no DB calls.
The live feed dict shape is derived from the MLB Stats API
/api/v1.1/game/{gamePk}/feed/live response (2024-2025 schema).
"""

import pytest
from live_state import LiveGameStateRow

GAME_ID = 745444
BREWERS_TEAM_ID = 158
OPPONENT_TEAM_ID = 112  # Cubs

# ---------------------------------------------------------------------------
# Helper: build a minimal play dict
# ---------------------------------------------------------------------------

def make_play(
    at_bat_index: int,
    play_index: int = 0,
    event_type: str = "strikeout",
    event: str = "Strikeout",
    batter_id: int = 999,
    batter_name: str = "Test Batter",
    batting_team_id: int = OPPONENT_TEAM_ID,
    inning: int = 5,
    half_inning: str = "top",
    home_win_probability: float = 55.0,
    is_complete: bool = True,
) -> dict:
    return {
        "about": {
            "atBatIndex": at_bat_index,
            "playIndex": play_index,
            "inning": inning,
            "halfInning": half_inning,
            "homeWinProbability": home_win_probability,
            "isComplete": is_complete,
        },
        "result": {
            "eventType": event_type,
            "event": event,
            "description": f"{batter_name} {event_type}",
        },
        "matchup": {
            "batter": {
                "id": batter_id,
                "fullName": batter_name,
                "currentTeam": {"id": batting_team_id},
            },
        },
    }


def make_brewers_home_run_play(
    at_bat_index: int = 5,
    batter_name: str = "Christian Yelich",
    batter_id: int = 592885,
    inning: int = 7,
    half_inning: str = "bottom",
    wp_before: float = 55.0,
    wp_after: float = 78.0,
    prev_wp: float = 55.0,
) -> dict:
    return make_play(
        at_bat_index=at_bat_index,
        event_type="home_run",
        event="Home Run",
        batter_id=batter_id,
        batter_name=batter_name,
        batting_team_id=BREWERS_TEAM_ID,
        inning=inning,
        half_inning=half_inning,
        home_win_probability=wp_after,
    )


# ---------------------------------------------------------------------------
# LiveGameStateRow fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def snapshot_tied():
    """Score: 3-3 (tied). Brewers are home."""
    return LiveGameStateRow(
        game_id=GAME_ID,
        inning=7,
        inning_state="Middle",
        outs=3,
        balls=0,
        strikes=0,
        home_score=3,
        away_score=3,
        win_probability=0.50,
    )


@pytest.fixture
def snapshot_brewers_ahead():
    """Score: Brewers 4, Opponent 3. Brewers home."""
    return LiveGameStateRow(
        game_id=GAME_ID,
        inning=8,
        inning_state="Middle",
        outs=3,
        balls=0,
        strikes=0,
        home_score=4,
        away_score=3,
        win_probability=0.72,
    )


@pytest.fixture
def snapshot_brewers_behind():
    """Score: Brewers 3, Opponent 5. Brewers home."""
    return LiveGameStateRow(
        game_id=GAME_ID,
        inning=8,
        inning_state="Middle",
        outs=3,
        balls=0,
        strikes=0,
        home_score=3,
        away_score=5,
        win_probability=0.22,
    )


@pytest.fixture
def snapshot_high_wp():
    """Brewers WP = 0.80."""
    return LiveGameStateRow(
        game_id=GAME_ID,
        inning=8,
        inning_state="Top",
        home_score=4,
        away_score=2,
        win_probability=0.80,
    )


@pytest.fixture
def snapshot_low_wp():
    """Brewers WP = 0.35 — a 45pp drop from high_wp."""
    return LiveGameStateRow(
        game_id=GAME_ID,
        inning=8,
        inning_state="Top",
        home_score=4,
        away_score=5,
        win_probability=0.35,
    )


@pytest.fixture
def walkoff_plays():
    """A play list ending with a walk-off hit in the bottom of the 9th."""
    return [
        make_play(at_bat_index=0, inning=1, half_inning="top"),
        make_play(at_bat_index=1, inning=1, half_inning="bottom"),
        # ... many plays later ...
        make_play(
            at_bat_index=28,
            event_type="single",
            event="Single",
            inning=9,
            half_inning="bottom",
            is_complete=True,
        ),
    ]


@pytest.fixture
def non_walkoff_plays():
    """Plays ending in the top of the 9th — NOT a walk-off."""
    return [
        make_play(at_bat_index=0, inning=1, half_inning="top"),
        make_play(
            at_bat_index=27,
            event_type="strikeout",
            event="Strikeout",
            inning=9,
            half_inning="top",  # top of 9th — not a walkoff
            is_complete=True,
        ),
    ]
