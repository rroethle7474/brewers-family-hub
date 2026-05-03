import type { Comment, ShoutboxProfile } from './useShoutboxFeed'
import { ReactionBar } from './ReactionBar'
import type { ReactionBucket } from './useReactions'

interface Props {
  comment: Comment
  profile: ShoutboxProfile | null
  isOptimistic?: boolean
  reactions: Map<string, ReactionBucket>
  onToggleReaction: (commentId: string, emoji: string) => void
}

export function CommentCard({
  comment,
  profile,
  isOptimistic,
  reactions,
  onToggleReaction,
}: Props) {
  const name = profile?.display_name ?? '…'

  return (
    <article
      className={[
        'rounded-2xl bg-surface border border-border p-3 md:p-4 shadow-sm',
        isOptimistic ? 'opacity-70' : '',
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        <Avatar profile={profile} />
        <div className="min-w-0 flex-1">
          <header className="flex items-baseline gap-2">
            <p className="font-medium text-text text-sm truncate">{name}</p>
            <p className="text-[11px] text-text-muted shrink-0 tabular-nums">
              {isOptimistic ? 'Posting…' : formatRelative(comment.created_at)}
            </p>
          </header>
          <p className="mt-1 text-text text-sm whitespace-pre-wrap break-words">
            {comment.body}
          </p>
          <ReactionBar
            buckets={reactions}
            onToggle={(emoji) => onToggleReaction(comment.id, emoji)}
            disabled={isOptimistic}
          />
        </div>
      </div>
    </article>
  )
}

function Avatar({ profile }: { profile: ShoutboxProfile | null }) {
  if (profile?.avatar_url) {
    return (
      <img
        src={profile.avatar_url}
        alt=""
        className="w-9 h-9 rounded-full shrink-0 object-cover"
      />
    )
  }
  const initials = initialsFor(profile?.display_name ?? '?')
  const color = colorFor(profile?.id ?? '')
  return (
    <div
      className={`w-9 h-9 shrink-0 rounded-full ${color} flex items-center justify-center text-white text-xs font-semibold`}
      aria-hidden="true"
    >
      {initials}
    </div>
  )
}

function initialsFor(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const AVATAR_PALETTE = [
  'bg-navy',
  'bg-gold-deep',
  'bg-sky-700',
  'bg-emerald-700',
  'bg-rose-700',
  'bg-violet-700',
]

function colorFor(seed: string): string {
  if (!seed) return AVATAR_PALETTE[0]
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length]
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diffSec = Math.max(0, Math.floor((now - then) / 1000))

  if (diffSec < 45) return 'just now'
  if (diffSec < 60 * 60) {
    const m = Math.max(1, Math.floor(diffSec / 60))
    return `${m}m`
  }
  if (diffSec < 60 * 60 * 24) {
    const h = Math.floor(diffSec / 3600)
    return `${h}h`
  }
  if (diffSec < 60 * 60 * 24 * 7) {
    const d = Math.floor(diffSec / 86400)
    return `${d}d`
  }
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}
