// MLB team metadata, scoped to what we actually need to render schedule and
// standings views. We deliberately don't have a teams table in the DB —
// these IDs and abbreviations don't change, and the alternative (a
// daily-synced teams table) would be schema for the sake of schema.
//
// Source: MLB Stats API team IDs. Names match the MLB API's `clubName`
// (i.e., short forms — "Brewers" not "Milwaukee Brewers") so list/calendar
// rows stay compact at 375px.

export const BREWERS_TEAM_ID = 158

export type Division = 'NL Central' | 'NL East' | 'NL West' | 'AL East' | 'AL Central' | 'AL West'

export interface MlbTeam {
  id: number
  abbr: string
  short: string  // "Brewers", "Cubs"
  city: string   // "Milwaukee", "Chicago"
  division: Division | null
}

export const MLB_TEAMS: Record<number, MlbTeam> = {
  // NL Central
  158: { id: 158, abbr: 'MIL', short: 'Brewers',   city: 'Milwaukee',     division: 'NL Central' },
  112: { id: 112, abbr: 'CHC', short: 'Cubs',      city: 'Chicago',       division: 'NL Central' },
  138: { id: 138, abbr: 'STL', short: 'Cardinals', city: 'St. Louis',     division: 'NL Central' },
  134: { id: 134, abbr: 'PIT', short: 'Pirates',   city: 'Pittsburgh',    division: 'NL Central' },
  113: { id: 113, abbr: 'CIN', short: 'Reds',      city: 'Cincinnati',    division: 'NL Central' },

  // NL East
  121: { id: 121, abbr: 'NYM', short: 'Mets',      city: 'New York',      division: 'NL East' },
  144: { id: 144, abbr: 'ATL', short: 'Braves',    city: 'Atlanta',       division: 'NL East' },
  143: { id: 143, abbr: 'PHI', short: 'Phillies',  city: 'Philadelphia',  division: 'NL East' },
  146: { id: 146, abbr: 'MIA', short: 'Marlins',   city: 'Miami',         division: 'NL East' },
  120: { id: 120, abbr: 'WSH', short: 'Nationals', city: 'Washington',    division: 'NL East' },

  // NL West
  119: { id: 119, abbr: 'LAD', short: 'Dodgers',   city: 'Los Angeles',   division: 'NL West' },
  137: { id: 137, abbr: 'SF',  short: 'Giants',    city: 'San Francisco', division: 'NL West' },
  109: { id: 109, abbr: 'ARI', short: 'D-backs',   city: 'Arizona',       division: 'NL West' },
  135: { id: 135, abbr: 'SD',  short: 'Padres',    city: 'San Diego',     division: 'NL West' },
  115: { id: 115, abbr: 'COL', short: 'Rockies',   city: 'Colorado',      division: 'NL West' },

  // AL — included for interleague schedule rendering. The standings page
  // only renders NL teams (we sync NL only).
  110: { id: 110, abbr: 'BAL', short: 'Orioles',    city: 'Baltimore',     division: 'AL East' },
  111: { id: 111, abbr: 'BOS', short: 'Red Sox',    city: 'Boston',        division: 'AL East' },
  147: { id: 147, abbr: 'NYY', short: 'Yankees',    city: 'New York',      division: 'AL East' },
  139: { id: 139, abbr: 'TB',  short: 'Rays',       city: 'Tampa Bay',     division: 'AL East' },
  141: { id: 141, abbr: 'TOR', short: 'Blue Jays',  city: 'Toronto',       division: 'AL East' },

  145: { id: 145, abbr: 'CWS', short: 'White Sox',  city: 'Chicago',       division: 'AL Central' },
  114: { id: 114, abbr: 'CLE', short: 'Guardians',  city: 'Cleveland',     division: 'AL Central' },
  116: { id: 116, abbr: 'DET', short: 'Tigers',     city: 'Detroit',       division: 'AL Central' },
  118: { id: 118, abbr: 'KC',  short: 'Royals',     city: 'Kansas City',   division: 'AL Central' },
  142: { id: 142, abbr: 'MIN', short: 'Twins',      city: 'Minnesota',     division: 'AL Central' },

  117: { id: 117, abbr: 'HOU', short: 'Astros',     city: 'Houston',       division: 'AL West' },
  108: { id: 108, abbr: 'LAA', short: 'Angels',     city: 'Los Angeles',   division: 'AL West' },
  133: { id: 133, abbr: 'ATH', short: 'Athletics',  city: 'Athletics',     division: 'AL West' },
  136: { id: 136, abbr: 'SEA', short: 'Mariners',   city: 'Seattle',       division: 'AL West' },
  140: { id: 140, abbr: 'TEX', short: 'Rangers',    city: 'Texas',         division: 'AL West' },
}

// Fallback for unknown IDs — keeps rendering safe if MLB ever adds/changes
// a team mid-season. We surface the raw ID rather than the empty string so
// it's obvious in QA.
export function teamFor(id: number): MlbTeam {
  return MLB_TEAMS[id] ?? {
    id,
    abbr: `#${id}`,
    short: `Team ${id}`,
    city: '',
    division: null,
  }
}
