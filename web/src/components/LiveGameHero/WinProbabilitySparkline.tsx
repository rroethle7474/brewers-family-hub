import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  YAxis,
} from 'recharts'

interface PlayPoint {
  inning?: number | null
  inningState?: string | null
  brewersWP?: number | null
  description?: string | null
}

interface Props {
  recentPlays: unknown
}

/**
 * Sparkline of Brewers win probability over recent plays. Chart-only — no
 * axes, no tooltip; the hero is for reading at a glance, not deep analysis.
 * The 50% reference line marks "coin flip"; gold gradient fills the area
 * under the curve.
 */
export function WinProbabilitySparkline({ recentPlays }: Props) {
  const data = normalizePlays(recentPlays)

  if (data.length < 2) {
    return (
      <div className="h-[64px] flex items-center justify-center text-[11px] text-white/50">
        WP appears once the game has plays.
      </div>
    )
  }

  const latest = data[data.length - 1].wp
  const latestPct = Math.round(latest)

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-[11px] uppercase tracking-wider text-white/60">
        <span>Brewers Win Probability</span>
        <span className="tabular-nums text-white font-semibold">
          {latestPct}%
        </span>
      </div>

      <div className="h-[64px]" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 2, right: 2, bottom: 2, left: 2 }}
          >
            <defs>
              <linearGradient id="wp-gold" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FFC52F" stopOpacity={0.7} />
                <stop offset="100%" stopColor="#FFC52F" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <YAxis domain={[0, 100]} hide />
            <ReferenceLine
              y={50}
              stroke="#FFFFFF"
              strokeOpacity={0.2}
              strokeDasharray="2 3"
            />
            <Area
              type="monotone"
              dataKey="wp"
              stroke="#FFC52F"
              strokeWidth={2}
              fill="url(#wp-gold)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function normalizePlays(raw: unknown): { wp: number }[] {
  if (!Array.isArray(raw)) return []
  const out: { wp: number }[] = []
  for (const item of raw as PlayPoint[]) {
    const wp = item?.brewersWP
    if (typeof wp !== 'number' || Number.isNaN(wp)) continue
    out.push({ wp: Math.max(0, Math.min(100, wp * 100)) })
  }
  return out
}
