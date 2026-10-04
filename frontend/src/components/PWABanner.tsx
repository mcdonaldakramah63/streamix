// frontend/src/components/PWABanner.tsx — install prompt + offline strip
import { useState } from 'react'
import { usePWA } from '../hooks/usePWA'
import Icon from './Icon'

const DISMISS_KEY = 'pwa_dismissed'

export function InstallBanner() {
  const { canInstall, install } = usePWA()
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === '1' } catch { return false }
  })
  if (!canInstall || dismissed) return null

  const dismiss = () => { setDismissed(true); try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ } }

  return (
    <div className="fixed bottom-24 md:bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-[80] animate-slide-up">
      <div className="glass rounded-2xl p-4 shadow-deep">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand/20 flex items-center justify-center flex-shrink-0 text-brand">
            <Icon name="install_mobile" size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white">Install Streamix</p>
            <p className="text-xs text-ink-muted mt-0.5">Add it to your home screen or desktop</p>
          </div>
          <button onClick={dismiss} aria-label="Dismiss" className="text-ink-faint hover:text-white"><Icon name="close" size={18} /></button>
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={install} className="btn-primary flex-1 py-2 text-xs">Install</button>
          <button onClick={dismiss} className="btn-secondary flex-1 py-2 text-xs">Not now</button>
        </div>
      </div>
    </div>
  )
}

export function OfflineBanner() {
  const { isOnline } = usePWA()
  if (isOnline) return null
  return (
    <div className="fixed top-16 inset-x-0 z-[90] bg-gold text-dark-void text-xs font-bold text-center py-2 flex items-center justify-center gap-2">
      <Icon name="wifi_off" size={16} />
      You're offline — downloaded titles still play from Downloads
    </div>
  )
}
