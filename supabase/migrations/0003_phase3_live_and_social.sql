-- 0003_phase3_live_and_social.sql
-- Phase 3 schema: live game state + social layer.
-- Per SPEC.md §5 (data model), §6 (live poller), §10 (social), §13 (security/RLS).
--
-- Adds four tables:
--   live_game_state — single-row-per-game live snapshot, written by the
--                     FastAPI poller (service-role) every 30s during games.
--   big_moments    — append-only event log. Poller writes home runs, lead
--                     changes, win-probability swings >= 15pp, walkoffs.
--   comments       — shoutbox (game_id null) + per-game threads (Phase 5).
--                     Soft-delete only — no DELETE policy.
--   reactions      — emoji reactions; one per (user, comment, emoji).
--
-- All four are added to the supabase_realtime publication so the React UI
-- can subscribe and re-render on insert/update.
--
-- RLS pattern matches Phase 1: SELECT is open to any authenticated user;
-- writes are scoped to auth.uid() (user-facing tables) OR service-role only
-- (server-written tables — no policy means only the service-role key mutates).

-- ============================================================
-- live_game_state — one row per game; service-role writes only.
-- Populated by the FastAPI poller every 30s during live Brewers games.
-- ============================================================
create table public.live_game_state (
  game_id int primary key references public.games(id) on delete cascade,
  inning int,
  inning_state text,                           -- Top | Middle | Bottom | End
  outs int,
  balls int,
  strikes int,
  bases jsonb,                                 -- { first: <playerId|null>, second:..., third:... }
  current_batter_id int,
  current_pitcher_id int,
  home_score int,
  away_score int,
  win_probability float,                       -- 0.0–1.0, Brewers' WP
  recent_plays jsonb,                          -- last N plays for the WP sparkline
  updated_at timestamptz not null default now()
);

alter table public.live_game_state enable row level security;

create policy "live_game_state_select_authenticated" on public.live_game_state
  for select to authenticated using (true);
-- INSERT/UPDATE/DELETE: no policy => only the service-role key (the FastAPI
-- poller) can mutate. Frontend reads via Realtime; writes are server-only.

alter publication supabase_realtime add table public.live_game_state;

-- ============================================================
-- big_moments — append-only event log written by the poller.
-- ============================================================
create table public.big_moments (
  id uuid primary key default gen_random_uuid(),
  game_id int not null references public.games(id) on delete cascade,
  moment_type text not null
    check (moment_type in ('home_run', 'lead_change', 'wp_swing', 'walkoff')),
  description text not null,
  player_id int,
  inning int,
  wp_before float,
  wp_after float,
  created_at timestamptz not null default now()
);

create index big_moments_game_created_idx
  on public.big_moments (game_id, created_at desc);

alter table public.big_moments enable row level security;

create policy "big_moments_select_authenticated" on public.big_moments
  for select to authenticated using (true);
-- Writes via service-role (poller) only.

alter publication supabase_realtime add table public.big_moments;

-- ============================================================
-- comments — shoutbox (game_id null) + per-game threads (Phase 5).
-- 2000-char cap per Ryan's product call this session (kickoff doc said
-- 500; family chat needs longer comments). Soft-delete via deleted_at.
-- ============================================================
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  game_id int references public.games(id) on delete cascade,   -- null => shoutbox
  body text not null,
  is_hot_take boolean not null default false,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  check (length(body) > 0 and length(body) <= 2000)
);

-- Most common query: shoutbox feed = "newest 50 where game_id is null and
-- deleted_at is null". Partial index keeps it tight even as comments grow.
create index comments_shoutbox_created_idx
  on public.comments (created_at desc)
  where game_id is null and deleted_at is null;

alter table public.comments enable row level security;

create policy "comments_select_not_deleted" on public.comments
  for select to authenticated using (deleted_at is null);

create policy "comments_insert_self" on public.comments
  for insert to authenticated with check (auth.uid() = user_id);

create policy "comments_update_self" on public.comments
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
-- DELETE: no policy => clients soft-delete via UPDATE set deleted_at = now().

alter publication supabase_realtime add table public.comments;

-- One hot take per user per game. The "deleted_at is null" carve-out is
-- intentional: a user can soft-delete a flubbed hot take and post a new one
-- in the same game.
create unique index one_hot_take_per_user_per_game
  on public.comments (user_id, game_id)
  where is_hot_take = true and deleted_at is null;

-- ============================================================
-- reactions — emoji reactions on comments.
-- One row per (user, comment, emoji). Users delete + reinsert to "change"
-- their reaction; the row itself is immutable (no UPDATE policy).
-- ============================================================
create table public.reactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  comment_id uuid not null references public.comments(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (user_id, comment_id, emoji)
);

create index reactions_comment_idx on public.reactions (comment_id);

alter table public.reactions enable row level security;

create policy "reactions_select_authenticated" on public.reactions
  for select to authenticated using (true);

create policy "reactions_insert_self" on public.reactions
  for insert to authenticated with check (auth.uid() = user_id);

create policy "reactions_delete_self" on public.reactions
  for delete to authenticated using (auth.uid() = user_id);
-- UPDATE: no policy => emoji is immutable. Change a reaction by deleting +
-- reinserting; uniqueness on (user_id, comment_id, emoji) keeps it idempotent.

alter publication supabase_realtime add table public.reactions;
