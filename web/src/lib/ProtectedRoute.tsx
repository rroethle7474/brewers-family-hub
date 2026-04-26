import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './useAuth'

/**
 * Wraps any route subtree that should require an authenticated session.
 * Renders a minimal "loading" screen while the initial session check is
 * in flight (avoids a flash-of-login-page on refresh), then redirects to
 * /login if there's no session, preserving the attempted path so /login
 * can send the user back where they came from after sign-in.
 */
export function ProtectedRoute() {
  const { session, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="min-h-[100svh] flex items-center justify-center bg-bg">
        <p className="text-sm text-text-muted">Loading…</p>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  return <Outlet />
}
