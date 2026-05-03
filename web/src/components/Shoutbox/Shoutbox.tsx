import { useMemo } from 'react'
import { Composer } from './Composer'
import { CommentCard } from './CommentCard'
import { BigMomentCard } from './BigMomentCard'
import { useShoutboxFeed } from './useShoutboxFeed'
import { useReactions } from './useReactions'

/**
 * Family shoutbox: composer at the top, merged feed of comments + today's
 * big moments, "Load older" pager for comments. Lives at the bottom of Home.
 */
export function Shoutbox() {
  const {
    items,
    loading,
    error,
    hasMore,
    loadingMore,
    loadMore,
    postComment,
  } = useShoutboxFeed()

  const visibleCommentIds = useMemo(
    () =>
      items
        .filter((i) => i.kind === 'comment' && !i.isOptimistic)
        .map((i) => (i.kind === 'comment' ? i.comment.id : ''))
        .filter(Boolean),
    [items],
  )

  const { reactionsByComment, toggle } = useReactions(visibleCommentIds)

  return (
    <section
      className="space-y-3"
      aria-label="Family shoutbox"
    >
      <header className="px-1 flex items-baseline justify-between">
        <h2 className="font-display text-lg text-navy">Family Shoutbox</h2>
        <span className="text-[11px] uppercase tracking-wider text-text-muted">
          Live
        </span>
      </header>

      <Composer onSend={postComment} />

      {error && (
        <p className="text-sm text-loss text-center" role="alert">
          Couldn't load: {error}
        </p>
      )}

      {loading ? (
        <FeedSkeleton />
      ) : items.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="space-y-3" role="feed" aria-busy={loadingMore}>
          {items.map((item) => (
            <li
              key={
                item.kind === 'comment'
                  ? `c:${item.comment.id}`
                  : `m:${item.moment.id}`
              }
            >
              {item.kind === 'comment' ? (
                <CommentCard
                  comment={item.comment}
                  profile={item.profile}
                  isOptimistic={item.isOptimistic}
                  reactions={
                    reactionsByComment.get(item.comment.id) ?? new Map()
                  }
                  onToggleReaction={toggle}
                />
              ) : (
                <BigMomentCard moment={item.moment} />
              )}
            </li>
          ))}
        </ul>
      )}

      {!loading && hasMore && (
        <div className="text-center pt-2">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="inline-flex items-center rounded-full px-4 py-2 text-sm text-text-muted bg-surface border border-border hover:bg-bg disabled:opacity-50 min-h-[40px]"
          >
            {loadingMore ? 'Loading…' : 'Load older'}
          </button>
        </div>
      )}
    </section>
  )
}

function FeedSkeleton() {
  return (
    <ul className="space-y-3">
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          className="rounded-2xl bg-surface border border-border p-3 md:p-4 shadow-sm"
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-bg shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-32 rounded bg-bg" />
              <div className="h-3 w-full rounded bg-bg" />
              <div className="h-3 w-3/4 rounded bg-bg" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

function EmptyState() {
  return (
    <div className="rounded-2xl bg-surface border border-border p-6 text-center shadow-sm">
      <p className="text-sm text-text-muted">
        Nothing yet. Be the first to say something.
      </p>
    </div>
  )
}
