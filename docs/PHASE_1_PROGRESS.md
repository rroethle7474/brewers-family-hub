# Phase 1 — Progress & Checkpoints

Living doc tracking what's done, what's next, and how to resume across Claude sessions. Update at the end of each session.

---

## Status: ⏸ Paused mid-pre-flight (folder rename pending)

Last updated: 2026-04-26

### Done

- [x] Read SPEC.md, CLAUDE.md, README.md, DEPLOYMENT.md, PHASE_1_KICKOFF.md
- [x] Validated Brewers team ID `158` against live MLB Stats API (Milwaukee Brewers, NL Central, American Family Field — confirmed)
- [x] Initialized git repo (`git init` in project root)
- [x] Initial commit landed: `675fcfb chore: initial scaffold (CLAUDE.md, SPEC.md, agents)`
- [x] Supabase project `brewers-family-hub` created in East US (N. Virginia)
- [x] Captured Supabase URL + publishable key to `.env.local` (root, gitignored)
- [x] Updated `.gitignore` to cover `**/.env.local` and `**/.env.*.local` patterns
- [x] Saved Supabase URL + publishable key to Claude memory (so resume works even if `.env.local` is lost)
- [x] Phase 1 task list seeded in Claude's task tracker (10 tasks)

### Next up

- [ ] **Folder rename** — Ryan renames `horst-family-brewers` → `brewers-family-hub` (see resume instructions below)
- [ ] Scaffold `web/` with Vite + React 18 + TypeScript + Tailwind (task #3)
- [ ] Move `.env.local` from project root → `web/.env.local`
- [ ] Scaffold `supabase/` directory structure (task #4)
- [ ] Schema migration via `supabase-agent` (task #5)
- [ ] Edge Function: `sync-standings` (task #6)
- [ ] Frontend pages: login, predictions, leaderboard, home (task #7)
- [ ] PWA manifest + service worker (task #8)
- [ ] Manual end-to-end test (task #9)
- [ ] Spawn 3-teammate phase-review team — Recipe 3 (task #10)

---

## Resume instructions (for the next Claude session)

### Step 1 — Rename the project folder

In Windows File Explorer or PowerShell, with VS Code and Claude **closed**:

```powershell
Rename-Item "C:\Users\rroet\source\horst-family-brewers" "brewers-family-hub"
```

### Step 2 — Rename the Claude memory folder so persistent notes survive

The memory directory is keyed to the project path. Without this rename, Claude loses every fact saved during the first session.

```powershell
Rename-Item "C:\Users\rroet\.claude\projects\C--Users-rroet-source-horst-family-brewers" "C--Users-rroet-source-brewers-family-hub"
```

### Step 3 — Reopen and resume

1. Open VS Code in the new folder: `code C:\Users\rroet\source\brewers-family-hub`
2. Start Claude Code (`claude` in the integrated terminal)
3. Paste this prompt:

> Resuming Phase 1 of Brewers Family Hub. Read `docs/PHASE_1_PROGRESS.md` for where we left off. Confirm `.env.local` still has the Supabase URL + publishable key (and is gitignored), then proceed to task #3 — scaffolding `web/` with Vite + React + TypeScript + Tailwind.

That's it. Claude will pick up from task #3.

### Sanity checks Claude should run on resume

- `git -C . log --oneline` → should show the `675fcfb` initial scaffold commit
- `git -C . check-ignore -v .env.local` → should show it's matched by `.gitignore`
- `cat .env.local` (or equivalent) → should have `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- Read `MEMORY.md` from the renamed memory folder → should have the Supabase project entry

If memory is missing, the values are also recoverable from `.env.local`.

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
