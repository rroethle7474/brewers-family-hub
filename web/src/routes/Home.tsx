import { Link } from 'react-router-dom'
import { CalendarDays, ListOrdered, TrendingUp, Trophy } from 'lucide-react'
import { LiveGameHero } from '../components/LiveGameHero/LiveGameHero'
import { Shoutbox } from '../components/Shoutbox/Shoutbox'

export function Home() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:py-12 space-y-5">
      <LiveGameHero />

      <div className="rounded-2xl bg-surface border border-border p-6 md:p-8 shadow-sm">
        <p className="text-sm font-medium text-gold-deep uppercase tracking-wider">
          2026 Season
        </p>
        <h1 className="mt-2 font-display text-3xl md:text-5xl text-navy">
          Welcome to the Hub
        </h1>
        <p className="mt-4 text-text-muted">
          Lock in your Brewers win-total prediction, follow the schedule, and
          watch the leaderboard fill in as the season unfolds.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <Link
            to="/predictions"
            className="flex items-center justify-between rounded-xl bg-navy text-white px-5 py-4 hover:bg-navy/90 transition-colors min-h-[56px]"
          >
            <span className="font-medium">Make your pick</span>
            <TrendingUp size={20} aria-hidden="true" />
          </Link>
          <Link
            to="/predictions/leaderboard"
            className="flex items-center justify-between rounded-xl bg-gold text-navy px-5 py-4 hover:bg-gold/90 transition-colors min-h-[56px]"
          >
            <span className="font-medium">Leaderboard</span>
            <Trophy size={20} aria-hidden="true" />
          </Link>
          <Link
            to="/schedule"
            className="flex items-center justify-between rounded-xl bg-surface border border-border text-text px-5 py-4 hover:bg-bg transition-colors min-h-[56px]"
          >
            <span className="font-medium">Schedule</span>
            <CalendarDays size={20} aria-hidden="true" />
          </Link>
          <Link
            to="/standings"
            className="flex items-center justify-between rounded-xl bg-surface border border-border text-text px-5 py-4 hover:bg-bg transition-colors min-h-[56px]"
          >
            <span className="font-medium">Standings</span>
            <ListOrdered size={20} aria-hidden="true" />
          </Link>
        </div>
      </div>

      <Shoutbox />
    </div>
  )
}
