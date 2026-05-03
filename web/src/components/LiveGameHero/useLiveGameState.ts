import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Tables } from '../../lib/database.types'

export type LiveGameState = Tables<'live_game_state'>

interface UseLiveGameStateResult {
  state: LiveGameState | null
  loading: boolean
  error: string | null
}

/**
 * Subscribes to the single `live_game_state` row for a game via Supabase
 * Realtime. Returns the row, a loading flag for the initial fetch, and any
 * error from either fetch or subscription.
 *
 * Pass `gameId = null` for off-day / no-game-context — the hook resets to
 * an idle state and skips both the fetch and the subscription.
 */
export function useLiveGameState(
  gameId: number | null,
): UseLiveGameStateResult {
  const [state, setState] = useState<LiveGameState | null>(null)
  // Initialize loading based on whether we have a game id. Avoids a synchronous
  // setLoading(false) inside the effect for the no-game-id branch (which is
  // both wasteful and trips react-hooks/set-state-in-effect).
  const [loading, setLoading] = useState(gameId != null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // No game to subscribe to (off-day / pre-load). Initial state defaults
    // already match what the consumer should see — no resets needed.
    if (gameId == null) return

    let cancelled = false

    supabase
      .from('live_game_state')
      .select('*')
      .eq('game_id', gameId)
      .maybeSingle()
      .then(({ data, error: fetchError }) => {
        if (cancelled) return
        if (fetchError) setError(fetchError.message)
        setState(data ?? null)
        setLoading(false)
      })

    const channel = supabase
      .channel(`live_game_state:${gameId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_game_state',
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => {
          if (cancelled) return
          if (payload.eventType === 'DELETE') {
            setState(null)
          } else {
            setState(payload.new as LiveGameState)
          }
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [gameId])

  return { state, loading, error }
}
