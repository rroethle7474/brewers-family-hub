# Phase 3 — Progress & Checkpoints

Living doc tracking what's done, what's next, and how to resume across
Claude sessions for Phase 3 (Live Tracker + Shoutbox). Update at the
end of each session.

---

## Status: ⏳ Not started — see `docs/PHASE_3_KICKOFF.md` for the kickoff prompt.

Last updated: <fill in when first touched>

### Hosting decision (resolve before spawning the team)

- [ ] Path A — Hetzner VPS (canonical, per `docs/DEPLOYMENT.md`)
- [ ] Path B — Fly.io interim shim
- [ ] Decided: <fill in>
- [ ] Reasoning: <fill in>

### Done

_(populated as work lands)_

### Deferred / blocked

_(populated as work runs into walls)_

---

## Lessons learned

_(carry these into Phase 4. Phase 1 and Phase 2 progress docs have the
shape — keep entries factual, action-oriented, and short. Save the why
behind every non-obvious decision.)_

---

## Acceptance criteria progress (from PHASE_3_KICKOFF.md)

- [ ] `live_game_state`, `big_moments`, `comments`, `reactions` tables
      created with RLS enabled and policies per SPEC §13
- [ ] Realtime publication enabled on all four tables
- [ ] Poller deploys as a Docker image; runs on the chosen host;
      polls 30s during live games; sleeps until next scheduled game
- [ ] Big moment detection: home_run, lead_change, wp_swing ≥ 15pp,
      walkoff (each detection = exactly one big_moments row)
- [ ] Home page live hero: score + inning + baserunner diamond +
      win-probability sparkline; updates without manual refresh
- [ ] Shoutbox: last 50 comments, "load more" pagination, Realtime
      append
- [ ] Auto big-moment cards render with gold-bordered styling, link
      to `/games/:gamePk`
- [ ] Reactions: 👏 🔥 😂 😢 ⚾ 🍺 picker, one-per-user-per-emoji-per-
      comment, optimistic update
- [ ] Mobile-first at 375px; PWA still installs cleanly
- [ ] `get_advisors` security findings clean on the new tables
- [ ] Phase reviewed by Recipe 3 team before merge to main

---

## Decisions log

_(populate as we go — see `docs/PHASE_2_PROGRESS.md` for the format.
Each entry should be short and link to an ADR in `docs/decisions/`
when the decision is non-obvious.)_
