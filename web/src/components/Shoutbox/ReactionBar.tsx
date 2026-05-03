import { useState } from 'react'
import { SmilePlus } from 'lucide-react'
import type { ReactionBucket } from './useReactions'

const ALL_EMOJIS = ['👏', '🔥', '😂', '😢', '⚾', '🍺'] as const

interface Props {
  buckets: Map<string, ReactionBucket>
  onToggle: (emoji: string) => void
  /** When true, picker buttons render disabled (e.g., optimistic comments). */
  disabled?: boolean
}

/**
 * Compact reaction strip. Each emoji that has a count or the user's own
 * reaction renders as a pill. A "+" button reveals the rest of the picker
 * inline. Touch target ≥40px via padding.
 */
export function ReactionBar({ buckets, onToggle, disabled }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false)

  const visible: { emoji: string; bucket: ReactionBucket }[] = []
  for (const emoji of ALL_EMOJIS) {
    const b = buckets.get(emoji)
    if (b && (b.count > 0 || b.userReacted)) {
      visible.push({ emoji, bucket: b })
    }
  }

  const remaining = ALL_EMOJIS.filter(
    (e) => !visible.some((v) => v.emoji === e),
  )

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {visible.map(({ emoji, bucket }) => (
        <Pill
          key={emoji}
          emoji={emoji}
          count={bucket.count}
          active={bucket.userReacted}
          disabled={disabled}
          onClick={() => onToggle(emoji)}
        />
      ))}

      {pickerOpen
        ? remaining.map((emoji) => (
            <Pill
              key={emoji}
              emoji={emoji}
              count={0}
              active={false}
              disabled={disabled}
              onClick={() => {
                onToggle(emoji)
                setPickerOpen(false)
              }}
            />
          ))
        : null}

      {remaining.length > 0 && (
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          disabled={disabled}
          aria-label={pickerOpen ? 'Close reaction picker' : 'Add reaction'}
          aria-expanded={pickerOpen}
          className={[
            'inline-flex items-center justify-center rounded-full px-2.5 py-1.5 min-h-[32px] min-w-[32px] text-text-muted',
            'border border-border bg-bg hover:bg-surface',
            disabled ? 'opacity-50 cursor-not-allowed' : '',
          ].join(' ')}
        >
          <SmilePlus size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

function Pill({
  emoji,
  count,
  active,
  disabled,
  onClick,
}: {
  emoji: string
  count: number
  active: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={[
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 min-h-[32px] text-xs tabular-nums',
        active
          ? 'bg-gold/20 border border-gold-deep/40 text-text'
          : 'bg-bg border border-border text-text-muted hover:bg-surface',
        disabled ? 'opacity-50 cursor-not-allowed' : '',
      ].join(' ')}
    >
      <span aria-hidden="true">{emoji}</span>
      {count > 0 && <span>{count}</span>}
    </button>
  )
}
