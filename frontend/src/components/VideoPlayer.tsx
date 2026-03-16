import { useRef, useState, useEffect } from 'react'

interface Props {
  src?: string
  tmdbId?: number
  type?: 'movie' | 'tv'
  season?: number
  episode?: number
}

export default function VideoPlayer({ src, tmdbId, type = 'movie', season = 1, episode = 1 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const iframeRef    = useRef<HTMLIFrameElement>(null)
  const [isFS, setIsFS] = useState(false)

  // Track fullscreen state changes (e.g. user presses Escape)
  useEffect(() => {
    const onChange = () => setIsFS(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await containerRef.current?.requestFullscreen()
      } else {
        await document.exitFullscreen()
      }
    } catch (e) {
      // Fallback: try on the iframe itself
      try {
        if (!document.fullscreenElement) {
          await iframeRef.current?.requestFullscreen()
        }
      } catch {}
    }
  }

  const url = src || (tmdbId
    ? type === 'tv'
      ? `https://multiembed.mov/directstream.php?video_id=${tmdbId}&tmdb=1&s=${season}&e=${episode}`
      : `https://multiembed.mov/directstream.php?video_id=${tmdbId}&tmdb=1`
    : '')

  if (!url) {
    return (
      <div className="w-full aspect-video bg-dark-surface flex flex-col items-center justify-center gap-3 text-slate-500 rounded-xl">
        <div className="text-4xl">📽</div>
        <p className="text-sm">No stream available — try another server</p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-black group"
      style={{ aspectRatio: isFS ? undefined : '16/9', height: isFS ? '100vh' : undefined }}
    >
      <iframe
        key={url}
        ref={iframeRef}
        src={url}
        className="w-full h-full"
        allowFullScreen
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        frameBorder="0"
        title="Video Player"
        referrerPolicy="no-referrer"
      />

      {/* Custom fullscreen button overlay — bottom-right corner */}
      <button
        onClick={toggleFullscreen}
        title={isFS ? 'Exit fullscreen' : 'Fullscreen'}
        className="absolute bottom-3 right-3 z-20 w-9 h-9 rounded-lg bg-black/70 border border-white/10 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-brand hover:border-brand"
      >
        {isFS ? (
          // Compress icon
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
          </svg>
        ) : (
          // Expand icon
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
          </svg>
        )}
      </button>
    </div>
  )
}
