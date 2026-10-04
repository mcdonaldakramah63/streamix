// frontend/src/hooks/usePWA.ts — install prompt + online status (SW is registered in main.tsx)
import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt:     () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// The browser fires this once, often before the page that offers "Install" is open — keep it
let deferred: BeforeInstallPromptEvent | null = null
const waiting = new Set<(e: BeforeInstallPromptEvent | null) => void>()
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as BeforeInstallPromptEvent; waiting.forEach(f => f(deferred)) })
window.addEventListener('appinstalled', () => { deferred = null; waiting.forEach(f => f(null)) })

/** iPhone/iPad Safari has no install prompt — people use Share → Add to Home Screen */
export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export function usePWA() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(deferred)
  const [isInstalled,   setIsInstalled]   = useState(() => window.matchMedia('(display-mode: standalone)').matches)
  const [isOnline,      setIsOnline]      = useState(navigator.onLine)

  useEffect(() => {
    waiting.add(setInstallPrompt)
    return () => { waiting.delete(setInstallPrompt) }
  }, [])

  useEffect(() => {
    const onPrompt  = (e: Event) => { e.preventDefault(); setInstallPrompt(e as BeforeInstallPromptEvent) }
    const onOnline  = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)
    const onInstalled = () => { setIsInstalled(true); setInstallPrompt(null) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    window.addEventListener('online',  onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
      window.removeEventListener('online',  onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  const install = async () => {
    if (!installPrompt) return false
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') { setIsInstalled(true); setInstallPrompt(null); deferred = null }
    return outcome === 'accepted'
  }

  return { canInstall: !!installPrompt && !isInstalled, install, isInstalled, isOnline }
}
