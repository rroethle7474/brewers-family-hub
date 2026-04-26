import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import { useAuth } from './useAuth'
import { ProfileContext, type Profile } from './profile-context'

/**
 * Tracks the current authenticated user's profiles row. Lives at the top of
 * the app (inside AuthProvider, outside the router) so any consumer — gates,
 * pages, the layout footer — can read profile state without re-querying.
 *
 * Re-fetches automatically when the auth user changes (sign-in, sign-out).
 * Components that just inserted a new profile (ProfileSetup) call refetch()
 * after the insert to surface the new row immediately.
 */
export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refetch = useCallback(async () => {
    if (!user) {
      setProfile(null)
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()
    if (error) {
      console.error('profile fetch failed', error)
    }
    setProfile(data ?? null)
    setIsLoading(false)
  }, [user])

  useEffect(() => {
    refetch()
  }, [refetch])

  return (
    <ProfileContext.Provider value={{ profile, isLoading, refetch }}>
      {children}
    </ProfileContext.Provider>
  )
}
