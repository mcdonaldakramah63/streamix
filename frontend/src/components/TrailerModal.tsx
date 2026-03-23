// frontend/src/components/TrailerModal.tsx — NEW FILE
import { useEffect, useRef } from 'react'

interface Props {
  videoKey: string   // YouTube video key from TMDB
  title:    string
  onClose:  () => void
}

export default function TrailerModal({ videoKey, title, onClose }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null)

  // Close on Escape
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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === overlayRef.current) onClose() }}>

      <div className="relative w-full max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Official Trailer</p>
            <h3 className="text-white font-black text-lg">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* YouTube iframe */}
        <div className="relative w-full rounded-2xl overflow-hidden bg-black shadow-2xl" style={{ aspectRatio: '16/9' }}>
          <iframe
            src={`https://www.youtube.com/embed/${videoKey}?autoplay=1&rel=0&modestbranding=1`}
            className="absolute inset-0 w-full h-full"
            allow="autoplay; fullscreen; encrypted-media"
            allowFullScreen
            title={`${title} Trailer`}
          />
        </div>

        <p className="text-center text-xs text-slate-600 mt-3">Press ESC or click outside to close</p>
      </div>
    </div>
  )
}
