function App() {
  return (
    <main className="min-h-[100svh] flex flex-col items-center justify-center p-6 text-center">
      <h1 className="text-4xl md:text-6xl font-semibold text-navy">
        Brewers Family Hub
      </h1>
      <p className="mt-4 text-text-muted max-w-md">
        Phase 1 scaffold is up. Auth and predictions land next.
      </p>
      <div className="mt-8 flex gap-2">
        <span className="inline-block w-6 h-6 rounded-full bg-navy" />
        <span className="inline-block w-6 h-6 rounded-full bg-gold" />
        <span className="inline-block w-6 h-6 rounded-full bg-gold-deep" />
      </div>
    </main>
  )
}

export default App
