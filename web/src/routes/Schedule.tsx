import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, List } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Tables } from '../lib/database.types'
import { BREWERS_TEAM_ID, teamFor } from '../lib/mlbTeams'

type Game = Tables<'games'>

type View = 'calendar' | 'list'

interface ViewModel {
  games: Game[]
  loading: boolean
  error: string | null
}

const initialView: ViewModel = { games: [], loading: true, error: null }

// SPEC §11 motif: GitHub-contribution-style heatmap. The realisation is a
// vertically-stacked sequence of monthly grids — that fits 375px without
// horizontal scroll and keeps each tap target ≥44px.
export function Schedule() {
  const [view, setView] = useState<View>('calendar')
  const [data, setData] = useState<ViewModel>(initialView)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const res = await supabase
        .from('games')
        .select('*')
        .order('game_date', { ascending: true })

      if (cancelled) return
      setData({
        games: res.data ?? [],
        loading: false,
        error: res.error?.message ?? null,
      })
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (data.loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center">
        <p className="text-sm text-text-muted">Loading…</p>
      </div>
    )
  }

  if (data.error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <p className="text-sm text-loss" role="alert">
          Couldn't load schedule: {data.error}
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:py-10 space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl md:text-4xl text-navy">Schedule</h1>
          <p className="mt-2 text-text-muted">
            Brewers games — recent, today, and upcoming.
          </p>
        </div>
        <ViewToggle view={view} onChange={setView} />
      </header>

      {data.games.length === 0 ? (
        <EmptyState />
      ) : view === 'calendar' ? (
        <CalendarView games={data.games} />
      ) : (
        <ListView games={data.games} />
      )}
    </div>
  )
}

function ViewToggle({
  view,
  onChange,
}: {
  view: View
  onChange: (v: View) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Schedule view"
      className="inline-flex items-center rounded-xl bg-surface border border-border p-1 shadow-sm"
    >
      <ToggleButton
        active={view === 'calendar'}
        onClick={() => onChange('calendar')}
        label="Calendar"
        Icon={CalendarDays}
      />
      <ToggleButton
        active={view === 'list'}
        onClick={() => onChange('list')}
        label="List"
        Icon={List}
      />
    </div>
  )
}

function ToggleButton({
  active,
  onClick,
  label,
  Icon,
}: {
  active: boolean
  onClick: () => void
  label: string
  Icon: typeof CalendarDays
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={[
        'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors min-h-[40px]',
        active
          ? 'bg-navy text-white'
          : 'text-text-muted hover:text-text',
      ].join(' ')}
    >
      <Icon size={16} aria-hidden="true" />
      {label}
    </button>
  )
}

// ============================================================
// Calendar view — month-by-month grids
// ============================================================

interface MonthBucket {
  // First day of the month, used as the React key + for header rendering.
  monthStart: Date
  // Map of YYYY-MM-DD → games on that date (handles doubleheaders).
  games: Map<string, Game[]>
}

function CalendarView({ games }: { games: Game[] }) {
  const buckets = useMemo(() => bucketByMonth(games), [games])
  const todayKey = todayKeyLocal()

  return (
    <div className="space-y-6">
      <Legend />
      {buckets.map((b) => (
        <MonthGrid key={b.monthStart.toISOString()} bucket={b} todayKey={todayKey} />
      ))}
    </div>
  )
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
      <LegendDot className="bg-win/80" label="Win" />
      <LegendDot className="bg-loss/80" label="Loss" />
      <LegendDot className="bg-live" label="Live" />
      <LegendDot className="bg-navy/80" label="Upcoming" />
      <LegendDot className="bg-bg border border-border" label="Postponed" />
    </div>
  )
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block w-3 h-3 rounded ${className}`} aria-hidden="true" />
      {label}
    </span>
  )
}

function MonthGrid({ bucket, todayKey }: { bucket: MonthBucket; todayKey: string }) {
  const monthStart = bucket.monthStart
  const year = monthStart.getFullYear()
  const month = monthStart.getMonth()
  // Sun=0 .. Sat=6 — pad with empty cells before day 1 so the grid lines up.
  const startDow = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: ({ date: string; games: Game[] } | null)[] = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const date = isoDateLocal(year, month, d)
    cells.push({ date, games: bucket.games.get(date) ?? [] })
  }
  // Pad to a multiple of 7 so trailing rows render cleanly.
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <section
      aria-label={monthStart.toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      })}
      className="rounded-2xl bg-surface border border-border shadow-sm overflow-hidden"
    >
      <header className="bg-navy text-white px-5 py-3">
        <h2 className="font-display text-lg tracking-tight">
          {monthStart.toLocaleDateString(undefined, {
            month: 'long',
            year: 'numeric',
          })}
        </h2>
      </header>

      <div className="px-2 py-2 md:px-3 md:py-3">
        <div className="grid grid-cols-7 gap-1 text-[10px] uppercase tracking-wider text-text-muted text-center mb-1">
          <span>Sun</span>
          <span>Mon</span>
          <span>Tue</span>
          <span>Wed</span>
          <span>Thu</span>
          <span>Fri</span>
          <span>Sat</span>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell, i) =>
            cell == null ? (
              <div key={`empty-${i}`} className="aspect-square" aria-hidden="true" />
            ) : (
              <DayCell
                key={cell.date}
                date={cell.date}
                games={cell.games}
                isToday={cell.date === todayKey}
              />
            ),
          )}
        </div>
      </div>
    </section>
  )
}

function DayCell({
  date,
  games,
  isToday,
}: {
  date: string
  games: Game[]
  isToday: boolean
}) {
  const day = Number.parseInt(date.slice(8, 10), 10)
  const todayRing = isToday ? 'ring-2 ring-gold ring-offset-1 ring-offset-surface' : ''

  // No game on this date — show day number muted.
  if (games.length === 0) {
    return (
      <div
        className={[
          'aspect-square rounded-md flex items-start justify-end p-1 text-[11px] tabular-nums',
          'bg-bg text-text-muted',
          todayRing,
        ].join(' ')}
      >
        {day}
      </div>
    )
  }

  // Doubleheader (rare). Stack two pills inside the cell.
  if (games.length > 1) {
    return (
      <div
        className={[
          'aspect-square rounded-md p-0.5 flex flex-col gap-0.5 bg-surface border border-border',
          todayRing,
        ].join(' ')}
      >
        {games.slice(0, 2).map((g) => (
          <GamePill key={g.id} game={g} day={day} compact />
        ))}
      </div>
    )
  }

  return <SingleGameCell game={games[0]} day={day} todayRing={todayRing} />
}

function SingleGameCell({
  game,
  day,
  todayRing,
}: {
  game: Game
  day: number
  todayRing: string
}) {
  const fill = cellFill(game)
  return (
    <Link
      to={`/games/${game.id}`}
      aria-label={cellAriaLabel(game)}
      className={[
        'aspect-square rounded-md flex flex-col justify-between p-1 transition-opacity hover:opacity-90',
        fill.bg,
        fill.text,
        todayRing,
      ].join(' ')}
    >
      <span className="text-[10px] tabular-nums opacity-80 self-end">{day}</span>
      <span className="text-[11px] font-semibold tracking-tight self-start truncate">
        {opponentAbbr(game)}
      </span>
    </Link>
  )
}

function GamePill({
  game,
  day,
  compact,
}: {
  game: Game
  day: number
  compact?: boolean
}) {
  const fill = cellFill(game)
  return (
    <Link
      to={`/games/${game.id}`}
      aria-label={cellAriaLabel(game)}
      className={[
        'flex items-center justify-between rounded px-1 py-0.5 text-[9px] font-semibold flex-1',
        fill.bg,
        fill.text,
      ].join(' ')}
    >
      <span>{opponentAbbr(game)}</span>
      {!compact && <span className="opacity-80">{day}</span>}
    </Link>
  )
}

// ============================================================
// List view
// ============================================================

function ListView({ games }: { games: Game[] }) {
  const todayKey = todayKeyLocal()
  return (
    <ol className="space-y-2" aria-label="Games list">
      {games.map((g) => (
        <ListRow key={g.id} game={g} isToday={g.game_date === todayKey} />
      ))}
    </ol>
  )
}

function ListRow({ game, isToday }: { game: Game; isToday: boolean }) {
  const opponent = teamFor(opponentTeamId(game))
  const homeAway = isHomeGame(game) ? 'vs' : '@'
  const { home_score, away_score, status } = game
  const isFinal = status === 'Final'

  return (
    <li>
      <Link
        to={`/games/${game.id}`}
        className={[
          'flex items-center gap-3 rounded-2xl border bg-surface p-3 md:p-4 shadow-sm hover:bg-bg transition-colors min-h-[64px]',
          isToday ? 'border-gold' : 'border-border',
        ].join(' ')}
      >
        <DateBlock date={game.game_date} isToday={isToday} />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text truncate">
            <span className="text-text-muted mr-1">{homeAway}</span>
            {opponent.short}
          </p>
          <p className="mt-0.5 text-[11px] text-text-muted truncate">
            {statusLabel(game)}
            {game.venue ? ` · ${game.venue}` : ''}
          </p>
        </div>

        <div className="text-right shrink-0">
          {isFinal && home_score != null && away_score != null ? (
            <>
              <p className="font-display text-lg tabular-nums leading-none text-text">
                {brewersScore(game)}
                <span className="text-text-muted">–</span>
                {opponentScore(game)}
              </p>
              <ResultPill won={game.brewers_won} />
            </>
          ) : (
            <p className="text-[11px] tabular-nums text-text-muted">
              {gameTimeLocal(game.game_datetime)}
            </p>
          )}
        </div>
      </Link>
    </li>
  )
}

function DateBlock({ date, isToday }: { date: string; isToday: boolean }) {
  const [y, m, d] = date.split('-').map((s) => Number.parseInt(s, 10))
  const dt = new Date(y, m - 1, d)
  return (
    <div
      className={[
        'flex flex-col items-center justify-center rounded-lg w-12 h-12 shrink-0',
        isToday ? 'bg-gold text-navy' : 'bg-bg text-text',
      ].join(' ')}
      aria-label={dt.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      })}
    >
      <span className="text-[9px] uppercase tracking-wider opacity-80">
        {dt.toLocaleDateString(undefined, { weekday: 'short' })}
      </span>
      <span className="font-display text-lg tabular-nums leading-none">
        {dt.getDate()}
      </span>
    </div>
  )
}

function ResultPill({ won }: { won: boolean | null }) {
  if (won == null) return null
  const label = won ? 'W' : 'L'
  const cls = won
    ? 'bg-win/10 text-win border-win/30'
    : 'bg-loss/10 text-loss border-loss/30'
  return (
    <span
      className={`mt-1 inline-flex items-center justify-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${cls}`}
    >
      {label}
    </span>
  )
}

function EmptyState() {
  return (
    <div className="rounded-2xl bg-surface border border-border p-6 md:p-8 text-center shadow-sm">
      <CalendarDays
        size={32}
        className="mx-auto text-text-muted"
        aria-hidden="true"
      />
      <p className="mt-3 font-medium text-text">No games loaded yet</p>
      <p className="mt-1 text-sm text-text-muted">
        The daily schedule sync hasn't populated games. Check back after the
        next sync runs.
      </p>
    </div>
  )
}

// ============================================================
// Helpers
// ============================================================

function bucketByMonth(games: Game[]): MonthBucket[] {
  const monthMap = new Map<string, MonthBucket>()
  for (const g of games) {
    const [y, m] = g.game_date.split('-').map((s) => Number.parseInt(s, 10))
    const monthKey = `${y}-${String(m).padStart(2, '0')}`
    let bucket = monthMap.get(monthKey)
    if (!bucket) {
      bucket = {
        monthStart: new Date(y, m - 1, 1),
        games: new Map(),
      }
      monthMap.set(monthKey, bucket)
    }
    const list = bucket.games.get(g.game_date) ?? []
    list.push(g)
    bucket.games.set(g.game_date, list)
  }
  // Stable order: sorted by monthStart.
  return Array.from(monthMap.values()).sort(
    (a, b) => a.monthStart.getTime() - b.monthStart.getTime(),
  )
}

function isHomeGame(game: Game): boolean {
  return game.home_team_id === BREWERS_TEAM_ID
}

function opponentTeamId(game: Game): number {
  return isHomeGame(game) ? game.away_team_id : game.home_team_id
}

function opponentAbbr(game: Game): string {
  return teamFor(opponentTeamId(game)).abbr
}

function brewersScore(game: Game): number | null {
  return isHomeGame(game) ? game.home_score : game.away_score
}

function opponentScore(game: Game): number | null {
  return isHomeGame(game) ? game.away_score : game.home_score
}

interface CellFill {
  bg: string
  text: string
}

function cellFill(game: Game): CellFill {
  switch (game.status) {
    case 'Final':
      return game.brewers_won
        ? { bg: 'bg-win/85', text: 'text-white' }
        : game.brewers_won === false
          ? { bg: 'bg-loss/85', text: 'text-white' }
          : { bg: 'bg-text-muted/70', text: 'text-white' }
    case 'Live':
      return { bg: 'bg-live', text: 'text-white' }
    case 'Postponed':
    case 'Cancelled':
    case 'Suspended':
      return { bg: 'bg-bg border border-border', text: 'text-text-muted' }
    default:
      // Scheduled / Unknown — neutral navy
      return { bg: 'bg-navy/85', text: 'text-white' }
  }
}

function cellAriaLabel(game: Game): string {
  const opponent = teamFor(opponentTeamId(game)).short
  const homeAway = isHomeGame(game) ? 'vs' : 'at'
  const date = formatDateForLabel(game.game_date)
  const result =
    game.status === 'Final'
      ? game.brewers_won
        ? `won ${brewersScore(game)}-${opponentScore(game)}`
        : game.brewers_won === false
          ? `lost ${brewersScore(game)}-${opponentScore(game)}`
          : 'final'
      : game.status.toLowerCase()
  return `${date}, ${homeAway} ${opponent}, ${result}`
}

function statusLabel(game: Game): string {
  switch (game.status) {
    case 'Final':
      return 'Final'
    case 'Live':
      return `Live · ${game.inning_state ?? ''} ${game.inning ?? ''}`.trim()
    case 'Scheduled':
      return 'Scheduled'
    default:
      return game.status
  }
}

function gameTimeLocal(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

// "today" in the user's local timezone, formatted as YYYY-MM-DD.
// Matches game_date which is also a calendar-day date in the team's local TZ.
function todayKeyLocal(): string {
  const now = new Date()
  return isoDateLocal(now.getFullYear(), now.getMonth(), now.getDate())
}

function isoDateLocal(y: number, monthZeroIndexed: number, d: number): string {
  return `${y}-${String(monthZeroIndexed + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function formatDateForLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map((s) => Number.parseInt(s, 10))
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}
