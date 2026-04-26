# Brewers Family Hub — Project Context

> **Read SPEC.md first.** SPEC.md is the source of truth for product scope, data model, and architecture. This file is for *how we build*, not *what we build*.

## Project At-a-Glance

A family-only website combining a season-long Brewers win-prediction game with a fan hub (schedule, live tracking, standings, stats, news, minors) and a social layer (shoutbox, comments, hot takes, auto big moments).

- **Audience:** ≤30 family members (private, invite-only)
- **Mobile is first-class.** iPhones and Samsung devices are the primary access pattern. Desktop is secondary.
- **PWA support is required.** Installable on iOS and Android home screens.
- **Owner:** Ryan (solo developer)

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 + Vite 9 + TypeScript + Tailwind CSS v4 |
| Hosting | **Hetzner VPS** (Docker Compose, Caddy reverse proxy) |
| DNS + edge | **Cloudflare** (proxy mode, Origin Certs) |
| Auth + DB + Realtime | Supabase (managed) |
| Live game poller | FastAPI (Python), Docker container on the same VPS |
| Scheduled jobs | Supabase Edge Functions (Deno) |
| CI/CD | **GitHub Actions** → SSH deploy to VPS |
| Container registry | GHCR (GitHub Container Registry) |
| Charts | Recharts |
| MLB data | `MLB-StatsAPI` Python package + `statsapi.mlb.com` |
| Email | Resend (free tier) |

> **Deployment details live in `docs/DEPLOYMENT.md`.** Read it before deploying anything.

## Repo Structure

```
brewers-family-hub/
├── CLAUDE.md                    # this file
├── SPEC.md                      # design doc — source of truth
├── README.md                    # quickstart
├── .claude/
│   ├── agents/                  # subagent specialists (also reusable as teammates)
│   └── settings.json            # enables agent teams flag
├── .github/
│   └── workflows/
│       └── deploy.yml           # CI/CD: build images, deploy to VPS
├── infra/
│   ├── docker-compose.yml       # service orchestration on VPS
│   └── caddy/
│       └── Caddyfile            # reverse proxy + TLS config
├── docs/
│   ├── PHASE_1_KICKOFF.md       # ready-to-paste kickoff prompt
│   ├── DEPLOYMENT.md            # Hetzner + Cloudflare + GitHub Actions deploy guide
│   ├── decisions/               # ADRs as we go
│   └── runbooks/                # operational notes
├── web/                         # React + Vite frontend (Phase 1+)
│   ├── Dockerfile
│   └── nginx.conf
├── poller/                      # FastAPI poller (Phase 3+)
│   └── Dockerfile
└── supabase/
    ├── migrations/              # numbered SQL migrations
    ├── functions/               # Edge Functions
    └── config.toml
```

## Conventions

### General
- **Investigate before fixing.** When debugging, the first action is to understand what's happening, not to patch. Use a separate context window or subagent for investigation.
- **Small commits, descriptive messages.** Conventional Commits format (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`).
- **No code without a SPEC reference** for non-trivial work. If SPEC.md doesn't cover it, update SPEC.md first.
- **Document non-obvious decisions** as ADRs in `docs/decisions/NNNN-title.md`.

### Frontend
- TypeScript strict mode on.
- Functional components only. Hooks over HOCs.
- **Mobile-first Tailwind:** default styles target mobile; use `md:` and `lg:` for larger screens.
- Touch targets ≥44px (Apple HIG) / ≥48dp (Material).
- Avoid hover-only interactions — they don't work on touch.
- Test on real iPhone Safari and Android Chrome before merging UI work.
- Use `tabular-nums` for any score/stat display.
- Lucide React for icons.

### Backend / Data
- All Postgres tables have RLS enabled — no exceptions.
- Migrations are numbered and never edited after merge. New changes = new migration.
- Edge Functions: one directory per function under `supabase/functions/`.
- Poller: in-memory state for live event detection; only persist what other systems need.
- Never expose `service_role` key to the client. Frontend uses `anon` key only.
- All MLB API calls go through one wrapper (`mlb_client.py`) — single place to handle retries, rate limits, schema quirks.

### Naming
- React components: `PascalCase.tsx`
- React hooks: `useCamelCase.ts`
- Database: `snake_case` table and column names
- Edge Functions: `kebab-case` directories (`sync-standings/`)
- Migrations: `NNNN_short_description.sql` (zero-padded 4 digits)

## Mobile & PWA Requirements

These are not optional. Treat them as acceptance criteria for every UI ticket.

1. **Responsive at 375px wide minimum** (iPhone SE baseline).
2. **Safe area insets** respected (iOS notch / Dynamic Island, Android gesture bar). Use `env(safe-area-inset-*)`.
3. **Bottom nav on mobile** — primary nav is thumb-reachable on phones.
4. **PWA manifest** with proper icons (192, 512, maskable, apple-touch-icon at 180x180).
5. **Service worker** for offline shell + asset caching. Live data should *not* be aggressively cached.
6. **iOS install prompt guidance** — Safari doesn't auto-prompt; show a one-time hint to "Add to Home Screen."
7. **Android install prompt** — capture `beforeinstallprompt` and surface a custom button.
8. **Push notifications are out of scope for v1** but the manifest should leave room for them later.

The `react-frontend-builder` agent owns implementation. The `mobile-ux-reviewer` agent reviews against this list at end of every UI phase.

## Visual Design Tokens

```css
/* Brewers palette */
--navy: #13294B;
--gold: #FFC52F;
--gold-deep: #B6922E;

/* Neutrals */
--bg: #FAFAFA;
--surface: #FFFFFF;
--text: #1A1A1A;
--text-muted: #666;
--border: #E5E5E5;

/* Semantic */
--win: #16A34A;
--loss: #DC2626;
--live: #2563EB;
```

- Display font: **Bricolage Grotesque** (Google Fonts)
- Body font: **Inter** (Google Fonts)
- All numerals: tabular figures

## Phased Build Plan

See SPEC.md §14 for the full plan. Summary:

1. **Phase 1:** Auth + Predictions (MVP) — login, profile, prediction submission with valid-range validation, leaderboard. **Single session work.**
2. **Phase 2:** Schedule + game results + standings pages. **Single session work.**
3. **Phase 3:** Live tracker + shoutbox (poller + Realtime). **Agent team — 3 independent tracks.**
4. **Phase 4:** Player stats + news + minors. **Single session, possibly subagent for news ingestion.**
5. **Phase 5:** Hot takes, big moments, mentions, admin polish. **Agent team — cross-layer feature work.**
6. **Phase 6:** End-of-season resolution + offseason mode.

**End of every phase: spawn a review team** (see recipes below). Don't start phase N+1 until phase N is deployed and working for real family users.

---

## Working with Subagents

The `.claude/agents/` directory has four specialists:

- **`supabase-architect`** — schema, migrations, RLS policies (write access)
- **`react-frontend-builder`** — React/Tailwind UI, mobile-first, PWA (write access)
- **`mlb-data-engineer`** — poller, MLB API integration, event detection (write access)
- **`phase-reviewer`** — read-only mobile/PWA/security reviewer

Invoke explicitly when the work is clearly in their domain:
> "Use the supabase-architect to design migrations for the social tables in §5 of SPEC.md."

Or let Claude auto-delegate based on the agents' descriptions.

These same files double as teammate definitions — when an agent team spawns, it can reference these by name (e.g., "spawn a teammate using the `phase-reviewer` agent type").

---

## Working with Agent Teams

**Agent teams are experimental.** Enabled via `.claude/settings.json`. Read the limitations section before using.

### Honest guidance: when teams actually help

Per the official docs, teams use **significantly more tokens** than a single session and add coordination overhead. They're best for:

- Research and review (parallel exploration)
- New modules with clear, independent tracks
- Debugging with competing hypotheses
- Cross-layer features that span frontend/backend/tests

For sequential work, tightly-coupled changes, or anything where teammates would edit the same files, **do not use a team**. A single session with subagents is faster and cheaper.

**Default to a single session.** Reach for a team only when one of the recipes below clearly applies.

### Team operating rules

1. **Stay in the room.** The lead can shut down or get stuck. Don't let teams run unattended for long stretches.
2. **3-5 teammates max.** More = diminishing returns + token cost.
3. **No file conflicts.** Each teammate owns a different set of files/directories.
4. **Don't `/resume` after closing.** In-process teammates don't restore. Start fresh.
5. **One team per session.** Clean up before starting another.
6. **Use the lead to clean up.** "Clean up the team" when finished.
7. **Pre-approve common operations** in permission settings before spawning to avoid prompt friction.

### Recipe 1: Phase 3 kickoff team (live tracker + shoutbox)

This is the canonical "build a phase as a team" recipe. Phase 3 has three genuinely independent tracks.

```
Create an agent team for Phase 3 of the project (Live Tracker + Shoutbox).
Read SPEC.md §6 (poller), §10 (social), and §14 (phase plan) before spawning.

Spawn three teammates:

1. "Poller" — use the mlb-data-engineer agent type. Owns the poller/ directory.
   Builds the FastAPI service, MLB API integration, big moment detection,
   and writes to live_game_state and big_moments tables. Coordinates with
   "Schema" on the table shapes before implementing the writer.

2. "Realtime" — use the react-frontend-builder agent type. Owns
   web/src/pages/Home.tsx (live game hero), web/src/components/LiveGameHero/,
   and the win probability chart. Subscribes to live_game_state via
   Supabase Realtime. Coordinates with "Poller" on event payload shape.

3. "Shoutbox" — use the react-frontend-builder agent type. Owns
   web/src/components/Shoutbox/ and the comments table migration.
   Subscribes to comments via Realtime. Renders auto big-moment cards
   with special styling.

Coordination:
- Schema work for live_game_state, big_moments, and comments comes first.
  Have the Poller teammate publish the migration before others start
  consuming.
- Each teammate works in their own directory; no file conflicts.
- The Realtime and Shoutbox teammates can run in parallel once the schema
  is in place.

When all three are done, spawn the phase review team (Recipe 3) before
declaring Phase 3 complete.
```

### Recipe 2: Competing hypothesis investigation

For when something is broken and the cause is unclear. Use sparingly.

```
The live game state appears to lag 2-3 minutes behind real game action.
Spawn 3 teammates to investigate competing hypotheses:

1. "Poller-side" — investigate whether the FastAPI service is actually
   polling at 30s cadence. Check Fly.io logs, polling loop timing,
   MLB API latency.

2. "DB-side" — investigate whether writes to live_game_state are slow
   or batched. Check Supabase logs, write timing, RLS overhead.

3. "Client-side" — investigate whether the Realtime subscription is
   delivering updates promptly. Check WebSocket health, client render
   timing.

Have them message each other to challenge findings. Update
docs/runbooks/live-state-lag.md with the consensus root cause and fix.
```

### Recipe 3: End-of-phase review team

**This is the flagship use case.** Run this at the end of every UI phase. Reviewers are read-only and parallel — exactly the shape teams handle best.

```
Phase [N] is functionally complete and deployed to a preview URL.
Spawn an agent team to review it before merging to main.

Spawn three teammates, all using the phase-reviewer agent type:

1. "MobileUX" — focus exclusively on mobile experience. Test at 375px
   width minimum. Check touch targets, safe area insets, bottom nav
   reachability, install flow on iOS and Android, performance on
   throttled 3G. Reference CLAUDE.md "Mobile & PWA Requirements".

2. "Security" — focus on RLS policies, auth flow, key exposure, and
   input validation. Reference SPEC.md §13 (Security & Privacy) and
   verify every new table has RLS enabled and policies are correct.

3. "A11y" — focus on accessibility. Keyboard nav, screen reader labels,
   color contrast (Brewers navy/gold combos especially), focus
   management, semantic HTML.

Each teammate produces a findings report in docs/reviews/phase-[N]-[role].md
with severity-rated issues (blocking / non-blocking / nice-to-have).
The lead synthesizes findings into docs/reviews/phase-[N]-summary.md.

Do not merge to main until blocking issues are addressed.
```

### Recipe 4: Phase 5 kickoff team (social bonus features)

Phase 5 has clear cross-layer seams (mentions = DB + frontend + email function).

```
Create an agent team for Phase 5 (Hot Takes + Big Moments + Mentions).
Read SPEC.md §10 before spawning.

Spawn three teammates:

1. "Hot Takes" — use react-frontend-builder. Owns the hot takes UI,
   profile page additions, and the Hot Take Hall of Fame page.

2. "Mentions" — cross-layer. Use react-frontend-builder for autocomplete
   in comment inputs; also owns supabase/functions/notify-mentions/
   for email delivery via Resend.

3. "Big Moments Polish" — use react-frontend-builder. Owns the special
   card styling for auto-posted big moments in the shoutbox. Coordinates
   with the existing poller (no changes there).

Schema changes needed (mentions table) come first; have the Mentions
teammate publish that migration before others start.

After implementation, run Recipe 3 (review team).
```

---

## Operational Notes (Experimental Limitations)

Things to expect and how to handle them, per the official docs:

- **Lead may shut down before work is done.** If you notice the lead claiming "team is done" while teammates still have open tasks, tell it: "Wait for your teammates to complete their tasks before proceeding."
- **Task status can lag.** If a task appears stuck, check whether the work is actually done and update the task status manually or tell the lead to nudge the teammate.
- **No `/resume` for in-process teammates.** If you close and resume, the lead may message ghosts. Tell it to spawn fresh teammates.
- **Slow shutdown.** Teammates finish their current request before exiting. Be patient.
- **Split panes need tmux or iTerm2.** On Windows or VS Code's integrated terminal, you'll get in-process mode (Shift+Down to cycle through teammates). That's fine.
- **Pre-approve common ops.** Add common bash commands and file patterns to permission settings before spawning a team to reduce prompt friction.

## Quick Decision Guide

When in doubt, choose the lightest tool:

| Situation | Use |
|---|---|
| One focused task in one domain | Single session |
| Need a second opinion on a specific thing | Subagent (one of the four in `.claude/agents/`) |
| Phase with 3+ independent tracks | Agent team |
| End-of-phase review | Agent team (Recipe 3) |
| Bug with multiple plausible causes | Agent team (Recipe 2) |
| Quick fix or refactor | Single session |
| Anything where workers would edit the same files | Single session |
