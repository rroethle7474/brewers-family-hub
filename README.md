# Brewers Family Hub

A family-only website for tracking the Milwaukee Brewers season — predictions, live game tracking, schedule, standings, stats, news, and a family social layer.

## Status

Pre-Phase-1. The design doc (`SPEC.md`) and project context (`CLAUDE.md`) are complete. No code yet.

## Quickstart (for Ryan, on the laptop)

### Prerequisites

- [Claude Code](https://claude.com/claude-code) v2.1.32 or later (check with `claude --version`)
- Node.js 20+ and npm
- Python 3.11+ (for the poller, Phase 3+)
- A [Supabase](https://supabase.com) account (free tier)
- A [Hetzner Cloud](https://www.hetzner.com/cloud) VPS (CX22 recommended, ~$5/mo)
- A domain managed by [Cloudflare](https://www.cloudflare.com/) (free DNS + proxy)
- A GitHub account for the repo and CI/CD

See `docs/DEPLOYMENT.md` for the full deployment setup (one-time VPS provisioning, Cloudflare config, GitHub Actions secrets).

### First time setup

```bash
# From the project directory:
git init
git add .
git commit -m "chore: initial scaffold (CLAUDE.md, SPEC.md, agents)"

# Start Claude Code
claude
```

The `.claude/settings.json` enables the experimental agent teams feature automatically. Verify with:

```bash
echo $CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS
# Should print: 1
```

If it doesn't print `1`, the env var didn't load. Either restart your shell after Claude Code reads settings, or export it manually:

```bash
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
```

### Where to start

1. **Read `SPEC.md`** end-to-end. It's the source of truth for what we're building.
2. **Read `CLAUDE.md`**. Conventions, agent recipes, and the operating model.
3. **Read `docs/PHASE_1_KICKOFF.md`**. Copy the prompt at the bottom into Claude Code to start Phase 1.

### Project structure (current)

```
.
├── CLAUDE.md                # project context — read this first
├── SPEC.md                  # design doc — source of truth
├── README.md                # this file
├── .claude/
│   ├── agents/              # 4 subagent specialists (also reusable as teammates)
│   │   ├── supabase-architect.md
│   │   ├── react-frontend-builder.md
│   │   ├── mlb-data-engineer.md
│   │   └── phase-reviewer.md
│   └── settings.json        # enables agent teams flag
├── docs/
│   ├── PHASE_1_KICKOFF.md   # ready-to-paste kickoff prompt
│   └── DEPLOYMENT.md        # Hetzner + Cloudflare + GitHub Actions guide
└── .gitignore
```

After Phase 1 you'll also have `web/`, `supabase/`, `infra/`, `.github/workflows/`, and eventually `poller/` directories.

## How the agents work

Four specialists live in `.claude/agents/`:

| Agent | What it owns | Tool access |
|---|---|---|
| `supabase-architect` | Schema, migrations, RLS, Edge Functions | Read/Write |
| `react-frontend-builder` | React UI, Tailwind, PWA | Read/Write |
| `mlb-data-engineer` | Poller, MLB API, sync jobs | Read/Write + WebFetch |
| `phase-reviewer` | Read-only review (mobile/security/a11y) | Read-only |

These work two ways:

1. **As subagents** — Claude Code's main session delegates to them automatically when the task fits, or you can ask explicitly: *"Use the supabase-architect to..."*
2. **As teammate types in agent teams** — when spawning a team, reference them by name: *"Spawn a teammate using the phase-reviewer agent type..."*

See `CLAUDE.md` for the full set of agent team recipes (kickoff teams for Phase 3 and 5, end-of-phase reviews, competing-hypothesis debugging).

## When to use what

- **Single session:** routine work, one focus, sequential tasks. **Default.**
- **Subagent:** quick second opinion or focused work in one specialist's domain.
- **Agent team:** new phase with 3+ independent tracks, end-of-phase review, or bug investigation with competing hypotheses.

Teams use significantly more tokens. Don't reach for them by default.

## Phased rollout

Per `SPEC.md` §14:

1. **Phase 1** — Auth + Predictions (single session)
2. **Phase 2** — Schedule + game results (single session)
3. **Phase 3** — Live tracker + shoutbox (agent team — 3 tracks)
4. **Phase 4** — Player stats, news, minors (single session)
5. **Phase 5** — Hot takes, big moments, mentions (agent team — cross-layer)
6. **Phase 6** — End-of-season + offseason mode

Each phase ends with a phase-review team before merging to main.

## Cost estimate

~$3–5/mo total once Phase 3 is live (Vercel + Supabase free tiers, Fly.io ~$3/mo for the poller).

## License

Private / family use.
