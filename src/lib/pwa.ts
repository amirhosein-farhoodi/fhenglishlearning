import { useEffect, useState } from 'react'

/**
 * Installable-app plumbing: the service worker (offline + updates) and the
 * "Install app" prompt. The worker itself lives in src/sw/sw.js.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let installEvent: BeforeInstallPromptEvent | null = null
let waiting: ServiceWorker | null = null
let installed = false

const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/** Running from the home screen / as an installed app. */
export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

/** iPhone/iPad Safari never fires beforeinstallprompt - it needs Share > Add to Home Screen. */
export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  // iPadOS reports itself as a Mac with touch.
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

function trackWaiting(reg: ServiceWorkerRegistration) {
  const offer = (sw: ServiceWorker | null) => {
    // Only an *update* needs a prompt; the very first install just starts working.
    if (sw && navigator.serviceWorker.controller) {
      waiting = sw
      emit()
    }
  }
  if (reg.waiting) offer(reg.waiting)
  reg.addEventListener('updatefound', () => {
    const sw = reg.installing
    sw?.addEventListener('statechange', () => {
      if (sw.state === 'installed') offer(sw)
    })
  })
}

export function startPwa() {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Keep the browser's mini-infobar quiet; the app shows its own button.
    e.preventDefault()
    installEvent = e as BeforeInstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    installEvent = null
    installed = true
    emit()
  })

  // The dev server rebuilds on every save; a caching worker there only gets in the way.
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        trackWaiting(reg)
        // Installed apps can stay open for days; look for a new deploy whenever
        // the app comes back to the foreground.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void reg.update().catch(() => {})
        })
      })
      .catch((err) => console.error('[pwa] service worker failed to register', err))
  })

  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    window.location.reload()
  })
}

/** Swap to the waiting version; the page reloads once it takes over. */
export function applyUpdate() {
  waiting?.postMessage('SKIP_WAITING')
}

export async function promptInstall() {
  const e = installEvent
  if (!e) return
  await e.prompt()
  const { outcome } = await e.userChoice
  installEvent = null
  if (outcome === 'accepted') installed = true
  emit()
}

function useStore<T>(read: () => T): T {
  const [value, setValue] = useState(read)
  useEffect(() => subscribe(() => setValue(read())), [])
  return value
}

/** A newer version has been downloaded and is ready to use. */
export const useUpdateReady = () => useStore(() => waiting !== null)

/**
 * How this device can install the app: 'prompt' (Chrome, Edge, Android - one
 * tap), 'ios' (show Share > Add to Home Screen), or null (installed already, or
 * the browser cannot).
 */
export function useInstall(): 'prompt' | 'ios' | null {
  return useStore(() => {
    if (installed || isStandalone()) return null
    if (installEvent) return 'prompt'
    if (isIOS()) return 'ios'
    return null
  })
}
