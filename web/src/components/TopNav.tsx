import { NavLink } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuth } from '../lib/useAuth'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'rounded-md px-3 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-gold text-navy'
      : 'text-white/80 hover:text-white hover:bg-white/10',
  ].join(' ')

export function TopNav() {
  const { session, signOut } = useAuth()

  return (
    <header className="hidden md:block bg-navy text-white">
      <div className="mx-auto max-w-5xl flex items-center justify-between px-6 py-4">
        <NavLink to="/" className="font-display text-2xl tracking-tight">
          Brewers Family Hub
        </NavLink>
        <nav className="flex items-center gap-1">
          <NavLink to="/" end className={linkClass}>
            Home
          </NavLink>
          <NavLink to="/schedule" className={linkClass}>
            Schedule
          </NavLink>
          <NavLink to="/standings" className={linkClass}>
            Standings
          </NavLink>
          <NavLink to="/predictions" end className={linkClass}>
            Predictions
          </NavLink>
          <NavLink to="/predictions/leaderboard" className={linkClass}>
            Leaderboard
          </NavLink>
          {session && (
            <button
              type="button"
              onClick={signOut}
              className="ml-3 inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Sign out"
            >
              <LogOut size={16} aria-hidden="true" />
              Sign out
            </button>
          )}
        </nav>
      </div>
    </header>
  )
}
