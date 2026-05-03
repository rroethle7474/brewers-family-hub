# Phase 3 — Progress & Checkpoints

Living doc tracking what's done, what's next, and how to resume across
Claude sessions for Phase 3 (Live Tracker + Shoutbox). Update at the
end of each session.

---

## Status: 🚧 Setup in progress — decisions locked, pre-flight underway.

Last updated: 2026-04-28

### Hosting decision (resolved)

- [x] Path A — Hetzner VPS, **deployed via Coolify** (not the hand-rolled
      Caddy + GitHub Actions stack described in `docs/DEPLOYMENT.md`)
- [ ] Path B — Fly.io interim shim
- **Decided:** Path A, on the existing Coolify v4.0.0-beta.474 box at
  `178.156.219.107` that already runs SuperLoser. No new Hetzner server.
- **Reasoning:** Coolify is a self-hosted PaaS purpose-built for
  multi-app hosting on a single VPS. SuperLoser is the existence proof
  of the pattern on this same box: bare `Dockerfile` + `nginx.conf` in
  the repo, Coolify pulls from GitHub, builds, deploys, and terminates
  TLS via Traefik + Let's Encrypt. brewers mirrors this. Avoids
  duplicating infra + collapses Phase 3 deploy from "hand-roll Caddy +
  GHA workflow + Origin Certs" to "add app in Coolify UI, point at
  repo." `docs/DEPLOYMENT.md` is now partly obsolete; ADR
  `0001-coolify-deploy.md` to be written before merge.

### Other locked decisions

- [x] **Live-feed polling interval:** 30s (SPEC §6 floor; MLB-StatsAPI
      examples sit at 10–30s; no reason to push faster).
- [x] **Domain:** `horstbrewerhub.com` — purchased 2026-04-28 through
      Cloudflare (DNS already on Cloudflare). Subdomain TBD; default to
      apex.
- [x] **TLS pattern:** Coolify-managed Let's Encrypt + Cloudflare
      DNS-only (gray cloud). Confirmed by inspecting SuperLoser's cert
      (issuer "R13" = Let's Encrypt; no CF in path). CF proxy can be
      flipped on later if we want CDN/DDoS.
- [x] **Empty `HorstFamilyHub` Hetzner project:** to be deleted or kept
      as an organizational scope only. Not used for hosting.

### Done

- [x] **Phase 2 cron pre-flight backfill (2026-04-28).** Manually invoked
      `sync-schedule` (39 games upserted, window 2026-04-14 → 2026-05-28)
      and `sync-standings` (30 rows for today). Discovered Phase 2's
      Dashboard cron schedules were never installed (PHASE_2_PROGRESS.md
      had it as a "Action for Ryan" follow-up that never happened).
      `games.updated_at` now < 1 min; `standings_snapshot` has today's
      rows. The 4/27 historical standings gap is irrecoverable but
      harmless (page only reads the latest snapshot).
- [x] **Migration `0003_phase3_live_and_social.sql` applied.** Four
      tables (`live_game_state`, `big_moments`, `comments`, `reactions`),
      all with RLS, all on the `supabase_realtime` publication. 2000-char
      comment cap (vs. kickoff doc's 500 — Ryan's product call this
      session). `comments_shoutbox_created_idx` added as a partial
      index optimizing the most common shoutbox query. Soft-delete +
      partial unique on hot takes intact. `database.types.ts`
      regenerated and `tsc --noEmit` clean.
- [x] **Security advisor sweep post-migration:** no findings on the four
      new tables. Two pre-existing Phase 1 warnings surfaced
      (`prevent_admin_self_promotion()` exposed via `/rest/v1/rpc`).
      Tracked as a separate task — not blocking Phase 3.
- [x] **Poller skeleton built and validated locally (`poller/`).** FastAPI
      app + state machine (`poller_loop.py` IDLE↔ACTIVE), pure detection
      (`big_moments.py`, `live_state.py`), single MLB wrapper
      (`mlb_client.py`), service-role Supabase client. uv-managed; 20/20
      detection tests pass. Booted locally against real Supabase + real
      MLB API: IDLE tick correctly found today's gamePk and stayed IDLE
      because today's Brewers game was already Final. No spurious writes.
      Four bugs caught and fixed in the trust-but-verify pass:
      (a) first-tick-on-ACTIVE was replaying every historical play — now
      seeds `prev_play_ids` from the feed at IDLE→ACTIVE transition,
      (b) `updated_at` was sent as the literal string `"now()"` to
      PostgREST — now stamped with `datetime.now(timezone.utc).isoformat()`
      since UPSERT-as-UPDATE doesn't fire column DEFAULT,
      (c) `statsapi.schedule(teamId=…)` raised TypeError — the package
      uses `team=`, not `teamId=` (caught immediately at first boot),
      (d) tenacity retried on bare `Exception` and burned 3 attempts on
      the TypeError above — now restricted to ConnectionError /
      TimeoutError / httpx.HTTPError so programming bugs fail fast.
- [x] **Local env-file split corrected.** Service-role key was initially
      pasted into `web/.env.local`; moved to `poller/.env.local` (where
      pydantic-settings reads it). `web/.env.local` now holds only the
      publishable anon key. Both files gitignored and unstaged. Header
      comments updated in both to make the boundary self-documenting.
- [x] **`web/` containerized for Coolify.** `Dockerfile` (multi-stage
      Node 20 → Nginx alpine, with `VITE_SUPABASE_URL` +
      `VITE_SUPABASE_ANON_KEY` build args inlined at build time),
      `nginx.conf` (SPA fallback, immutable `/assets/` cache, no-cache
      for `sw.js`/`registerSW.js`/`manifest.webmanifest`/`index.html`,
      gzip on text payloads), `.dockerignore` (excludes `.env*`,
      `node_modules`, `dist`, `.git`). Mirrors SuperLoser's
      Coolify-friendly pattern. Container listens on port 80 plain
      HTTP; Coolify's Traefik handles TLS at the proxy.
- [x] **`poller/` containerized for Coolify.** `Dockerfile` (single-stage
      on Astral's `uv:python3.11-bookworm-slim` — uv pre-installed; deps
      cached as a separate layer via `uv sync --frozen --no-dev
      --no-install-project`, then project install). Port 8000.
      `--workers 1` enforced in CMD per the in-memory-state requirement.
      `.dockerignore` excludes `.venv` (huge + wrong-platform — Windows
      venv into a Linux image would break or bloat), `tests/`, `.env*`,
      `.git`, etc. Coolify will run this as an always-on container with
      no public domain; outbound traffic only (MLB Stats API + Supabase).

### Deferred / blocked

- [ ] **End-to-end ACTIVE-path validation against a live game.** Detectors
      have synthetic-fixture unit tests; live-feed + Supabase write +
      Realtime push integration is unverified until the next Brewers
      game in progress. Low risk — detection logic is pure and tested.
- [ ] **Install Dashboard cron schedules for `sync-schedule` and
      `sync-standings`** (Ryan, in-Dashboard). Cron `0 13 * * *`,
      header `x-cron-secret: <CRON_SECRET>`. Tracked as a separate
      task. Without this, both will go stale again after one day.
- [ ] **Future: migrate cron schedules to a pg_cron + pg_net SQL
      migration** so they live in version control. Worth doing when
      we have ≥4 cron jobs. Phase 3's poller uses a different
      mechanism entirely (always-on Docker container), so this isn't
      load-bearing for Phase 3.

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
