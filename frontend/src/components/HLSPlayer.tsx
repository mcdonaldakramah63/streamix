// frontend/src/components/HLSPlayer.tsx — NEW FILE
import { useEffect, useRef, useState, useCallback } from 'react'

// HLS.js loaded via CDN script tag (see index.html instructions)
declare const Hls: any

interface Props {
  src:           string           // m3u8 URL
  poster?:       string
  startAt?:      number           // seconds to seek to on load
  onTimeUpdate?: (time: number, duration: number) => void
  onEnded?:      () => void
  subtitles?:    { url: string; lang: string; label: string }[]
}

function formatTime(s: number): string {
  if (!s || isNaN(s)) return '0:00'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
  return `${m}:${String(sec).padStart(2,'0')}`
}

export default function HLSPlayer({ src, poster, startAt = 0, onTimeUpdate, onEnded, subtitles = [] }: Props) {
  const videoRef    = useRef<HTMLVideoElement>(null)
  const hlsRef      = useRef<any>(null)
  const wrapRef     = useRef<HTMLDivElement>(null)
  const seekRef     = useRef<HTMLInputElement>(null)
  const hideTimer   = useRef<ReturnType<typeof setTimeout>>()
  const hasSeeked   = useRef(false)

  const [isPlaying,    setIsPlaying]    = useState(false)
  const [isMuted,      setIsMuted]      = useState(false)
  const [volume,       setVolume]       = useState(1)
  const [currentTime,  setCurrentTime]  = useState(0)
  const [duration,     setDuration]     = useState(0)
  const [buffered,     setBuffered]     = useState(0)
  const [showControls, setShowControls] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [quality,      setQuality]      = useState<string>('Auto')
  const [qualities,    setQualities]    = useState<string[]>(['Auto'])
  const [showQuality,  setShowQuality]  = useState(false)
  const [isLoading,    setIsLoading]    = useState(true)
  const [subTrack,     setSubTrack]     = useState(-1)

  // ── Init HLS ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return

    setIsLoading(true)
    hasSeeked.current = false

    // Destroy previous instance
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }

    if (typeof Hls !== 'undefined' && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
      })
      hlsRef.current = hls
      hls.loadSource(src)
      hls.attachMedia(video)

      hls.on(Hls.Events.MANIFEST_PARSED, (_: any, data: any) => {
        setIsLoading(false)
        // Build quality list
        const levels = data.levels || []
        const qs = ['Auto', ...levels.map((l: any) => `${l.height}p`).filter(Boolean).reverse()]
        setQualities([...new Set(qs)] as string[])
        video.play().catch(() => {})
      })

      hls.on(Hls.Events.ERROR, (_: any, data: any) => {
        if (data.fatal) {
          console.error('[HLS] Fatal error:', data.type, data.details)
          setIsLoading(false)
        }
      })

    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS
      video.src = src
      video.addEventListener('loadedmetadata', () => setIsLoading(false), { once: true })
      video.play().catch(() => {})
    }

    return () => {
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    }
  }, [src])

  // ── Seek to startAt once duration is known ───────────────────────────────────
  useEffect(() => {
    const video = videoRef.current
    if (!video || hasSeeked.current || !startAt || startAt < 2) return

    const trySeek = () => {
      if (video.duration && video.duration > startAt) {
        video.currentTime = startAt
        hasSeeked.current = true
        video.removeEventListener('durationchange', trySeek)
        video.removeEventListener('loadedmetadata', trySeek)
      }
    }

    video.addEventListener('durationchange', trySeek)
    video.addEventListener('loadedmetadata', trySeek)
    trySeek()
    return () => {
      video.removeEventListener('durationchange', trySeek)
      video.removeEventListener('loadedmetadata', trySeek)
    }
  }, [startAt, src])

  // ── Video event listeners ────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onPlay     = () => setIsPlaying(true)
    const onPause    = () => setIsPlaying(false)
    const onWaiting  = () => setIsLoading(true)
    const onPlaying  = () => setIsLoading(false)
    const onEnd      = () => { setIsPlaying(false); onEnded?.() }

    const onTime = () => {
      const t = video.currentTime
      const d = video.duration || 0
      setCurrentTime(t)
      setDuration(d)
      onTimeUpdate?.(t, d)
      // Buffered
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1))
      }
    }

    video.addEventListener('play',         onPlay)
    video.addEventListener('pause',        onPause)
    video.addEventListener('waiting',      onWaiting)
    video.addEventListener('playing',      onPlaying)
    video.addEventListener('ended',        onEnd)
    video.addEventListener('timeupdate',   onTime)
    video.addEventListener('durationchange', onTime)

    return () => {
      video.removeEventListener('play',         onPlay)
      video.removeEventListener('pause',        onPause)
      video.removeEventListener('waiting',      onWaiting)
      video.removeEventListener('playing',      onPlaying)
      video.removeEventListener('ended',        onEnd)
      video.removeEventListener('timeupdate',   onTime)
      video.removeEventListener('durationchange', onTime)
    }
  }, [onTimeUpdate, onEnded])

  // ── Fullscreen ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const fn = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', fn)
    return () => document.removeEventListener('fullscreenchange', fn)
  }, [])

  // ── Auto-hide controls ────────────────────────────────────────────────────────
  const resetHideTimer = useCallback(() => {
    setShowControls(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setShowControls(false)
    }, 3000)
  }, [])

  // ── Controls ──────────────────────────────────────────────────────────────────
  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    v.paused ? v.play() : v.pause()
    resetHideTimer()
  }

  const toggleMute = () => {
    const v = videoRef.current
    if (!v) return
    v.muted = !v.muted
    setIsMuted(v.muted)
  }

  const handleVolume = (val: number) => {
    const v = videoRef.current
    if (!v) return
    v.volume = val
    v.muted  = val === 0
    setVolume(val)
    setIsMuted(val === 0)
  }

  const handleSeek = (val: number) => {
    const v = videoRef.current
    if (!v || !v.duration) return
    v.currentTime = val
    setCurrentTime(val)
  }

  const skip = (secs: number) => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = Math.max(0, Math.min(v.currentTime + secs, v.duration))
    resetHideTimer()
  }

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await wrapRef.current?.requestFullscreen()
    } catch {}
  }

  const setQualityLevel = (q: string) => {
    if (!hlsRef.current) return
    setQuality(q)
    setShowQuality(false)
    if (q === 'Auto') {
      hlsRef.current.currentLevel = -1
    } else {
      const idx = hlsRef.current.levels?.findIndex(
        (l: any) => `${l.height}p` === q
      ) ?? -1
      if (idx >= 0) hlsRef.current.currentLevel = idx
    }
  }

  const progress  = duration > 0 ? (currentTime / duration) * 100 : 0
  const bufPct    = duration > 0 ? (buffered  / duration) * 100 : 0

  return (
    <div
      ref={wrapRef}
      className="relative w-full bg-black select-none"
      style={{ aspectRatio: '16/9' }}
      onMouseMove={resetHideTimer}
      onTouchStart={resetHideTimer}
      onClick={e => {
        // Click on video area toggles play (but not on controls)
        if ((e.target as HTMLElement).closest('.player-controls')) return
        togglePlay()
      }}>

      {/* Video element */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full"
        poster={poster}
        playsInline
        crossOrigin="anonymous">
        {subtitles.map((s, i) => (
          <track key={i} kind="subtitles" src={s.url} srcLang={s.lang} label={s.label}
            default={i === subTrack} />
        ))}
      </video>

      {/* Buffering spinner */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="w-12 h-12 border-3 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      )}

      {/* Double-tap skip zones (mobile) */}
      <div className="absolute inset-0 flex pointer-events-none">
        <div className="flex-1 pointer-events-auto" onDoubleClick={() => skip(-10)} />
        <div className="flex-1 pointer-events-auto" onDoubleClick={() => skip(10)} />
      </div>

      {/* Controls overlay */}
      <div
        className={`player-controls absolute inset-0 flex flex-col justify-end transition-opacity duration-300 ${showControls || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ background: 'linear-gradient(transparent 50%, rgba(0,0,0,0.85) 100%)' }}>

        {/* Seek bar */}
        <div className="px-3 sm:px-4 pb-1 relative group/seek">
          {/* Buffered track */}
          <div className="absolute left-3 sm:left-4 right-3 sm:right-4 h-1 rounded-full bg-white/20 top-1/2 -translate-y-1/2 pointer-events-none">
            <div className="h-full rounded-full bg-white/30" style={{ width: `${bufPct}%` }} />
            <div className="absolute top-0 left-0 h-full rounded-full bg-brand" style={{ width: `${progress}%` }} />
          </div>
          <input
            ref={seekRef}
            type="range"
            min={0}
            max={duration || 100}
            step={0.5}
            value={currentTime}
            onChange={e => handleSeek(Number(e.target.value))}
            className="relative w-full h-1 appearance-none bg-transparent cursor-pointer z-10"
            style={{ '--progress': `${progress}%` } as any}
          />
        </div>

        {/* Bottom row */}
        <div className="flex items-center gap-2 px-3 sm:px-4 pb-3 pt-1">

          {/* Play/Pause */}
          <button onClick={togglePlay} className="text-white hover:text-brand transition-colors flex-shrink-0">
            {isPlaying ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5,3 19,12 5,21"/>
              </svg>
            )}
          </button>

          {/* Skip -10 */}
          <button onClick={() => skip(-10)} className="text-white/80 hover:text-white transition-colors flex-shrink-0 hidden sm:block">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="1 4 1 10 7 10"/>
              <path d="M3.51 15a9 9 0 1 0 .49-4"/>
              <text x="8" y="14" fontSize="6" fill="currentColor" stroke="none">10</text>
            </svg>
          </button>

          {/* Skip +10 */}
          <button onClick={() => skip(10)} className="text-white/80 hover:text-white transition-colors flex-shrink-0 hidden sm:block">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-.49-4"/>
              <text x="8" y="14" fontSize="6" fill="currentColor" stroke="none">10</text>
            </svg>
          </button>

          {/* Volume */}
          <button onClick={toggleMute} className="text-white/80 hover:text-white transition-colors flex-shrink-0">
            {isMuted || volume === 0 ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
              </svg>
            )}
          </button>
          <input type="range" min={0} max={1} step={0.05} value={isMuted ? 0 : volume}
            onChange={e => handleVolume(Number(e.target.value))}
            className="w-16 sm:w-20 h-1 appearance-none bg-white/20 rounded-full cursor-pointer hidden sm:block" />

          {/* Time */}
          <span className="text-white text-xs tabular-nums ml-1 flex-shrink-0">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <div className="flex-1" />

          {/* Subtitles */}
          {subtitles.length > 0 && (
            <button
              onClick={() => {
                const v = videoRef.current
                if (!v) return
                const next = subTrack + 1 >= subtitles.length ? -1 : subTrack + 1
                setSubTrack(next)
                for (let i = 0; i < v.textTracks.length; i++) {
                  v.textTracks[i].mode = i === next ? 'showing' : 'hidden'
                }
              }}
              className={`text-xs px-2 py-1 rounded border transition-colors flex-shrink-0 ${subTrack >= 0 ? 'border-brand text-brand' : 'border-white/20 text-white/60 hover:text-white'}`}>
              CC
            </button>
          )}

          {/* Quality */}
          <div className="relative flex-shrink-0">
            <button onClick={() => setShowQuality(p => !p)}
              className="text-xs px-2 py-1 rounded border border-white/20 text-white/60 hover:text-white hover:border-white transition-colors">
              {quality}
            </button>
            {showQuality && (
              <div className="absolute bottom-full right-0 mb-2 bg-black/95 border border-white/10 rounded-xl overflow-hidden min-w-[80px] z-50">
                {qualities.map(q => (
                  <button key={q} onClick={() => setQualityLevel(q)}
                    className={`block w-full px-4 py-2 text-xs text-left hover:bg-white/10 transition-colors ${quality === q ? 'text-brand' : 'text-white'}`}>
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Fullscreen */}
          <button onClick={toggleFullscreen} className="text-white/80 hover:text-white transition-colors flex-shrink-0">
            {isFullscreen ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/>
                <path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/>
                <path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Seek bar custom styles */}
      <style>{`
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 14px; height: 14px;
          border-radius: 50%;
          background: #14b8a6;
          cursor: pointer;
          box-shadow: 0 0 4px rgba(0,0,0,0.5);
        }
        input[type=range]::-moz-range-thumb {
          width: 14px; height: 14px;
          border-radius: 50%;
          background: #14b8a6;
          cursor: pointer;
          border: none;
        }
      `}</style>
    </div>
  )
}
