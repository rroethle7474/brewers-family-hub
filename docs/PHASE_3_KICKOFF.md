# Phase 3 Kickoff — Live Tracker + Shoutbox

Phase 1 shipped auth + predictions. Phase 2 shipped the fan-hub
data layer (schedule, standings, game recap). **Phase 3 is the first
phase that's an agent team by default** — per CLAUDE.md Recipe 1, the
work splits cleanly into three independent tracks (poller / realtime
UI / shoutbox) and that's exactly where teams earn their tokens.

This is also the phase where the family experience becomes *live*.
Up to now the site is a fan dashboard you check; from Phase 3 forward
it's a place you sit on game day.

---

## Goal

Three deliverables, built concurrently by three teammates:

1. **FastAPI poller (`poller/`)** — always-on Python service polling MLB's
   live game feed every 30s when a Brewers game is in progress; writes
   `live_game_state` and `big_moments` rows.
2. **Live game hero on `/`** — Home page renders a live scoreboard with
   inning/baserunners/win-probability when a Brewers game is live, falling
   back to a "next game" card otherwise. Subscribes to `live_game_state`
   via Supabase Realtime.
3. **Shoutbox** — pinned-to-home family chat backed by `comments` table
   (Realtime), with a 6-emoji reaction picker and special card styling for
   auto-posted big moments inserted by the poller.

## Acceptance criteria

- [ ] `live_game_state`, `big_moments`, `comments`, `reactions` tables
      created with RLS enabled and policies per SPEC §13
- [ ] Poller deploys as a Docker image, runs on the Hetzner VPS (or the
      interim `fly.io` shim — see "Hosting decision" below). Polls a
      30s cadence during live games; sleeps until next scheduled game
      otherwise. Container restarts cleanly.
- [ ] Big moment detection: home run, lead change, win-probability swing
      ≥ 15pp in one play, walk-off (per SPEC §6). Each detection writes
      a `big_moments` row exactly once.
- [ ] Home page live hero shows score + inning + baserunner diamond +
      win-probability sparkline, all updating without manual refresh.
- [ ] Shoutbox renders last 50 comments, "load more" paginates older,
      Realtime appends new ones in place.
- [ ] Auto big-moment cards render with gold-bordered special styling
      and link to `/games/:gamePk`.
- [ ] Reactions work: emoji picker (👏 🔥 😂 😢 ⚾ 🍺), one-of-each per
      user per comment, optimistic update.
- [ ] Mobile-first at 375px; PWA still installable; RLS clean
      (`get_advisors` returns no security findings on the new tables).
- [ ] Phase review team (Recipe 3 from CLAUDE.md) run before merge to main.
      Phase 3 is the first user-visible interactive feature; defer no
      longer.

## Hosting decision (must resolve before the team spawns)

Phases 1 and 2 ran entirely on `localhost`. The poller cannot. It needs
an always-on host with outbound network and a writable `SUPABASE_SERVICE_ROLE_KEY`.

Two paths:

- **A. Hetzner VPS** (the intended Phase 6 destination per SPEC §3 and
  `docs/DEPLOYMENT.md`). Add the poller to `infra/docker-compose.yml`
  alongside the existing services; deploy via the GitHub Actions
  workflow. **Lift-and-shift the whole stack to Hetzner now.**
- **B. Fly.io interim shim.** Run the poller on Fly while the frontend
  remains local. Cheaper to spin up; defers the full deploy.

Default: **A**. The CLAUDE.md tech-stack table already names Hetzner +
Cloudflare + GitHub Actions as the destination. Doing it now is
slightly more work but lets the family use the live tracker on their
phones without `localhost` gymnastics. **B** is acceptable if you're
short on time and want to validate the poller logic first.

## Pre-flight

Before pasting the kickoff prompt:

1. `git log --oneline -5` — should show Phase 2's `feat: phase 2 …` commit
2. `git status` — clean working tree (Phase 2 committed)
3. **The cron schedules from Phase 2 are firing.** SQL check:
   ```sql
   select snapshot_date, count(*) from public.standings_snapshot
   where snapshot_date >= current_date - 7
   group by snapshot_date order by snapshot_date desc;
   ```
   You want a row per day for the last several days. Same for `games`:
   ```sql
   select max(updated_at) from public.games;
   ```
   Should be within the last 24h. If either has stalled, fix that first
   — the live hero's "next game" fallback depends on `games`.
4. **Resolve the hosting decision** (A or B above). Add the choice to
   `docs/PHASE_3_PROGRESS.md` so the team's Poller teammate doesn't
   guess.
5. **Agent teams flag on**: `echo $CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`
   should print `1`.
6. **Pre-approve common operations** (CLAUDE.md "Team operating rules"
   #7). At minimum: `docker build`, `docker compose up`, Python tooling
   (`pip`, `uv`, `pytest`), `supabase functions deploy`.
7. **Decide the live-feed polling interval**: 30s is the SPEC §6 floor.
   The MLB Stats API doesn't publish a hard rate limit but the
   `MLB-StatsAPI` package's polling examples sit at 10–30s. Stick with
   30s unless you have a reason.

## Schema work comes first

Three new tables and one extension. Have the **Poller** teammate publish
this migration before the Realtime/Shoutbox teammates start consuming.
The migration shape is in SPEC §5; the canonical RLS pattern is from
the supabase-mcp-workflow skill (gotcha #4).

```sql
-- 0003_phase3_live_and_social.sql

create table public.live_game_state (
  game_id int primary key references public.games(id) on delete cascade,
  inning int,
  inning_state text,
  outs int,
  balls int,
  strikes int,
  bases jsonb,
  current_batter_id int,
  current_pitcher_id int,
  home_score int,
  away_score int,
  win_probability float,
  recent_plays jsonb,
  updated_at timestamptz not null default now()
);
alter table public.live_game_state enable row level security;
create policy "live_game_state_select_authenticated"
  on public.live_game_state for select to authenticated using (true);
-- writes only via service-role (poller).
alter publication supabase_realtime add table public.live_game_state;

create table public.big_moments (
  id uuid primary key default gen_random_uuid(),
  game_id int not null references public.games(id) on delete cascade,
  moment_type text not null check (moment_type in
    ('home_run','lead_change','wp_swing','walkoff')),
  description text not null,
  player_id int,
  inning int,
  wp_before float,
  wp_after float,
  created_at timestamptz not null default now()
);
alter table public.big_moments enable row level security;
create policy "big_moments_select_authenticated"
  on public.big_moments for select to authenticated using (true);
-- writes only via service-role (poller).
alter publication supabase_realtime add table public.big_moments;

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  game_id int references public.games(id) on delete cascade,  -- null = shoutbox
  body text not null check (length(body) > 0 and length(body) <= 500),
  is_hot_take boolean not null default false,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);
alter table public.comments enable row level security;
create policy "comments_select_not_deleted"
  on public.comments for select to authenticated
  using (deleted_at is null);
create policy "comments_insert_self"
  on public.comments for insert to authenticated
  with check (auth.uid() = user_id);
create policy "comments_update_self"
  on public.comments for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- DELETE: no policy. Use update set deleted_at for soft-delete.
alter publication supabase_realtime add table public.comments;

create table public.reactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  comment_id uuid not null references public.comments(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (user_id, comment_id, emoji)
);
alter table public.reactions enable row level security;
create policy "reactions_select_authenticated"
  on public.reactions for select to authenticated using (true);
create policy "reactions_insert_self"
  on public.reactions for insert to authenticated
  with check (auth.uid() = user_id);
create policy "reactions_delete_self"
  on public.reactions for delete to authenticated
  using (auth.uid() = user_id);
alter publication supabase_realtime add table public.reactions;

-- Hot take constraint per SPEC §5: one per user per game.
create unique index one_hot_take_per_user_per_game
  on public.comments(user_id, game_id)
  where is_hot_take = true and deleted_at is null;
```

## Kickoff prompt (paste into Claude Code)

```
We're starting Phase 3 of the Brewers Family Hub. Read CLAUDE.md and
SPEC.md §6 (live poller), §10 (social layer), §11 (visual design —
baseball diamond, win-probability chart), and §14 (Phase 3 scope).
Read docs/PHASE_2_PROGRESS.md for the lessons we carried out of Phase
2 — apply them. Read docs/PHASE_3_KICKOFF.md (this file) for the
schema migration text and hosting decision; the schema must land
before the Realtime/Shoutbox teammates start consuming it.

This is the canonical agent-team phase per CLAUDE.md Recipe 1.
Spawn three teammates:

1. "Poller" — use the mlb-data-engineer agent type. Owns the poller/
   directory and the schema migration. Builds the FastAPI service,
   MLB live-feed integration, big-moment detection (home_run,
   lead_change, wp_swing ≥ 15pp, walkoff), and writes to
   live_game_state and big_moments. PUBLISH THE MIGRATION FIRST so
   the other teammates can consume the schema. Coordinate hosting
   per docs/PHASE_3_KICKOFF.md "Hosting decision".

2. "Realtime" — use the react-frontend-builder agent type. Owns
   web/src/pages/Home.tsx (live game hero) and web/src/components/
   LiveGameHero/ (sub-components: scoreboard, baserunner diamond,
   win-probability sparkline). Subscribes to live_game_state via
   Supabase Realtime. Coordinates with Poller on event payload shape
   — confirm the payload before consuming.

3. "Shoutbox" — use the react-frontend-builder agent type. Owns
   web/src/components/Shoutbox/ and the reactions UI. Subscribes to
   comments via Realtime; renders auto big-moment cards (where
   game_id is set and a matching big_moments row exists) with
   gold-bordered special styling. Reactions: 👏 🔥 😂 😢 ⚾ 🍺,
   one-per-user-per-emoji-per-comment, optimistic.

Coordination:
- Schema migration first. Poller publishes 0003_phase3_live_and_social.sql
  via the supabase-mcp-workflow skill. Confirm Realtime publication is
  enabled on all four tables before declaring schema done.
- Each teammate works in their own directory; no file conflicts.
- Realtime and Shoutbox can run in parallel once the schema is in place.
- Stay in the room (CLAUDE.md operating rule #1) — don't let the team
  run unattended for long stretches.
- 30s polling cadence floor (SPEC §6). Don't go faster.
- Agent-team token cost is real; if a teammate finishes early, have it
  pick up nice-to-have polish (e.g., the live hero's confetti animation
  on Brewers wins, SPEC §11) rather than spinning idle.

When all three are done, spawn Recipe 3 (3-teammate review team) before
declaring Phase 3 complete. This is the first user-facing interactive
feature; reviewing-before-deploy isn't optional this time.

Throughout: Update SPEC.md if a gap appears. Document non-obvious
decisions in docs/decisions/NNNN-title.md. Update docs/PHASE_3_PROGRESS.md
at the end of each session.
```

## Scope creep watch

- "Let's add per-game comment threads now" — no, the shoutbox (game_id =
  null) is enough for v3. Per-game threads are listed in SPEC §10 but
  that polish belongs in Phase 5 alongside hot takes.
- "Let's send push notifications when a big moment fires" — out of scope
  for v1 per SPEC §13. The manifest leaves room; that's the boundary.
- "Let's make the win-probability chart 162-game season-arc" — no, the
  in-game WP sparkline is one game's WP over plays. Season-arc charts
  are a Phase 5 idea.
- "Let's @-mention each other in shoutbox" — Phase 5 (mentions table is
  not in this migration intentionally).
- "Let's let users edit their own comments" — the schema supports it
  (RLS allows update-self), but the UI for it is Phase 5 polish.
  Soft-delete via the `deleted_at` column is the only mutation we ship
  in Phase 3 — and only if the team has time after the live hero is
  solid.

## After Phase 3 ships

- Run Recipe 3 review team (mandatory this time, not deferred).
- Add a "lessons learned" section to `docs/PHASE_3_PROGRESS.md`,
  mirroring Phase 1 and Phase 2.
- Share the URL with family. The whole point of Phase 3 is that the site
  becomes a place to *be* during a game; family-on-game-day is the
  validation.
- Begin Phase 4 (player stats + news + minors) once the live tracker has
  carried the family through at least one full Brewers game.
