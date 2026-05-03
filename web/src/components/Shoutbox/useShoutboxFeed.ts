import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'
import { useProfile } from '../../lib/useProfile'
import type { Tables } from '../../lib/database.types'

export type Comment = Tables<'comments'>
export type BigMoment = Tables<'big_moments'>
export interface ShoutboxProfile {
  id: string
  display_name: string
  avatar_url: string | null
}

export type FeedItem =
  | {
      kind: 'comment'
      comment: Comment
      profile: ShoutboxProfile | null
      /** True while the optimistic row is awaiting server confirmation. */
      isOptimistic?: boolean
    }
  | { kind: 'big_moment'; moment: BigMoment }

export interface ShoutboxFeed {
  items: FeedItem[]
  loading: boolean
  error: string | null
  hasMore: boolean
  loadingMore: boolean
  loadMore: () => Promise<void>
  postComment: (body: string) => Promise<{ ok: boolean; error?: string }>
}

const PAGE_SIZE = 50

interface CommentRow extends Comment {
  profiles?: ShoutboxProfile | null
}

/**
 * Reads the family shoutbox: newest 50 comments (game_id null) + today's
 * big_moments, merged chronologically. Subscribes to Realtime for live
 * inserts and soft-deletes. Exposes optimistic `postComment` and cursor-
 * based `loadMore` for older comments.
 *
 * Big_moments are scoped to today's game(s); pagination only walks comments.
 */
export function useShoutboxFeed(): ShoutboxFeed {
  const { user } = useAuth()
  const { profile: myProfile } = useProfile()

  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)

  // Cache of user_id → profile so Realtime inserts can hydrate display name
  // without a fetch when the author has already been seen in the feed.
  const profileCacheRef = useRef<Map<string, ShoutboxProfile>>(new Map())
  const todayGameIdsRef = useRef<Set<number>>(new Set())
  const oldestCreatedAtRef = useRef<string | null>(null)

  // ---------- helpers ---------------------------------------------------

  const cacheProfile = useCallback((p: ShoutboxProfile | null | undefined) => {
    if (p && p.id) profileCacheRef.current.set(p.id, p)
  }, [])

  const fetchAndCacheProfile = useCallback(
    async (userId: string): Promise<ShoutboxProfile | null> => {
      if (profileCacheRef.current.has(userId)) {
        return profileCacheRef.current.get(userId)!
      }
      const { data } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .eq('id', userId)
        .maybeSingle()
      if (data) cacheProfile(data)
      return data ?? null
    },
    [cacheProfile],
  )

  // Stable comparator: newest first.
  const compareDesc = (a: FeedItem, b: FeedItem) => {
    const at = a.kind === 'comment' ? a.comment.created_at : a.moment.created_at
    const bt = b.kind === 'comment' ? b.comment.created_at : b.moment.created_at
    return bt.localeCompare(at)
  }

  // ---------- initial fetch + subscriptions -----------------------------

  useEffect(() => {
    let cancelled = false
    // No synchronous loading/error reset here — initial useState values
    // already match the load-start state (loading=true, error=null), and the
    // hook only mounts once per Home page lifetime.

    async function load() {
      const todayIso = todayLocalISO()

      // 1. Today's game ids — used to scope big_moments + the Realtime filter.
      const { data: todayGames, error: gErr } = await supabase
        .from('games')
        .select('id')
        .eq('game_date', todayIso)

      if (cancelled) return
      if (gErr) {
        // Non-fatal — empty set means no big_moments will surface today.
        console.warn('[shoutbox] today-games fetch failed:', gErr.message)
      }
      const gameIds = new Set((todayGames ?? []).map((g) => g.id))
      todayGameIdsRef.current = gameIds

      // 2. Newest 50 shoutbox comments (with profile).
      const { data: rawComments, error: cErr } = await supabase
        .from('comments')
        .select(
          '*, profiles!comments_user_id_fkey(id, display_name, avatar_url)',
        )
        .is('game_id', null)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)

      if (cancelled) return
      if (cErr) {
        setError(cErr.message)
        setLoading(false)
        return
      }

      const comments = (rawComments ?? []) as CommentRow[]
      comments.forEach((c) => cacheProfile(c.profiles ?? undefined))

      const commentItems: FeedItem[] = comments.map((c) => ({
        kind: 'comment',
        comment: c,
        profile: c.profiles ?? null,
      }))

      // 3. Big moments for today's games (only if any).
      let momentItems: FeedItem[] = []
      if (gameIds.size > 0) {
        const { data: moments, error: mErr } = await supabase
          .from('big_moments')
          .select('*')
          .in('game_id', Array.from(gameIds))
          .order('created_at', { ascending: false })
        if (mErr) {
          console.warn('[shoutbox] big_moments fetch failed:', mErr.message)
        } else {
          momentItems = (moments ?? []).map((m) => ({
            kind: 'big_moment',
            moment: m,
          }))
        }
      }

      const merged = [...commentItems, ...momentItems].sort(compareDesc)
      if (!cancelled) {
        setItems(merged)
        setHasMore(comments.length === PAGE_SIZE)
        oldestCreatedAtRef.current =
          comments.length > 0 ? comments[comments.length - 1].created_at : null
        setLoading(false)
      }
    }

    load()

    // ---------- Realtime ------------------------------------------------

    const channel = supabase
      .channel('shoutbox')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comments' },
        async (payload) => {
          if (cancelled) return
          const row = payload.new as Comment
          if (row.game_id !== null) return
          if (row.deleted_at !== null) return

          let profile = profileCacheRef.current.get(row.user_id) ?? null
          if (!profile) profile = await fetchAndCacheProfile(row.user_id)

          setItems((prev) => {
            // Dedup by id (the optimistic row may have been swapped already).
            if (
              prev.some((i) => i.kind === 'comment' && i.comment.id === row.id)
            ) {
              return prev
            }
            const next: FeedItem = { kind: 'comment', comment: row, profile }
            return [next, ...prev].sort(compareDesc)
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'comments' },
        (payload) => {
          if (cancelled) return
          const row = payload.new as Comment
          if (row.deleted_at !== null) {
            setItems((prev) =>
              prev.filter(
                (i) => !(i.kind === 'comment' && i.comment.id === row.id),
              ),
            )
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'big_moments' },
        (payload) => {
          if (cancelled) return
          const row = payload.new as BigMoment
          if (!todayGameIdsRef.current.has(row.game_id)) return
          setItems((prev) => {
            if (
              prev.some(
                (i) => i.kind === 'big_moment' && i.moment.id === row.id,
              )
            ) {
              return prev
            }
            const next: FeedItem = { kind: 'big_moment', moment: row }
            return [next, ...prev].sort(compareDesc)
          })
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [cacheProfile, fetchAndCacheProfile])

  // ---------- pagination -----------------------------------------------

  const loadMore = useCallback(async () => {
    if (loadingMore) return
    if (!hasMore) return
    if (!oldestCreatedAtRef.current) return

    setLoadingMore(true)
    const cursor = oldestCreatedAtRef.current
    const { data: rawComments, error: pErr } = await supabase
      .from('comments')
      .select(
        '*, profiles!comments_user_id_fkey(id, display_name, avatar_url)',
      )
      .is('game_id', null)
      .is('deleted_at', null)
      .lt('created_at', cursor)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)

    if (pErr) {
      console.error('[shoutbox] loadMore failed:', pErr.message)
      setLoadingMore(false)
      return
    }

    const newPage = (rawComments ?? []) as CommentRow[]
    newPage.forEach((c) => cacheProfile(c.profiles ?? undefined))
    const newItems: FeedItem[] = newPage.map((c) => ({
      kind: 'comment',
      comment: c,
      profile: c.profiles ?? null,
    }))

    setItems((prev) => {
      const seen = new Set(
        prev.filter((i) => i.kind === 'comment').map((i) =>
          i.kind === 'comment' ? i.comment.id : '',
        ),
      )
      const dedup = newItems.filter(
        (i) => i.kind === 'comment' && !seen.has(i.comment.id),
      )
      return [...prev, ...dedup].sort(compareDesc)
    })

    if (newPage.length > 0) {
      oldestCreatedAtRef.current = newPage[newPage.length - 1].created_at
    }
    setHasMore(newPage.length === PAGE_SIZE)
    setLoadingMore(false)
  }, [hasMore, loadingMore, cacheProfile])

  // ---------- composer post --------------------------------------------

  const postComment = useCallback(
    async (body: string): Promise<{ ok: boolean; error?: string }> => {
      const trimmed = body.trim()
      if (!user || !myProfile) {
        return { ok: false, error: 'Not signed in.' }
      }
      if (trimmed.length === 0) {
        return { ok: false, error: 'Empty message.' }
      }
      if (trimmed.length > 2000) {
        return { ok: false, error: 'Message too long.' }
      }

      // Cache our own profile so Realtime never has to fetch it for our own
      // posts on a fresh page load.
      cacheProfile({
        id: myProfile.id,
        display_name: myProfile.display_name,
        avatar_url: myProfile.avatar_url,
      })

      const tempId = `optimistic-${crypto.randomUUID()}`
      const now = new Date().toISOString()
      const optimistic: Comment = {
        id: tempId,
        user_id: user.id,
        game_id: null,
        body: trimmed,
        is_hot_take: false,
        created_at: now,
        edited_at: null,
        deleted_at: null,
      }
      const optimisticItem: FeedItem = {
        kind: 'comment',
        comment: optimistic,
        profile: {
          id: myProfile.id,
          display_name: myProfile.display_name,
          avatar_url: myProfile.avatar_url,
        },
        isOptimistic: true,
      }

      setItems((prev) => [optimisticItem, ...prev].sort(compareDesc))

      const { data, error: insertErr } = await supabase
        .from('comments')
        .insert({
          user_id: user.id,
          game_id: null,
          body: trimmed,
          is_hot_take: false,
        })
        .select('*')
        .single()

      if (insertErr || !data) {
        // Roll back the optimistic row.
        setItems((prev) =>
          prev.filter(
            (i) => !(i.kind === 'comment' && i.comment.id === tempId),
          ),
        )
        return { ok: false, error: insertErr?.message ?? 'Insert failed.' }
      }

      // Swap the temp row for the canonical one. Realtime will deliver the
      // same row; the dedup guard there is what prevents a duplicate.
      setItems((prev) =>
        prev.map((i) =>
          i.kind === 'comment' && i.comment.id === tempId
            ? { ...i, comment: data, isOptimistic: false }
            : i,
        ),
      )
      return { ok: true }
    },
    [cacheProfile, myProfile, user],
  )

  return { items, loading, error, hasMore, loadingMore, loadMore, postComment }
}

function todayLocalISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
