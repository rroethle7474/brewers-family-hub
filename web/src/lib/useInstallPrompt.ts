import { useEffect, useState } from 'react'

// Chromium fires 'beforeinstallprompt' when the page is installable. We
// capture the event, prevent the default mini-infobar, and expose the
// stashed event so a UI button can call .prompt() at the right moment.
// iOS Safari does not fire this — there's no programmatic install path on
// iOS, so we show a manual "tap Share → Add to Home Screen" hint instead.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function useInstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault()
      setEvent(e as BeforeInstallPromptEvent)
    }
    function onInstalled() {
      setEvent(null)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  return event
}

// True when the page is being rendered as an installed PWA (standalone window).
// Used to suppress install hints — they're already done.
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari uses the legacy navigator.standalone flag.
    'standalone' in window.navigator &&
      (window.navigator as { standalone?: boolean }).standalone === true
  )
}

// True when the page is loaded in iOS Safari (iPhone/iPad). On iOS we have
// to teach the user the manual install gesture; there is no API.
export function isIOSSafari(): boolean {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent
  const isIOS = /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ identifies as Mac with touch points.
    (ua.includes('Mac') && 'ontouchend' in document)
  if (!isIOS) return false
  // Filter out in-app browsers (Facebook, Instagram, etc.) where Add-to-Home
  // doesn't behave the same way.
  const isSafari = /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|FBAN|FBAV|Instagram/.test(ua)
  return isSafari
}
