# Phase 1 Kickoff — Auth + Predictions

This is your starting point on the new laptop. Phase 1 is intentionally **a single-session build** — no agent team. The work is sequential (schema → frontend) and the scope is small enough that a team would just add coordination overhead.

You'll spawn the first agent team at the **end** of Phase 1 to review the deployment.

---

## Goal

Ship a working MVP where family members can:

1. Log in via Supabase magic link
2. Set a display name and avatar
3. Submit a one-time prediction for the Brewers' final win total — with valid-range validation against current standings
4. View a leaderboard of all family predictions vs. the current on-pace projection

That's it. No schedule pages, no live tracking, no shoutbox. Just the prediction game working end-to-end.

## Acceptance criteria

- [ ] Family members can sign up via an invite link
- [ ] Magic link login works on iOS Safari and Android Chrome
- [ ] A user with no prediction sees the prediction form on `/predictions`
- [ ] Valid range is computed server-side (current wins to current wins + games remaining)
- [ ] Submitting a prediction outside the valid range shows a clear error
- [ ] After submission, the prediction is visible but cannot be edited or deleted
- [ ] `/predictions/leaderboard` shows everyone's prediction with on-pace projection and diff
- [ ] Submission date is publicly visible on the leaderboard
- [ ] Standings sync runs hourly via an Edge Function and updates a snapshot table
- [ ] Site works on a 375px-wide viewport
- [ ] PWA manifest in place; site is installable on iOS and Android
- [ ] All tables have RLS enabled with correct policies
- [ ] Phase reviewed by an agent team (Recipe 3) before merge to main

## Pre-flight

Before pasting the kickoff prompt below, make sure:

1. You have a Supabase project created. Note the project URL and `anon` key.
2. You have read `docs/DEPLOYMENT.md` and decided whether to do the VPS setup now or after Phase 1 functionality is working locally. **Recommended: build Phase 1 locally first, deploy at the end of Phase 1 as part of the phase review.**
3. You're in the project root directory in the terminal.
4. Claude Code is running (`claude`).
5. Agent teams flag is on: `echo $CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` should print `1`.

## Kickoff prompt (paste this into Claude Code)

```
We're starting Phase 1 of the Brewers Family Hub. Read CLAUDE.md and
SPEC.md fully before doing anything else. SPEC.md is the source of
truth for the data model and product scope.

This is a single-session build, not an agent team. Work sequentially:

1. SCAFFOLD
   - Initialize the web/ directory: Vite + React + TypeScript + Tailwind.
   - Set up the Supabase project structure: supabase/migrations/,
     supabase/functions/, supabase/config.toml.
   - Create web/src/lib/supabase.ts with a single client instance
     using import.meta.env vars (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).
   - Add Tailwind config with the design tokens from CLAUDE.md.
   - Wire up Bricolage Grotesque (display) and Inter (body) from
     Google Fonts.

2. SCHEMA — use the supabase-architect subagent for this step.
   Migrations to create (per SPEC.md §5):
   - profiles (extends auth.users; display_name, avatar_url, is_admin)
   - predictions (one per user, insert-only via RLS)
   - standings_snapshot (team_id + snapshot_date PK)
   - games (full schedule shape — we'll populate it in Phase 2 but
     create it now so foreign keys exist)
   RLS policies on every table per CLAUDE.md and SPEC.md §13.

3. EDGE FUNCTIONS — use supabase-architect.
   - sync-standings: hourly, pulls Brewers standings from MLB API
     (team ID 158), upserts into standings_snapshot.
   - sync-schedule: daily, pulls next 14 days of games, upserts into games.
   For Phase 1, sync-schedule is optional — only sync-standings is
   required. We need standings to compute the prediction valid range.

4. FRONTEND — use the react-frontend-builder subagent.
   Pages (per SPEC.md §8):
   - /login (magic link form)
   - /predictions (form if no prediction; otherwise show your prediction)
   - /predictions/leaderboard (sorted by closeness to on-pace projection)
   - / (home — for Phase 1, just a welcome card and links to predictions)
   Components:
   - Bottom nav (mobile) with Home, Predictions, Leaderboard
   - Top nav (desktop)
   - PredictionForm with valid-range validation (client AND server side)
   - LeaderboardRow with the prediction visualization described in
     SPEC.md §9
   PWA:
   - manifest.json with the required icons
   - Service worker (workbox or hand-rolled) caching app shell only
   - iOS install hint (one-time bottom sheet on Safari)
   - Android install button hooked to beforeinstallprompt

5. SEED + TEST
   - Create a one-time signup token mechanism for invite-only access.
     Simplest: a small admin-only page that generates magic-link
     invites the admin can share. Defer if it's slowing you down —
     for Phase 1 manual signup via Supabase dashboard is fine.
   - Manually verify the full flow: signup → set name → submit
     prediction → see leaderboard.

6. DEPLOY — choose your hosting path
   Two options at this point:

   (a) Vercel (simplest, free, Git-connected auto-deploy):
       - Push web/ to a Vercel project
       - Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY env vars
       - Vercel auto-deploys on every push to main
       - Skip docs/DEPLOYMENT.md until Phase 3 (when the poller arrives)

   (b) Hetzner VPS (full control, see docs/DEPLOYMENT.md):
       - Create the Dockerfile, nginx.conf, infra/docker-compose.yml,
         infra/caddy/Caddyfile, and .github/workflows/deploy.yml per
         the templates in DEPLOYMENT.md
       - Provision the VPS, configure Cloudflare DNS + Origin Cert,
         set GitHub secrets per DEPLOYMENT.md Part 1
       - Push to main and watch the GitHub Actions workflow

   Recommendation for first-time deploy: option (a). You can migrate
   to (b) later — it's mostly config files, not application code.

   Either way: verify the deployed site works on a real iPhone Safari
   and Android Chrome.

7. PHASE REVIEW — spawn an agent team using Recipe 3 from CLAUDE.md.
   Three teammates (MobileUX, Security, A11y), all using the
   phase-reviewer agent type. Reports go in docs/reviews/phase-1-*.md.
   Address blocking findings before merging to main.

Throughout: commit often using Conventional Commits format. Update
SPEC.md if you discover a gap. Document non-obvious decisions in
docs/decisions/.

Stop and ask me if anything in SPEC.md or CLAUDE.md is unclear or
seems wrong. Don't paper over ambiguity.
```

## After Phase 1 ships

- Update this kickoff doc with anything you learned (a "lessons learned" section is gold for Phase 2).
- Don't start Phase 2 until family has used the site and submitted real predictions.
- Phase 2 kickoff doc can be created similarly: `docs/PHASE_2_KICKOFF.md`.

## A note on scope creep

It's tempting to build "just the schedule page too while we're here." Don't. Phase 1's value is **family using a working prediction game**. Every additional thing delays that. Schedule is Phase 2.
