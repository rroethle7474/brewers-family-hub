"""
test_big_moments.py — Unit tests for all four big moment detectors.

Coverage:
  detect_home_run   — 2 cases (positive: Brewers HR; negative: opponent HR)
  detect_lead_change — 3 cases (tied->ahead, ahead->behind, ahead->tied [no event])
  detect_wp_swing   — 2 cases (positive: >= threshold; negative: < threshold)
  detect_walkoff    — 2 cases (positive: walk-off win; negative: top-of-9th final)

No MLB API calls, no DB calls — only pure Python inputs.
"""

import pytest

from big_moments import (
    detect_home_run,
    detect_lead_change,
    detect_wp_swing,
    detect_walkoff,
    BigMomentRow,
)
from tests.conftest import (
    GAME_ID,
    BREWERS_TEAM_ID,
    OPPONENT_TEAM_ID,
    make_play,
    make_brewers_home_run_play,
)

# ---------------------------------------------------------------------------
# detect_home_run
# ---------------------------------------------------------------------------

class TestDetectHomeRun:
    def test_brewers_home_run_emits_moment(self):
        """A new home run play by a Brewers batter should emit one BigMomentRow."""
        hr_play = make_brewers_home_run_play(at_bat_index=5)
        plays = [
            make_play(at_bat_index=0),
            make_play(at_bat_index=1),
            make_play(at_bat_index=2),
            hr_play,
        ]
        prev_seen = {"0:0", "1:0", "2:0"}  # plays 0-2 already processed

        moments = detect_home_run(
            prev_play_ids=prev_seen,
            all_plays=plays,
            game_id=GAME_ID,
            brewers_team_id=BREWERS_TEAM_ID,
        )

        assert len(moments) == 1
        m = moments[0]
        assert isinstance(m, BigMomentRow)
        assert m.moment_type == "home_run"
        assert m.game_id == GAME_ID
        assert "home run" in m.description.lower()
        assert m.player_id == 592885  # Christian Yelich ID from fixture

    def test_opponent_home_run_emits_no_moment(self):
        """A home run by the opponent should NOT emit a big moment."""
        hr_play = make_play(
            at_bat_index=5,
            event_type="home_run",
            event="Home Run",
            batting_team_id=OPPONENT_TEAM_ID,  # NOT Brewers
            batter_name="Kyle Tucker",
        )
        plays = [hr_play]
        prev_seen: set[str] = set()

        moments = detect_home_run(
            prev_play_ids=prev_seen,
            all_plays=plays,
            game_id=GAME_ID,
            brewers_team_id=BREWERS_TEAM_ID,
        )

        assert moments == []

    def test_already_seen_play_not_re_emitted(self):
        """A Brewers HR play that was already in prev_play_ids should be skipped."""
        hr_play = make_brewers_home_run_play(at_bat_index=5)
        plays = [hr_play]
        prev_seen = {"5:0"}  # already seen

        moments = detect_home_run(
            prev_play_ids=prev_seen,
            all_plays=plays,
            game_id=GAME_ID,
            brewers_team_id=BREWERS_TEAM_ID,
        )

        assert moments == []


# ---------------------------------------------------------------------------
# detect_lead_change
# ---------------------------------------------------------------------------

class TestDetectLeadChange:
    """All tests assume Brewers are the home team."""

    def _call(self, prev_home, prev_away, curr_home, curr_away,
              inning=7, inning_state="Middle",
              prev_wp=0.50, curr_wp=0.60):
        return detect_lead_change(
            prev_home_score=prev_home,
            prev_away_score=prev_away,
            curr_home_score=curr_home,
            curr_away_score=curr_away,
            game_id=GAME_ID,
            brewers_are_home=True,
            inning=inning,
            inning_state=inning_state,
            prev_wp=prev_wp,
            curr_wp=curr_wp,
        )

    def test_tied_to_brewers_lead_emits_moment(self):
        """Tied → Brewers ahead should emit a lead_change moment."""
        moments = self._call(prev_home=3, prev_away=3, curr_home=4, curr_away=3)
        assert len(moments) == 1
        m = moments[0]
        assert m.moment_type == "lead_change"
        assert "take the lead" in m.description.lower()
        assert "4-3" in m.description

    def test_brewers_ahead_to_behind_emits_moment(self):
        """Brewers leading → opponents leading should emit a lead_change moment."""
        moments = self._call(prev_home=4, prev_away=3, curr_home=4, curr_away=5)
        assert len(moments) == 1
        m = moments[0]
        assert m.moment_type == "lead_change"
        assert "fall behind" in m.description.lower()
        assert "5-4" in m.description

    def test_ahead_to_tied_no_moment(self):
        """Brewers going from ahead to tied is NOT a lead change per spec."""
        moments = self._call(prev_home=4, prev_away=3, curr_home=4, curr_away=4)
        assert moments == []

    def test_same_score_no_moment(self):
        """No score change should produce no moment."""
        moments = self._call(prev_home=3, prev_away=3, curr_home=3, curr_away=3)
        assert moments == []

    def test_none_scores_no_moment(self):
        """None scores (pre-game) should not crash or emit."""
        moments = detect_lead_change(
            prev_home_score=None,
            prev_away_score=None,
            curr_home_score=None,
            curr_away_score=None,
            game_id=GAME_ID,
            brewers_are_home=True,
            inning=1,
            inning_state="Top",
            prev_wp=None,
            curr_wp=None,
        )
        assert moments == []

    def test_brewers_away_lead_change(self):
        """Lead change when Brewers are the away team."""
        # Brewers (away) go from trailing 3-4 to leading 5-4
        moments = detect_lead_change(
            prev_home_score=4,
            prev_away_score=3,
            curr_home_score=4,
            curr_away_score=5,
            game_id=GAME_ID,
            brewers_are_home=False,  # Brewers are away
            inning=8,
            inning_state="Top",
            prev_wp=0.35,
            curr_wp=0.65,
        )
        assert len(moments) == 1
        m = moments[0]
        assert "take the lead" in m.description.lower()
        assert "5-4" in m.description


# ---------------------------------------------------------------------------
# detect_wp_swing
# ---------------------------------------------------------------------------

class TestDetectWpSwing:
    THRESHOLD = 0.15

    def _call(self, prev_wp, curr_wp, inning=7, inning_state="Bottom"):
        return detect_wp_swing(
            prev_wp=prev_wp,
            curr_wp=curr_wp,
            game_id=GAME_ID,
            threshold=self.THRESHOLD,
            inning=inning,
            inning_state=inning_state,
        )

    def test_large_positive_swing_emits_moment(self):
        """WP jumping from 0.40 to 0.80 (40pp) should emit a wp_swing."""
        moments = self._call(prev_wp=0.40, curr_wp=0.80)
        assert len(moments) == 1
        m = moments[0]
        assert m.moment_type == "wp_swing"
        assert m.wp_before == pytest.approx(0.40, abs=1e-4)
        assert m.wp_after == pytest.approx(0.80, abs=1e-4)
        assert "40" in m.description  # 40 percentage points

    def test_large_negative_swing_emits_moment(self):
        """WP dropping from 0.80 to 0.35 (45pp) should emit a wp_swing."""
        moments = self._call(prev_wp=0.80, curr_wp=0.35)
        assert len(moments) == 1
        m = moments[0]
        assert m.moment_type == "wp_swing"
        assert "45" in m.description
        assert "dropped" in m.description

    def test_small_swing_below_threshold_no_moment(self):
        """WP change of 10pp (below 15pp threshold) should not emit."""
        moments = self._call(prev_wp=0.50, curr_wp=0.60)
        assert moments == []

    def test_exactly_at_threshold_emits_moment(self):
        """WP change of exactly 15pp should emit (>= threshold)."""
        moments = self._call(prev_wp=0.50, curr_wp=0.65)
        assert len(moments) == 1

    def test_none_wp_no_moment(self):
        """None WP values should not crash or emit."""
        moments = self._call(prev_wp=None, curr_wp=0.80)
        assert moments == []

        moments = self._call(prev_wp=0.50, curr_wp=None)
        assert moments == []


# ---------------------------------------------------------------------------
# detect_walkoff
# ---------------------------------------------------------------------------

class TestDetectWalkoff:

    def test_brewers_home_walkoff_win(self, walkoff_plays):
        """
        Game just became Final after a walk-off hit in bottom of 9th;
        Brewers are home and win — should emit 'Walk-off win'.
        """
        moments = detect_walkoff(
            prev_status="In Progress",
            curr_status="Final",
            all_plays=walkoff_plays,
            game_id=GAME_ID,
            brewers_are_home=True,
            home_score=5,   # Brewers (home) win
            away_score=4,
            prev_wp=0.60,
            curr_wp=1.0,
        )
        assert len(moments) == 1
        m = moments[0]
        assert m.moment_type == "walkoff"
        assert "walk-off win" in m.description.lower()
        assert m.inning == 9

    def test_brewers_away_walkoff_loss(self, walkoff_plays):
        """
        Brewers are the away team; home team wins on a walk-off.
        Should emit 'Brewers fall on a walk-off'.
        """
        moments = detect_walkoff(
            prev_status="In Progress",
            curr_status="Final",
            all_plays=walkoff_plays,
            game_id=GAME_ID,
            brewers_are_home=False,
            home_score=5,   # Home team wins (Brewers are away, so Brewers lose)
            away_score=4,
            prev_wp=0.40,
            curr_wp=0.0,
        )
        assert len(moments) == 1
        m = moments[0]
        assert m.moment_type == "walkoff"
        assert "fall on a walk-off" in m.description.lower()

    def test_not_final_no_moment(self, walkoff_plays):
        """Game still in progress — no walkoff moment."""
        moments = detect_walkoff(
            prev_status="In Progress",
            curr_status="In Progress",
            all_plays=walkoff_plays,
            game_id=GAME_ID,
            brewers_are_home=True,
            home_score=5,
            away_score=4,
            prev_wp=0.70,
            curr_wp=0.80,
        )
        assert moments == []

    def test_top_of_ninth_no_walkoff(self, non_walkoff_plays):
        """
        Game ends in the top of the 9th (e.g., away team bats last half).
        Not a walk-off — should emit no moment.
        """
        moments = detect_walkoff(
            prev_status="In Progress",
            curr_status="Final",
            all_plays=non_walkoff_plays,
            game_id=GAME_ID,
            brewers_are_home=True,
            home_score=5,
            away_score=3,  # home wins but last play was top of 9th
            prev_wp=0.80,
            curr_wp=1.0,
        )
        assert moments == []

    def test_already_final_no_duplicate(self, walkoff_plays):
        """
        If both prev_status and curr_status are Final, don't re-emit.
        This guards against the poller looping on a completed game.
        """
        moments = detect_walkoff(
            prev_status="Final",
            curr_status="Final",
            all_plays=walkoff_plays,
            game_id=GAME_ID,
            brewers_are_home=True,
            home_score=5,
            away_score=4,
            prev_wp=1.0,
            curr_wp=1.0,
        )
        assert moments == []

    def test_home_team_loses_no_walkoff(self, walkoff_plays):
        """
        Bottom of 9th but away team is winning — away team doesn't walk-off.
        (Walk-off only possible if home team scores to win.)
        """
        moments = detect_walkoff(
            prev_status="In Progress",
            curr_status="Final",
            all_plays=walkoff_plays,
            game_id=GAME_ID,
            brewers_are_home=True,
            home_score=3,   # Home team loses
            away_score=5,
            prev_wp=0.20,
            curr_wp=0.0,
        )
        assert moments == []
