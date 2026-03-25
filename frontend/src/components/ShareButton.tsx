// frontend/src/components/ShareButton.tsx — FULL REPLACEMENT
import { useState } from 'react'

interface Props {
  title: string
  url?:  string
}

export default function ShareButton({ title, url }: Props) {
  const [state, setState] = useState<'idle'|'copied'|'shared'>('idle')
  const shareUrl = url || window.location.href

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, url: shareUrl })
        setState('shared')
        setTimeout(() => setState('idle'), 2000)
        return
      } catch { /* cancelled or unsupported */ }
    }
    try {
      await navigator.clipboard.writeText(shareUrl)
      setState('copied')
      setTimeout(() => setState('idle'), 2000)
    } catch {
      prompt('Copy this link:', shareUrl)
    }
  }

  return (
    <button
      onClick={handleShare}
      className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-xs font-medium transition-all duration-200 active:scale-95 ${
        state !== 'idle'
          ? 'bg-brand/10 border-brand/40 text-brand'
          : 'bg-dark-card border-dark-border text-slate-400 hover:border-brand/40 hover:text-white'
      }`}>
      {state === 'copied' ? (
        <>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Copied!
        </>
      ) : state === 'shared' ? (
        <>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Shared!
        </>
      ) : (
        <>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
            <polyline points="16 6 12 2 8 6"/>
            <line x1="12" y1="2" x2="12" y2="15"/>
          </svg>
          Share
        </>
      )}
    </button>
  )
}
