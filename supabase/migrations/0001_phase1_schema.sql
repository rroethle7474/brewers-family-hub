-- 0001_phase1_schema.sql
-- Phase 1 schema: profiles, predictions, standings_snapshot, games.
-- Per SPEC.md §5 (data model) and §13 (security/RLS).
--
-- Conventions: every table has RLS enabled. Writes that aren't user-facing
-- (standings sync, schedule sync) have no policies, so only the service-role
-- key (used by Edge Functions) can mutate them.

-- ============================================================
-- profiles — extends auth.users with display name + admin flag
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_authenticated" on public.profiles
  for select to authenticated using (true);

create policy "profiles_insert_self" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

create policy "profiles_update_self" on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);
-- DELETE: no policy => nobody can delete via the API.
-- A profile is removed only when its underlying auth.users row is deleted (cascades).

-- Without this trigger, profiles_update_self would let a user flip their own
-- is_admin column (RLS is row-level, not column-level). This closes that hole.
create or replace function public.prevent_admin_self_promotion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.is_admin is distinct from old.is_admin then
    if not exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin
    ) then
      raise exception 'only admins can change admin status';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_prevent_admin_self_promotion
  before update on public.profiles
  for each row execute function public.prevent_admin_self_promotion();

-- ============================================================
-- standings_snapshot — daily Brewers standings (PK = team + date)
-- Populated by the sync-standings Edge Function (task #6).
-- ============================================================
create table public.standings_snapshot (
  team_id int not null,
  snapshot_date date not null,
  wins int not null,
  losses int not null,
  pct float,
  games_back float,
  division_rank int,
  league_rank int,
  run_diff int,
  last_10 text,
  streak text,
  primary key (team_id, snapshot_date),
  check (wins >= 0 and wins <= 162),
  check (losses >= 0 and losses <= 162)
);

-- "give me the latest snapshot for a team" — used by the predictions trigger.
create index standings_snapshot_team_date_desc_idx
  on public.standings_snapshot (team_id, snapshot_date desc);

alter table public.standings_snapshot enable row level security;

create policy "standings_select_authenticated" on public.standings_snapshot
  for select to authenticated using (true);
-- INSERT/UPDATE/DELETE: no policy => only the service-role key (Edge Function) can write.

-- ============================================================
-- games — full schedule shape (Phase 2 populates; created now so FKs exist)
-- ============================================================
create table public.games (
  id int primary key,                         -- MLB gamePk
  game_date date not null,
  game_datetime timestamptz not null,
  home_team_id int not null,
  away_team_id int not null,
  home_score int,
  away_score int,
  status text not null,                       -- Scheduled | Live | Final | Postponed
  inning int,
  inning_state text,                          -- Top | Bottom | Middle | End
  venue text,
  probable_home_pitcher_id int,
  probable_away_pitcher_id int,
  winning_pitcher_id int,
  losing_pitcher_id int,
  brewers_won boolean,                        -- denormalized for fast leaderboard math
  updated_at timestamptz not null default now()
);

create index games_game_date_idx on public.games (game_date);
create index games_status_idx on public.games (status);

alter table public.games enable row level security;

create policy "games_select_authenticated" on public.games
  for select to authenticated using (true);
-- Writes via Edge Function service-role only.

-- ============================================================
-- predictions — one per user, insert-once, server-validated
-- ============================================================
create table public.predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  predicted_wins int not null,
  submitted_at timestamptz not null default now(),
  team_record_at_submission text,             -- stamped by the trigger below
  check (predicted_wins >= 0 and predicted_wins <= 162)
);

alter table public.predictions enable row level security;

create policy "predictions_select_authenticated" on public.predictions
  for select to authenticated using (true);

create policy "predictions_insert_self" on public.predictions
  for insert to authenticated with check (auth.uid() = user_id);
-- UPDATE/DELETE: no policy => insert-once.
-- Admin override (SPEC §13) is intentionally deferred to Phase 5.

-- Server-side valid-range validation per SPEC §5:
--   current_wins <= predicted_wins <= current_wins + games_remaining
-- Reads the most recent standings_snapshot for the Brewers (team_id 158)
-- and stamps the record into team_record_at_submission.
create or replace function public.validate_prediction_range()
returns trigger
language plpgsql
as $$
declare
  current_wins int;
  current_losses int;
  games_remaining int;
  max_valid int;
begin
  select wins, losses
    into current_wins, current_losses
    from public.standings_snapshot
    where team_id = 158
    order by snapshot_date desc
    limit 1;

  if not found then
    raise exception
      'no standings snapshot found; cannot validate prediction (sync-standings has not run yet)';
  end if;

  games_remaining := 162 - (current_wins + current_losses);
  max_valid := current_wins + games_remaining;

  if new.predicted_wins < current_wins then
    raise exception
      'prediction (%) is below the current win count (% wins, % losses) — pick at least %',
      new.predicted_wins, current_wins, current_losses, current_wins;
  end if;

  if new.predicted_wins > max_valid then
    raise exception
      'prediction (%) exceeds the maximum possible (% wins, % games remaining) — pick at most %',
      new.predicted_wins, current_wins, games_remaining, max_valid;
  end if;

  new.team_record_at_submission := current_wins || '-' || current_losses;
  return new;
end;
$$;

create trigger predictions_validate_range
  before insert on public.predictions
  for each row execute function public.validate_prediction_range();
