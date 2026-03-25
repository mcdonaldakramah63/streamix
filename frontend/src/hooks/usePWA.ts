// frontend/src/hooks/usePWA.ts — NEW FILE
import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt:             () => Promise<void>
  userChoice:         Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function usePWA() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled,   setIsInstalled]   = useState(false)
  const [isOnline,      setIsOnline]       = useState(navigator.onLine)

  useEffect(() => {
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('[SW] Registered:', reg.scope))
        .catch(err => console.warn('[SW] Registration failed:', err))
    }

    // Check if already installed as PWA
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
    }

    // Capture install prompt
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)

    // Online/offline detection
    const onOnline  = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)
    window.addEventListener('online',  onOnline)
    window.addEventListener('offline', onOffline)

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('online',  onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  const install = async () => {
    if (!installPrompt) return false
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') {
      setIsInstalled(true)
      setInstallPrompt(null)
    }
    return outcome === 'accepted'
  }

  return { canInstall: !!installPrompt && !isInstalled, install, isInstalled, isOnline }
}

// ── Picture-in-Picture hook ───────────────────────────────────────────────────
export function usePiP(videoRef: React.RefObject<HTMLVideoElement>) {
  const [isPiP, setIsPiP] = useState(false)
  const [supported] = useState(() => document.pictureInPictureEnabled ?? false)

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onEnter = () => setIsPiP(true)
    const onLeave = () => setIsPiP(false)
    v.addEventListener('enterpictureinpicture', onEnter)
    v.addEventListener('leavepictureinpicture', onLeave)
    return () => {
      v.removeEventListener('enterpictureinpicture', onEnter)
      v.removeEventListener('leavepictureinpicture', onLeave)
    }
  }, [videoRef])

  const toggle = async () => {
    const v = videoRef.current
    if (!v || !supported) return
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
      } else {
        await v.requestPictureInPicture()
      }
    } catch (e) {
      console.warn('[PiP] Failed:', e)
    }
  }

  return { isPiP, toggle, supported }
}
