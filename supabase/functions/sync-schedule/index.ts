// supabase/functions/sync-schedule/index.ts
//
// Daily cron pulls a rolling window of the Brewers' MLB schedule and upserts
// one row per game into public.games (PK = MLB gamePk). The /schedule and
// /games/:gamePk pages read directly from this table; the live tracker
// (Phase 3) will overlay the row with realtime data from the FastAPI poller.
//
// Window: today-14 .. today+30 in Central Time. Past games provide the
// recent results panel on /schedule; future games populate the calendar.
// 30 days of lookahead is enough to catch a full road trip + homestand,
// without paying for the whole season every run. The kickoff doc said
// "today-14 .. today+30 feels right" — keeping the wider lookahead so the
// schedule page can show "next homestand" on day-after-deploy without
// waiting for the next cron tick.
//
// Auth pattern matches sync-standings (see that file for the full reasoning):
//   - Deploy with verify_jwt: false (the gateway can't verify ES256 tokens
//     under the new sb_publishable_* key format).
//   - Authenticate inside the function via x-cron-secret header. Same
//     CRON_SECRET env var is reused — there's no end user, so a single
//     server-to-server secret is fine.
//
// Required Edge Function secrets:
//   CRON_SECRET                   (shared with sync-standings)
//   SUPABASE_URL                  (auto-injected)
//   SUPABASE_SERVICE_ROLE_KEY     (auto-injected)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BREWERS_TEAM_ID = 158;
const SPORT_ID = 1;
const LOOKBACK_DAYS = 14;
const LOOKAHEAD_DAYS = 30;

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Central Time YYYY-MM-DD. Same helper as sync-standings; copied to keep
// each function self-contained (Edge Functions don't share local modules
// well across deploys without an import map).
function todayInCentral(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function shiftDate(yyyyMmDd: string, deltaDays: number): string {
  const [y, m, d] = yyyyMmDd.split("-").map((s) => Number.parseInt(s, 10));
  // Use UTC arithmetic; we only need date-level precision.
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

// Normalize MLB API states down to the four SPEC.md §5 buckets, plus
// pass-through for less-common terminal states (Postponed/Cancelled).
// abstractGameState is the cleanest lever: "Preview" | "Live" | "Final".
// detailedState carries the nuance (e.g., "Postponed", "Suspended").
function normalizeStatus(
  abstractGameState: string | undefined,
  detailedState: string | undefined,
): string {
  const detailed = (detailedState ?? "").trim();
  if (/postponed/i.test(detailed)) return "Postponed";
  if (/cancelled|canceled/i.test(detailed)) return "Cancelled";
  if (/suspended/i.test(detailed)) return "Suspended";

  switch (abstractGameState) {
    case "Preview":
      return "Scheduled";
    case "Live":
      return "Live";
    case "Final":
      return "Final";
    default:
      // Fallback to detailedState raw rather than fabricating something.
      return detailed || "Unknown";
  }
}

interface MlbTeamRef {
  team?: { id?: number };
  score?: number;
  isWinner?: boolean;
  probablePitcher?: { id?: number };
}

interface MlbGame {
  gamePk?: number;
  gameDate?: string; // ISO 8601
  officialDate?: string; // YYYY-MM-DD
  status?: { abstractGameState?: string; detailedState?: string };
  teams?: { home?: MlbTeamRef; away?: MlbTeamRef };
  venue?: { name?: string };
  linescore?: { currentInning?: number; inningState?: string };
  decisions?: {
    winner?: { id?: number };
    loser?: { id?: number };
  };
}

// Map one MLB schedule game payload to a row for public.games.
// Returns null if the payload is missing the fields we treat as required
// (gamePk, both team IDs, a date) — defensive against MLB API quirks.
function rowFromGame(g: MlbGame) {
  const id = g.gamePk;
  const homeTeamId = g.teams?.home?.team?.id;
  const awayTeamId = g.teams?.away?.team?.id;
  const gameDate = g.officialDate;
  const gameDatetime = g.gameDate;

  if (
    typeof id !== "number" ||
    typeof homeTeamId !== "number" ||
    typeof awayTeamId !== "number" ||
    !gameDate ||
    !gameDatetime
  ) {
    return null;
  }

  const status = normalizeStatus(
    g.status?.abstractGameState,
    g.status?.detailedState,
  );

  // Only stamp brewers_won once the game is final. Mid-game leads aren't
  // wins — leaving this null until Final keeps leaderboard math honest.
  let brewersWon: boolean | null = null;
  if (status === "Final") {
    if (homeTeamId === BREWERS_TEAM_ID) {
      brewersWon = g.teams?.home?.isWinner ?? null;
    } else if (awayTeamId === BREWERS_TEAM_ID) {
      brewersWon = g.teams?.away?.isWinner ?? null;
    }
  }

  return {
    id,
    game_date: gameDate,
    game_datetime: gameDatetime,
    home_team_id: homeTeamId,
    away_team_id: awayTeamId,
    home_score: g.teams?.home?.score ?? null,
    away_score: g.teams?.away?.score ?? null,
    status,
    inning: g.linescore?.currentInning ?? null,
    inning_state: g.linescore?.inningState ?? null,
    venue: g.venue?.name ?? null,
    probable_home_pitcher_id: g.teams?.home?.probablePitcher?.id ?? null,
    probable_away_pitcher_id: g.teams?.away?.probablePitcher?.id ?? null,
    winning_pitcher_id: g.decisions?.winner?.id ?? null,
    losing_pitcher_id: g.decisions?.loser?.id ?? null,
    brewers_won: brewersWon,
    updated_at: new Date().toISOString(),
  };
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

  const today = todayInCentral();
  const startDate = shiftDate(today, -LOOKBACK_DAYS);
  const endDate = shiftDate(today, LOOKAHEAD_DAYS);

  const url = `https://statsapi.mlb.com/api/v1/schedule` +
    `?teamId=${BREWERS_TEAM_ID}` +
    `&sportId=${SPORT_ID}` +
    `&startDate=${startDate}` +
    `&endDate=${endDate}` +
    `&hydrate=team,probablePitcher,decisions,linescore`;

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

  const rows: NonNullable<ReturnType<typeof rowFromGame>>[] = [];
  const skipped: number[] = [];
  for (const dateGroup of data.dates ?? []) {
    for (const g of dateGroup.games ?? []) {
      const row = rowFromGame(g);
      if (row) rows.push(row);
      else if (typeof g?.gamePk === "number") skipped.push(g.gamePk);
    }
  }

  if (rows.length === 0) {
    // Empty isn't fatal during the offseason, but during the season it
    // means a real failure — log and surface 502 so the cron retries.
    return Response.json(
      {
        ok: false,
        warning: "No games returned for window",
        window: { startDate, endDate },
        skipped,
      },
      { status: 502 },
    );
  }

  const { error } = await supabaseAdmin
    .from("games")
    .upsert(rows, { onConflict: "id" });

  if (error) {
    console.error("upsert failed", error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({
    ok: true,
    window: { startDate, endDate },
    rows_upserted: rows.length,
    skipped_game_pks: skipped,
  });
});
