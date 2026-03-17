// frontend/src/components/VideoPlayer.tsx — FULL REPLACEMENT
import { useState, useRef, useEffect } from 'react'

interface Props {
  tmdbId:   number
  imdbId?:  string
  type:     'movie' | 'tv'
  season?:  number
  episode?: number
}

interface Source { label: string; url: string }

function buildSources(
  type: 'movie' | 'tv',
  tmdbId: number,
  imdbId: string | undefined,
  season: number,
  episode: number
): Source[] {
  if (type === 'tv') {
    return [
      { label: 'VidSrc',       url: `https://vidsrc.to/embed/tv/${tmdbId}/${season}/${episode}` },
      { label: 'VidSrc 2',     url: `https://vidsrc.me/embed/tv?tmdb=${tmdbId}&season=${season}&episode=${episode}` },
      { label: 'VidSrc 3',     url: `https://vidsrc.xyz/embed/tv?tmdb=${tmdbId}&season=${season}&episode=${episode}` },
      { label: 'Embed.su',     url: `https://embed.su/embed/tv/${tmdbId}/${season}/${episode}` },
      { label: 'AutoEmbed',    url: `https://autoembed.co/tv/tmdb/${tmdbId}-${season}-${episode}` },
      { label: 'MultiEmbed',   url: `https://multiembed.mov/directstream.php?video_id=${tmdbId}&tmdb=1&s=${season}&e=${episode}` },
      ...(imdbId ? [{ label: 'MultiEmbed 2', url: `https://multiembed.mov/?video_id=${imdbId}&s=${season}&e=${episode}` }] : []),
      { label: '2Embed',       url: `https://www.2embed.cc/embedtv/${tmdbId}&s=${season}&e=${episode}` },
    ]
  }
  return [
    { label: 'VidSrc',       url: `https://vidsrc.to/embed/movie/${tmdbId}` },
    { label: 'VidSrc 2',     url: `https://vidsrc.me/embed/movie?tmdb=${tmdbId}` },
    { label: 'VidSrc 3',     url: `https://vidsrc.xyz/embed/movie?tmdb=${tmdbId}` },
    { label: 'Embed.su',     url: `https://embed.su/embed/movie/${tmdbId}` },
    { label: 'AutoEmbed',    url: `https://autoembed.co/movie/tmdb/${tmdbId}` },
    { label: 'MultiEmbed',   url: `https://multiembed.mov/directstream.php?video_id=${tmdbId}&tmdb=1` },
    ...(imdbId ? [{ label: 'MultiEmbed 2', url: `https://multiembed.mov/?video_id=${imdbId}` }] : []),
    { label: '2Embed',       url: `https://www.2embed.cc/embed/${tmdbId}` },
  ]
}

export default function VideoPlayer({ tmdbId, imdbId, type, season = 1, episode = 1 }: Props) {
  const sources = buildSources(type, tmdbId, imdbId, season, episode)

  const [activeIdx,    setActiveIdx]    = useState(0)
  const [isLoading,    setIsLoading]    = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // We fullscreen the iframe itself — pure video, nothing else
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const timerRef  = useRef<ReturnType<typeof setTimeout>>()

  // Reset on content change
  useEffect(() => { setActiveIdx(0); setIsLoading(true) }, [tmdbId, season, episode])

  // Clear loading spinner after 7s
  useEffect(() => {
    setIsLoading(true)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setIsLoading(false), 7000)
    return () => clearTimeout(timerRef.current)
  }, [activeIdx, tmdbId, season, episode])

  // Track fullscreen state
  useEffect(() => {
    const fn = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', fn)
    return () => document.removeEventListener('fullscreenchange', fn)
  }, [])

  // Fullscreen on the IFRAME only — pure video, no UI around it
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        // Try iframe first, fall back to its parent div
        const el = iframeRef.current as any
        if (el?.requestFullscreen)          await el.requestFullscreen()
        else if (el?.webkitRequestFullscreen) el.webkitRequestFullscreen()
        else if (el?.mozRequestFullScreen)    el.mozRequestFullScreen()
      }
    } catch {}
  }

  return (
    <div className="bg-black w-full flex flex-col">

      {/* ── Video iframe — completely clean, nothing overlaid ── */}
      <div className="relative w-full bg-black" style={{ aspectRatio: '16/9' }}>

        <iframe
          ref={iframeRef}
          key={`${activeIdx}-${tmdbId}-${season}-${episode}`}
          src={sources[activeIdx].url}
          className="absolute inset-0 w-full h-full border-0"
          allowFullScreen
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          referrerPolicy="no-referrer"
          title="Video Player"
        />

        {/* Loading spinner — pointer-events-none, never blocks iframe */}
        {isLoading && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center pointer-events-none z-10">
            <div className="w-10 h-10 border-2 border-slate-700 border-t-brand rounded-full animate-spin mb-3" />
            <p className="text-sm text-slate-400">{sources[activeIdx].label}</p>
            {activeIdx > 0 && (
              <p className="text-xs text-slate-600 mt-1">Source {activeIdx + 1} / {sources.length}</p>
            )}
          </div>
        )}
      </div>

      {/* ── Controls bar — below the video, never shown in fullscreen ── */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[#0d1117] border-t border-white/5 flex-wrap">

        <span className="text-xs text-slate-500 flex-shrink-0">Server:</span>

        {/* Source buttons */}
        <div className="flex gap-1.5 flex-wrap flex-1 min-w-0">
          {sources.map((s, i) => (
            <button
              key={i}
              onClick={() => setActiveIdx(i)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all active:scale-95 whitespace-nowrap ${
                activeIdx === i
                  ? 'bg-brand text-dark'
                  : 'bg-dark-card border border-dark-border text-slate-400 hover:border-brand hover:text-white'
              }`}>
              {s.label}
            </button>
          ))}
        </div>

        {/* Fullscreen button */}
        <button
          onClick={toggleFullscreen}
          title="Fullscreen"
          className="flex-shrink-0 w-8 h-8 rounded-lg bg-dark-card border border-dark-border flex items-center justify-center text-slate-400 hover:text-white hover:border-brand transition-colors active:scale-95">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M8 3H5a2 2 0 0 0-2 2v3"/>
            <path d="M21 8V5a2 2 0 0 0-2-2h-3"/>
            <path d="M3 16v3a2 2 0 0 0 2 2h3"/>
            <path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
          </svg>
        </button>

      </div>
    </div>
  )
}
