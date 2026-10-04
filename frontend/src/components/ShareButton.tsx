import { useState } from 'react'
import Icon from './Icon'

export default function ShareButton({ title, url }: { title: string; url?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'shared'>('idle')
  const shareUrl = url || window.location.href

  const flash = (s: 'copied' | 'shared') => { setState(s); setTimeout(() => setState('idle'), 2000) }

  const handleShare = async () => {
    if (navigator.share) {
      try { await navigator.share({ title, url: shareUrl }); flash('shared'); return }
      catch (e: any) { if (e?.name === 'AbortError') return }
    }
    try { await navigator.clipboard.writeText(shareUrl); flash('copied') }
    catch { window.prompt('Copy this link:', shareUrl) }
  }

  return (
    <button onClick={handleShare}
      className={`h-11 px-2 sm:px-4 rounded-full flex items-center justify-center gap-1 sm:gap-1.5 text-[13px] sm:text-sm font-semibold whitespace-nowrap transition-all active:scale-95 ${
        state !== 'idle' ? 'bg-cyan/15 text-cyan' : 'bg-dark-border text-ink hover:bg-dark-high'
      }`}>
      <Icon name={state === 'idle' ? 'share' : 'check'} size={18} />
      {state === 'copied' ? 'Copied' : state === 'shared' ? 'Shared' : 'Share'}
    </button>
  )
}
