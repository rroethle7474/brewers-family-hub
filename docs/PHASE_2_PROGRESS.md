# Phase 2 — Progress & Checkpoints

Living doc for Phase 2 (Schedule + Game Results + Standings). Update at the
end of each session.

---

## Status: ✅ Phase 2 functionally complete — schedule/standings/game-detail pages all shipping locally. Phase review (Recipe 3) and deploy still deferred.

Last updated: 2026-04-26

### Done

- [x] Read CLAUDE.md, SPEC.md (§5, §11, §14), `docs/PHASE_1_PROGRESS.md`
- [x] **Task #1 — `sync-standings` extended to all NL teams** (Edge Function v3)
  - Refactored to iterate every `teamRecord` in the MLB standings response
    and `upsert` one row per team per `snapshot_date`.
  - Manual invocation returned `{rows_upserted: 15, team_ids: [144,146,…,158,…]}` —
    all 15 NL teams (3 divisions × 5 teams) landed in one shot.
  - Verified via SQL: 158 (Brewers, 5th in NL Central, 13-13), 113 (Reds, 1st),
    112 (Cubs), 134 (Pirates), 138 (Cardinals) all present for `2026-04-26`.
- [x] **Task #2 — `sync-schedule` Edge Function** (v1)
  - Window: today-14 .. today+30 in Central Time. The kickoff doc said 14
    days; we kept the wider lookahead because the MLB API call covers it
    regardless of window size, and the schedule page benefits from showing
    the next homestand on day-after-deploy without waiting for tomorrow's
    cron tick.
  - Hydrate=`team,probablePitcher,decisions,linescore`. Status normalized to
    SPEC §5 buckets via `abstractGameState` + a regex pass over
    `detailedState` for Postponed/Cancelled/Suspended.
  - `brewers_won` is only stamped once `status === 'Final'`; mid-game leads
    aren't wins.
  - Manual invocation returned `{rows_upserted: 39, skipped_game_pks: []}`.
    Database breakdown: 26 Scheduled, 12 Final, 1 Live in progress.
  - Same `verify_jwt: false` + `x-cron-secret` pattern as `sync-standings`.
    Reuses the existing `CRON_SECRET` (no new secret needed).
  - **Action for Ryan:** add the daily cron in Dashboard → Edge Functions →
    `sync-schedule` → Schedules. Cron `0 13 * * *` (same time as
    `sync-standings`, the two are independent).
- [x] **Task #3 — `/standings` page**
  - Card layout. NL Central first; NL East and NL West below. Brewers row
    gold-tinted with a gold rank badge and "us" text marker — matches the
    "you" treatment on the leaderboard so the visual language is consistent.
  - Renders W-L, PCT (MLB-style `.NNN`), GB (only when > 0), Last 10, Streak.
  - Two-step query: latest `snapshot_date` first, then all rows for that date.
    Avoids a window function and keeps RLS-readable.
  - Mobile-first; no horizontal scroll at 375px.
- [x] **Task #4 — `/schedule` page (calendar + list views)**
  - **Calendar view** — month-by-month vertical stack, each month a 7-col
    SUN-SAT grid. Cells colored by SPEC §11 motif (GitHub-contribution-style
    heatmap):
    - Win → green
    - Loss → red
    - Live → blue (with gold ring on today)
    - Upcoming → navy
    - Postponed → muted neutral with border
    - Off-day → light gray with day number muted
  - Each game cell shows opponent abbreviation in-cell; tapping → `/games/:gamePk`.
  - **List view** — chronological list of game cards with date block,
    `vs`/`@`, opponent, venue, score, W/L pill (semantic green/red).
  - Toggle between views via a tablist at the page header.
- [x] **Task #5 — `/games/:gamePk` page (recap mode)**
  - Hero: Brewers gold tile for our side, big tabular numerals for both
    scores, status badge (FINAL navy / LIVE blue / SCHEDULED gold).
  - **Final state**: line score table with R/H/E columns, Brewers row
    gold-tinted (vintage scoreboard motif per SPEC §11). Pitchers of record
    card with semantic green/red labels for Win/Loss.
  - **Live state**: line score (partial, with `·` placeholders for innings
    not yet played) and a "Game in progress — live tracker coming Phase 3"
    banner using the `--live` blue accent.
  - **Pre-game state**: probables card with TBD fallback, gold-tinted
    Brewers side. "First pitch HH:MM" line in the hero.
  - **Postponed/Cancelled/Suspended**: explicit banner with appropriate copy.
  - Linescore + pitcher names fetched from MLB API at view time
    (`/api/v1/game/{pk}/linescore`, `/api/v1/people?personIds=…`). Failures
    are non-fatal — the rest of the page still renders.
- [x] **Task #6 — Bottom-nav reorganization**
  - Mobile: 4 items now — Home, Schedule, Picks, Board. Standings reachable
    from the Home page card grid (per kickoff doc default).
  - Desktop top-nav mirrors but adds Standings as a 5th link (more room).
- [x] **Home page polish** — added Schedule and Standings entry tiles
  alongside the existing Picks and Leaderboard tiles, in a 2x2 grid on
  small screens.

### Deferred

- **Phase 2 review team (Recipe 3).** Same reasoning as Phase 1: not
  deployed, no family users yet. Worth running before the URL is shared.
- **Vercel / Hetzner deployment.** Continuing to defer until end of Phase 3
  (the FastAPI poller can't run on localhost forever).
- **End-to-end QA pass on real iPhone Safari + Android Chrome.** All
  changes were validated at a 420px-wide viewport in desktop Chrome via
  the claude-in-chrome MCP. A cross-device check is good before the URL
  goes wide.

---

## Lessons learned (carry these into Phase 3 and beyond)

- **The `supabase-mcp-workflow` skill's preflight is doing real work.** It
  confirmed project ref `vxnocwzuoctszydrtzbl` was live and authenticated
  before either deploy. We didn't have to re-discover this from scratch — it
  read the project from `supabase/config.toml` and `get_project`'d it.
- **MLB Stats API status normalization is non-trivial.** `abstractGameState`
  is the cleanest 3-bucket lever (Preview/Live/Final), but `detailedState`
  is where Postponed/Suspended/Cancelled hide. We layered a regex pass over
  `detailedState` first to catch those, then fell back to
  `abstractGameState`. This pattern probably needs to repeat in the Phase 3
  poller; consider lifting `normalizeStatus` to a shared module if a Deno
  import map appears.
- **Don't put MLB team metadata in the DB if you don't have to.** We
  considered a `teams` table; landed on a static `web/src/lib/mlbTeams.ts`
  module instead. Team IDs and abbreviations don't change; a daily-synced
  table would be schema for the sake of schema. ADR `0001-mlb-team-metadata-in-code.md`
  for the reasoning.
- **Three game states make a tested matrix.** The /games/:gamePk page has
  Final / Live / Pre-game / Postponed branches. The first three each
  rendered correctly on the first browser pass (validated against gamePks
  824290, 823797, 823798 respectively). Worth re-running the Postponed
  branch once a real postponement happens — easy to forget to test that
  empty score state.
- **`supabase.from('games').select('*')` ordered ascending isn't enough on
  its own** — the calendar bucketing pass needs date strings in
  YYYY-MM-DD form to get reliable month grouping. We parse explicitly
  (`split('-').map(parseInt)`) rather than relying on `Date` constructor
  TZ behavior. Stick with this — `new Date('2026-04-12')` parses as UTC
  midnight which can render as Apr 11 in negative-offset timezones.
- **Vite SPA hard-refresh on `/standings` direct URL bumps to `/`.** Saw
  this twice during browser-driven QA. The auth/profile gates fire before
  the route resolves; pre-existing Phase 1 behavior, not a regression.
  Workaround: navigate from inside the app for live testing. Worth a
  follow-up someday but not blocking.

---

## Acceptance criteria progress (from PHASE_2_KICKOFF.md)

- [x] `sync-schedule` Edge Function deployed, populates `games` table from MLB API
      (cron schedule install pending Ryan's Dashboard click)
- [x] `sync-standings` extended to upsert all NL teams (full NL = 15 rows/day)
- [x] `/schedule` shows next ~14 days + last ~14 days of Brewers games. Empty state when no rows.
- [x] `/schedule` works at 375px wide; calendar collapses gracefully on narrow screens
- [x] `/games/:gamePk` renders for any final game with score, line score, pitchers of record
- [x] `/games/:gamePk` shows clear pre-game / in-progress states (live tracker coming Phase 3)
- [x] `/standings` shows NL Central with W-L, PCT, GB, Last 10, Streak — Brewers row highlighted
- [x] Bottom-nav reorganized — Home, Schedule, Picks, Board (4 items, comfortable mobile cap)
- [x] All new pages behind `<ProtectedRoute>` and inside `<Layout>` (existing chrome unchanged)
- [x] All MLB API responses parsed safely (defensive: required-field guards, optional chaining throughout)
- [ ] PWA install + cache verified post-changes (deferred to E2E pass)
- [ ] Phase reviewed by an agent team before merge to main (deferred — same as Phase 1)

---

## Decisions log

- **Wider schedule window (14d back / 30d ahead) than the kickoff doc's
  "today-14 .. today+30 feels right" suggested.** Settled on the wider end
  of that range because the MLB API call covers it for free, and the
  schedule page benefits from showing the next homestand on day-after-deploy
  without waiting for tomorrow's cron.
- **Team metadata lives in `web/src/lib/mlbTeams.ts`, not in a DB table.**
  See `docs/decisions/0001-mlb-team-metadata-in-code.md`.
- **No new schema in Phase 2.** The `games` table from migration 0001 was
  already shaped for what Phase 2 needed. We considered adding
  `save_pitcher_id` but skipped — winning/losing pitcher coverage is
  enough for recap mode, and a save column is a one-line additive
  migration whenever a future phase wants it.
- **Linescore is fetched at view time from MLB API, not stored in
  `games`.** Storing it would mean a `linescore jsonb` column or a child
  table. For ~50 final games visible at any one time and a tiny family
  audience, on-demand fetch (one MLB API call per game-page open) is
  cheaper than schema. If MLB API rate limits become a problem in
  Phase 4+, revisit.
