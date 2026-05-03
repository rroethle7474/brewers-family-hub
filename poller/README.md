# Brewers Family Hub — Live Game Poller

FastAPI service that polls the MLB Stats API every 30 seconds during
live Brewers games, writes `live_game_state` to Supabase, and detects
big moments (home runs, lead changes, WP swings, walk-offs).

## Prerequisites

- Python 3.11+
- [uv](https://docs.astral.sh/uv/) for dependency management

Install uv if you don't have it:

```bash
pip install uv
# or
pipx install uv
```

## Local development

1. Copy the env example and fill in your real service-role key:

   ```bash
   cp .env.example .env.local
   # Edit .env.local — add your SUPABASE_SERVICE_ROLE_KEY from:
   # Supabase dashboard > Project Settings > API > service_role (secret)
   ```

   `.env.local` is gitignored. Never commit a real service-role key.

2. Install dependencies:

   ```bash
   cd poller/
   uv sync
   ```

3. Run the server (exactly one worker — see note below):

   ```bash
   uv run uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1 --reload
   ```

4. Verify it's alive:

   ```bash
   curl http://localhost:8000/healthz
   # {"ok":true}

   curl http://localhost:8000/status
   # {"mode":"IDLE","game_pk":null,...}
   ```

## Running tests

```bash
uv run pytest -q
```

All tests are pure Python — no MLB API calls, no DB calls.

## SINGLE WORKER REQUIREMENT

**Always run with `--workers 1`.** The poller holds in-memory state per
game (previous snapshot, set of already-seen play IDs). If multiple
workers ran in the same process group, each would maintain an independent
snapshot and emit duplicate `big_moments` rows on every polling interval.
The Dockerfile enforces this. Do not override it.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `SUPABASE_URL` | (required) | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | (required) | Service-role key (bypasses RLS) |
| `LOG_LEVEL` | `info` | Python logging level |
| `BREWERS_TEAM_ID` | `158` | MLB team ID — hardcoded but overrideable |
| `IDLE_POLL_INTERVAL` | `60` | Seconds between schedule checks when no game is live |
| `ACTIVE_POLL_INTERVAL` | `30` | Seconds between live-feed polls during a game |
| `WP_SWING_THRESHOLD` | `0.15` | Minimum WP change (0–1 scale) to emit a `wp_swing` big moment |

In production (Coolify / Docker Compose), set these as environment
variables in the service config. Do not mount a `.env` file in prod.

## State machine

```
IDLE  --(game found, not Final)--> ACTIVE
ACTIVE --(game.status == Final)--> IDLE
```

IDLE ticks every `IDLE_POLL_INTERVAL` seconds. ACTIVE ticks every
`ACTIVE_POLL_INTERVAL` seconds. Both transitions run at the next tick;
there is no immediate wake-up on game-start (max latency = IDLE interval).

## Known limitations (v1)

- **Crash-dropped detections:** If the poller process crashes mid-poll,
  the in-memory previous snapshot is lost. On restart, the first ACTIVE
  tick treats all existing plays as "new" for home-run detection but
  skips lead-change and WP-swing detection (they require a prior snapshot).
  This means a crash could produce duplicate home-run big moments on the
  next poll. Acceptable for v1; a future fix would checkpoint the last
  seen play ID to the DB.

- **Doubleheaders:** `find_brewers_game_today()` returns the first
  non-Final game of the day. If game 1 is Final and game 2 is upcoming,
  it returns game 2. If both are Final, it returns the last game. Works
  for the 99% case.

- **MLB API WP data:** Win probability is not available in pre-game or
  very early in a game. The poller handles None WP gracefully; WP-swing
  detection simply does not fire until both prev and curr have values.

- **MLB live feed endpoint:** Uses `statsapi.get("game", ...)` which maps
  to `/api/v1.1/game/{gamePk}/feed/live`. The `MLB-StatsAPI` package
  abstracts this. If the MLB API schema changes significantly, update
  `mlb_client.py` and the field-extraction helpers in `live_state.py`.

## File structure

```
poller/
├── main.py            # FastAPI app + /healthz + /status; starts poller_loop task
├── config.py          # pydantic-settings; single Settings() instance
├── supabase_client.py # Service-role Supabase client singleton
├── mlb_client.py      # MLB API wrapper (ONLY file that imports statsapi)
├── live_state.py      # Pure: MLB feed dict -> LiveGameStateRow pydantic model
├── big_moments.py     # Pure: detection functions, returns list[BigMomentRow]
├── poller_loop.py     # Async state machine (IDLE/ACTIVE); writes to Supabase
├── pyproject.toml
├── .env.example       # Template — copy to .env.local with real values
├── .gitignore
└── tests/
    ├── conftest.py        # Synthetic fixtures (no I/O)
    └── test_big_moments.py
```
