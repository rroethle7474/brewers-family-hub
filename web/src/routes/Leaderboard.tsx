export function Leaderboard() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-display text-3xl md:text-4xl text-navy">Leaderboard</h1>
      <p className="mt-3 text-text-muted">
        The leaderboard lands in step 7e. It will sort by closeness to the
        on-pace projection (current_wins ÷ games_played × 162), with the
        submission date publicly visible per <code className="font-mono text-sm">SPEC §13</code>.
      </p>
    </div>
  )
}
