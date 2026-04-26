import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Tables } from '../lib/database.types'
import {
  BREWERS_TEAM_ID,
  type Division,
  teamFor,
} from '../lib/mlbTeams'

type Standings = Tables<'standings_snapshot'>

// NL renders first because the page is "where do the Brewers stand?" before
// it's "what are the standings?". AL follows for interleague context.
const LEAGUE_SECTIONS: { league: 'NL' | 'AL'; divisions: Division[] }[] = [
  { league: 'NL', divisions: ['NL Central', 'NL East', 'NL West'] },
  { league: 'AL', divisions: ['AL East', 'AL Central', 'AL West'] },
]

interface ViewModel {
  rows: Standings[]
  snapshotDate: string | null
  loading: boolean
  error: string | null
}

const initialView: ViewModel = {
  rows: [],
  snapshotDate: null,
  loading: true,
  error: null,
}

export function Standings() {
  const [view, setView] = useState<ViewModel>(initialView)

  useEffect(() => {
    let cancelled = false

    async function load() {
      // Step 1: latest snapshot date. Across all teams, snapshot_date is
      // written in lockstep by sync-standings, so picking max() over any
      // row is fine and avoids a separate window function.
      const latestDateRes = await supabase
        .from('standings_snapshot')
        .select('snapshot_date')
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (cancelled) return
      if (latestDateRes.error) {
        setView({
          rows: [],
          snapshotDate: null,
          loading: false,
          error: latestDateRes.error.message,
        })
        return
      }
      const snapshotDate = latestDateRes.data?.snapshot_date ?? null
      if (!snapshotDate) {
        setView({ rows: [], snapshotDate: null, loading: false, error: null })
        return
      }

      // Step 2: all teams for that date.
      const rowsRes = await supabase
        .from('standings_snapshot')
        .select('*')
        .eq('snapshot_date', snapshotDate)
        .order('division_rank', { ascending: true, nullsFirst: false })

      if (cancelled) return
      setView({
        rows: rowsRes.data ?? [],
        snapshotDate,
        loading: false,
        error: rowsRes.error?.message ?? null,
      })
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (view.loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center">
        <p className="text-sm text-text-muted">Loading…</p>
      </div>
    )
  }

  if (view.error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <p className="text-sm text-loss" role="alert">
          Couldn't load standings: {view.error}
        </p>
      </div>
    )
  }

  if (!view.snapshotDate || view.rows.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="rounded-2xl bg-surface border border-border p-6 md:p-8 text-center shadow-sm">
          <h1 className="font-display text-3xl text-navy">Standings</h1>
          <p className="mt-3 text-text-muted">
            No standings data yet. The daily sync hasn't populated rows.
          </p>
        </div>
      </div>
    )
  }

  // Group rows by division. teamFor() is the source of truth for division
  // membership; rows for unknown teams (shouldn't happen, but defensive)
  // get bucketed under "Other".
  const byDivision = new Map<Division | 'Other', Standings[]>()
  for (const row of view.rows) {
    const team = teamFor(row.team_id)
    const key: Division | 'Other' = team.division ?? 'Other'
    const list = byDivision.get(key) ?? []
    list.push(row)
    byDivision.set(key, list)
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:py-10 space-y-8">
      <header>
        <h1 className="font-display text-3xl md:text-4xl text-navy">Standings</h1>
        <p className="mt-2 text-text-muted">
          Updated{' '}
          <span className="font-medium text-text">
            {formatDate(view.snapshotDate)}
          </span>
        </p>
      </header>

      {LEAGUE_SECTIONS.map(({ league, divisions }) => {
        const visibleDivisions = divisions.filter(
          (d) => (byDivision.get(d) ?? []).length > 0,
        )
        if (visibleDivisions.length === 0) return null
        return (
          <section key={league} className="space-y-4">
            <h2 className="font-display text-lg uppercase tracking-wider text-text-muted">
              {league === 'NL' ? 'National League' : 'American League'}
            </h2>
            {visibleDivisions.map((div) => (
              <DivisionCard
                key={div}
                division={div}
                rows={byDivision.get(div) ?? []}
              />
            ))}
          </section>
        )
      })}
    </div>
  )
}


function DivisionCard({
  division,
  rows,
}: {
  division: Division
  rows: Standings[]
}) {
  return (
    <section
      aria-label={`${division} standings`}
      className="rounded-2xl bg-surface border border-border shadow-sm overflow-hidden"
    >
      <header className="bg-navy text-white px-5 py-3">
        <h2 className="font-display text-lg tracking-tight">{division}</h2>
      </header>
      <ol className="divide-y divide-border">
        {rows.map((row) => (
          <TeamRow key={row.team_id} row={row} />
        ))}
      </ol>
    </section>
  )
}

function TeamRow({ row }: { row: Standings }) {
  const team = teamFor(row.team_id)
  const isBrewers = row.team_id === BREWERS_TEAM_ID
  const pct = formatPct(row.pct)

  return (
    <li
      className={[
        'px-4 py-3 md:px-5 md:py-4 flex items-center gap-3',
        isBrewers ? 'bg-gold/10' : 'bg-surface',
      ].join(' ')}
    >
      <RankBadge rank={row.division_rank} highlighted={isBrewers} />

      <div className="flex-1 min-w-0">
        <p
          className={[
            'truncate font-medium',
            isBrewers ? 'text-navy' : 'text-text',
          ].join(' ')}
        >
          {team.short}
          {isBrewers && (
            <span className="ml-2 text-[10px] uppercase tracking-wider text-gold-deep font-semibold">
              us
            </span>
          )}
        </p>
        <p className="mt-0.5 text-[11px] text-text-muted truncate">
          {team.abbr}
          {row.last_10 ? ` · L10 ${row.last_10}` : ''}
          {row.streak ? ` · ${row.streak}` : ''}
        </p>
      </div>

      <div className="text-right shrink-0">
        <p className="font-display text-xl tabular-nums leading-none text-text">
          {row.wins}-{row.losses}
        </p>
        <p className="mt-1 text-[11px] tabular-nums text-text-muted">
          {pct}
          {row.games_back != null && row.games_back > 0
            ? ` · GB ${formatGB(row.games_back)}`
            : ''}
        </p>
      </div>
    </li>
  )
}

function RankBadge({
  rank,
  highlighted,
}: {
  rank: number | null
  highlighted: boolean
}) {
  return (
    <div
      className={[
        'flex items-center justify-center w-8 h-8 rounded-full font-display tabular-nums shrink-0 text-sm',
        highlighted
          ? 'bg-gold text-navy'
          : 'bg-bg text-text-muted border border-border',
      ].join(' ')}
      aria-label={rank == null ? 'Unranked' : `Division rank ${rank}`}
    >
      {rank ?? '–'}
    </div>
  )
}

function formatPct(pct: number | null): string {
  if (pct == null) return '.000'
  // MLB convention: .NNN with leading dot, no leading zero.
  return pct.toFixed(3).replace(/^0/, '')
}

function formatGB(gb: number): string {
  // Halves are rendered as ".5" by Postgres → display as ".5" not " 0.5".
  if (Number.isInteger(gb)) return gb.toString()
  return gb.toFixed(1)
}

function formatDate(iso: string): string {
  // iso is YYYY-MM-DD; render in user's locale.
  const [y, m, d] = iso.split('-').map((s) => Number.parseInt(s, 10))
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}
