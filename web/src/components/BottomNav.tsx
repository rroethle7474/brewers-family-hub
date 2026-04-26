import { NavLink } from 'react-router-dom'
import { Home, TrendingUp, Trophy } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface ItemProps {
  to: string
  end?: boolean
  icon: LucideIcon
  label: string
}

function Item({ to, end, icon: Icon, label }: ItemProps) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        [
          'flex flex-1 flex-col items-center justify-center gap-1',
          'min-h-[56px] py-2',
          isActive ? 'text-navy' : 'text-text-muted',
        ].join(' ')
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={22} strokeWidth={isActive ? 2.4 : 1.8} aria-hidden="true" />
          <span className="text-[11px] font-medium">{label}</span>
        </>
      )}
    </NavLink>
  )
}

export function BottomNav() {
  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed inset-x-0 bottom-0 z-40 bg-surface border-t border-border pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex items-stretch justify-around">
        <Item to="/" end icon={Home} label="Home" />
        <Item to="/predictions" end icon={TrendingUp} label="Picks" />
        <Item to="/predictions/leaderboard" icon={Trophy} label="Board" />
      </div>
    </nav>
  )
}
