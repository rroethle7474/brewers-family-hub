import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { BREWERS_TEAM_ID, teamFor } from '../../lib/mlbTeams'
import type { Tables } from '../../lib/database.types'

type Game = Tables<'games'>

interface Props {
  game: Game
  /** "today" if game.game_date === today; "future" otherwise. Drives copy. */
  when: 'today' | 'future'
}

/**
 * Slim compact hero for non-live game contexts: today-scheduled (with
 * countdown), today-final (with result), future-scheduled. Always tappable —
 * routes to the game-detail page.
 */
export function NextGameStrip({ game, when }: Props) {
  const opponent = opponentTeam(game)
  const isHome = game.home_team_id === BREWERS_TEAM_ID
  const vsAt = isHome ? 'vs' : '@'

  return (
    <Link
      to={`/games/${game.id}`}
      className="block rounded-2xl bg-navy text-white border border-white/10 px-5 py-4 shadow-sm hover:border-white/30 transition-colors min-h-[64px]"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-wider text-gold-deep font-semibold">
            <BadgeText game={game} when={when} />
          </p>
          <p className="mt-0.5 font-display text-base text-white truncate">
            <PrimaryLine
              game={game}
              when={when}
              opponentShort={opponent.short}
              opponentAbbr={opponent.abbr}
              vsAt={vsAt}
            />
          </p>
        </div>
        <ChevronRight
          size={20}
          className="text-white/40 shrink-0"
          aria-hidden="true"
        />
      </div>
    </Link>
  )
}

function BadgeText({ game, when }: { game: Game; when: 'today' | 'future' }) {
  if (game.status === 'Final') return <>Final</>
  if (game.status === 'Postponed') return <>Postponed</>
  if (game.status === 'Suspended') return <>Suspended</>
  if (game.status === 'Cancelled') return <>Cancelled</>
  if (when === 'today') return <>Today</>
  return <>Next Game</>
}

function PrimaryLine({
  game,
  when,
  opponentShort,
  opponentAbbr,
  vsAt,
}: {
  game: Game
  when: 'today' | 'future'
  opponentShort: string
  opponentAbbr: string
  vsAt: string
}) {
  if (game.status === 'Final') {
    return (
      <FinalLine
        game={game}
        opponentAbbr={opponentAbbr}
        vsAt={vsAt}
      />
    )
  }

  if (
    game.status === 'Postponed' ||
    game.status === 'Suspended' ||
    game.status === 'Cancelled'
  ) {
    return (
      <>
        {vsAt} {opponentShort}
      </>
    )
  }

  // Scheduled
  if (when === 'today') {
    return (
      <>
        First pitch <Countdown iso={game.game_datetime} /> {vsAt}{' '}
        {opponentShort}
      </>
    )
  }

  return (
    <>
      {formatFutureDate(game.game_date)}{' '}
      <span className="text-white/70 font-normal">at</span>{' '}
      {formatTime(game.game_datetime)} {vsAt} {opponentShort}
    </>
  )
}

function FinalLine({
  game,
  opponentAbbr,
  vsAt,
}: {
  game: Game
  opponentAbbr: string
  vsAt: string
}) {
  const isHome = game.home_team_id === BREWERS_TEAM_ID
  const brewersScore = isHome ? game.home_score : game.away_score
  const oppScore = isHome ? game.away_score : game.home_score

  if (brewersScore == null || oppScore == null) {
    return (
      <>
        Final {vsAt} {opponentAbbr}
      </>
    )
  }

  const won = brewersScore > oppScore
  const lost = brewersScore < oppScore
  const verb = won ? 'Won' : lost ? 'Lost' : 'Tied'
  const cls = won ? 'text-win' : lost ? 'text-loss' : 'text-white'

  return (
    <>
      <span className={cls + ' font-semibold'}>{verb}</span>{' '}
      <span className="tabular-nums">
        {brewersScore}-{oppScore}
      </span>{' '}
      {vsAt} {opponentAbbr}
    </>
  )
}

function Countdown({ iso }: { iso: string }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const target = new Date(iso).getTime()
  const diffMs = target - now

  if (Number.isNaN(diffMs) || diffMs <= 0) {
    return <span className="text-white/70">soon</span>
  }

  const totalMin = Math.floor(diffMs / 60_000)
  const hours = Math.floor(totalMin / 60)
  const minutes = totalMin % 60

  if (hours >= 24) {
    const days = Math.floor(hours / 24)
    return (
      <span className="tabular-nums text-white/70">
        in {days}d {hours % 24}h
      </span>
    )
  }
  if (hours >= 1) {
    return (
      <span className="tabular-nums text-white/70">
        in {hours}h {minutes}m
      </span>
    )
  }
  return (
    <span className="tabular-nums text-white/70">
      in {minutes}m
    </span>
  )
}

function opponentTeam(game: Game) {
  const oppId =
    game.home_team_id === BREWERS_TEAM_ID
      ? game.away_team_id
      : game.home_team_id
  return teamFor(oppId)
}

function formatFutureDate(iso: string): string {
  const [y, m, d] = iso.split('-').map((s) => Number.parseInt(s, 10))
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}
