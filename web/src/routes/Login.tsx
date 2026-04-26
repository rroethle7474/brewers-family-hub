import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Mail } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'

type Status = 'idle' | 'sending' | 'sent' | 'error'
type ResendStatus = 'idle' | 'sending' | 'sent'

export function Login() {
  const { session, isLoading } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [resendStatus, setResendStatus] = useState<ResendStatus>('idle')

  // If the user is already signed in (e.g. came back from a magic-link click,
  // or hit /login while still authed), bounce them to whichever path they
  // were originally trying to reach — or "/" by default.
  const fromPath =
    (location.state as { from?: string } | null)?.from ?? '/'

  if (isLoading) return null
  if (session) return <Navigate to={fromPath} replace />

  async function sendLink(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!email) return
    setStatus('sending')
    setErrorMsg(null)

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${window.location.origin}/`,
      },
    })

    if (error) {
      setStatus('error')
      setErrorMsg(error.message)
      return
    }
    setStatus('sent')
  }

  async function resend() {
    setResendStatus('sending')
    setErrorMsg(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${window.location.origin}/` },
    })
    if (error) {
      setResendStatus('idle')
      setErrorMsg(error.message)
      return
    }
    setResendStatus('sent')
  }

  return (
    <div className="min-h-[100svh] flex items-center justify-center px-4 bg-bg pb-[env(safe-area-inset-bottom)]">
      <div className="w-full max-w-sm rounded-2xl bg-surface border border-border p-6 md:p-8 shadow-sm">
        <div className="text-center">
          <h1 className="font-display text-3xl text-navy">Brewers Family Hub</h1>
          <p className="mt-1 text-sm text-text-muted">Family-only sign in</p>
        </div>

        {status === 'sent' ? (
          <div className="mt-8 space-y-4">
            <div className="flex flex-col items-center text-center">
              <div className="rounded-full bg-navy/10 p-3">
                <Mail size={28} className="text-navy" aria-hidden="true" />
              </div>
              <p className="mt-3 font-medium text-text">Check your email</p>
              <p className="mt-1 text-sm text-text-muted">
                A sign-in link is on its way to{' '}
                <span className="font-medium text-text break-all">{email}</span>.
              </p>
            </div>

            <div className="rounded-xl bg-bg border border-border p-4 text-xs text-text-muted leading-relaxed">
              <p>
                <span className="font-semibold text-text">Don't see it?</span>{' '}
                Check your <span className="font-semibold">spam</span> or{' '}
                <span className="font-semibold">junk</span> folder. The email
                comes from{' '}
                <span className="font-mono text-[10.5px] text-text">
                  noreply@mail.app.supabase.io
                </span>
                .
              </p>
              <p className="mt-2">
                Once you click the link, you'll stay signed in for weeks — you
                won't need to do this often.
              </p>
            </div>

            <button
              type="button"
              onClick={resend}
              disabled={resendStatus === 'sending'}
              className="w-full rounded-xl border border-border bg-surface px-5 py-3 text-sm font-medium text-text hover:bg-bg disabled:opacity-60 disabled:cursor-not-allowed transition-colors min-h-[48px]"
            >
              {resendStatus === 'sending' ? 'Sending…' : 'Resend the email'}
            </button>
            {resendStatus === 'sent' && (
              <p className="text-xs text-win text-center" role="status">
                Sent again — check your inbox.
              </p>
            )}
            {errorMsg && (
              <p className="text-sm text-loss text-center" role="alert">
                {errorMsg}
              </p>
            )}
          </div>
        ) : (
          <form onSubmit={sendLink} className="mt-8 space-y-3">
            <label htmlFor="email" className="block text-sm font-medium text-text">
              Email address
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="block w-full rounded-xl border border-border bg-surface px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-navy/40 focus:border-navy"
              placeholder="you@example.com"
            />
            <button
              type="submit"
              disabled={status === 'sending'}
              className="w-full rounded-xl bg-navy text-white px-5 py-3 font-medium hover:bg-navy/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors min-h-[48px]"
            >
              {status === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
            </button>
            {status === 'error' && errorMsg && (
              <p className="text-sm text-loss" role="alert">
                {errorMsg}
              </p>
            )}
            <p className="pt-2 text-xs text-text-muted text-center leading-relaxed">
              No password required. We'll email you a link that signs you in
              with one tap.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
