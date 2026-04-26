# supabase/

Database migrations and Edge Functions for Brewers Family Hub.

> Cloud project: `brewers-family-hub` — ref `oebgjmoeicpujxjzdcpt` (East US).

## Layout

```
supabase/
├── config.toml      # local CLI config (project ref)
├── migrations/      # numbered SQL files — applied in order
└── functions/       # one directory per Edge Function (kebab-case)
```

## Conventions

These are the rules from `CLAUDE.md` — restated here so future contributors
(human or agent) don't have to dig.

### Migrations

- Filename: `NNNN_short_description.sql` — zero-padded 4 digits, snake_case.
- Numbering increases monotonically. New change = **new file**, never edit
  one that has already been merged or applied.
- Every table created in a migration **must enable RLS** in the same migration.
  No exceptions. If a table genuinely needs to be public-readable, write the
  policy explicitly — don't leave RLS off.
- Keep table and column names `snake_case`.
- Prefer `text` over `varchar(n)`; prefer `timestamptz` over `timestamp`.
- Foreign keys with explicit `on delete` behavior — never leave it implicit.

### Edge Functions

- One directory per function under `supabase/functions/`, named in
  `kebab-case` (e.g. `sync-standings/`, `notify-mentions/`).
- Each function directory contains `index.ts` (entry point) and any helpers.
- Write functions in TypeScript; runtime is Deno.
- Service-role access is allowed (functions run server-side); never log the
  service-role key.

## How we apply changes today (Phase 1+)

We're using the **Supabase MCP** for all schema and Edge Function work in
Phase 1 — no local CLI required. The MCP applies migrations to the cloud
project directly and ships function source from this repo.

If/when the local CLI is installed (Phase 3+, when we're testing the
poller against local Supabase), `supabase db diff` and
`supabase functions serve` become useful and this directory's structure
already maps to what those commands expect.
