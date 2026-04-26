import { Navigate, Outlet } from 'react-router-dom'
import { useProfile } from './useProfile'

/**
 * Sits inside ProtectedRoute. Once we know there's a session, this gate
 * makes sure the user has also completed profile setup. If their profiles
 * row is missing, send them to /profile/setup. Returning users with a
 * complete profile fall through to the app.
 */
export function ProfileGate() {
  const { profile, isLoading } = useProfile()

  if (isLoading) {
    return (
      <div className="min-h-[100svh] flex items-center justify-center bg-bg">
        <p className="text-sm text-text-muted">Loading…</p>
      </div>
    )
  }

  if (!profile) {
    return <Navigate to="/profile/setup" replace />
  }

  return <Outlet />
}
