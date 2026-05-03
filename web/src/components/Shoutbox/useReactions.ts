import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'
import type { Tables } from '../../lib/database.types'

type Reaction = Tables<'reactions'>

export interface ReactionBucket {
  count: number
  userReacted: boolean
}

/** commentId → emoji → { count, userReacted } */
export type ReactionsMap = Map<string, Map<string, ReactionBucket>>

export interface UseReactionsResult {
  reactionsByComment: ReactionsMap
  toggle: (commentId: string, emoji: string) => Promise<void>
}

/**
 * Manages reactions for a set of visible comments. Refetches on every
 * Realtime reaction event for the visible set — simpler and bullet-proof
 * vs delta-tracking, which is cumbersome because Supabase Realtime DELETE
 * payloads only include the primary key by default. Full refetch is one
 * indexed query against a small table; cost is negligible at family scale.
 *
 * Toggle is optimistic: state flips immediately, server runs in background,
 * any error rolls the bucket back. The unique (user_id, comment_id, emoji)
 * constraint makes inserts idempotent on race.
 */
export function useReactions(commentIds: string[]): UseReactionsResult {
  const { user } = useAuth()
  const [reactionsByComment, setReactionsByComment] = useState<ReactionsMap>(
    () => new Map(),
  )

  // Keep a stable ref to current ids so the Realtime callback always refetches
  // the latest visible set, not whatever it captured at subscribe time.
  const idsRef = useRef<string[]>(commentIds)
  useEffect(() => {
    idsRef.current = commentIds
  }, [commentIds])

  const buildMap = useCallback(
    (rows: Reaction[]): ReactionsMap => {
      const out: ReactionsMap = new Map()
      for (const r of rows) {
        let inner = out.get(r.comment_id)
        if (!inner) {
          inner = new Map()
          out.set(r.comment_id, inner)
        }
        const prev = inner.get(r.emoji) ?? { count: 0, userReacted: false }
        inner.set(r.emoji, {
          count: prev.count + 1,
          userReacted: prev.userReacted || (!!user && r.user_id === user.id),
        })
      }
      return out
    },
    [user],
  )

  const refetch = useCallback(
    async (ids: string[]) => {
      // Empty case is handled by the consumer (skip the refetch entirely);
      // stale state doesn't matter because no comment will look itself up.
      if (ids.length === 0) return
      const { data, error } = await supabase
        .from('reactions')
        .select('*')
        .in('comment_id', ids)
      if (error) {
        console.error('[reactions] fetch failed:', error.message)
        return
      }
      setReactionsByComment(buildMap((data ?? []) as Reaction[]))
    },
    [buildMap],
  )

  // Initial + when visible ids set changes. Stringify the array to a stable
  // dep so the effect only re-runs on actual membership change, not every
  // render (commentIds is a fresh array reference each time).
  const idsKey = commentIds.join(',')
  useEffect(() => {
    if (idsKey === '') return
    // refetch() is async; setState inside runs after an await, so this is
    // not a true synchronous effect-body setState — the rule can't see that.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refetch(commentIds)
    // commentIds intentionally omitted from deps; idsKey is the canary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, refetch])

  // Realtime: any change → refetch using the current ids set.
  useEffect(() => {
    const channel = supabase
      .channel('reactions')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reactions' },
        () => {
          void refetch(idsRef.current)
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [refetch])

  // ---------- toggle ---------------------------------------------------

  const toggle = useCallback(
    async (commentId: string, emoji: string) => {
      if (!user) return

      const current = reactionsByComment.get(commentId)?.get(emoji) ?? {
        count: 0,
        userReacted: false,
      }

      // Optimistic flip.
      setReactionsByComment((prev) => {
        const next = cloneMap(prev)
        const inner = next.get(commentId) ?? new Map()
        if (current.userReacted) {
          inner.set(emoji, {
            count: Math.max(0, current.count - 1),
            userReacted: false,
          })
        } else {
          inner.set(emoji, { count: current.count + 1, userReacted: true })
        }
        next.set(commentId, inner)
        return next
      })

      if (current.userReacted) {
        const { error } = await supabase
          .from('reactions')
          .delete()
          .eq('user_id', user.id)
          .eq('comment_id', commentId)
          .eq('emoji', emoji)
        if (error) {
          console.error('[reactions] delete failed:', error.message)
          // Revert by full refetch — cheap and avoids any drift.
          void refetch(idsRef.current)
        }
      } else {
        const { error } = await supabase.from('reactions').insert({
          user_id: user.id,
          comment_id: commentId,
          emoji,
        })
        if (error) {
          console.error('[reactions] insert failed:', error.message)
          void refetch(idsRef.current)
        }
      }
    },
    [reactionsByComment, refetch, user],
  )

  return { reactionsByComment, toggle }
}

function cloneMap(src: ReactionsMap): ReactionsMap {
  const out: ReactionsMap = new Map()
  for (const [k, v] of src) out.set(k, new Map(v))
  return out
}
