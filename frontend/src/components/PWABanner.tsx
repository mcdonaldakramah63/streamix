// frontend/src/components/PWABanner.tsx — NEW FILE
import { usePWA } from '../hooks/usePWA'
import { useState } from 'react'

export function InstallBanner() {
  const { canInstall, install } = usePWA()
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem('pwa_dismissed') === '1'
  )

  if (!canInstall || dismissed) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-[80] animate-slide-up">
      <div className="glass rounded-2xl p-4 shadow-deep border border-brand/20">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand/20 flex items-center justify-center flex-shrink-0">
            <span className="text-xl">📲</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">Install Streamix</p>
            <p className="text-xs text-slate-500 mt-0.5">Add to home screen for the best experience</p>
          </div>
          <button
            onClick={() => { setDismissed(true); localStorage.setItem('pwa_dismissed','1') }}
            className="text-slate-600 hover:text-slate-400 flex-shrink-0 text-xs mt-0.5">✕</button>
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={install} className="btn-primary flex-1 py-2 text-xs">
            Install App
          </button>
          <button
            onClick={() => { setDismissed(true); localStorage.setItem('pwa_dismissed','1') }}
            className="btn-secondary flex-1 py-2 text-xs">
            Not Now
          </button>
        </div>
      </div>
    </div>
  )
}

export function OfflineBanner() {
  const { isOnline } = usePWA()
  if (isOnline) return null
  return (
    <div className="fixed top-16 left-0 right-0 z-[90] bg-yellow-500/95 text-dark text-xs font-bold text-center py-2 flex items-center justify-center gap-2">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/>
      </svg>
      You're offline — some features may be unavailable
    </div>
  )
}
