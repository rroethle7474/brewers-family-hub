import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, MapPin } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Tables } from '../lib/database.types'
import { BREWERS_TEAM_ID, teamFor } from '../lib/mlbTeams'

type Game = Tables<'games'>

interface InningLine {
  num: number
  home?: { runs?: number | null }
  away?: { runs?: number | null }
}

interface LinescoreData {
  innings: InningLine[]
  scheduledInnings: number
  homeTotals: { runs: number; hits: number; errors: number }
  awayTotals: { runs: number; hits: number; errors: number }
}

type PitcherMap = Map<number, string>

interface ViewModel {
  game: Game | null
  notFound: boolean
  loading: boolean
  error: string | null
  linescore: LinescoreData | null
  pitchers: PitcherMap
}

const initialView: ViewModel = {
  game: null,
  notFound: false,
  loading: true,
  error: null,
  linescore: null,
  pitchers: new Map(),
}

export function GameDetail() {
  const { gamePk } = useParams<{ gamePk: string }>()
  const [view, setView] = useState<ViewModel>(initialView)

  useEffect(() => {
    let cancelled = false
    setView(initialView)

    const id = Number.parseInt(gamePk ?? '', 10)
    if (!Number.isFinite(id)) {
      setView({ ...initialView, loading: false, notFound: true })
      return
    }

    async function load() {
      const gameRes = await supabase
        .from('games')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (cancelled) return

      if (gameRes.error) {
        setView({
          ...initialView,
          loading: false,
          error: gameRes.error.message,
        })
        return
      }
      if (!gameRes.data) {
        setView({ ...initialView, loading: false, notFound: true })
        return
      }
      const game = gameRes.data

      // Fire MLB API enrichment in parallel — safe to fail; the page still
      // renders without linescore or pitcher names.
      const [linescore, pitchers] = await Promise.all([
        fetchLinescore(id).catch(() => null),
        fetchPitcherNames(game).catch(() => new Map<number, string>()),
      ])

      if (cancelled) return
      setView({
        game,
        notFound: false,
        loading: false,
        error: null,
        linescore,
        pitchers,
      })
    }

    load()
    return () => {
      cancelled = true
    }
  }, [gamePk])

  if (view.loading) {
    return (
      <Shell>
        <p className="text-sm text-text-muted text-center mt-10">Loading…</p>
      </Shell>
    )
  }

  if (view.notFound) {
    return (
      <Shell>
        <div className="rounded-2xl bg-surface border border-border p-6 md:p-8 text-center shadow-sm mt-6">
          <h1 className="font-display text-2xl text-navy">Game not found</h1>
          <p className="mt-2 text-text-muted">
            We don't have data for that game. It may be outside the schedule
            sync window.
          </p>
        </div>
      </Shell>
    )
  }

  if (view.error || !view.game) {
    return (
      <Shell>
        <p className="text-sm text-loss text-center mt-10" role="alert">
          Couldn't load: {view.error}
        </p>
      </Shell>
    )
  }

  const { game } = view
  return (
    <Shell>
      <div className="space-y-6 mt-6">
        <Hero game={game} />

        {(game.status === 'Final' || game.status === 'Live') && (
          <LineScore game={game} linescore={view.linescore} />
        )}

        {game.status === 'Final' && (
          <PitchersOfRecord game={game} pitchers={view.pitchers} />
        )}

        {game.status === 'Scheduled' && (
          <Probables game={game} pitchers={view.pitchers} />
        )}

        {game.status === 'Live' && <LiveBanner game={game} />}

        {(game.status === 'Postponed' ||
          game.status === 'Cancelled' ||
          game.status === 'Suspended') && (
          <PostponedBanner status={game.status} />
        )}

        <VenueCard game={game} />
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:py-10">
      <Link
        to="/schedule"
        className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Back to schedule
      </Link>
      {children}
    </div>
  )
}

// ============================================================
// Hero — vintage scoreboard motif
// ============================================================

function Hero({ game }: { game: Game }) {
  const homeTeam = teamFor(game.home_team_id)
  const awayTeam = teamFor(game.away_team_id)
  const isFinal = game.status === 'Final'
  const isLive = game.status === 'Live'

  return (
    <section
      aria-label={`${awayTeam.short} at ${homeTeam.short}`}
      className="rounded-2xl bg-navy text-white shadow-sm overflow-hidden"
    >
      <div className="px-5 py-3 bg-black/20 flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wider text-white/70">
          {formatGameDate(game.game_date)}
        </p>
        <StatusBadge status={game.status} />
      </div>

      <div className="px-5 py-6 md:px-8 md:py-8">
        <TeamScoreRow
          team={awayTeam}
          score={game.away_score}
          isBrewers={game.away_team_id === BREWERS_TEAM_ID}
          isWinner={isFinal && game.away_score != null && game.home_score != null && game.away_score > game.home_score}
          showScore={isFinal || isLive}
        />
        <div className="my-3 h-px bg-white/10" aria-hidden="true" />
        <TeamScoreRow
          team={homeTeam}
          score={game.home_score}
          isBrewers={game.home_team_id === BREWERS_TEAM_ID}
          isWinner={isFinal && game.home_score != null && game.away_score != null && game.home_score > game.away_score}
          showScore={isFinal || isLive}
        />

        {!isFinal && !isLive && (
          <p className="mt-5 text-center text-sm text-white/70">
            First pitch{' '}
            <span className="font-semibold tabular-nums text-white">
              {formatTime(game.game_datetime)}
            </span>
          </p>
        )}
      </div>
    </section>
  )
}

function TeamScoreRow({
  team,
  score,
  isBrewers,
  isWinner,
  showScore,
}: {
  team: ReturnType<typeof teamFor>
  score: number | null
  isBrewers: boolean
  isWinner: boolean
  showScore: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={[
            'flex items-center justify-center font-display text-sm tabular-nums shrink-0 rounded w-12 h-12',
            isBrewers ? 'bg-gold text-navy' : 'bg-white/10 text-white',
          ].join(' ')}
          aria-hidden="true"
        >
          {team.abbr}
        </div>
        <div className="min-w-0">
          <p className="text-sm text-white/70 truncate">{team.city}</p>
          <p className="font-display text-xl tracking-tight truncate">
            {team.short}
          </p>
        </div>
      </div>

      {showScore && (
        <p
          className={[
            'font-display tabular-nums leading-none',
            isWinner ? 'text-white' : 'text-white/60',
            'text-5xl md:text-6xl',
          ].join(' ')}
          aria-label={`Score ${score ?? 0}`}
        >
          {score ?? 0}
        </p>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'Live'
      ? 'bg-live text-white'
      : status === 'Final'
        ? 'bg-white/15 text-white'
        : status === 'Scheduled'
          ? 'bg-gold text-navy'
          : 'bg-white/15 text-white'
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${cls}`}
    >
      {status}
    </span>
  )
}

// ============================================================
// Line score — vintage scoreboard motif
// ============================================================

function LineScore({
  game,
  linescore,
}: {
  game: Game
  linescore: LinescoreData | null
}) {
  if (!linescore) {
    return (
      <Card title="Line score">
        <p className="text-sm text-text-muted">Inning-by-inning data unavailable.</p>
      </Card>
    )
  }

  const homeTeam = teamFor(game.home_team_id)
  const awayTeam = teamFor(game.away_team_id)
  const innings = linescore.innings
  const scheduled = Math.max(linescore.scheduledInnings, innings.length)

  return (
    <Card title="Line score">
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-text-muted text-[10px] uppercase tracking-wider">
              <th className="text-left font-semibold py-1 px-1">&nbsp;</th>
              {Array.from({ length: scheduled }).map((_, i) => (
                <th
                  key={i + 1}
                  className="font-semibold py-1 px-1 text-center min-w-[1.75rem]"
                  scope="col"
                >
                  {i + 1}
                </th>
              ))}
              <th className="font-semibold py-1 px-1 text-center min-w-[1.75rem]">R</th>
              <th className="font-semibold py-1 px-1 text-center min-w-[1.75rem]">H</th>
              <th className="font-semibold py-1 px-1 text-center min-w-[1.75rem]">E</th>
            </tr>
          </thead>
          <tbody>
            <ScoreboardRow
              abbr={awayTeam.abbr}
              isBrewers={game.away_team_id === BREWERS_TEAM_ID}
              innings={innings}
              side="away"
              scheduled={scheduled}
              totals={linescore.awayTotals}
            />
            <ScoreboardRow
              abbr={homeTeam.abbr}
              isBrewers={game.home_team_id === BREWERS_TEAM_ID}
              innings={innings}
              side="home"
              scheduled={scheduled}
              totals={linescore.homeTotals}
            />
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function ScoreboardRow({
  abbr,
  isBrewers,
  innings,
  side,
  scheduled,
  totals,
}: {
  abbr: string
  isBrewers: boolean
  innings: InningLine[]
  side: 'home' | 'away'
  scheduled: number
  totals: { runs: number; hits: number; errors: number }
}) {
  return (
    <tr
      className={[
        'border-t border-border',
        isBrewers ? 'bg-gold/10' : '',
      ].join(' ')}
    >
      <th
        scope="row"
        className={[
          'text-left py-2 px-1 font-display tracking-tight',
          isBrewers ? 'text-navy' : 'text-text',
        ].join(' ')}
      >
        {abbr}
      </th>
      {Array.from({ length: scheduled }).map((_, i) => {
        const inning = innings.find((n) => n.num === i + 1)
        const runs = inning?.[side]?.runs
        return (
          <td
            key={i + 1}
            className="text-center py-2 px-1 text-text"
          >
            {runs == null ? <span className="text-text-muted">·</span> : runs}
          </td>
        )
      })}
      <td className="text-center py-2 px-1 font-semibold text-text">
        {totals.runs}
      </td>
      <td className="text-center py-2 px-1 text-text">{totals.hits}</td>
      <td className="text-center py-2 px-1 text-text">{totals.errors}</td>
    </tr>
  )
}

// ============================================================
// Decisions / probables
// ============================================================

function PitchersOfRecord({
  game,
  pitchers,
}: {
  game: Game
  pitchers: PitcherMap
}) {
  const wId = game.winning_pitcher_id
  const lId = game.losing_pitcher_id
  if (wId == null && lId == null) return null

  return (
    <Card title="Pitchers of record">
      <dl className="grid grid-cols-3 gap-2 text-sm">
        {wId != null && (
          <PitcherCell label="Win" name={pitchers.get(wId) ?? `#${wId}`} accent="win" />
        )}
        {lId != null && (
          <PitcherCell label="Loss" name={pitchers.get(lId) ?? `#${lId}`} accent="loss" />
        )}
      </dl>
    </Card>
  )
}

function Probables({
  game,
  pitchers,
}: {
  game: Game
  pitchers: PitcherMap
}) {
  const homeId = game.probable_home_pitcher_id
  const awayId = game.probable_away_pitcher_id
  const haveAny = homeId != null || awayId != null
  if (!haveAny) {
    return (
      <Card title="Probable pitchers">
        <p className="text-sm text-text-muted">
          Not announced yet.
        </p>
      </Card>
    )
  }

  const homeTeam = teamFor(game.home_team_id)
  const awayTeam = teamFor(game.away_team_id)

  return (
    <Card title="Probable pitchers">
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <PitcherCell
          label={awayTeam.abbr}
          name={awayId == null ? 'TBD' : pitchers.get(awayId) ?? `#${awayId}`}
          accent={game.away_team_id === BREWERS_TEAM_ID ? 'brewers' : 'neutral'}
        />
        <PitcherCell
          label={homeTeam.abbr}
          name={homeId == null ? 'TBD' : pitchers.get(homeId) ?? `#${homeId}`}
          accent={game.home_team_id === BREWERS_TEAM_ID ? 'brewers' : 'neutral'}
        />
      </dl>
    </Card>
  )
}

function PitcherCell({
  label,
  name,
  accent,
}: {
  label: string
  name: string
  accent: 'win' | 'loss' | 'brewers' | 'neutral'
}) {
  const labelCls =
    accent === 'win'
      ? 'text-win'
      : accent === 'loss'
        ? 'text-loss'
        : accent === 'brewers'
          ? 'text-gold-deep'
          : 'text-text-muted'
  return (
    <div className="rounded-xl bg-bg border border-border p-3">
      <dt className={`text-[10px] uppercase tracking-wider font-semibold ${labelCls}`}>
        {label}
      </dt>
      <dd className="mt-1 font-medium text-text truncate">{name}</dd>
    </div>
  )
}

function LiveBanner({ game }: { game: Game }) {
  const inningLabel =
    game.inning != null
      ? `${game.inning_state ?? ''} ${game.inning}`.trim()
      : 'In progress'

  return (
    <div className="rounded-2xl bg-live/10 border border-live/30 p-4 md:p-5">
      <p className="text-[11px] uppercase tracking-wider font-semibold text-live">
        {inningLabel}
      </p>
      <p className="mt-1 text-sm text-text">
        Game in progress — live tracker coming Phase 3.
      </p>
    </div>
  )
}

function PostponedBanner({ status }: { status: string }) {
  return (
    <div className="rounded-2xl bg-bg border border-border p-4 md:p-5">
      <p className="text-[11px] uppercase tracking-wider font-semibold text-text-muted">
        {status}
      </p>
      <p className="mt-1 text-sm text-text">
        {status === 'Postponed'
          ? 'Game postponed. Check back for a make-up date.'
          : status === 'Suspended'
            ? 'Game suspended. Resumes later.'
            : 'Game cancelled.'}
      </p>
    </div>
  )
}

function VenueCard({ game }: { game: Game }) {
  if (!game.venue) return null
  return (
    <div className="flex items-center gap-2 text-sm text-text-muted">
      <MapPin size={16} aria-hidden="true" />
      <span>{game.venue}</span>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-surface border border-border shadow-sm overflow-hidden">
      <header className="bg-bg border-b border-border px-5 py-2">
        <h2 className="text-[11px] uppercase tracking-wider text-text-muted font-semibold">
          {title}
        </h2>
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  )
}

// ============================================================
// MLB API helpers
// ============================================================

async function fetchLinescore(gamePk: number): Promise<LinescoreData | null> {
  const res = await fetch(
    `https://statsapi.mlb.com/api/v1/game/${gamePk}/linescore`,
  )
  if (!res.ok) return null
  const data = await res.json()
  if (!Array.isArray(data?.innings)) return null
  return {
    innings: data.innings,
    scheduledInnings:
      typeof data.scheduledInnings === 'number' ? data.scheduledInnings : 9,
    homeTotals: {
      runs: data.teams?.home?.runs ?? 0,
      hits: data.teams?.home?.hits ?? 0,
      errors: data.teams?.home?.errors ?? 0,
    },
    awayTotals: {
      runs: data.teams?.away?.runs ?? 0,
      hits: data.teams?.away?.hits ?? 0,
      errors: data.teams?.away?.errors ?? 0,
    },
  }
}

async function fetchPitcherNames(game: Game): Promise<PitcherMap> {
  const ids = new Set<number>()
  for (const id of [
    game.winning_pitcher_id,
    game.losing_pitcher_id,
    game.probable_home_pitcher_id,
    game.probable_away_pitcher_id,
  ]) {
    if (typeof id === 'number') ids.add(id)
  }
  if (ids.size === 0) return new Map()

  const idsCsv = Array.from(ids).join(',')
  const res = await fetch(
    `https://statsapi.mlb.com/api/v1/people?personIds=${idsCsv}`,
  )
  if (!res.ok) return new Map()
  const data = await res.json()
  const m = new Map<number, string>()
  for (const p of data?.people ?? []) {
    if (typeof p?.id === 'number' && typeof p?.fullName === 'string') {
      m.set(p.id, p.fullName)
    }
  }
  return m
}

function formatGameDate(iso: string): string {
  const [y, m, d] = iso.split('-').map((s) => Number.parseInt(s, 10))
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}
