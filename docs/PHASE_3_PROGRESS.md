# Phase 3 — Progress & Checkpoints

Living doc tracking what's done, what's next, and how to resume across
Claude sessions for Phase 3 (Live Tracker + Shoutbox). Update at the
end of each session.

---

## Status: 🚧 Steps 1–7 complete (deploys live). Next: step 8 (Shoutbox + reactions + big-moment cards).

Last updated: 2026-05-03

### Hosting decision (resolved)

- [x] Path A — Hetzner VPS, **deployed via Coolify** (not the hand-rolled
      Caddy + GitHub Actions stack described in `docs/DEPLOYMENT.md`)
- [ ] Path B — Fly.io interim shim
- **Decided:** Path A, on the existing Coolify v4.0.0-beta.474 box at
  `178.156.219.107` that already runs SuperLoser. No new Hetzner server.
- **Reasoning:** Coolify is a self-hosted PaaS purpose-built for
  multi-app hosting on a single VPS. SuperLoser proved the pattern on
  this same box: bare `Dockerfile` + `nginx.conf` in the repo, Coolify
  pulls from GitHub, builds, deploys, and terminates TLS via Traefik +
  Let's Encrypt. Avoided duplicating infra and collapsed Phase 3 deploy
  from "hand-roll Caddy + GHA workflow + Origin Certs" to "add app in
  Coolify UI, point at repo." `docs/DEPLOYMENT.md` is now partly
  obsolete; ADR `0001-coolify-deploy.md` to be written before merge
  (task #1).

### Other locked decisions

- [x] **Live-feed polling interval:** 30s active / 60s idle (SPEC §6
      floor; MLB-StatsAPI examples sit at 10–30s; no reason to push
      faster).
- [x] **Domain:** `horstbrewerhub.com` — purchased 2026-04-28 through
      Cloudflare. DNS-only (gray cloud) for first deploy so Coolify's
      Let's Encrypt HTTP-01 challenge isn't intercepted by CF proxy.
- [x] **TLS pattern:** Coolify-managed Let's Encrypt + Cloudflare
      DNS-only. Confirmed against SuperLoser's cert (issuer "R13" =
      Let's Encrypt). CF proxy can be flipped on later if we want
      CDN/DDoS.
- [x] **Comment body cap:** 2000 chars (kickoff doc said 500; family
      chat needs longer rambles per Ryan's product call this session).
- [x] **Empty `HorstFamilyHub` Hetzner project:** to be deleted or kept
      as an organizational scope only. Not used for hosting.

### Done

- [x] **Phase 2 cron pre-flight backfill (2026-04-28).** Manually invoked
      `sync-schedule` (39 games upserted, window 2026-04-14 → 2026-05-28)
      and `sync-standings` (30 rows for today). Discovered Phase 2's
      Dashboard cron schedules were never installed (PHASE_2_PROGRESS.md
      had it as a "Action for Ryan" follow-up that never happened).
      The 4/27 historical standings gap is irrecoverable but harmless
      (page only reads the latest snapshot). Schedule install tracked
      as task #10.
- [x] **Migration `0003_phase3_live_and_social.sql` applied.** Four
      tables (`live_game_state`, `big_moments`, `comments`, `reactions`),
      all with RLS, all on the `supabase_realtime` publication. 2000-char
      comment cap. `comments_shoutbox_created_idx` partial index added
      for the most common query (newest 50 where `game_id is null and
      deleted_at is null`). Soft-delete + partial unique on hot takes
      intact. `web/src/lib/database.types.ts` regenerated and
      `tsc --noEmit` clean.
- [x] **Security advisor sweep post-migration:** no findings on the four
      new tables. Two pre-existing Phase 1 warnings surfaced
      (`prevent_admin_self_promotion()` exposed via `/rest/v1/rpc`).
      Tracked as task #11 — not blocking.
- [x] **Poller skeleton built and validated locally (`poller/`).** FastAPI
      app + state machine (`poller_loop.py` IDLE↔ACTIVE), pure detection
      (`big_moments.py`, `live_state.py`), single MLB wrapper
      (`mlb_client.py`), service-role Supabase client. uv-managed; 20/20
      detection tests pass. Booted locally against real Supabase + real
      MLB API: IDLE tick correctly found today's gamePk and stayed IDLE
      because today's Brewers game was already Final. Four bugs caught
      and fixed in trust-but-verify pass:
      (a) first-tick-on-ACTIVE was replaying every historical play —
          now seeds `prev_play_ids` from the feed at IDLE→ACTIVE.
      (b) `updated_at` was sent as the literal string `"now()"` to
          PostgREST — now stamped with `datetime.now(timezone.utc).isoformat()`
          since UPSERT-as-UPDATE doesn't fire column DEFAULT.
      (c) `statsapi.schedule(teamId=…)` raised TypeError — the package
          uses `team=`, not `teamId=` (caught immediately at first boot).
      (d) tenacity retried on bare `Exception` and burned 3 attempts on
          the TypeError above — now restricted to ConnectionError /
          TimeoutError / httpx.HTTPError so programming bugs fail fast.
- [x] **Local env-file split corrected.** Service-role key was initially
      pasted into `web/.env.local`; moved to `poller/.env.local` (where
      pydantic-settings reads it). `web/.env.local` now holds only the
      publishable anon key. Both gitignored and unstaged. Header comments
      updated in both to make the boundary self-documenting.
- [x] **`web/` containerized for Coolify.** `Dockerfile` (multi-stage
      Node 20 → Nginx alpine, with `VITE_SUPABASE_URL` +
      `VITE_SUPABASE_ANON_KEY` build args inlined at build time),
      `nginx.conf` (SPA fallback, immutable `/assets/` cache, no-cache
      for `sw.js`/`registerSW.js`/`manifest.webmanifest`/`index.html`,
      gzip on text payloads), `.dockerignore` (excludes `.env*`,
      `node_modules`, `dist`, `.git`).
- [x] **`poller/` containerized for Coolify.** `Dockerfile` (single-stage
      on Astral's `uv:python3.11-bookworm-slim`; deps cached as a
      separate layer via `uv sync --frozen --no-dev --no-install-project`,
      then project install). Port 8000. `--workers 1` enforced in CMD per
      the in-memory-state requirement. `.dockerignore` excludes `.venv`,
      `tests/`, `.env*`, `.git`.
- [x] **Both apps deployed to Coolify (2026-05-03).** Web live at
      `https://horstbrewerhub.com` (Coolify Let's Encrypt cert,
      Cloudflare DNS-only). Poller running with no public domain,
      writing `live_game_state` every 30s during today's Brewers game
      (gamePk 822742). End-to-end ACTIVE-path verified via Supabase API
      logs: continuous 200s from python-httpx after the cutover. Two
      fixes required en route, both tracked separately:
      - **(a)** `npm ci --legacy-peer-deps` for vite-plugin-pwa@1.2.0 vs
        vite@8 peer conflict (task #12).
      - **(b)** Coolify v4 has a per-row Update button on env vars and
        clicking the one *above the row you edited* doesn't update the
        row below — saves the wrong field silently. ~30 min lost
        chasing this as a key/code issue. Lesson: after editing an env
        var, click the Update button attached *to that specific row*.
- [x] **Task #13 fixed (2026-05-03).** Magic-link auth redirected to
      `http://localhost:5173` from production. Root cause was Supabase
      Dashboard → Auth → URL Configuration: Site URL still pinned to
      localhost from Phase 1 and `https://horstbrewerhub.com/**` was
      not in the Redirect URLs allow-list, so `emailRedirectTo` was
      silently rejected and Supabase fell back to Site URL. Code in
      `web/src/routes/Login.tsx:36,53` was already correct
      (`emailRedirectTo: \`${window.location.origin}/\``). Pure
      Dashboard fix; no code change. Verified: prod sign-in works,
      local dev sign-in still works.
- [x] **Step 7 — LiveGameHero on Home (2026-05-03).** Slim NextGameStrip
      and full live-tracker hero now render at the top of `/`. Six new
      modules in `web/src/components/LiveGameHero/`:
      - `useLiveGameState.ts` — initial fetch + Realtime
        `postgres_changes` subscription on `live_game_state` filtered
        by `game_id`. Subscribes eagerly even on Scheduled games so the
        UI auto-flips to live the moment the poller writes the first
        row, no refresh needed.
      - `LiveGameHero.tsx` — orchestrator: picks today's game (any
        status) or the next future Scheduled game, mode-switches
        between FullHero and NextGameStrip. Returns `null` when there
        is no current/upcoming game (off-season per Ryan's product
        call).
      - `Scoreboard.tsx` — pulsing LIVE dot + inning + B-S-O count +
        two team rows (Brewers row gold-accented, leading team
        brightened, batting team marked).
      - `BaserunnerDiamond.tsx` — pure 100×100 viewBox SVG; lit bases
        from the `bases` jsonb shape `{first, second, third}`.
      - `WinProbabilitySparkline.tsx` — Recharts AreaChart of last N
        plays' `brewersWP × 100`, gold gradient fill, 50% reference
        line, no axes/tooltip (it's a hero, not an analytics chart).
      - `NextGameStrip.tsx` — slim variant: today-Scheduled
        (countdown), today-Final (Won/Lost X-Y), today-Postponed,
        future-Scheduled (date + time). Always tappable → game detail.
      Bumped `poller/live_state.py` `RECENT_PLAYS_COUNT` 20 → 30 to
      match Phase 3 sparkline window. Installed `recharts` +
      `react-is` (with `--legacy-peer-deps`). Verified end-to-end at
      375px: NextGameStrip "Today + Scheduled" branch rendered
      correctly for today's MIL @ WSH game, console clean, click-
      through routes to `/games/:gamePk`. **FullHero mode unverified
      under live conditions** — game.status hasn't been refreshed by
      `sync-schedule` (task #10), so the strip showed "Scheduled" even
      though the 12:35 PM game was already in progress. The hook +
      mode-switch logic are correct; they just couldn't be exercised
      against today's live data without manually invoking the cron.
      Two new follow-ups generated: tasks #14 (lazy-load recharts —
      bundle hit 784 KB / 229 KB gzipped), #15 (PWA meta deprecation
      in `web/index.html:13`).

### Deferred / blocked

_(none currently — task #13 closed; backlog tracked in the cross-task
index below.)_

### Lessons learned (carry into Phase 4)

- **Coolify v4-beta env-var UI has per-row Update buttons.** When you
  edit a row, click the Update button attached *to that row*, not a
  Save/Update button elsewhere on the page. Otherwise the change
  doesn't persist and the symptom (HTTP 401, write failures) looks
  like a code or key bug. ~30 min sunk on this; would have been caught
  in 30 seconds by clicking Reveal on the env var in the Coolify UI to
  visually confirm what got saved.
- **Trust-but-verify on subagent output catches bugs early.** The
  poller skeleton came back from `mlb-data-engineer` with 4 real bugs
  that 20 passing unit tests didn't expose: kwarg mismatch, retry
  scope, replay-on-startup, and the `"now()"` string sent to
  PostgREST. None would have surfaced until first live use.
- **Vite + vite-plugin-pwa peer-dep mismatch is a Coolify-specific
  trap.** `npm install` (looser) accepts it locally, but Coolify uses
  `npm ci` which enforces peer deps strictly. Result: builds work
  locally, fail in CI. Fix is `--legacy-peer-deps`; cleanup is task #12.
- **Supabase has both legacy JWT and new sb_secret_* / sb_publishable_*
  formats active simultaneously.** The new formats are recommended
  going forward; legacy is still accepted for backward compat. Both
  work with supabase-py 2.29; the env var name (`SUPABASE_SERVICE_ROLE_KEY`)
  doesn't change between formats. The new format is much shorter
  (~40 chars vs 218) and less prone to copy-paste damage.
- **`pydantic-settings` env-var precedence:** `os.environ` > `.env.local`
  > `.env` > field defaults. So Coolify's runtime env always wins over
  any baked-in `.env` file (which we don't ship anyway via
  `.dockerignore`).
- **Supabase Auth's "Site URL" is the silent fallback for magic-link
  redirects.** `emailRedirectTo` in the client is only honored if the
  origin matches the Redirect URLs allow-list. If it doesn't match,
  Supabase silently falls back to Site URL — no error, no warning. So
  a missing prod URL in the allow-list looks identical to "the code
  has localhost hardcoded somewhere." When debugging redirect issues,
  check Dashboard config FIRST before grepping code (~30 min would
  have been saved here).
- **Recharts pulls a peer dep on `react-is` that npm doesn't auto-
  install.** Vite's optimizer fails the page load with
  "Failed to resolve import `react-is`" until you `npm i react-is`
  explicitly. After installing, blow away `node_modules/.vite/` and
  restart the dev server — the optimizer caches the failure.
- **Vite chunk-size warning at 500 KB is genuine.** Recharts adds
  ~150 KB to the main bundle; we're now at 784 KB / 229 KB gzipped.
  Lazy-loading WinProbabilitySparkline via dynamic import would let
  off-day visitors skip the chart bundle entirely. Tracked as task #14.

---

## Acceptance criteria progress (from PHASE_3_KICKOFF.md)

- [x] `live_game_state`, `big_moments`, `comments`, `reactions` tables
      created with RLS enabled and policies per SPEC §13
- [x] Realtime publication enabled on all four tables
- [x] Poller deploys as a Docker image; runs on the chosen host;
      polls 30s during live games; sleeps until next scheduled game
- [x] Big moment detection: home_run, lead_change, wp_swing ≥ 15pp,
      walkoff (20/20 unit tests pass; live emission unverified — no
      qualifying moments fired during initial integration window)
- [x] Home page live hero: score + inning + baserunner diamond +
      win-probability sparkline; updates without manual refresh
      **(step 7 done; FullHero mode unverified under live conditions —
      needs `sync-schedule` cron for live game.status)**
- [ ] Shoutbox: last 50 comments, "load more" pagination, Realtime
      append **(step 8 — next)**
- [ ] Auto big-moment cards render with gold-bordered styling, link
      to `/games/:gamePk` **(step 8)**
- [ ] Reactions: 👏 🔥 😂 😢 ⚾ 🍺 picker, one-per-user-per-emoji-per-
      comment, optimistic update **(step 8)**
- [ ] Mobile-first at 375px; PWA still installs cleanly
      **(verified during step 9 review)**
- [x] `get_advisors` security findings clean on the new tables
- [ ] Phase reviewed by Recipe 3 team before merge to main **(step 9)**

---

## Resume from here — start of next session

1. **Phase 3 step 8 — Shoutbox + reactions + auto big-moment cards.**
   Owns `web/src/components/Shoutbox/`. Subscribes to `comments` via
   Realtime, renders last 50 with "load more" pagination, optimistic
   compose. Auto big-moment cards: when a row appears in `big_moments`,
   render a gold-bordered card in-line in the shoutbox feed linking to
   `/games/:gamePk`. Reactions: 👏 🔥 😂 😢 ⚾ 🍺 picker, one-per-user-
   per-emoji-per-comment, optimistic.

2. **Then step 9 — Recipe 3 review team** (mandatory — see kickoff doc).

3. **At some point soon, install the cron schedules (task #10).**
   Without them, today's `games.status` doesn't refresh from MLB and
   the LiveGameHero's FullHero mode never gets exercised in the wild.
   Closing #10 also fixes the standings-stale-since-April-28 issue.

---

## Decisions log

- **Path A (Coolify on existing Hetzner box) over Path B (Fly.io shim).**
  See "Hosting decision" above. ADR `0001-coolify-deploy.md` to be
  written (task #1).
- **2000-char comment cap** (vs kickoff doc's 500). Family chat needs
  room for longer game-recap rants.
- **Partial unique index `one_hot_take_per_user_per_game`** carves out
  soft-deleted rows so a user can retract a flubbed hot take and post
  a new one in the same game.
- **`--legacy-peer-deps` on `npm ci` in `web/Dockerfile`** to bypass
  `vite-plugin-pwa@1.2.0` peer-vite-≤7 vs `vite@8` mismatch. Drop the
  flag once vite-plugin-pwa supports vite@8 (task #12).
- **Off-season Home renders nothing above the welcome card** (vs.
  showing "Spring training starts in N days" or similar). Phase 6
  (offseason mode) will revisit; for now silence is better than fake
  state.
- **Subscribe to `live_game_state` eagerly even on Scheduled games.**
  Lets the NextGameStrip auto-flip to FullHero the moment the poller
  writes the first row at game start — no refresh needed. Cost is one
  Realtime channel per Home page load while waiting for first pitch;
  acceptable for a family-only audience.

---

## Open follow-ups (cross-task index)

| # | Task | Why |
|---|---|---|
| 1 | Write ADR 0001 — Coolify deploy pivot | Document the deviation from `docs/DEPLOYMENT.md`. |
| 10 | Install Dashboard cron schedules for sync-schedule + sync-standings | Phase 2 follow-up. Without it, `games` and `standings_snapshot` will go stale daily. |
| 11 | Revoke EXECUTE on Phase 1 SECURITY DEFINER trigger fns | Pre-existing advisor warnings on `prevent_admin_self_promotion` exposed via `/rest/v1/rpc`. |
| 12 | Drop `--legacy-peer-deps` when vite-plugin-pwa supports Vite 8 | Cleaner build. Currently a workaround. |
| 13 | ~~Magic-link auth redirects to localhost in production~~ | ✅ Closed 2026-05-03. Pure Supabase Dashboard fix (Site URL + Redirect URLs allow-list). |
| 14 | Lazy-load `WinProbabilitySparkline` (recharts) via dynamic import | Bundle hit 784 KB / 229 KB gzipped after recharts. Off-day visitors don't need the chart. |
| 15 | Replace deprecated `<meta name="apple-mobile-web-app-capable">` in `web/index.html:13` with the modern `<meta name="mobile-web-app-capable">` (keeping the apple- prefixed version alongside per current iOS recommendation). | Console deprecation warning. One-line change. |
