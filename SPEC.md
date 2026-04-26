# Brewers Family Hub — Design Spec

## 1. Project Overview

A family-only website that combines:

1. A season-long **win prediction game** (one prediction per family member, locked once submitted, with a live leaderboard).
2. A **Brewers fan hub** with schedule, live game tracking, standings, player stats, news, and minor league coverage.
3. A **family social layer** — shoutbox, per-game comment threads, reactions, hot takes, and auto-posted big moments.

The site is private (auth-gated), professional in look, and fun in feel. Scale is family-sized (≤ ~30 users).

---

## 2. Goals & Non-Goals

### Goals
- Single destination for the family to follow the Brewers all season
- Shared prediction game that creates ongoing stakes and bragging rights
- Live, social experience during games — not just a stats site
- Low ongoing maintenance cost (target < $10/mo total)
- Built for one developer (Ryan) using familiar tooling

### Non-Goals
- Public site or open registration (family-only, invite/link-based signup)
- Mobile native apps (responsive web is enough)
- Real-time pitch-by-pitch parity with MLB Gameday (30s cadence is the floor)
- Advanced sabermetrics or projections (basic stats only)
- Multi-team support (Brewers only)

---

## 3. Tech Stack

> **Deployment note:** Hosting is a deferred decision. Two viable paths: (a) Vercel for frontend + Fly.io for poller (simplest), or (b) self-hosted on a Hetzner VPS via Docker Compose + Caddy + Cloudflare (more control, slightly higher cost). See `docs/DEPLOYMENT.md` for the VPS path. The decision can be made at end of Phase 1 (frontend deploy) and revisited at end of Phase 3 (when the poller arrives). Application code is hosting-agnostic.

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | React + Vite + Tailwind CSS | Familiar; fast dev loop |
| Hosting (web + poller) | Hetzner VPS, Docker Compose, Caddy | One box, owner-controlled, predictable cost |
| DNS + edge | Cloudflare (proxy mode) | Free DDoS protection, hides VPS IP, Origin Certs |
| Auth & DB | Supabase (Postgres + Auth + Realtime) | One platform for auth, data, real-time subscriptions |
| Live game poller | FastAPI service in Docker on the VPS | In-memory state for event detection; Python MLB libs |
| Daily/periodic jobs | Supabase Edge Functions + cron | Standings refresh, news pull, daily snapshots |
| CI/CD | GitHub Actions → SSH deploy | Automated, image-based, zero-downtime |
| Container registry | GHCR | Free with GitHub, integrated with Actions |
| Charts | Recharts | Win probability, trend graphs |
| MLB data | MLB Stats API (`statsapi.mlb.com`) via `MLB-StatsAPI` Python package | Free, comprehensive |
| News | RSS aggregation (MLB.com Brewers, Brew Crew Ball, Reviewing the Brew) | Free, no API needed |
| Email (optional) | Resend or Supabase built-in | For mention notifications |

---

## 4. Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                           User's Browser                          │
│  React app (Vercel) ←─── Supabase Realtime (WebSocket) ────────┐  │
└──────────┬────────────────────────────────────────────────────┼──┘
           │                                                    │
           │ REST + RLS                                         │
           ▼                                                    │
┌───────────────────────────────┐         ┌────────────────────────┐
│        Supabase                │◄───────│  Live Poller (Fly.io)  │
│  Postgres + Auth + Realtime    │ writes │  FastAPI, Python       │
│  + Edge Functions (cron)       │        │  Polls MLB API every   │
└───────────────────────────────┘         │  30s during live games │
           ▲                              │  Detects big moments   │
           │ writes                       └─────────┬──────────────┘
           │                                        │
┌──────────┴───────────┐                           │
│  Edge Functions       │                          │
│  (daily/periodic):    │                          │
│  - Standings refresh  │                          ▼
│  - Player stats       │                ┌─────────────────────┐
│  - News RSS pull      │                │   MLB Stats API     │
│  - Schedule sync      │                │  statsapi.mlb.com   │
└───────────────────────┘                └─────────────────────┘
```

### Why two ingestion paths?

**Live poller (Fly.io):** Always-on Python service. Owns the 30-second polling cadence during live games. Holds in-memory state (last play ID seen, last score, last win probability) to detect new events without hammering the DB. Writes updates to `live_game_state` table; Supabase Realtime pushes to clients.

**Edge Functions (Supabase cron):** Stateless, scheduled jobs. Owns everything that runs on a daily/hourly cadence: schedule sync, standings, player stats snapshots, news ingestion. Cheaper and simpler for non-live work.

---

## 5. Data Model

### Auth & Users

```sql
-- Supabase auth.users handles auth; this extends it
profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  display_name text NOT NULL,
  avatar_url text,
  is_admin boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
)
```

### Predictions

```sql
predictions (
  id uuid PRIMARY KEY,
  user_id uuid UNIQUE REFERENCES profiles(id),  -- one per user
  predicted_wins int NOT NULL,
  submitted_at timestamptz DEFAULT now(),
  team_record_at_submission text,  -- e.g., "15-10" for context
  CHECK (predicted_wins >= 0 AND predicted_wins <= 162)
)
```

**Validation logic (server-side, on insert):**

```
Get current standings: W wins, L losses, G = W+L played
games_remaining = 162 - G
min_valid = W
max_valid = W + games_remaining

if predicted_wins < min_valid or predicted_wins > max_valid:
  reject with explanatory message
```

RLS: users can `SELECT` all predictions, but `INSERT` only their own, and **never** `UPDATE` or `DELETE` (only admin can edit/delete).

### Games & Schedule

```sql
games (
  id int PRIMARY KEY,  -- MLB gamePk
  game_date date NOT NULL,
  game_datetime timestamptz NOT NULL,
  home_team_id int NOT NULL,
  away_team_id int NOT NULL,
  home_score int,
  away_score int,
  status text NOT NULL,  -- Scheduled, Live, Final, Postponed
  inning int,
  inning_state text,  -- Top, Bottom, Middle, End
  venue text,
  probable_home_pitcher_id int,
  probable_away_pitcher_id int,
  winning_pitcher_id int,
  losing_pitcher_id int,
  brewers_won boolean,  -- denormalized for fast leaderboard math
  updated_at timestamptz DEFAULT now()
)
```

### Live Game State (Realtime-subscribed)

```sql
live_game_state (
  game_id int PRIMARY KEY REFERENCES games(id),
  inning int,
  inning_state text,
  outs int,
  balls int,
  strikes int,
  bases jsonb,  -- {first: player_id|null, second: ..., third: ...}
  current_batter_id int,
  current_pitcher_id int,
  home_score int,
  away_score int,
  win_probability float,  -- Brewers' WP from MLB API
  recent_plays jsonb,  -- last ~5 plays as array
  updated_at timestamptz DEFAULT now()
)
```

### Standings, Stats, Players

```sql
standings_snapshot (
  team_id int,
  snapshot_date date,
  wins int,
  losses int,
  pct float,
  games_back float,
  division_rank int,
  league_rank int,
  run_diff int,
  last_10 text,  -- "7-3"
  streak text,   -- "W3" or "L2"
  PRIMARY KEY (team_id, snapshot_date)
)

players (
  id int PRIMARY KEY,  -- MLB player ID
  full_name text NOT NULL,
  position text,
  jersey_number int,
  bat_side text,
  throw_side text,
  active boolean DEFAULT true,
  affiliate text,  -- 'MLB', 'AAA', 'AA', 'A+', 'A'
  headshot_url text
)

player_stats_season (
  player_id int REFERENCES players(id),
  season int,
  -- batting
  games int, ab int, hits int, hr int, rbi int, sb int,
  avg float, obp float, slg float, ops float,
  -- pitching
  ip float, era float, whip float, k int, bb int, w int, l int, sv int,
  updated_at timestamptz,
  PRIMARY KEY (player_id, season)
)
```

### Social Layer

```sql
comments (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES profiles(id),
  game_id int REFERENCES games(id),  -- nullable: null = shoutbox
  body text NOT NULL CHECK (length(body) <= 500),
  is_hot_take boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  edited_at timestamptz,
  deleted_at timestamptz  -- soft delete
)

reactions (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES profiles(id),
  comment_id uuid REFERENCES comments(id),
  emoji text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, comment_id, emoji)
)

big_moments (
  id uuid PRIMARY KEY,
  game_id int REFERENCES games(id),
  moment_type text NOT NULL,  -- 'home_run', 'lead_change', 'wp_swing', 'walkoff'
  description text NOT NULL,  -- "Christian Yelich homers — Brewers lead 4-3"
  player_id int REFERENCES players(id),
  inning int,
  wp_before float,
  wp_after float,
  created_at timestamptz DEFAULT now()
)

mentions (
  id uuid PRIMARY KEY,
  comment_id uuid REFERENCES comments(id),
  mentioned_user_id uuid REFERENCES profiles(id),
  notified boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
)

news_items (
  id uuid PRIMARY KEY,
  source text NOT NULL,
  title text NOT NULL,
  url text NOT NULL UNIQUE,
  summary text,
  published_at timestamptz NOT NULL,
  ingested_at timestamptz DEFAULT now()
)
```

### Hot Takes

A comment with `is_hot_take = true` and `game_id` set is the user's hot take for that game. Constraint: each user can only have one active hot take per game (enforced via partial unique index).

```sql
CREATE UNIQUE INDEX one_hot_take_per_user_per_game
  ON comments(user_id, game_id)
  WHERE is_hot_take = true AND deleted_at IS NULL;
```

---

## 6. Live Poller Design (Fly.io FastAPI)

### Responsibilities
- Detect when a Brewers game is live (within window of `game_datetime`)
- Poll `/api/v1.1/game/{gamePk}/feed/live` every 30s
- Update `live_game_state` row
- Detect events and create `big_moments` rows (auto-post to shoutbox)
- Stop polling when game status = Final

### Event detection rules
| Moment | Trigger |
|---|---|
| `home_run` | New play with `event = "Home Run"` and Brewers batter |
| `lead_change` | Score state crosses (Brewers tied or behind → ahead, or vice versa) |
| `wp_swing` | Win probability changes by ≥ 15 percentage points in one play |
| `walkoff` | Game-ending Brewers play in 9th+ inning |

Each new big moment is inserted into `big_moments`. The frontend subscribes to inserts on this table via Supabase Realtime and renders a special card in the shoutbox.

### Service structure

```
poller/
├── main.py           # FastAPI app + scheduler loop
├── mlb_client.py     # MLB API wrapper (uses MLB-StatsAPI lib)
├── state.py          # In-memory state per game
├── detectors.py      # Big moment detection logic
├── supabase_writer.py
├── pyproject.toml
├── Dockerfile
└── fly.toml
```

A single async loop checks every 30s whether any game is live. If yes, polls; if no, sleeps until next scheduled game. A small admin endpoint (`GET /healthz`, `GET /status`) is exposed for debugging.

### Cost & scale
- Fly.io shared-cpu-1x, 256MB RAM, autostop=false during season
- Estimated $2-3/mo running 24/7

---

## 7. Edge Function Jobs

| Function | Schedule | Purpose |
|---|---|---|
| `sync-schedule` | Daily `0 13 * * *` UTC | Pull/upsert today-14d to today+30d of Brewers games |
| `sync-standings` | Daily `0 13 * * *` UTC | Refresh `standings_snapshot` for all NL teams |
| `sync-player-stats` | Daily 5am CT | Refresh season stat lines for active 40-man + key minors |
| `sync-minors` | Daily 7am CT | Pull affiliate game results, top prospect lines |
| `pull-news` | Every 30 min | RSS aggregation from configured feeds |
| `notify-mentions` | Every 5 min | Email pending unnotified mentions |

> Phase 2 cadence reality check: `sync-standings` was originally specced
> "hourly" and `sync-schedule` "daily 4am CT". Both were resolved to a
> single shared daily cron at `0 13 * * *` UTC (≈ 7am CST / 8am CDT) once
> we discovered the standings PK is one row per team per day — sub-daily
> runs collapse on the same key. Co-scheduling with `sync-schedule` is
> fine; the two functions read different MLB API endpoints and write to
> different tables. Phase 2 also extended `sync-standings` to write all
> 15 NL teams from a single MLB call (the API returns the whole league).

---

## 8. Frontend Page Map

```
/                        Home — live game hero (or next game) + shoutbox + recent news
/login                   Magic link / OAuth via Supabase
/predictions             Make a prediction (if none) + family leaderboard
/predictions/leaderboard Detailed leaderboard with projected vs predicted
/schedule                Calendar view + list view; W/L color-coded
/games/:id               Single game page (live tracker if live, recap if final)
/standings               NL Central + NL + MLB tabs
/players                 Roster grid with leaderboards (HR, AVG, ERA, etc.)
/players/:id             Player profile, season stats, recent game log
/news                    Aggregated news feed
/minors                  Four affiliate cards + top prospect performances
/profile/:userId         User profile — prediction, hot takes, comment history
/admin                   Admin-only — manage users, edit/delete content
```

### Home page composition (priority order)

1. **Live game hero** (when a game is live): score, inning, baserunner diamond, win prob chart, current matchup
2. **Next game card** (when no game live): countdown, probable pitchers, opponent record
3. **Last result card**: final score, brief recap, link to box score
4. **Shoutbox**: real-time family chat + auto big-moment cards
5. **Prediction leaderboard widget**: top 3 predictions vs current pace
6. **Recent news**: 5 most recent items

---

## 9. Predictions Mechanics

### Submission flow
1. User logs in, goes to `/predictions`
2. If they have no prediction: shown current standings, valid range, input field
3. They enter `predicted_wins`; client-side validates against current valid range
4. On submit, server re-validates against fresh standings (prevents stale-page edge cases)
5. Insert into `predictions` table with `team_record_at_submission` snapshot
6. Cannot edit or delete (RLS enforces); admin override available

### Leaderboard math

For every user with a prediction:

```
current_wins, current_losses = standings.brewers_record()
games_played = current_wins + current_losses
games_remaining = 162 - games_played

# Two metrics shown:
on_pace_wins = round((current_wins / games_played) * 162)
diff_to_prediction = predicted_wins - on_pace_wins
```

Sort by `abs(predicted_wins - on_pace_wins)` ascending (closest to current pace = "winning"). Display:
- Rank, display_name, predicted_wins, current pace projection, diff
- Submission date (publicly shown — late submitters are visibly labeled)
- Visual: prediction as a vertical line on a horizontal axis, current pace marker that animates as season progresses

### End-of-season resolution

When season ends (game 162 final), compute `abs(predicted_wins - actual_wins)` for each user. Lowest absolute diff wins. Tiebreaker: earliest submission. Display a season-end celebration page.

---

## 10. Social Features Detail

### Shoutbox
- Pinned to home page
- Last 50 messages by default, "load more" to paginate
- Realtime subscription on `comments WHERE game_id IS NULL`
- Auto big-moment cards inserted by poller render with special styling (Brewers gold border, emoji, player headshot)
- Reactions: emoji picker (limited set: 👏 🔥 😂 😢 ⚾ 🍺)

### Per-game threads
- On `/games/:id`, comment thread below box score
- Flat (no nesting) for simplicity
- Same reaction set
- "Mark as Hot Take" button on your own comments (one per game)

### Hot takes
- Visible on user profiles and game pages
- Season-end "Hot Take Hall of Fame" page: comments with most reactions, hot takes that aged best/worst (compared to game outcomes)

### Mentions
- Type `@displayname` in any comment
- Frontend autocomplete on profiles
- Insert into `mentions`; `notify-mentions` Edge Function emails the recipient
- User setting: enable/disable mention emails

### Big moments (auto-posts)
- Generated by poller (see §6)
- Render in shoutbox as special cards (not regular messages)
- Family can react but not reply
- Linked to game page

---

## 11. Visual Design Direction

### Palette
- **Primary navy:** `#13294B` (Brewers official navy) — used for nav, key surfaces
- **Brewers gold:** `#FFC52F` — accents, CTAs, highlights, the "fun" color
- **Neutral base:** `#FAFAFA` background, `#1A1A1A` text — keeps it modern, not dated
- **Semantic:** green for wins, red for losses, blue for live state

### Typography
- **Display:** Bricolage Grotesque or Space Grotesk — modern with personality
- **Body:** Inter
- **Numerals:** Tabular figures for all stats and scores

### Components / motifs
- **Baseball diamond** SVG for baserunners on live tracker
- **Vintage scoreboard** style for line scores (monospace numerals on dark background)
- **Power-ranking style** for prediction leaderboard
- **GitHub-contribution-style heatmap** for season schedule (W/L squares by date)
- **Subtle confetti** when Brewers win (one-time on home page after a W)
- **Card-based layouts** with soft shadows; avoid heavy borders

### Inspiration
The Athletic game pages, Baseball Savant, ESPN Gamecast (cleaner version), Linear/Vercel for general polish.

---

## 12. Admin Panel

A simple `/admin` route, gated by `profiles.is_admin = true`.

Functions:
- View all users (display name, email, joined date, prediction)
- Edit/delete any comment (soft delete)
- Edit any user's prediction (with audit log)
- View ingestion job statuses (last successful run for each)
- Trigger manual sync for any data type
- View poller status (proxied from Fly.io healthz endpoint)

---

## 13. Security & Privacy

- **Signup model: open registration to anyone with the URL.** Originally specced as
  invite-link-based with admin-generated one-time tokens. That was reversed
  early in Phase 1 because (a) the audience skews older / less technical and
  any extra registration step is a real cost, (b) the owner doesn't have
  every family member's current email, and addresses change, so an explicit
  allowlist is operational overhead, and (c) the data is low-stakes — Brewers
  predictions and shoutbox chatter, no real PII beyond display name. The URL
  is unlisted (circulated by family text/email, not indexed); RLS enforces
  that even an outsider who stumbles in can only read public data and write
  rows they own. If "open" ever feels too loose, an admin-approval queue
  (new users in `pending` until owner approves) is the cheap follow-up.
- **Auth method (Phase 1): Supabase magic link only.** Google OAuth is
  deferred to Phase 5 — running it cleanly requires a verified Google
  consent screen, which needs a real domain + privacy policy URL. Easier
  to do once the app is deployed than while we're still on `localhost`.
- All routes require auth except `/login`.
- RLS enabled on every table.
- Predictions: insert-once for own row; admin can override (Phase 5).
- Comments: own row mutable; admin can delete any.
- No PII stored beyond email (handled by Supabase auth) and display name.
- Avatars uploaded to Supabase Storage with size/type validation.

---

## 14. Phased Build Plan

### Phase 1 — Auth + Predictions (MVP)
- Supabase project setup, RLS policies
- React app skeleton, Tailwind config, Brewers theme
- Login page (Supabase magic link)
- Profile creation
- Standings ingestion (Edge Function, daily)
- Prediction form with valid-range validation
- Leaderboard page with on-pace projection
- Deploy to Vercel
**Deliverable:** Family can log in and predict; leaderboard updates daily.

### Phase 2 — Schedule + Game Results
- Schedule sync Edge Function
- `/schedule` page (calendar + list views)
- `/games/:id` page (recap mode for completed games)
- Standings page

### Phase 3 — Live Tracker + Shoutbox
- Fly.io poller service
- `live_game_state` Realtime subscription
- Live game hero on home page
- Shoutbox with Realtime
- Reactions

### Phase 4 — Player Stats + News + Minors
- Player stats sync
- `/players` and `/players/:id`
- News RSS aggregation
- `/news` and `/minors` pages

### Phase 5 — Bonus Features
- Hot takes
- Big moment auto-posts
- Mentions + email notifications
- Hot Take Hall of Fame
- Admin panel polish

### Phase 6 — End-of-Season
- Resolution page (winner announcement)
- Season recap stats
- Archive mode for offseason

---

## 15. Open Questions / Decisions Needed Later

- **Avatar uploads vs Gravatar vs initials?** Probably support all three — uploaded > Gravatar > initials fallback.
- **Email digests?** A weekly "Brewers This Week" email summarizing record, top performers, upcoming series, top family comments? Phase 5+ candidate.
- **Mobile push notifications?** Out of scope for v1. Could add PWA support later for "add to home screen" + web push for big moments.
- **Offseason mode?** What does the site look like Nov–Mar? Probably: final results displayed prominently, archived comments, countdown to next Opening Day, hot stove news section.
- **Prediction game year-over-year?** Add a `season` column to `predictions` from day one so year 2 just works.

---

## 16. Repo Structure Suggestion

```
brewers-family-hub/
├── web/                     # React + Vite frontend
│   ├── src/
│   ├── package.json
│   └── ...
├── poller/                  # Fly.io FastAPI service
│   ├── main.py
│   ├── ...
│   └── fly.toml
├── supabase/
│   ├── migrations/          # SQL migrations
│   ├── functions/           # Edge Functions
│   │   ├── sync-schedule/
│   │   ├── sync-standings/
│   │   └── ...
│   └── config.toml
├── docs/
│   ├── SPEC.md              # this doc
│   └── CLAUDE.md            # Claude Code project context
└── README.md
```

---

## 17. Estimated Costs (Monthly)

> See `docs/DEPLOYMENT.md` for the canonical cost breakdown. Summary:

| Service | Tier | Cost |
|---|---|---|
| Hetzner CX22 VPS | shared, 4GB RAM | ~$5 |
| Cloudflare DNS + proxy | Free | $0 |
| Supabase | Free | $0 (until ~500MB DB or 2GB egress) |
| GitHub Actions (private repo) | Free tier (2,000 min/mo) | $0 |
| GHCR storage | Free tier | $0 |
| Resend (email) | Free tier | $0 (3k emails/mo) |
| Domain | (your choice) | ~$1/mo amortized |
| **Total** | | **~$6/mo** |
