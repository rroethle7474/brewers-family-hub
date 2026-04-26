import { useState } from 'react'
import { Share, Smartphone, X } from 'lucide-react'
import {
  useInstallPrompt,
  isStandalone,
  isIOSSafari,
} from '../lib/useInstallPrompt'

const DISMISS_KEY = 'bfh:install-hint-dismissed'

export function InstallHint() {
  const installEvent = useInstallPrompt()
  const [dismissed, setDismissed] = useState(() => {
    if (isStandalone()) return true
    return localStorage.getItem(DISMISS_KEY) === '1'
  })
  const ios = isIOSSafari()

  // No install path available — neither Chromium prompt nor iOS hint applies.
  // (e.g. desktop Chrome before site meets PWA criteria, or non-Safari iOS browser.)
  if (dismissed) return null
  if (!ios && !installEvent) return null

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  async function install() {
    if (!installEvent) return
    await installEvent.prompt()
    // The event is single-use; once prompted, dismiss the hint regardless of
    // the user's choice (appinstalled will fire if they accepted).
    dismiss()
  }

  return (
    <div
      className="md:hidden fixed bottom-[calc(env(safe-area-inset-bottom)+124px)] inset-x-0 z-30 px-3 pointer-events-none"
      role="region"
      aria-label="Install app hint"
    >
      <div className="mx-auto max-w-md pointer-events-auto rounded-2xl bg-navy text-white px-4 py-3 shadow-lg shadow-black/20 flex items-start gap-3">
        <Smartphone
          size={20}
          className="text-gold mt-0.5 shrink-0"
          aria-hidden="true"
        />
        <div className="flex-1 text-sm leading-snug">
          {ios ? (
            <>
              <p className="font-medium">Install on your iPhone</p>
              <p className="mt-0.5 text-xs text-white/80">
                Tap{' '}
                <Share
                  size={13}
                  className="inline-block mx-0.5 align-[-2px]"
                  aria-hidden="true"
                />
                in Safari, then choose <span className="font-semibold">Add to Home Screen</span>.
              </p>
            </>
          ) : (
            <>
              <p className="font-medium">Install Brewers Family Hub</p>
              <p className="mt-0.5 text-xs text-white/80">
                One tap from your home screen, every time.
              </p>
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {!ios && installEvent && (
            <button
              type="button"
              onClick={install}
              className="rounded-lg bg-gold text-navy px-3 py-1.5 text-xs font-semibold hover:bg-gold/90 transition-colors"
            >
              Install
            </button>
          )}
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="text-white/60 hover:text-white p-1.5 -m-1.5"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  )
}
