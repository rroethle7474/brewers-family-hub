"""
big_moments.py — PURE detection functions for big moment events.

Rule: NO I/O in this module. No DB calls, no MLB API calls. Every
function takes plain Python data structures and returns a list of
BigMomentRow pydantic models. This keeps the detection logic trivially
testable without any mocks.

Detection rules per SPEC §6 and the Phase 3 brief:

  home_run    — New play with result.eventType == 'home_run' and
                Brewers batter. One row per home-run play.

  lead_change — Sign of (home_score - away_score) changed between the
                previous state and the current state. "Tied" is treated
                as 0. Going from behind OR tied TO ahead counts. Going
                from ahead OR tied TO behind also counts. Going from
                leading to tied does NOT count (Brewers give up the lead
                but aren't behind yet).

  wp_swing    — Any new play where Brewers WP shifted by >= threshold
                (absolute value) from the previous snapshot's WP.

  walkoff     — Game just became Final, the last completed play was in
                the bottom of inning >= 9, and the home team won. If
                Brewers are home, emit "Walk-off win"; if Brewers are
                away, emit "Brewers fall on a walk-off".

Idempotency note: detection compares the current snapshot against the
PREVIOUS in-memory snapshot held by the poller loop. If the loop
crashes mid-poll the detections for that interval are dropped — this
is acceptable for v1 (documented in README). The DB has no dedup
constraint on big_moments beyond the uuid PK; uniqueness is maintained
entirely by in-memory comparison.
"""

from __future__ import annotations

from typing import Optional
from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Output model — matches big_moments table columns.
# ---------------------------------------------------------------------------

class BigMomentRow(BaseModel):
    game_id: int
    moment_type: str          # 'home_run' | 'lead_change' | 'wp_swing' | 'walkoff'
    description: str
    player_id: Optional[int] = None
    inning: Optional[int] = None
    wp_before: Optional[float] = None
    wp_after: Optional[float] = None


# ---------------------------------------------------------------------------
# Detection helpers
# ---------------------------------------------------------------------------

def _score_perspective(home_score: int, away_score: int, brewers_are_home: bool) -> int:
    """
    Return the score difference from the Brewers' perspective.
    Positive = Brewers leading, negative = Brewers trailing, 0 = tied.
    """
    if brewers_are_home:
        return home_score - away_score
    return away_score - home_score


def _lead_label(diff: int, brewers_are_home: bool,
                home_score: int, away_score: int) -> str:
    """Return a short score string like '4-3' from Brewers perspective."""
    if brewers_are_home:
        return f"{home_score}-{away_score}"
    return f"{away_score}-{home_score}"


# ---------------------------------------------------------------------------
# Public detection functions — all accept (prev_*, curr_*, raw_feed_data)
# and return list[BigMomentRow].
# ---------------------------------------------------------------------------

def detect_home_run(
    prev_play_ids: set[str],
    all_plays: list[dict],
    game_id: int,
    brewers_team_id: int,
) -> list[BigMomentRow]:
    """
    Emit one BigMomentRow for each new play where:
      - play ID has not been seen before (new since last poll)
      - result.eventType == 'home_run'
      - the batting team is the Brewers

    Parameters
    ----------
    prev_play_ids : set of play IDs already processed
    all_plays     : liveData.plays.allPlays from the live feed
    game_id       : MLB gamePk
    brewers_team_id : constant (158)
    """
    moments: list[BigMomentRow] = []

    for play in all_plays:
        play_id = _play_id(play)
        if play_id in prev_play_ids:
            continue  # already processed

        result = play.get("result", {})
        event_type = result.get("eventType", "").lower()
        if event_type != "home_run":
            continue

        # Check that the batter belongs to the Brewers
        matchup = play.get("matchup", {})
        batting_team_id = _batting_team_id(play)
        if batting_team_id != brewers_team_id:
            continue

        about = play.get("about", {})
        inning = about.get("inning")
        half = about.get("halfInning", "")  # "top" | "bottom"

        batter = matchup.get("batter", {})
        batter_name = batter.get("fullName", "The Brewers batter")
        batter_id = batter.get("id")

        inning_label = _inning_label(inning, half)
        description = f"{batter_name} hits a home run{inning_label}"

        wp_before, wp_after = _wp_around_play(play, all_plays)

        moments.append(BigMomentRow(
            game_id=game_id,
            moment_type="home_run",
            description=description,
            player_id=batter_id,
            inning=inning,
            wp_before=wp_before,
            wp_after=wp_after,
        ))

    return moments


def detect_lead_change(
    prev_home_score: Optional[int],
    prev_away_score: Optional[int],
    curr_home_score: Optional[int],
    curr_away_score: Optional[int],
    game_id: int,
    brewers_are_home: bool,
    inning: Optional[int],
    inning_state: Optional[str],
    prev_wp: Optional[float],
    curr_wp: Optional[float],
) -> list[BigMomentRow]:
    """
    Emit a BigMomentRow when the lead changes.

    Lead-change definition:
      - Going from Brewers behind/tied to Brewers ahead: "Brewers take the lead"
      - Going from Brewers ahead/tied to Brewers behind: "Brewers fall behind"
      - Tied to tied, ahead to ahead, behind to behind: no event
      - Ahead to tied (giving up the lead): NO event (lead change requires
        crossing into the OTHER team's territory per the brief)

    Both scores must be non-None for a valid comparison.
    """
    if any(v is None for v in [
        prev_home_score, prev_away_score, curr_home_score, curr_away_score
    ]):
        return []

    prev_diff = _score_perspective(
        prev_home_score, prev_away_score, brewers_are_home
    )
    curr_diff = _score_perspective(
        curr_home_score, curr_away_score, brewers_are_home
    )

    # No change in sign territory
    if prev_diff == curr_diff:
        return []

    # Brewers took the lead: crossed from <= 0 to > 0
    if prev_diff <= 0 and curr_diff > 0:
        if brewers_are_home:
            score_str = f"{curr_home_score}-{curr_away_score}"
        else:
            score_str = f"{curr_away_score}-{curr_home_score}"
        inning_label = _inning_label(inning, inning_state)
        description = f"Brewers take the lead {score_str}{inning_label}"
        return [BigMomentRow(
            game_id=game_id,
            moment_type="lead_change",
            description=description,
            inning=inning,
            wp_before=prev_wp,
            wp_after=curr_wp,
        )]

    # Brewers fell behind: crossed from >= 0 to < 0
    if prev_diff >= 0 and curr_diff < 0:
        if brewers_are_home:
            score_str = f"{curr_away_score}-{curr_home_score}"
        else:
            score_str = f"{curr_home_score}-{curr_away_score}"
        inning_label = _inning_label(inning, inning_state)
        description = f"Brewers fall behind {score_str}{inning_label}"
        return [BigMomentRow(
            game_id=game_id,
            moment_type="lead_change",
            description=description,
            inning=inning,
            wp_before=prev_wp,
            wp_after=curr_wp,
        )]

    return []


def detect_wp_swing(
    prev_wp: Optional[float],
    curr_wp: Optional[float],
    game_id: int,
    threshold: float,
    inning: Optional[int],
    inning_state: Optional[str],
) -> list[BigMomentRow]:
    """
    Emit a BigMomentRow when Brewers win probability shifts by >= threshold
    in a single polling interval.

    Uses absolute value — both big gains and big drops qualify.
    Both prev_wp and curr_wp must be non-None.
    """
    if prev_wp is None or curr_wp is None:
        return []

    swing = curr_wp - prev_wp
    if abs(swing) < threshold:
        return []

    swing_pp = round(abs(swing) * 100)
    inning_label = _inning_label(inning, inning_state)
    direction = "surged" if swing > 0 else "dropped"
    description = (
        f"Win probability {direction} {swing_pp} points{inning_label}"
    )

    return [BigMomentRow(
        game_id=game_id,
        moment_type="wp_swing",
        description=description,
        inning=inning,
        wp_before=round(prev_wp, 4),
        wp_after=round(curr_wp, 4),
    )]


def detect_walkoff(
    prev_status: Optional[str],
    curr_status: Optional[str],
    all_plays: list[dict],
    game_id: int,
    brewers_are_home: bool,
    home_score: Optional[int],
    away_score: Optional[int],
    prev_wp: Optional[float],
    curr_wp: Optional[float],
) -> list[BigMomentRow]:
    """
    Emit a BigMomentRow when the game JUST became Final with a walk-off.

    Walkoff conditions:
      1. Status just changed to Final/Game Over/Completed Early
      2. The last play occurred in the bottom half of inning >= 9
      3. The home team won (walk-offs only happen in the bottom of an inning)

    If Brewers are home: "Walk-off win for the Brewers"
    If Brewers are away: "Brewers fall on a walk-off"
    """
    final_statuses = {"Final", "Game Over", "Completed Early"}
    if curr_status not in final_statuses:
        return []
    if prev_status in final_statuses:
        return []  # game was already Final; don't re-emit

    # Find the last completed play
    last_play = _last_completed_play(all_plays)
    if last_play is None:
        return []

    about = last_play.get("about", {})
    inning = about.get("inning")
    half = about.get("halfInning", "").lower()

    # Walk-off only possible in bottom of inning >= 9
    if half != "bottom":
        return []
    if inning is None or inning < 9:
        return []

    # Home team must have won (that's what makes it a walk-off)
    if home_score is None or away_score is None:
        return []
    if home_score <= away_score:
        return []

    if brewers_are_home:
        description = "Walk-off win for the Brewers!"
    else:
        description = "Brewers fall on a walk-off"

    return [BigMomentRow(
        game_id=game_id,
        moment_type="walkoff",
        description=description,
        inning=inning,
        wp_before=prev_wp,
        wp_after=curr_wp,
    )]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _play_id(play: dict) -> str:
    """
    Return a stable string ID for a play.
    MLB uses about.atBatIndex as the primary identifier.
    """
    about = play.get("about", {})
    at_bat_index = about.get("atBatIndex")
    play_index = about.get("playIndex")
    # Combine both for maximum uniqueness within a game
    return f"{at_bat_index}:{play_index}"


def _batting_team_id(play: dict) -> Optional[int]:
    """
    Extract the batting team's ID from a play dict.
    MLB stores this under play.about.halfInning ("top"/"bottom") and
    the game-level team mapping, but the play itself sometimes has
    team data under matchup.batSide or runners. The most reliable path
    is through the play's team field if present; otherwise we rely on
    the caller passing brewers_team_id and checking the batter's team.

    In the live feed, the batting team ID is in:
      play.matchup.batter.currentTeam.id  (sometimes present)
    or inferred from halfInning + game teams.

    For simplicity we look for the direct field; the caller should
    also verify by checking if the batter ID is in the Brewers roster
    (not done here — we keep this module pure of that context).
    """
    matchup = play.get("matchup", {})
    batter = matchup.get("batter", {})
    # Try currentTeam first
    current_team = batter.get("currentTeam", {})
    if current_team:
        team_id = current_team.get("id")
        if team_id is not None:
            try:
                return int(team_id)
            except (TypeError, ValueError):
                pass
    return None


def _inning_label(inning: Optional[int], half: Optional[str]) -> str:
    """Format ' in the 7th' from inning number and half (Top/Bottom/etc)."""
    if inning is None:
        return ""
    suffix = _ordinal(inning)
    if half and half.lower() in ("top", "bottom"):
        return f" in the {half.lower()} of the {suffix}"
    return f" in the {suffix}"


def _ordinal(n: int) -> str:
    """Return ordinal string: 1 -> '1st', 2 -> '2nd', etc."""
    if 11 <= (n % 100) <= 13:
        return f"{n}th"
    return f"{n}{['th', 'st', 'nd', 'rd', 'th'][min(n % 10, 4)]}"


def _wp_around_play(play: dict, all_plays: list[dict]) -> tuple[Optional[float], Optional[float]]:
    """
    Extract wp_before and wp_after for a specific play.
    wp_after  = play.about.homeWinProbability (already on this play)
    wp_before = previous play's homeWinProbability

    Returns raw home-team values (0–100 scale converted to 0–1).
    Callers that need Brewers-perspective must flip if Brewers are away.
    """
    about = play.get("about", {})
    raw_after = about.get("homeWinProbability")
    wp_after = (float(raw_after) / 100.0) if raw_after is not None else None

    # Find the previous play by atBatIndex
    at_bat_index = about.get("atBatIndex", -1)
    wp_before = None
    for prev_play in reversed(all_plays):
        prev_about = prev_play.get("about", {})
        if prev_about.get("atBatIndex", -1) < at_bat_index:
            raw_before = prev_about.get("homeWinProbability")
            if raw_before is not None:
                wp_before = float(raw_before) / 100.0
            break

    return wp_before, wp_after


def _last_completed_play(all_plays: list[dict]) -> Optional[dict]:
    """Return the last play with isComplete=True."""
    for play in reversed(all_plays):
        about = play.get("about", {})
        if about.get("isComplete", False):
            return play
    return None
