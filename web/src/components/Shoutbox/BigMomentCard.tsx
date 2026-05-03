import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { BigMoment } from './useShoutboxFeed'

interface Props {
  moment: BigMoment
}

const TYPE_META: Record<string, { label: string; emoji: string }> = {
  home_run: { label: 'HOME RUN', emoji: '💥' },
  lead_change: { label: 'LEAD CHANGE', emoji: '🔄' },
  wp_swing: { label: 'BIG SWING', emoji: '📈' },
  walkoff: { label: 'WALKOFF', emoji: '🏆' },
}

/**
 * Auto-posted big moment from the poller. Gold-bordered to feel distinct
 * from family chatter, and tappable through to the game detail page.
 */
export function BigMomentCard({ moment }: Props) {
  const meta = TYPE_META[moment.moment_type] ?? {
    label: moment.moment_type.toUpperCase(),
    emoji: '⚡',
  }
  const inningLabel = moment.inning != null ? ` · ${ordinal(moment.inning)}` : ''

  return (
    <Link
      to={`/games/${moment.game_id}`}
      className="block rounded-2xl bg-gold/10 border-2 border-gold-deep/40 p-3 md:p-4 shadow-sm hover:border-gold-deep/70 transition-colors"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 shrink-0 rounded-full bg-gold flex items-center justify-center text-base">
          <span aria-hidden="true">{meta.emoji}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-gold-deep">
            {meta.label}
            {inningLabel}
          </p>
          <p className="mt-0.5 text-text text-sm break-words">
            {moment.description}
          </p>
          <p className="mt-1 inline-flex items-center text-[11px] uppercase tracking-wider text-text-muted">
            View game
            <ChevronRight size={12} className="ml-0.5" aria-hidden="true" />
          </p>
        </div>
      </div>
    </Link>
  )
}

function ordinal(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n}st`
  if (mod10 === 2 && mod100 !== 12) return `${n}nd`
  if (mod10 === 3 && mod100 !== 13) return `${n}rd`
  return `${n}th`
}
