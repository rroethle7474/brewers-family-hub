import { Outlet } from 'react-router-dom'
import { TopNav } from './TopNav'
import { BottomNav } from './BottomNav'
import { InstallHint } from './InstallHint'
import { useAuth } from '../lib/useAuth'

export function Layout() {
  const { user, signOut } = useAuth()

  return (
    <div className="min-h-[100svh] flex flex-col bg-bg">
      <TopNav />
      <main className="flex-1 pb-24 md:pb-8">
        <Outlet />
      </main>

      {/* Stacked above the bottom nav on mobile, in this z-order:
          - InstallHint (top, only when applicable + not dismissed)
          - sign-out pill (middle)
          - BottomNav itself (bottom)                                   */}
      <InstallHint />

      {/* Mobile sign-out footer — discoverable without crowding the bottom nav.
          Hidden on desktop; the top nav already has a sign-out button. */}
      {user && (
        <footer className="md:hidden fixed bottom-[calc(env(safe-area-inset-bottom)+72px)] inset-x-0 z-30 px-4 pointer-events-none">
          <div className="mx-auto max-w-md flex justify-center">
            <button
              type="button"
              onClick={signOut}
              className="pointer-events-auto rounded-full bg-surface/95 backdrop-blur border border-border px-4 py-1.5 text-xs text-text-muted shadow-sm"
            >
              Signed in as{' '}
              <span className="text-text font-medium">{user.email}</span> ·{' '}
              <span className="text-navy font-medium">Sign out</span>
            </button>
          </div>
        </footer>
      )}

      <BottomNav />
    </div>
  )
}
