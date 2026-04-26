import { useContext } from 'react'
import { ProfileContext } from './profile-context'

export function useProfile() {
  const ctx = useContext(ProfileContext)
  if (!ctx) {
    throw new Error('useProfile must be used inside <ProfileProvider>')
  }
  return ctx
}
