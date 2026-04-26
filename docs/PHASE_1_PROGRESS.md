# Phase 1 — Progress & Checkpoints

Living doc tracking what's done, what's next, and how to resume across Claude sessions. Update at the end of each session.

---

## Status: ✅ Phase 1 complete — auth, predictions, leaderboard, PWA all shipping. Deployment deferred. See `PHASE_2_KICKOFF.md` to start Phase 2.

Last updated: 2026-04-26

### Done

- [x] Read SPEC.md, CLAUDE.md, README.md, DEPLOYMENT.md, PHASE_1_KICKOFF.md
- [x] Validated Brewers team ID `158` against live MLB Stats API (Milwaukee Brewers, NL Central, American Family Field — confirmed)
- [x] Initialized git repo (`git init` in project root)
- [x] Initial commit landed: `675fcfb chore: initial scaffold (CLAUDE.md, SPEC.md, agents)`
- [x] Supabase project `brewers-family-hub` created in East US (N. Virginia)
- [x] Captured Supabase URL + publishable key to `.env.local` (gitignored)
- [x] Updated `.gitignore` to cover `**/.env.local` and `**/.env.*.local` patterns
- [x] Saved Supabase URL + publishable key to Claude memory
- [x] **Folder rename** — `horst-family-brewers` → `brewers-family-hub`; matching memory folder also renamed; persisted memory survived
- [x] **Task #3 (scaffold) — files in place**:
  - `web/` initialized with Vite 9 + **React 19** + TypeScript
  - Tailwind **v4** wired via `@tailwindcss/vite` plugin (CSS-first config — no `tailwind.config.js`)
  - Brewers design tokens (navy / gold / gold-deep / win / loss / live + neutrals) defined in `web/src/index.css` via `@theme`
  - Bricolage Grotesque (display) + Inter (body) loaded from Google Fonts; `tnum` font feature on
  - `web/src/lib/supabase.ts` created with env-var guard
  - `index.html`: title, `viewport-fit=cover` (iOS notch), `theme-color = navy`
  - `App.tsx` replaced with palette swatch placeholder
  - Vite scaffold demo files removed (`App.css`, hero/react/vite svgs, `icons.svg`)
- [x] `.env.local` moved from project root → `web/.env.local` (covered by Vite's default `*.local` gitignore)
- [x] `web/.env.example` added (safe to commit) for future contributors

- [x] **Task #3 smoke test** — Node upgraded to v24.15.0 via nvm-windows (after uninstalling prior MSI Node install). `npm run build` clean (191KB JS / 60KB gzip). `npm run dev` boots in 344ms. Page renders correctly in Chrome with Bricolage Grotesque headline, Inter body, and the three Brewers swatches.
- [x] **Task #3 committed** — `7a6d583 feat: scaffold web/ with Vite 9 + React 19 + Tailwind v4`
- [x] **Task #4 complete — `supabase/` skeleton**:
  - `supabase/config.toml` with `project_id = "vxnocwzuoctszydrtzbl"` (compatible with what `supabase init` would generate)
  - `supabase/README.md` documenting migration / function / RLS conventions from CLAUDE.md
  - `supabase/migrations/` and `supabase/functions/` directories with `.gitkeep`
  - **Supabase CLI not installed locally** — winget rolled back silently. Working through the Supabase MCP for Phase 1 (migrations, RLS, Edge Functions, type generation). CLI install can wait until Phase 3 when local function dev becomes useful.
- [x] **Task #5 complete — schema migration**:
  - `supabase-mcp-workflow` skill caught a project-ref mismatch in preflight: the credentials we'd been carrying pointed at `superloser-tracker`, not `brewers-family-hub`. Fixed across `web/.env.local`, `supabase/config.toml`, and the project memory file before any SQL ran. Correct ref is `vxnocwzuoctszydrtzbl` (us-east-1).
  - Migration `0001_phase1_schema` applied: 4 tables (`profiles`, `predictions`, `standings_snapshot`, `games`), all RLS-enabled, with policies per SPEC.md §13. Two triggers: `prevent_admin_self_promotion` (column-level guard on `is_admin`) and `validate_prediction_range` (server-side enforcement of SPEC §5 valid-range rule).
  - Migration `0002_lock_validate_prediction_range_search_path` applied to fix a `function_search_path_mutable` advisor finding (WARN-level). Pinned `search_path = public, pg_temp` on the prediction validator. Security advisor now clean (`lints: []`).
  - Generated `web/src/lib/database.types.ts` from the public schema. Verified it satisfies `GenericSchema` (gotcha #3 from the Supabase MCP workflow skill: `__InternalSupabase`, `Views`, `Functions`, `Relationships` all present).
  - Wired the Supabase client to use the generated types: `createClient<Database>` in `web/src/lib/supabase.ts`. `npx tsc -b` clean.

- [x] **Task #6 complete — sync-standings Edge Function** (commits `8817cf6`, `d213b67`)
  - MLB API shape live-validated. Daily cron (cron `0 13 * * *`) installed by Ryan in the Dashboard with the `x-cron-secret` header. Function returns 200 + parsed Brewers row in ~600ms; 401 on missing/wrong header.
  - Cadence corrected from initial "hourly" to "daily" mid-task: the PK collapses sub-daily runs anyway, and SPEC §14 already specced daily.
- [x] **Task #7 complete — frontend pages** (commits `8667d18`, `09526e2`, `298faaa`)
  - 7a — Routing scaffold + auth context + Layout shell with mobile bottom nav (≥56px touch targets, safe-area inset) and desktop top nav.
  - 7b — Magic-link login at `/login`, ProtectedRoute gate, sign-out in top nav + mobile pill. SPEC §13 updated to reflect open registration (allowlist dropped) and Google OAuth deferred to Phase 5 (needs verified consent screen, which needs a real domain + privacy policy).
  - 7c — Profile setup gate at `/profile/setup`, ProfileProvider/useProfile/ProfileGate plumbing.
  - 7d — Predictions page: live-validated form with the trigger-stamped `team_record_at_submission`, locked-in display when already submitted.
  - 7e — Leaderboard at `/predictions/leaderboard`: PostgREST embed of profiles into predictions, sort by closeness to on-pace projection per SPEC §9. Card-list (vertical-axis visualization deferred).
  - 7f — Home page polish skipped (the 7a card was already in good shape).
- [x] **Task #8 complete — PWA** (commit `375a19b`)
  - 8a — Source SVG icon (BFH navy/gold monogram) + generated icon set via `@vite-pwa/assets-generator`, manifest wired through `vite-plugin-pwa`.
  - 8b — Service worker with Workbox runtime caching (CacheFirst for Google Fonts, NetworkFirst with 5min TTL + 5s timeout for Supabase REST). Auth and Realtime intentionally fall through to NetworkOnly.
  - 8c — Mobile install hint banner. Android: captures `beforeinstallprompt`, shows gold "Install" button. iOS: explanatory hint pointing at Share → Add to Home Screen (no API on iOS). Dismissal persisted in localStorage.

### Deferred

- **Task #9 — formal manual end-to-end test pass.** Ryan tested every sub-step interactively as we built it. A formal cross-device pass is a good idea before sharing the link with family but doesn't need to gate Phase 2 work.
- **Task #10 — agent team phase review.** Skipped for now; Ryan is the only user so far and Phase 1 hasn't been deployed. Worth running before Phase 1 is shared with family or before Phase 3 (live tracker is the first user-facing feature where bugs would be visible to multiple people).
- **Vercel / Hetzner deployment.** Deferred until later phases ship. Phase 2 development happens locally; nothing in Phase 2 requires a deploy. Revisit at end of Phase 3 (when the FastAPI poller arrives — the poller needs a real host, not localhost).

---

## Lessons learned (carry these into Phase 2 and beyond)

- **Always preflight the Supabase MCP project ref** — the `supabase-mcp-workflow` skill caught that our captured credentials were pointing at a different project (`superloser-tracker`) before any migration ran. Trust `get_project`, not whatever ref happens to be in memory or env.
- **`verify_jwt: false` + custom header gate is the right pattern for cron-driven Edge Functions** under the new `sb_publishable_*` key format. ES256 signing breaks the gateway's `verify_jwt: true` mode silently. The `CRON_SECRET` in memory is reusable for any future cron function.
- **Migrations are immutable post-apply** — when the security advisor flagged `validate_prediction_range` for a mutable search_path, we shipped `0002` rather than editing `0001`. Build that habit; it scales.
- **vite-plugin-pwa lags Vite major versions on peer-deps.** It works fine, but you'll need `--legacy-peer-deps` to install on Vite 8+. Not a bug; just the upstream plugin's pace.
- **Step-by-step beats agent teams** for everything we did in Phase 1. The agent-team recipes in CLAUDE.md become useful starting Phase 3 (genuinely independent tracks). Keep the single-session habit by default.
- **Mobile-first is not an afterthought.** The 56px touch targets, the safe-area inset on the bottom nav, the install hint stacking math — all of that came from designing for 375px first and letting desktop fall out from there. Stay disciplined about this in Phase 2.

---

## Acceptance criteria progress (from PHASE_1_KICKOFF.md)

- [ ] Family members can sign up via an invite link
- [ ] Magic link login works on iOS Safari and Android Chrome
- [ ] A user with no prediction sees the prediction form on `/predictions`
- [ ] Valid range is computed server-side
- [ ] Submitting outside valid range shows a clear error
- [ ] After submission, the prediction is visible but cannot be edited or deleted
- [ ] `/predictions/leaderboard` shows everyone with on-pace + diff
- [ ] Submission date publicly visible on leaderboard
- [ ] Standings sync runs hourly via Edge Function
- [ ] Site works on a 375px-wide viewport
- [ ] PWA manifest in place; installable on iOS and Android
- [ ] All tables have RLS enabled with correct policies
- [ ] Phase reviewed by an agent team before merge to main

---

## Decisions log

- **Hosting deferred** — Phase 1 builds locally only. Hosting choice (Vercel vs. Hetzner VPS) revisited at end of phase per kickoff doc.
- **Brewers team ID 158 confirmed** — verified live against `https://statsapi.mlb.com/api/v1/teams/158`. Don't re-validate every session.
- **Publishable key format** — Ryan's project uses the new `sb_publishable_*` format (not legacy `eyJ...` JWT). The Supabase MCP and supabase-js v2 both support this seamlessly.
- **React 19 + Tailwind v4 (deviation from original CLAUDE.md)** — `create-vite` ships React 19 in 2026; we accepted that rather than downgrading. Tailwind v4 uses CSS-first config: tokens live in `web/src/index.css` as `@theme` variables, **no `tailwind.config.js`**. CLAUDE.md tech-stack table updated to match.
- **nvm-windows on a machine with prior MSI Node install** — nvm-windows manages versions by symlinking `C:\Program Files\nodejs` to its active version. If a prior official Node MSI is sitting at that path as a real directory, `nvm install` may "succeed" but `nvm use` silently fails to swap the symlink, and `node --version` keeps reporting the old version. Fix: uninstall the original Node from Settings → Apps, then `nvm install lts && nvm use <ver>` in **admin** PowerShell.
