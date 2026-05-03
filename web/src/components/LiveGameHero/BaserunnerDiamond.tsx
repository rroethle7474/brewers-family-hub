interface Bases {
  first: number | null
  second: number | null
  third: number | null
}

interface Props {
  bases: Bases | null
  className?: string
}

/**
 * Pure SVG diamond. Lit bases are Brewers gold; empty bases are outlined.
 * `bases` jsonb shape comes from the poller's live_state.py mapping:
 *   { first: <playerId | null>, second: ..., third: ... }
 */
export function BaserunnerDiamond({ bases, className }: Props) {
  const onFirst = !!bases?.first
  const onSecond = !!bases?.second
  const onThird = !!bases?.third

  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label={ariaLabel(onFirst, onSecond, onThird)}
    >
      <Base cx={84} cy={50} lit={onFirst} />
      <Base cx={50} cy={16} lit={onSecond} />
      <Base cx={16} cy={50} lit={onThird} />
      <HomePlate />
    </svg>
  )
}

function Base({ cx, cy, lit }: { cx: number; cy: number; lit: boolean }) {
  const half = 9
  const points = [
    `${cx},${cy - half}`,
    `${cx + half},${cy}`,
    `${cx},${cy + half}`,
    `${cx - half},${cy}`,
  ].join(' ')

  return (
    <polygon
      points={points}
      className={
        lit
          ? 'fill-gold stroke-gold-deep'
          : 'fill-white/10 stroke-white/40'
      }
      strokeWidth={2}
    />
  )
}

function HomePlate() {
  // Pentagon: flat top, point at bottom, sized down so it reads as "the plate".
  const points = '44,82 56,82 58,88 50,94 42,88'
  return (
    <polygon
      points={points}
      className="fill-white/20 stroke-white/40"
      strokeWidth={2}
    />
  )
}

function ariaLabel(first: boolean, second: boolean, third: boolean): string {
  const lit: string[] = []
  if (first) lit.push('first')
  if (second) lit.push('second')
  if (third) lit.push('third')
  if (lit.length === 0) return 'Bases empty'
  return `Runners on ${lit.join(', ')}`
}
