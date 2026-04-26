import { useEffect, useState } from 'react'
import { Trophy } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import type { Tables } from '../lib/database.types'

type Standings = Tables<'standings_snapshot'>

interface Row {
  prediction_id: string
  user_id: string
  display_name: string
  predicted_wins: number
  submitted_at: string
}

const SEASON_GAMES = 162

export function Leaderboard() {
  const { user } = useAuth()
  const [standings, setStandings] = useState<Standings | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const [standingsRes, predRes] = await Promise.all([
        supabase
          .from('standings_snapshot')
          .select('*')
          .eq('team_id', 158)
          .order('snapshot_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('predictions')
          .select(
            'id, user_id, predicted_wins, submitted_at, profiles!inner(display_name)',
          )
          .order('submitted_at', { ascending: true }),
      ])

      if (cancelled) return

      if (standingsRes.error || predRes.error) {
        setError(
          standingsRes.error?.message ?? predRes.error?.message ?? 'Load failed',
        )
        setLoading(false)
        return
      }

      const mapped: Row[] = (predRes.data ?? []).map((p) => ({
        prediction_id: p.id,
        user_id: p.user_id,
        display_name: p.profiles.display_name,
        predicted_wins: p.predicted_wins,
        submitted_at: p.submitted_at,
      }))

      setStandings(standingsRes.data ?? null)
      setRows(mapped)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center">
        <p className="text-sm text-text-muted">Loading…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <p className="text-sm text-loss" role="alert">
          Couldn't load: {error}
        </p>
      </div>
    )
  }

  // Compute on-pace projection if we have standings.
  const onPace = standings ? computeOnPace(standings) : null

  // Sort by closeness to on-pace (ascending). Tie-break by earliest submission
  // (stable sort input was already submitted_at ASC).
  const sorted = onPace == null
    ? rows
    : [...rows].sort(
        (a, b) =>
          Math.abs(a.predicted_wins - onPace) -
          Math.abs(b.predicted_wins - onPace),
      )

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:py-10 space-y-6">
      <header>
        <h1 className="font-display text-3xl md:text-4xl text-navy">
          Leaderboard
        </h1>
        <p className="mt-2 text-text-muted">
          Closest to the Brewers' current pace is winning. Updates as the season
          plays out.
        </p>
      </header>

      {onPace != null && standings && (
        <div className="rounded-2xl bg-navy text-white p-5 md:p-6 shadow-sm">
          <p className="text-[11px] uppercase tracking-wider text-white/70">
            On pace for
          </p>
          <p className="mt-1 font-display text-5xl tabular-nums">
            {onPace}{' '}
            <span className="text-base font-sans text-white/70 align-middle">
              wins
            </span>
          </p>
          <p className="mt-3 text-xs text-white/60">
            From {standings.wins}-{standings.losses} ·{' '}
            {standings.wins + standings.losses} games played
          </p>
        </div>
      )}

      {sorted.length === 0 ? (
        <EmptyState />
      ) : (
        <ol className="space-y-3" aria-label="Leaderboard rankings">
          {sorted.map((r, i) => (
            <LeaderRow
              key={r.prediction_id}
              rank={i + 1}
              row={r}
              onPace={onPace}
              isYou={r.user_id === user?.id}
            />
          ))}
        </ol>
      )}

      {/* TODO: SPEC §9 visualization — a horizontal axis from min_valid..162
          with each prediction as a vertical line and an animated current-pace
          marker. Deferred to Phase 2 polish; the card list above covers the
          numerical info. */}
    </div>
  )
}

function LeaderRow({
  rank,
  row,
  onPace,
  isYou,
}: {
  rank: number
  row: Row
  onPace: number | null
  isYou: boolean
}) {
  const diff = onPace == null ? null : row.predicted_wins - onPace

  return (
    <li
      className={[
        'rounded-2xl border p-4 md:p-5 shadow-sm flex items-center gap-4',
        isYou ? 'bg-gold/10 border-gold' : 'bg-surface border-border',
      ].join(' ')}
    >
      <RankBadge rank={rank} />

      <div className="flex-1 min-w-0">
        <p className="font-medium text-text truncate">
          {row.display_name}
          {isYou && (
            <span className="ml-2 text-[10px] uppercase tracking-wider text-gold-deep font-semibold">
              you
            </span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-text-muted">
          Submitted {formatDate(row.submitted_at)}
        </p>
      </div>

      <div className="text-right">
        <p className="font-display text-2xl tabular-nums text-navy leading-none">
          {row.predicted_wins}
        </p>
        {diff != null && (
          <p className="mt-1 text-[11px] text-text-muted tabular-nums">
            {diff === 0 ? 'on pace' : `${diff > 0 ? '+' : ''}${diff} from pace`}
          </p>
        )}
      </div>
    </li>
  )
}

function RankBadge({ rank }: { rank: number }) {
  const isPodium = rank <= 3
  return (
    <div
      className={[
        'flex items-center justify-center w-9 h-9 rounded-full font-display tabular-nums shrink-0',
        isPodium
          ? 'bg-gold text-navy text-base'
          : 'bg-bg text-text-muted border border-border text-sm',
      ].join(' ')}
      aria-label={`Rank ${rank}`}
    >
      {rank}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="rounded-2xl bg-surface border border-border p-6 md:p-8 text-center shadow-sm">
      <Trophy
        size={32}
        className="mx-auto text-gold-deep"
        aria-hidden="true"
      />
      <p className="mt-3 font-medium text-text">No picks yet</p>
      <p className="mt-1 text-sm text-text-muted">
        Be the first one in. Head to{' '}
        <a className="text-navy font-medium underline" href="/predictions">
          Predictions
        </a>{' '}
        and lock in your guess.
      </p>
    </div>
  )
}

function computeOnPace(s: Standings): number | null {
  const gp = s.wins + s.losses
  if (gp <= 0) return null
  return Math.round((s.wins / gp) * SEASON_GAMES)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}
