import { NavLink } from 'react-router-dom'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'rounded-md px-3 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-gold text-navy'
      : 'text-white/80 hover:text-white hover:bg-white/10',
  ].join(' ')

export function TopNav() {
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
          <NavLink to="/predictions" end className={linkClass}>
            Predictions
          </NavLink>
          <NavLink to="/predictions/leaderboard" className={linkClass}>
            Leaderboard
          </NavLink>
        </nav>
      </div>
    </header>
  )
}
