import { BREWERS_TEAM_ID, teamFor } from '../../lib/mlbTeams'
import type { Tables } from '../../lib/database.types'
import type { LiveGameState } from './useLiveGameState'

type Game = Tables<'games'>

interface Props {
  game: Pick<
    Game,
    'home_team_id' | 'away_team_id' | 'home_score' | 'away_score'
  >
  state: LiveGameState
}

/**
 * Live scoreboard panel. Shows inning, count, and the two teams with their
 * current scores. The Brewers row is gold-accented; the leading team's score
 * is brightened.
 */
export function Scoreboard({ game, state }: Props) {
  const home = teamFor(game.home_team_id)
  const away = teamFor(game.away_team_id)

  // live_game_state is the source of truth during a live game; games.*_score
  // is only refreshed by the daily sync. Fall back if either is null.
  const homeScore = state.home_score ?? game.home_score ?? 0
  const awayScore = state.away_score ?? game.away_score ?? 0

  return (
    <div className="space-y-3">
      <StatusLine state={state} />

      <div className="space-y-1.5">
        <TeamRow
          team={away}
          score={awayScore}
          isBrewers={game.away_team_id === BREWERS_TEAM_ID}
          isLeading={awayScore > homeScore}
          isBatting={state.inning_state === 'Top'}
        />
        <TeamRow
          team={home}
          score={homeScore}
          isBrewers={game.home_team_id === BREWERS_TEAM_ID}
          isLeading={homeScore > awayScore}
          isBatting={state.inning_state === 'Bottom'}
        />
      </div>
    </div>
  )
}

function StatusLine({ state }: { state: LiveGameState }) {
  const inningLabel = formatInning(state.inning_state, state.inning)
  const balls = state.balls ?? 0
  const strikes = state.strikes ?? 0
  const outs = state.outs ?? 0

  const showCount =
    state.inning_state === 'Top' || state.inning_state === 'Bottom'

  return (
    <div className="flex items-center justify-between text-[11px] uppercase tracking-wider">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-white/90 font-semibold">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full bg-live animate-pulse"
            aria-hidden="true"
          />
          Live
        </span>
        <span className="text-white/60">·</span>
        <span className="text-white tabular-nums">{inningLabel}</span>
      </div>

      {showCount && (
        <div className="flex items-center gap-2 text-white/70 tabular-nums">
          <span>
            <span className="text-white">{balls}</span>-
            <span className="text-white">{strikes}</span>
          </span>
          <span className="text-white/40">·</span>
          <span>
            <span className="text-white">{outs}</span> out
          </span>
        </div>
      )}
    </div>
  )
}

function TeamRow({
  team,
  score,
  isBrewers,
  isLeading,
  isBatting,
}: {
  team: ReturnType<typeof teamFor>
  score: number
  isBrewers: boolean
  isLeading: boolean
  isBatting: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <div
          className={[
            'flex items-center justify-center font-display text-xs tabular-nums shrink-0 rounded w-9 h-9',
            isBrewers ? 'bg-gold text-navy' : 'bg-white/10 text-white',
          ].join(' ')}
          aria-hidden="true"
        >
          {team.abbr}
        </div>
        <div className="min-w-0 flex items-baseline gap-1.5">
          <p className="font-display text-base tracking-tight text-white truncate">
            {team.short}
          </p>
          {isBatting && (
            <span
              className="text-[9px] uppercase tracking-wider text-gold-deep font-semibold"
              aria-label="now batting"
            >
              ●
            </span>
          )}
        </div>
      </div>

      <p
        className={[
          'font-display tabular-nums leading-none text-3xl md:text-4xl',
          isLeading ? 'text-white' : 'text-white/60',
        ].join(' ')}
        aria-label={`${team.short} score ${score}`}
      >
        {score}
      </p>
    </div>
  )
}

function formatInning(state: string | null, inning: number | null): string {
  if (inning == null) return ''
  if (state === 'Top') return `Top ${ordinal(inning)}`
  if (state === 'Bottom') return `Bot ${ordinal(inning)}`
  if (state === 'Middle') return `Mid ${ordinal(inning)}`
  if (state === 'End') return `End ${ordinal(inning)}`
  return `${ordinal(inning)}`
}

function ordinal(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n}st`
  if (mod10 === 2 && mod100 !== 12) return `${n}nd`
  if (mod10 === 3 && mod100 !== 13) return `${n}rd`
  return `${n}th`
}
