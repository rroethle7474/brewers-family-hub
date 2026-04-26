export function Predictions() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-display text-3xl md:text-4xl text-navy">Predictions</h1>
      <p className="mt-3 text-text-muted">
        The prediction form lands in step 7d. It will show your locked-in pick
        once submitted, or the form (with the current valid range computed
        from <code className="font-mono text-sm">standings_snapshot</code>) if
        you haven't submitted yet.
      </p>
    </div>
  )
}
