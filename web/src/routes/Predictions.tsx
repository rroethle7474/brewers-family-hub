import { useEffect, useState, type FormEvent } from 'react'
import { Lock, Trophy } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import { useProfile } from '../lib/useProfile'
import type { Tables } from '../lib/database.types'

type Prediction = Tables<'predictions'>
type Standings = Tables<'standings_snapshot'>

const SEASON_GAMES = 162

interface ViewModel {
  prediction: Prediction | null
  standings: Standings | null
  loading: boolean
  error: string | null
}

const initialView: ViewModel = {
  prediction: null,
  standings: null,
  loading: true,
  error: null,
}

export function Predictions() {
  const { user } = useAuth()
  const { profile } = useProfile()
  const [view, setView] = useState<ViewModel>(initialView)

  // Form state — only used when no prediction yet.
  const [picked, setPicked] = useState('')
  const [submitState, setSubmitState] = useState<'idle' | 'saving' | 'error'>(
    'idle',
  )
  const [submitError, setSubmitError] = useState<string | null>(null)

  async function loadData() {
    if (!user) return
    setView((v) => ({ ...v, loading: true, error: null }))

    const [predRes, standingsRes] = await Promise.all([
      supabase
        .from('predictions')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('standings_snapshot')
        .select('*')
        .eq('team_id', 158)
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    setView({
      prediction: predRes.data ?? null,
      standings: standingsRes.data ?? null,
      loading: false,
      error: predRes.error?.message ?? standingsRes.error?.message ?? null,
    })
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!user) return
    const n = Number.parseInt(picked, 10)
    if (!Number.isFinite(n)) return

    setSubmitState('saving')
    setSubmitError(null)

    const { error } = await supabase.from('predictions').insert({
      user_id: user.id,
      predicted_wins: n,
    })

    if (error) {
      setSubmitState('error')
      setSubmitError(error.message)
      return
    }

    // Reload — the locked-in view will replace the form.
    setSubmitState('idle')
    setPicked('')
    await loadData()
  }

  if (view.loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center">
        <p className="text-sm text-text-muted">Loading…</p>
      </div>
    )
  }

  if (view.error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <p className="text-sm text-loss" role="alert">
          Couldn't load: {view.error}
        </p>
      </div>
    )
  }

  // 1. Locked-in view — user already submitted.
  if (view.prediction) {
    return <LockedInCard prediction={view.prediction} displayName={profile?.display_name ?? null} />
  }

  // 2. Pre-season / no standings yet — predictions can't open.
  if (!view.standings) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="rounded-2xl bg-surface border border-border p-6 md:p-8 text-center shadow-sm">
          <h1 className="font-display text-3xl text-navy">Predictions open soon</h1>
          <p className="mt-3 text-text-muted">
            We need at least one standings snapshot before picks can be locked
            in. Check back after the daily sync runs.
          </p>
        </div>
      </div>
    )
  }

  // 3. Form — user hasn't picked yet.
  const { wins, losses } = view.standings
  const gamesPlayed = wins + losses
  const gamesRemaining = SEASON_GAMES - gamesPlayed
  const minPick = wins
  const maxPick = wins + gamesRemaining

  const n = Number.parseInt(picked, 10)
  const pickedIsNumber = Number.isFinite(n)
  const inRange = pickedIsNumber && n >= minPick && n <= maxPick
  const canSubmit = inRange && submitState !== 'saving'

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:py-10 space-y-6">
      <header>
        <h1 className="font-display text-3xl md:text-4xl text-navy">
          Make your pick
        </h1>
        <p className="mt-2 text-text-muted">
          One prediction per season. Once you submit, it's locked.
        </p>
      </header>

      <StandingsBlock standings={view.standings} />

      <form
        onSubmit={onSubmit}
        className="rounded-2xl bg-surface border border-border p-6 md:p-8 shadow-sm space-y-5"
      >
        <div>
          <label htmlFor="predicted_wins" className="block text-sm font-medium text-text">
            Your prediction — Brewers' final win total
          </label>
          <input
            id="predicted_wins"
            type="number"
            min={minPick}
            max={maxPick}
            step={1}
            inputMode="numeric"
            required
            value={picked}
            onChange={(e) => setPicked(e.target.value)}
            className="mt-2 block w-full rounded-xl border border-border bg-surface px-4 py-3 text-2xl font-display tabular-nums text-text focus:outline-none focus:ring-2 focus:ring-navy/40 focus:border-navy"
            placeholder={`${minPick}–${maxPick}`}
          />
          <p className="mt-2 text-sm text-text-muted">
            Valid range:{' '}
            <span className="font-semibold tabular-nums text-text">
              {minPick}–{maxPick}
            </span>{' '}
            wins.{' '}
            <span className="text-text-muted">
              ({gamesRemaining} games left in the {SEASON_GAMES}-game season.)
            </span>
          </p>
          {pickedIsNumber && !inRange && (
            <p className="mt-2 text-sm text-loss" role="alert">
              {n < minPick
                ? `That's below the Brewers' current ${wins} wins — they've already locked those in.`
                : `That's more wins than physically possible — only ${gamesRemaining} games left.`}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-navy text-white px-5 py-3 font-medium hover:bg-navy/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors min-h-[48px]"
        >
          <Lock size={18} aria-hidden="true" />
          {submitState === 'saving' ? 'Locking in…' : 'Lock it in'}
        </button>

        {submitError && (
          <p className="text-sm text-loss text-center" role="alert">
            {submitError}
          </p>
        )}

        <p className="text-xs text-text-muted text-center">
          You only get one pick. We can't change it after.
        </p>
      </form>
    </div>
  )
}

function StandingsBlock({ standings }: { standings: Standings }) {
  const { wins, losses, snapshot_date, games_back, division_rank, streak, last_10 } =
    standings
  return (
    <div className="rounded-2xl bg-navy text-white p-5 md:p-6 shadow-sm">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-white/70">
            Brewers — current standings
          </p>
          <p className="mt-1 font-display text-4xl tabular-nums">
            {wins}-{losses}
          </p>
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {division_rank != null && (
            <Stat label="NL Central" value={`${ordinal(division_rank)}`} />
          )}
          {games_back != null && (
            <Stat
              label="GB"
              value={games_back === 0 ? '—' : games_back.toString()}
            />
          )}
          {last_10 && <Stat label="Last 10" value={last_10} />}
          {streak && <Stat label="Streak" value={streak} />}
        </dl>
      </div>
      <p className="mt-4 text-xs text-white/60">
        Snapshot from {formatDate(snapshot_date)}.
      </p>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-white/60">
        {label}
      </dt>
      <dd className="font-display tabular-nums text-base">{value}</dd>
    </div>
  )
}

function LockedInCard({
  prediction,
  displayName,
}: {
  prediction: Prediction
  displayName: string | null
}) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:py-10 space-y-6">
      <header>
        <h1 className="font-display text-3xl md:text-4xl text-navy">
          {displayName ? `Locked in, ${displayName}` : 'Locked in'}
        </h1>
        <p className="mt-2 text-text-muted">Your pick is in for the season.</p>
      </header>

      <div className="rounded-2xl bg-surface border border-border p-6 md:p-8 shadow-sm">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-text-muted">
              Your prediction
            </p>
            <p className="mt-1 font-display text-6xl text-navy tabular-nums leading-none">
              {prediction.predicted_wins}
            </p>
            <p className="mt-1 text-text-muted text-sm">wins for the Brewers</p>
          </div>
          <Lock size={28} className="text-gold-deep" aria-hidden="true" />
        </div>

        <hr className="my-6 border-border" />

        <dl className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
          <dt className="text-text-muted">Submitted</dt>
          <dd className="font-medium text-text">
            {formatDate(prediction.submitted_at)}
          </dd>

          {prediction.team_record_at_submission && (
            <>
              <dt className="text-text-muted">Record at submission</dt>
              <dd className="font-medium tabular-nums text-text">
                {prediction.team_record_at_submission}
              </dd>
            </>
          )}
        </dl>
      </div>

      <div className="rounded-2xl bg-bg border border-border p-5 text-sm text-text-muted">
        <Trophy
          size={18}
          className="inline-block mr-2 align-text-bottom text-gold-deep"
          aria-hidden="true"
        />
        Good luck the rest of the way. Watch the leaderboard fill in as
        family members lock in their picks.
      </div>
    </div>
  )
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
