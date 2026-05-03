import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Tables } from '../../lib/database.types'
import { useLiveGameState, type LiveGameState } from './useLiveGameState'
import { Scoreboard } from './Scoreboard'
import { BaserunnerDiamond } from './BaserunnerDiamond'
import { WinProbabilitySparkline } from './WinProbabilitySparkline'
import { NextGameStrip } from './NextGameStrip'

type Game = Tables<'games'>

interface ContextGame {
  game: Game
  when: 'today' | 'future'
}

/**
 * Top-of-Home live game card. Three render modes:
 *
 *   1. **Live** — full hero (Scoreboard + Diamond + WP sparkline). Triggered
 *      when the picked game is `Live` OR a `live_game_state` row exists for
 *      it. Auto-upgrades from the Scheduled mode the moment the poller
 *      writes the first row, no refresh needed.
 *   2. **Strip** — slim card showing today's status (Final / Scheduled with
 *      countdown) or the next future game.
 *   3. **Hidden** — off-season / no scheduled future games. Renders null and
 *      lets the existing Home content stand alone.
 *
 * The hero subscribes to `live_game_state` eagerly even for Scheduled games
 * so that mode 2 → mode 1 transition is instant when the poller starts
 * writing.
 */
export function LiveGameHero() {
  const [ctx, setCtx] = useState<ContextGame | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function pickGame() {
      const today = todayISO()

      // 1. Today's game (any status). Doubleheaders → take the earliest one;
      // it's the one the family is most likely watching first.
      const { data: todayRows, error: todayErr } = await supabase
        .from('games')
        .select('*')
        .eq('game_date', today)
        .order('game_datetime', { ascending: true })
        .limit(1)
      if (cancelled) return
      if (todayErr) {
        console.error('[LiveGameHero] today fetch failed:', todayErr.message)
      }
      if (todayRows && todayRows.length > 0) {
        setCtx({ game: todayRows[0], when: 'today' })
        setLoaded(true)
        return
      }

      // 2. Next future Scheduled game.
      const { data: futureRows, error: futureErr } = await supabase
        .from('games')
        .select('*')
        .gt('game_date', today)
        .eq('status', 'Scheduled')
        .order('game_date', { ascending: true })
        .order('game_datetime', { ascending: true })
        .limit(1)
      if (cancelled) return
      if (futureErr) {
        console.error('[LiveGameHero] future fetch failed:', futureErr.message)
      }
      if (futureRows && futureRows.length > 0) {
        setCtx({ game: futureRows[0], when: 'future' })
      } else {
        setCtx(null)
      }
      setLoaded(true)
    }

    pickGame()
    return () => {
      cancelled = true
    }
  }, [])

  // Always subscribe (when we have a game) — lets a Scheduled card auto-flip
  // to the live hero the moment the poller writes its first row.
  const { state: liveState } = useLiveGameState(ctx?.game.id ?? null)

  // Off-season / no schedule. Render nothing per Phase 3 product call.
  if (loaded && !ctx) return null

  // Initial load skeleton — same dimensions as the slim strip so the page
  // doesn't reflow when the data lands.
  if (!loaded || !ctx) {
    return (
      <div
        className="rounded-2xl bg-navy/50 border border-white/5 px-5 py-4 min-h-[64px]"
        aria-busy="true"
      />
    )
  }

  const isLive = ctx.game.status === 'Live' || hasUsableState(liveState)

  if (isLive && liveState) {
    return <FullHero game={ctx.game} state={liveState} />
  }

  return <NextGameStrip game={ctx.game} when={ctx.when} />
}

function FullHero({ game, state }: { game: Game; state: LiveGameState }) {
  const bases = parseBases(state.bases)

  return (
    <Link
      to={`/games/${game.id}`}
      className="block rounded-2xl bg-navy text-white border border-white/10 shadow-sm overflow-hidden hover:border-white/30 transition-colors"
    >
      <div className="p-5 md:p-6 space-y-4">
        <div className="grid grid-cols-[1fr_auto] gap-4 items-start">
          <Scoreboard game={game} state={state} />
          <BaserunnerDiamond
            bases={bases}
            className="w-20 h-20 md:w-24 md:h-24 shrink-0"
          />
        </div>

        <WinProbabilitySparkline recentPlays={state.recent_plays} />

        <div className="flex items-center justify-end text-[11px] uppercase tracking-wider text-white/60">
          Tap for full game
          <ChevronRight size={14} className="ml-0.5" aria-hidden="true" />
        </div>
      </div>
    </Link>
  )
}

function hasUsableState(state: LiveGameState | null): boolean {
  if (!state) return false
  // A "real" live row has at least an inning. Brand-new rows from a tick
  // before first pitch will have nulls everywhere — fall back to strip.
  return state.inning != null
}

function parseBases(raw: unknown): {
  first: number | null
  second: number | null
  third: number | null
} | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const toIdOrNull = (v: unknown): number | null =>
    typeof v === 'number' ? v : null
  return {
    first: toIdOrNull(obj.first),
    second: toIdOrNull(obj.second),
    third: toIdOrNull(obj.third),
  }
}

function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
