# 0001 — MLB team metadata lives in code, not in the database

**Status:** Accepted
**Date:** 2026-04-26
**Phase:** 2

## Context

Phase 2 introduced two pages — `/standings` and `/schedule` — that need to
render team names and abbreviations alongside data keyed only by MLB team
ID (e.g., `home_team_id = 158`). The same need will recur in Phase 3
(live tracker), Phase 4 (player profiles, opponent context), and beyond.

Two options were considered:

1. **DB-backed `teams` table.** A new migration, plus a Supabase Edge
   Function (`sync-teams`) to refresh it daily from
   `https://statsapi.mlb.com/api/v1/teams?sportId=1`. The standings and
   schedule pages would PostgREST-embed `teams` into their queries.
2. **Code-backed `MLB_TEAMS` constant** in `web/src/lib/mlbTeams.ts`. A
   ~30-row literal, hand-curated, with id/abbr/short/city/division.

## Decision

Adopt option 2 — team metadata lives in `web/src/lib/mlbTeams.ts`.

## Reasoning

- **MLB team identity is effectively static.** Teams don't get renumbered.
  Abbreviations change once a decade at most (the most recent MLB rename,
  Cleveland Guardians, was 2022; A's → "Athletics" was a branding tweak,
  the ID stayed 133). A static literal we update at most once a year is
  fine.
- **The DB-backed alternative requires real engineering**: a migration
  with RLS, a sync Edge Function, a daily cron, error handling, and
  schema regeneration. All of that to denormalize three text columns onto
  ~50 rows. Net negative on lines of code and operational complexity.
- **Embed queries cost more than a code lookup.** `select *,
  team:teams!home_team_id(*)` produces nested response shapes the calendar
  cell renderer would have to flatten anyway. Fewer round-trips and
  simpler types.
- **The Phase 3 poller (FastAPI / Python) doesn't share TypeScript code.**
  If we ever need the same metadata server-side, the
  `MLB-StatsAPI` Python package already exposes `statsapi.lookup_team()`
  which is the right shape there.

## Tradeoffs

- **Updates require a code change + redeploy** rather than a DB row
  update. For a once-a-year refresh that's accepted.
- **The list will go stale silently** if MLB renames a team. Mitigation:
  the `teamFor()` helper falls back to a clearly-marked "Team #NN" string
  for unknown IDs, which is obvious during QA.
- **No relational integrity.** A migration could drop a team ID from
  `MLB_TEAMS` and the games table would still reference it. Not a
  concern given the curation rate.

## Revisit if

- We start needing team metadata server-side in Edge Functions (would
  require duplicating the constant in Deno). Acceptable until it gets
  awkward.
- We add a "manage favorite teams" feature where users select non-MLB
  affiliates dynamically. Then the static list breaks down and a DB
  table becomes the right shape.
- A real-world rename happens mid-season and we want to ship the fix
  without a deploy. (The deploy itself is fast; this is unlikely to bite.)
