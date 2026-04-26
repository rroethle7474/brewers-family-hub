# Phase 1 — Progress & Checkpoints

Living doc tracking what's done, what's next, and how to resume across Claude sessions. Update at the end of each session.

---

## Status: 🟢 Task #3 complete — scaffold verified, ready for task #4

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

### Next up

- [ ] Scaffold `supabase/` directory structure (task #4)
- [ ] Schema migration via `supabase-agent` (task #5)
- [ ] Edge Function: `sync-standings` (task #6)
- [ ] Frontend pages: login, predictions, leaderboard, home (task #7)
- [ ] PWA manifest + service worker (task #8)
- [ ] Manual end-to-end test (task #9)
- [ ] Spawn 3-teammate phase-review team — Recipe 3 (task #10)

---

## Resume instructions (for the next Claude session)

We're picking up mid-task-#3 after a Node upgrade. The scaffold is on disk; only the smoke test remains for #3.

### Step 1 — Confirm Node ≥ 22.12 is active

In the new terminal:

```bash
node --version    # expect v22.12.x or higher
```

If still showing 22.9 or older, see "Decisions log → nvm-windows on a machine with prior MSI Node install" below.

### Step 2 — Paste this prompt to Claude

> Resuming Phase 1 of Brewers Family Hub at task #3 smoke test. Read `docs/PHASE_1_PROGRESS.md` for context. From `web/`, run `npm install` (lockfile may need rebuilding now that Node is current) then `npm run dev` and confirm the page loads at the dev URL. Then move on to task #4 (scaffold `supabase/`).

### Sanity checks Claude should run on resume

- `node --version` → ≥ 22.12.0
- `git log --oneline` → should show at least `675fcfb` and `85a8f91`
- `git check-ignore -v web/.env.local` → matched by `web/.gitignore` (`*.local`)
- `cat web/.env.local` → has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- Read `MEMORY.md` → should have the Supabase project entry

If `web/.env.local` is missing, restore it from the values in the Supabase project memory entry.

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
