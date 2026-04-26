import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import { useProfile } from '../lib/useProfile'

const NAME_MAX = 30

type Status = 'idle' | 'saving' | 'error'

export function ProfileSetup() {
  const { user } = useAuth()
  const { profile, isLoading: profileLoading, refetch } = useProfile()
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  if (profileLoading) return null
  if (profile) return <Navigate to="/" replace />
  if (!user) return null // unreachable: we're already inside ProtectedRoute

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!user) return
    const name = displayName.trim()
    if (name.length < 1) return

    setStatus('saving')
    setErrorMsg(null)

    const { error } = await supabase.from('profiles').insert({
      id: user.id,
      display_name: name,
      avatar_url: avatarUrl.trim() || null,
    })

    if (error) {
      setStatus('error')
      setErrorMsg(error.message)
      return
    }

    await refetch()
    navigate('/', { replace: true })
  }

  const canSubmit = displayName.trim().length >= 1 && status !== 'saving'

  return (
    <div className="min-h-[100svh] flex items-center justify-center px-4 bg-bg pb-[env(safe-area-inset-bottom)]">
      <div className="w-full max-w-sm rounded-2xl bg-surface border border-border p-6 md:p-8 shadow-sm">
        <div className="text-center">
          <h1 className="font-display text-3xl text-navy">Welcome aboard</h1>
          <p className="mt-2 text-sm text-text-muted">
            Tell the family who you are.
          </p>
        </div>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <div>
            <label
              htmlFor="display_name"
              className="block text-sm font-medium text-text"
            >
              Display name
            </label>
            <input
              id="display_name"
              type="text"
              required
              maxLength={NAME_MAX}
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-border bg-surface px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-navy/40 focus:border-navy"
              placeholder="e.g. Uncle Mike"
            />
            <p className="mt-1 text-xs text-text-muted">
              Shown next to your prediction on the leaderboard. Up to{' '}
              {NAME_MAX} characters.
            </p>
          </div>

          <div>
            <label
              htmlFor="avatar_url"
              className="block text-sm font-medium text-text"
            >
              Photo URL{' '}
              <span className="text-text-muted font-normal">(optional)</span>
            </label>
            <input
              id="avatar_url"
              type="url"
              autoComplete="off"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-border bg-surface px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-navy/40 focus:border-navy"
              placeholder="https://…"
            />
            <p className="mt-1 text-xs text-text-muted">
              Skip this for now if you'd rather. Photo uploads from your
              device come later.
            </p>
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-xl bg-navy text-white px-5 py-3 font-medium hover:bg-navy/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors min-h-[48px]"
          >
            {status === 'saving' ? 'Saving…' : 'Continue'}
          </button>
          {status === 'error' && errorMsg && (
            <p className="text-sm text-loss text-center" role="alert">
              {errorMsg}
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
