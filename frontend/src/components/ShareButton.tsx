// frontend/src/components/ShareButton.tsx — NEW FILE
import { useState } from 'react'

interface Props {
  title: string
  url?:  string
}

export default function ShareButton({ title, url }: Props) {
  const [copied, setCopied] = useState(false)
  const shareUrl = url || window.location.href

  const handleShare = async () => {
    // Try native share (mobile)
    if (navigator.share) {
      try {
        await navigator.share({ title, url: shareUrl })
        return
      } catch { /* cancelled */ }
    }
    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Last resort: prompt
      prompt('Copy this link:', shareUrl)
    }
  }

  return (
    <button
      onClick={handleShare}
      className="flex items-center gap-2 px-3 py-2 rounded-xl bg-dark-card border border-dark-border text-slate-400 hover:text-white hover:border-brand transition-all text-sm active:scale-95">
      {copied ? (
        <>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-brand">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <span className="text-brand text-xs font-semibold">Copied!</span>
        </>
      ) : (
        <>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
            <polyline points="16 6 12 2 8 6"/>
            <line x1="12" y1="2" x2="12" y2="15"/>
          </svg>
          <span className="text-xs">Share</span>
        </>
      )}
    </button>
  )
}
