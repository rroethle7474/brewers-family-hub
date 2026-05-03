# Phase 2 Kickoff — Schedule + Game Results + Standings

Phase 1 shipped: family can sign in, set a profile, lock in a single season-long Brewers prediction, and watch a leaderboard. Phase 2 is the **fan-hub layer** — give people something to look at when they're not making predictions.

This is **single-session work** again. The work is mostly sequential (sync the data → build the pages), and the agent-team coordination tax isn't worth it for this scope. Phase 3 is where teams start to earn their keep (independent tracks for poller, realtime UI, shoutbox).

---

## Goal

Ship three new pages backed by real MLB data:

1. `/schedule` — upcoming + recent Brewers games (calendar/list)
2. `/games/:gamePk` — game detail page in **recap mode** (final score, line score, pitchers of record). Live mode is Phase 3.
3. `/standings` — current NL Central standings (Brewers highlighted)

Plus one new Edge Function (`sync-schedule`) and an extension to `sync-standings` so we have rows for every NL team, not just the Brewers.

## Acceptance criteria

- [ ] `sync-schedule` Edge Function deployed, daily cron, populates `games` table from MLB API
- [ ] `sync-standings` extended to upsert all NL Central teams (Brewers + 4 division rivals minimum; full NL is fine too)
- [ ] `/schedule` shows the next ~14 days + last ~14 days of Brewers games. Empty state when no rows.
- [ ] `/schedule` works at 375px wide; calendar view collapses gracefully on narrow screens
- [ ] `/games/:gamePk` renders for any final game with score, inning-by-inning line score, and pitchers of record
- [ ] `/games/:gamePk` shows a clear "game hasn't started" or "game in progress" state for non-final games (live tracker comes in Phase 3)
- [ ] `/standings` shows NL Central with W-L, PCT, GB, last 10, streak — Brewers row visually highlighted
- [ ] Bottom-nav reorganized to surface the new pages without crowding (current 3 items: Home, Picks, Board → likely 4 items: Home, Schedule, Picks, Board, OR move Leaderboard to a sub-route)
- [ ] All new pages behind `<ProtectedRoute>` and inside `<Layout>` (existing chrome unchanged)
- [ ] All MLB API responses parsed safely (defensive against missing fields — opening day rosters change, partial data is normal)
- [ ] PWA still installs cleanly; new fetched data respects the existing 5-min Supabase REST cache

## Pre-flight

Run these checks before pasting the kickoff prompt:

1. `git log --oneline -3` — should show Phase 1's PWA commit (`375a19b` or later)
2. `node --version` — still ≥ 22.12 (no version manager weirdness)
3. **Supabase project ref in `supabase/config.toml`** — must be `vxnocwzuoctszydrtzbl`. The supabase-mcp-workflow skill verifies this anyway, but check it manually too — wrong-project mistakes are the worst.
4. `web/.env.local` still has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Phase 1 setup; if missing, restore from the project's memory entry).
5. **The `sync-standings` daily cron is still firing.** Run this SQL in the Dashboard or via MCP:
   ```sql
   select snapshot_date, wins, losses from public.standings_snapshot order by snapshot_date desc limit 5;
   ```
   You should see at least one row per day since Phase 1 shipped. If the cron's stopped firing, fix that before proceeding (otherwise predictions break too).
6. CRON_SECRET in memory and in Supabase Dashboard → Edge Functions → Secrets. Same secret reused for `sync-schedule` (no need to generate a new one).

## Kickoff prompt (paste into Claude Code)

```

```

## After Phase 2 ships

- Add a "lessons learned" section to this doc, mirroring the Phase 1 progress doc
- Don't start Phase 3 until family has been pinged with the URL and at least one person has used it
- Phase 3 is when the agent teams pattern earns its keep — the live tracker, shoutbox, and big-moment poller are genuinely independent tracks. Use Recipe 1 from CLAUDE.md.

## Scope creep watch

The temptations:
- "While we're here, let's add the player photos page too" — no, that's Phase 4
- "Let's track every team's standings, not just NL" — fine if it's free (the MLB API call returns the whole league anyway), but resist new schema for it
- "The line score should be live!" — no, that's the whole reason Phase 3 exists
- "Let's build a real settings page so users can edit their display name" — not blocking; defer to a Phase 5 polish pass

Phase 2's value is **family checking the schedule on game day**. Everything else delays that.
