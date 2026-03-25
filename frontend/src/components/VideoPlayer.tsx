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

function buildSources(type: 'movie'|'tv', tmdbId: number, imdbId: string|undefined, season: number, episode: number): Source[] {
  if (type === 'tv') {
    return [
      { label: 'VidSrc',      url: `https://vidsrc.to/embed/tv/${tmdbId}/${season}/${episode}` },
      { label: 'VidSrc 2',    url: `https://vidsrc.me/embed/tv?tmdb=${tmdbId}&season=${season}&episode=${episode}` },
      { label: 'VidSrc 3',    url: `https://vidsrc.xyz/embed/tv?tmdb=${tmdbId}&season=${season}&episode=${episode}` },
      { label: 'Embed.su',    url: `https://embed.su/embed/tv/${tmdbId}/${season}/${episode}` },
      { label: 'AutoEmbed',   url: `https://autoembed.co/tv/tmdb/${tmdbId}-${season}-${episode}` },
      { label: 'MultiEmbed',  url: `https://multiembed.mov/directstream.php?video_id=${tmdbId}&tmdb=1&s=${season}&e=${episode}` },
      ...(imdbId ? [{ label: 'MultiEmbed 2', url: `https://multiembed.mov/?video_id=${imdbId}&s=${season}&e=${episode}` }] : []),
      { label: '2Embed',      url: `https://www.2embed.cc/embedtv/${tmdbId}&s=${season}&e=${episode}` },
    ]
  }
  return [
    { label: 'VidSrc',      url: `https://vidsrc.to/embed/movie/${tmdbId}` },
    { label: 'VidSrc 2',    url: `https://vidsrc.me/embed/movie?tmdb=${tmdbId}` },
    { label: 'VidSrc 3',    url: `https://vidsrc.xyz/embed/movie?tmdb=${tmdbId}` },
    { label: 'Embed.su',    url: `https://embed.su/embed/movie/${tmdbId}` },
    { label: 'AutoEmbed',   url: `https://autoembed.co/movie/tmdb/${tmdbId}` },
    { label: 'MultiEmbed',  url: `https://multiembed.mov/directstream.php?video_id=${tmdbId}&tmdb=1` },
    ...(imdbId ? [{ label: 'MultiEmbed 2', url: `https://multiembed.mov/?video_id=${imdbId}` }] : []),
    { label: '2Embed',      url: `https://www.2embed.cc/embed/${tmdbId}` },
  ]
}

export default function VideoPlayer({ tmdbId, imdbId, type, season = 1, episode = 1 }: Props) {
  const sources   = buildSources(type, tmdbId, imdbId, season, episode)
  const [idx,     setIdx]     = useState(0)
  const [loading, setLoading] = useState(true)
  const timerRef  = useRef<ReturnType<typeof setTimeout>>()
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => { setIdx(0); setLoading(true) }, [tmdbId, season, episode])

  useEffect(() => {
    setLoading(true)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setLoading(false), 7000)
    return () => clearTimeout(timerRef.current)
  }, [idx, tmdbId, season, episode])

  const toggleFullscreen = async () => {
    try {
      const el = iframeRef.current as any
      if (document.fullscreenElement) await document.exitFullscreen()
      else if (el?.requestFullscreen) await el.requestFullscreen()
      else if (el?.webkitRequestFullscreen) el.webkitRequestFullscreen()
    } catch {}
  }

  return (
    <div className="bg-[#07080c] w-full flex flex-col">

      {/* Iframe — clean, nothing overlaid */}
      <div className="relative w-full bg-black" style={{ aspectRatio:'16/9' }}>
        <iframe
          ref={iframeRef}
          key={`${idx}-${tmdbId}-${season}-${episode}`}
          src={sources[idx].url}
          className="absolute inset-0 w-full h-full border-0"
          allowFullScreen
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          referrerPolicy="no-referrer"
          title="Video Player"
        />
        {loading && (
          <div className="absolute inset-0 bg-[#07080c]/80 flex flex-col items-center justify-center pointer-events-none z-10">
            <div className="w-10 h-10 border-2 border-dark-border border-t-brand rounded-full animate-spin mb-2" />
            <p className="text-xs text-slate-500">{sources[idx].label}</p>
          </div>
        )}
      </div>

      {/* Controls bar — below video */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-dark-surface border-t border-dark-border flex-wrap">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600 flex-shrink-0">Server</span>

        <div className="flex gap-1.5 flex-wrap flex-1 min-w-0">
          {sources.map((s, i) => (
            <button key={i} onClick={() => setIdx(i)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all active:scale-95 whitespace-nowrap ${
                idx === i
                  ? 'bg-brand text-dark'
                  : 'bg-dark-card border border-dark-border text-slate-500 hover:border-brand/40 hover:text-white'
              }`}>
              {s.label}
            </button>
          ))}
        </div>

        {/* Fullscreen */}
        <button onClick={toggleFullscreen}
          className="flex-shrink-0 btn-icon w-8 h-8 rounded-lg ml-auto">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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
