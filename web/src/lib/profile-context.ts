import { createContext } from 'react'
import type { Tables } from './database.types'

export type Profile = Tables<'profiles'>

export interface ProfileContextValue {
  profile: Profile | null
  isLoading: boolean
  /** Re-fetch the current user's profile row. Call after creating/updating. */
  refetch: () => Promise<void>
}

export const ProfileContext = createContext<ProfileContextValue | undefined>(
  undefined,
)
