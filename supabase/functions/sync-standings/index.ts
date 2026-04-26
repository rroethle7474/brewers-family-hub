// supabase/functions/sync-standings/index.ts
//
// Daily cron pulls Brewers standings from the MLB Stats API and upserts a
// row into public.standings_snapshot, keyed on (team_id, snapshot_date).
// Daily matches the table's natural granularity (the PK is one row per
// team per day) and matches SPEC.md §14 ("Standings ingestion, daily").
// The function is the only path standings get into the DB; the table has
// no INSERT/UPDATE/DELETE policy, so only the service-role key works.
//
// Why this function gates on a cron secret instead of verify_jwt:
//   1. There's no end user — it's server-to-server (Supabase scheduler ->
//      function). With the new sb_publishable_* key format, the gateway's
//      verify_jwt: true mode silently 401s every request (ES256 signing
//      isn't supported there). So we deploy with verify_jwt: false.
//   2. Without JWT verification at the gateway, the function itself must
//      authenticate the caller. We require an x-cron-secret header that
//      matches the CRON_SECRET env var (set in Dashboard -> Edge Functions
//      -> Secrets and pasted into the schedule's request headers).
//
// Required Edge Function secrets:
//   CRON_SECRET                   (any opaque random string)
//   SUPABASE_URL                  (auto-injected by Supabase)
//   SUPABASE_SERVICE_ROLE_KEY     (auto-injected by Supabase)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BREWERS_TEAM_ID = 158;
const NL_LEAGUE_ID = 104;

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function parseFloatOrNull(s: unknown): number | null {
  if (typeof s !== "string" || s === "" || s === "-") return null;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function parseIntOrNull(s: unknown): number | null {
  if (typeof s !== "string" || s === "" || s === "-") return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

interface SplitRecord {
  type?: string;
  wins?: number;
  losses?: number;
}

function findLastTen(splitRecords: SplitRecord[] | undefined): string | null {
  const lastTen = splitRecords?.find((r) => r.type === "lastTen");
  if (!lastTen || lastTen.wins == null || lastTen.losses == null) return null;
  return `${lastTen.wins}-${lastTen.losses}`;
}

// Snapshot date in Central Time so a snapshot taken at 11pm Brewers-local
// stays on the same calendar day, not the next UTC one. en-CA produces
// YYYY-MM-DD natively, which Postgres accepts as a `date`.
function todayInCentral(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret) {
    console.error("CRON_SECRET env var not set");
    return new Response("Server misconfigured", { status: 500 });
  }
  if (req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const season = new Date().getUTCFullYear();
  const url =
    `https://statsapi.mlb.com/api/v1/standings?leagueId=${NL_LEAGUE_ID}&season=${season}`;

  let mlbResp: Response;
  try {
    mlbResp = await fetch(url);
  } catch (err) {
    console.error("MLB API fetch threw", err);
    return Response.json({ error: "MLB API unreachable" }, { status: 502 });
  }
  if (!mlbResp.ok) {
    return Response.json(
      { error: `MLB API returned ${mlbResp.status}` },
      { status: 502 },
    );
  }
  const data = await mlbResp.json();

  // deno-lint-ignore no-explicit-any
  let brewers: any = null;
  for (const rec of data.records ?? []) {
    for (const tr of rec.teamRecords ?? []) {
      if (tr.team?.id === BREWERS_TEAM_ID) {
        brewers = tr;
        break;
      }
    }
    if (brewers) break;
  }

  if (!brewers) {
    return Response.json(
      { error: `Brewers (id ${BREWERS_TEAM_ID}) not in standings response` },
      { status: 502 },
    );
  }

  const row = {
    team_id: BREWERS_TEAM_ID,
    snapshot_date: todayInCentral(),
    wins: brewers.wins ?? 0,
    losses: brewers.losses ?? 0,
    pct: parseFloatOrNull(brewers.winningPercentage),
    games_back: parseFloatOrNull(brewers.gamesBack),
    division_rank: parseIntOrNull(brewers.divisionRank),
    league_rank: parseIntOrNull(brewers.leagueRank),
    run_diff: typeof brewers.runDifferential === "number"
      ? brewers.runDifferential
      : null,
    last_10: findLastTen(brewers.records?.splitRecords),
    streak: brewers.streak?.streakCode ?? null,
  };

  const { error } = await supabaseAdmin
    .from("standings_snapshot")
    .upsert(row, { onConflict: "team_id,snapshot_date" });

  if (error) {
    console.error("upsert failed", error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, row });
});
