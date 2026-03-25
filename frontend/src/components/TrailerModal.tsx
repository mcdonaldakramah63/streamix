// frontend/src/components/TrailerModal.tsx — FULL REPLACEMENT
import { useEffect, useRef } from 'react'

interface Props {
  videoKey: string
  title:    string
  onClose:  () => void
}

export default function TrailerModal({ videoKey, title, onClose }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', fn)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', fn)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8"
      style={{ background: 'rgba(7,8,12,0.95)', backdropFilter:'blur(20px)' }}
      onClick={e => { if (e.target === overlayRef.current) onClose() }}>

      <div className="relative w-full max-w-4xl animate-scale-in">

        {/* Header */}
        <div className="flex items-start justify-between mb-3 sm:mb-4 px-1">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-1">Official Trailer</p>
            <h2 className="font-bold text-white text-base sm:text-xl leading-tight line-clamp-1"
              style={{ fontFamily:'Syne, sans-serif' }}>
              {title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 ml-4 w-9 h-9 rounded-full glass border border-dark-border flex items-center justify-center text-slate-400 hover:text-white hover:border-brand/50 transition-all">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Video */}
        <div className="relative w-full rounded-2xl overflow-hidden shadow-deep border border-dark-border" style={{ aspectRatio:'16/9' }}>
          <iframe
            src={`https://www.youtube.com/embed/${videoKey}?autoplay=1&rel=0&modestbranding=1&color=white`}
            className="absolute inset-0 w-full h-full"
            allow="autoplay; fullscreen; encrypted-media"
            allowFullScreen
            title={`${title} Trailer`}
          />
        </div>

        <p className="text-center text-[11px] text-slate-700 mt-3">
          Press <kbd className="px-1.5 py-0.5 rounded bg-dark-surface border border-dark-border text-slate-500 text-[10px]">ESC</kbd> or click outside to close
        </p>
      </div>
    </div>
  )
}
