// frontend/src/components/HLSPlayer.tsx — FULL REPLACEMENT
// FIX: removed direct continueWatchingStore import (wrong export name was crashing build)
//      Progress saving is now handled by Player.tsx via onTimeUpdate + onEnded callbacks
import { useEffect, useRef, useState, useCallback } from 'react'
import Hls, { Level, ErrorData, HlsConfig } from 'hls.js'

// ── Types ────────────────────────────────────────────────────────────────────
export interface HLSPlayerProps {
  src:           string
  movieId:       number
  title:         string
  poster?:       string
  type?:         'movie' | 'tv'
  season?:       number
  episode?:      number
  episodeName?:  string
  startTime?:    number
  onEnded?:      () => void
  onTimeUpdate?: (seconds: number, duration: number) => void
}

type BufferHealth = 'good' | 'low' | 'critical'

// ── HLS.js config — optimised for ABR + low-latency VOD ─────────────────────
const HLS_CONFIG: Partial<HlsConfig> = {
  // Buffer
  maxBufferLength:            30,
  maxMaxBufferLength:         600,
  maxBufferSize:              60 * 1000 * 1000,
  backBufferLength:           30,
  maxBufferHole:              0.3,
  // ABR
  abrEwmaDefaultEstimate:     500_000,
  abrEwmaFastLive:            3,
  abrEwmaSlowLive:            9,
  abrEwmaFastVoD:             4,
  abrEwmaSlowVoD:             15,
  abrBandWidthFactor:         0.95,
  abrBandWidthUpFactor:       0.7,
  // Startup
  startLevel:                 -1,
  testBandwidth:              true,
  lowLatencyMode:             false,
  // Retry settings
  fragLoadingMaxRetry:        6,
  fragLoadingRetryDelay:      1000,
  fragLoadingMaxRetryTimeout: 64_000,
  fragLoadingTimeOut:         20_000,
  manifestLoadingMaxRetry:    4,
  manifestLoadingRetryDelay:  1000,
  manifestLoadingTimeOut:     10_000,
  levelLoadingMaxRetry:       4,
  levelLoadingRetryDelay:     1000,
  levelLoadingTimeOut:        10_000,
  xhrSetup: (xhr) => { xhr.withCredentials = false },
  enableWorker:               true,
  enableSoftwareAES:          true,
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function qualityLabel(level: Level): string {
  const h = level.height
  if (!h) return `${Math.round((level.bitrate || 0) / 1000)} kbps`
  if (h >= 2160) return '4K'
  if (h >= 1080) return '1080p'
  if (h >= 720)  return '720p'
  if (h >= 480)  return '480p'
  if (h >= 360)  return '360p'
  return `${h}p`
}

function fmt(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00'
  const h   = Math.floor(s / 3600)
  const m   = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
  return `${m}:${String(sec).padStart(2,'0')}`
}

// ── Component ────────────────────────────────────────────────────────────────
export default function HLSPlayer({
  src, movieId, title, poster, type = 'movie',
  season, episode, episodeName, startTime = 0,
  onEnded, onTimeUpdate,
}: HLSPlayerProps) {
  const videoRef  = useRef<HTMLVideoElement>(null)
  const hlsRef    = useRef<Hls | null>(null)
  const wrapRef   = useRef<HTMLDivElement>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout>>()

  // ── UI state ─────────────────────────────────────────────────────────────
  const [playing,      setPlaying]      = useState(false)
  const [muted,        setMuted]        = useState(false)
  const [volume,       setVolume]       = useState(1)
  const [currentTime,  setCurrentTime]  = useState(0)
  const [duration,     setDuration]     = useState(0)
  const [buffered,     setBuffered]     = useState(0)
  const [bufHealth,    setBufHealth]    = useState<BufferHealth>('good')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isPiP,        setIsPiP]        = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [showQuality,  setShowQuality]  = useState(false)
  const [levels,       setLevels]       = useState<Level[]>([])
  const [currentLevel, setCurrentLevel] = useState(-1)
  const [hlsLevel,     setHlsLevel]     = useState(-1)
  const [isLoading,    setIsLoading]    = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [retries,      setRetries]      = useState(0)
  const [skipFb,       setSkipFb]       = useState<string | null>(null)
  const [sleepTimer,   setSleepTimer]   = useState<number | null>(null)
  const [sleepLeft,    setSleepLeft]    = useState<number | null>(null)
  const [showSleep,    setShowSleep]    = useState(false)
  const [nextCountdown,setNextCountdown]= useState<number | null>(null)
  const [netSpeed,     setNetSpeed]     = useState<number | null>(null)
  const retriesRef = useRef(0)

  // ── Init HLS ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return

    setError(null)
    setIsLoading(true)
    setLevels([])
    setCurrentLevel(-1)
    retriesRef.current = 0
    setRetries(0)

    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    // Safari native HLS
    if (!Hls.isSupported() && video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src
      if (startTime > 0) video.currentTime = startTime
      video.play().catch(() => {})
      setIsLoading(false)
      return
    }

    if (!Hls.isSupported()) {
      setError('HLS playback is not supported in this browser.')
      setIsLoading(false)
      return
    }

    const hls = new Hls(HLS_CONFIG)
    hlsRef.current = hls
    hls.loadSource(src)
    hls.attachMedia(video)

    hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
      setLevels(data.levels)
      setIsLoading(false)
      if (startTime > 0) video.currentTime = startTime
      video.play().catch(() => {})
    })

    hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => setHlsLevel(data.level))

    hls.on(Hls.Events.FRAG_LOADED, (_e, data) => {
      const stats = data.frag.stats
      if (stats?.loading?.end && stats?.loading?.start && stats?.total) {
        const ms  = stats.loading.end - stats.loading.start
        const bps = (stats.total * 8) / (ms / 1000)
        setNetSpeed(Math.round(bps / 1000))
      }
    })

    hls.on(Hls.Events.BUFFER_STALLED_ERROR, () => setBufHealth('critical'))
    hls.on(Hls.Events.BUFFER_APPENDED,      () => setBufHealth('good'))

    hls.on(Hls.Events.ERROR, (_e: string, data: ErrorData) => {
      if (!data.fatal) return
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        if (retriesRef.current < 5) {
          retriesRef.current++
          setRetries(retriesRef.current)
          setTimeout(() => hls.startLoad(), 1000 * retriesRef.current)
        } else {
          setError('Network error — check your connection.')
        }
      } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        hls.recoverMediaError()
      } else {
        setError('Playback error. Try a different source.')
      }
    })

    return () => {
      hls.destroy()
      hlsRef.current = null
    }
  }, [src]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Video event listeners ─────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onPlay   = () => setPlaying(true)
    const onPause  = () => setPlaying(false)
    const onWait   = () => setIsLoading(true)
    const onCanPlay= () => setIsLoading(false)
    const onDur    = () => setDuration(video.duration || 0)
    const onVol    = () => { setVolume(video.volume); setMuted(video.muted) }
    const onEnterP = () => setIsPiP(true)
    const onLeaveP = () => setIsPiP(false)

    const onTU = () => {
      const t = video.currentTime
      const d = video.duration || 0
      setCurrentTime(t)
      if (video.buffered.length) setBuffered(video.buffered.end(video.buffered.length - 1))
      const ahead = (video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0) - t
      setBufHealth(ahead < 2 ? 'critical' : ahead < 5 ? 'low' : 'good')
      onTimeUpdate?.(t, d)
    }

    const onEnd = () => {
      setPlaying(false)
      setNextCountdown(10)
      onEnded?.()
    }

    const onFS = () => setIsFullscreen(!!document.fullscreenElement)

    video.addEventListener('play',           onPlay)
    video.addEventListener('pause',          onPause)
    video.addEventListener('waiting',        onWait)
    video.addEventListener('canplay',        onCanPlay)
    video.addEventListener('durationchange', onDur)
    video.addEventListener('volumechange',   onVol)
    video.addEventListener('timeupdate',     onTU)
    video.addEventListener('ended',          onEnd)
    video.addEventListener('enterpictureinpicture', onEnterP)
    video.addEventListener('leavepictureinpicture', onLeaveP)
    document.addEventListener('fullscreenchange', onFS)

    return () => {
      video.removeEventListener('play',           onPlay)
      video.removeEventListener('pause',          onPause)
      video.removeEventListener('waiting',        onWait)
      video.removeEventListener('canplay',        onCanPlay)
      video.removeEventListener('durationchange', onDur)
      video.removeEventListener('volumechange',   onVol)
      video.removeEventListener('timeupdate',     onTU)
      video.removeEventListener('ended',          onEnd)
      video.removeEventListener('enterpictureinpicture', onEnterP)
      video.removeEventListener('leavepictureinpicture', onLeaveP)
      document.removeEventListener('fullscreenchange', onFS)
    }
  }, [onEnded, onTimeUpdate])

  // ── Media Session API ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const video = videoRef.current
    if (!video) return

    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist: type === 'tv' && season ? `S${season} · E${episode}` : 'Streamix',
      album:  episodeName || title,
      artwork: poster ? [{ src: poster, sizes: '512x512', type: 'image/jpeg' }] : [],
    })

    const seek = (d: number) => { video.currentTime = Math.max(0, video.currentTime + d) }
    navigator.mediaSession.setActionHandler('play',          () => video.play())
    navigator.mediaSession.setActionHandler('pause',         () => video.pause())
    navigator.mediaSession.setActionHandler('seekbackward',  () => seek(-10))
    navigator.mediaSession.setActionHandler('seekforward',   () => seek(10))

    const updatePos = () => {
      if (!video.duration || !isFinite(video.duration)) return
      try {
        navigator.mediaSession.setPositionState({
          duration: video.duration, playbackRate: video.playbackRate, position: video.currentTime,
        })
      } catch { /* ignore */ }
    }
    video.addEventListener('timeupdate', updatePos)
    return () => video.removeEventListener('timeupdate', updatePos)
  }, [title, type, season, episode, episodeName, poster])

  // ── Sleep timer ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (sleepTimer === null) { setSleepLeft(null); return }
    setSleepLeft(sleepTimer * 60)
    const id = setInterval(() => {
      setSleepLeft(s => {
        if (s === null || s <= 1) {
          clearInterval(id)
          videoRef.current?.pause()
          setSleepTimer(null)
          return null
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [sleepTimer])

  // ── Next-episode countdown ────────────────────────────────────────────────
  useEffect(() => {
    if (nextCountdown === null) return
    if (nextCountdown <= 0) { onEnded?.(); return }
    const t = setTimeout(() => setNextCountdown(n => (n ?? 1) - 1), 1000)
    return () => clearTimeout(t)
  }, [nextCountdown, onEnded])

  // ── Auto-hide controls ────────────────────────────────────────────────────
  const resetHide = useCallback(() => {
    setShowControls(true)
    clearTimeout(hideTimer.current)
    if (playing) hideTimer.current = setTimeout(() => setShowControls(false), 3000)
  }, [playing])

  // ── Actions ───────────────────────────────────────────────────────────────
  const togglePlay = () => {
    const v = videoRef.current; if (!v) return
    v.paused ? v.play().catch(() => {}) : v.pause()
    resetHide()
  }

  const skip = (offset: number) => {
    const v = videoRef.current; if (!v) return
    v.currentTime = Math.max(0, Math.min(v.currentTime + offset, v.duration || 0))
    setSkipFb(offset > 0 ? `+${offset}s` : `${offset}s`)
    setTimeout(() => setSkipFb(null), 700)
  }

  const seekTo   = (pct: number) => { const v = videoRef.current; if (v?.duration) v.currentTime = pct * v.duration }
  const setVol   = (n: number)   => { const v = videoRef.current; if (v) { v.volume = n; if (n > 0) v.muted = false } }
  const toggleMute  = () => { const v = videoRef.current; if (v) v.muted = !v.muted }
  const toggleFS = async () => {
    try { !document.fullscreenElement ? await wrapRef.current?.requestFullscreen() : await document.exitFullscreen() } catch { /* ignore */ }
  }
  const togglePiP = async () => {
    try { document.pictureInPictureElement ? await document.exitPictureInPicture() : await videoRef.current?.requestPictureInPicture() } catch { /* ignore */ }
  }
  const setQuality = (lvl: number) => {
    if (!hlsRef.current) return
    hlsRef.current.currentLevel = lvl
    setCurrentLevel(lvl)
    setShowQuality(false)
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (['INPUT','TEXTAREA','SELECT'].includes(tag)) return
      switch(e.key) {
        case ' ': case 'k': e.preventDefault(); togglePlay(); break
        case 'ArrowLeft':   e.preventDefault(); skip(-10); break
        case 'ArrowRight':  e.preventDefault(); skip(10); break
        case 'ArrowUp':     e.preventDefault(); setVol(Math.min(1, volume + 0.1)); break
        case 'ArrowDown':   e.preventDefault(); setVol(Math.max(0, volume - 0.1)); break
        case 'm': toggleMute(); break
        case 'f': toggleFS();   break
        case 'p': togglePiP();  break
        case 'j': skip(-10);    break
        case 'l': skip(30);     break
      }
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [volume, playing]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Computed values ───────────────────────────────────────────────────────
  const pct    = duration > 0 ? (currentTime / duration) * 100 : 0
  const bufPct = duration > 0 ? (buffered    / duration) * 100 : 0

  const healthColor = bufHealth === 'critical' ? 'text-red-400' : bufHealth === 'low' ? 'text-yellow-400' : 'text-green-400'
  const activeQLabel = currentLevel === -1
    ? (hlsLevel >= 0 && levels[hlsLevel] ? `Auto (${qualityLabel(levels[hlsLevel])})` : 'Auto')
    : (levels[currentLevel] ? qualityLabel(levels[currentLevel]) : 'Auto')

  return (
    <div
      ref={wrapRef}
      className="relative w-full bg-black overflow-hidden"
      style={{ aspectRatio: '16/9' }}
      onMouseMove={resetHide}
      onMouseLeave={() => playing && setShowControls(false)}
      onClick={togglePlay}
    >
      <video ref={videoRef} className="w-full h-full object-contain" poster={poster} playsInline preload="auto" />

      {/* Buffering */}
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 z-10 pointer-events-none">
          <div className="w-12 h-12 border-2 border-white/20 border-t-brand rounded-full animate-spin mb-2" />
          <p className="text-white/50 text-xs">{retries > 0 ? `Retrying… (${retries}/5)` : 'Loading…'}</p>
          {netSpeed !== null && <p className="text-white/30 text-[10px] mt-1">{netSpeed > 999 ? `${(netSpeed/1000).toFixed(1)} Mbps` : `${netSpeed} kbps`}</p>}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20 px-6 text-center">
          <span className="text-4xl mb-3">⚠️</span>
          <p className="text-white font-semibold mb-3">{error}</p>
          <button className="btn-primary px-6 py-2 text-sm" onClick={e => { e.stopPropagation(); setError(null); setRetries(0) }}>
            Try Again
          </button>
        </div>
      )}

      {/* Skip feedback */}
      {skipFb && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none">
          <div className="bg-black/70 text-white font-bold text-lg px-5 py-2 rounded-full">{skipFb}</div>
        </div>
      )}

      {/* Buffer health */}
      {bufHealth !== 'good' && playing && !isLoading && (
        <div className={`absolute top-3 left-3 z-20 flex items-center gap-1.5 text-[10px] font-bold ${healthColor} bg-black/60 px-2 py-1 rounded-full pointer-events-none`}>
          <div className={`w-1.5 h-1.5 rounded-full ${bufHealth==='critical'?'bg-red-400 animate-pulse':'bg-yellow-400'}`} />
          {bufHealth === 'critical' ? 'Buffering…' : 'Low buffer'}
        </div>
      )}

      {/* Sleep badge */}
      {sleepLeft !== null && (
        <div className="absolute top-3 right-3 z-20 bg-black/60 text-white text-[10px] font-bold px-2 py-1 rounded-full pointer-events-none">
          😴 {fmt(sleepLeft)}
        </div>
      )}

      {/* Next episode */}
      {nextCountdown !== null && nextCountdown > 0 && (
        <div className="absolute bottom-20 right-4 z-30" onClick={e => e.stopPropagation()}>
          <div className="glass rounded-2xl px-4 py-3 border border-dark-border">
            <p className="text-white text-sm font-semibold mb-2">Next episode in {nextCountdown}s</p>
            <div className="flex gap-2">
              <button className="btn-primary px-4 py-1.5 text-sm" onClick={() => { setNextCountdown(null); onEnded?.() }}>Play Now</button>
              <button className="btn-secondary px-3 py-1.5 text-sm" onClick={() => setNextCountdown(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Controls overlay */}
      <div
        className={`absolute inset-0 flex flex-col justify-end z-20 transition-opacity duration-300 ${showControls || !playing ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 40%)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Seek bar */}
        <div className="px-3 sm:px-4 mb-2">
          <div className="relative h-1 rounded-full cursor-pointer group/bar"
            style={{ background: 'rgba(255,255,255,0.15)' }}
            onClick={e => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); seekTo((e.clientX - r.left) / r.width) }}>
            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width:`${bufPct}%`, background:'rgba(255,255,255,0.2)' }} />
            <div className="absolute inset-y-0 left-0 rounded-full bg-brand transition-all" style={{ width:`${pct}%` }} />
            <div className="absolute w-3 h-3 rounded-full bg-brand opacity-0 group-hover/bar:opacity-100 transition-opacity"
              style={{ left:`${pct}%`, top:'50%', transform:'translate(-50%,-50%)' }} />
          </div>
          <div className="flex justify-between text-[10px] text-white/50 mt-1 font-mono">
            <span>{fmt(currentTime)}</span>
            <span>{fmt(duration)}</span>
          </div>
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-2 px-3 sm:px-4 pb-3 sm:pb-4">

          {/* Play/Pause */}
          <button onClick={togglePlay} className="w-9 h-9 flex items-center justify-center text-white hover:text-brand transition-colors">
            {playing
              ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>}
          </button>

          {/* -10s */}
          <button onClick={() => skip(-10)} className="hidden sm:flex w-8 h-8 items-center justify-center text-white/70 hover:text-white transition-colors" title="Back 10s (←)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.64"/>
            </svg>
          </button>

          {/* +10s */}
          <button onClick={() => skip(10)} className="hidden sm:flex w-8 h-8 items-center justify-center text-white/70 hover:text-white transition-colors" title="Forward 10s (→)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.49-4.64"/>
            </svg>
          </button>

          {/* Volume */}
          <div className="hidden sm:flex items-center gap-1">
            <button onClick={toggleMute} className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white transition-colors">
              {muted || volume === 0
                ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>}
            </button>
            <input type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume}
              onChange={e => setVol(Number(e.target.value))}
              className="w-16 sm:w-20 accent-brand cursor-pointer" />
          </div>

          {/* Title */}
          <div className="flex-1 min-w-0 px-2">
            <p className="text-white text-xs font-semibold truncate">{title}</p>
            {type === 'tv' && season && (
              <p className="text-white/40 text-[10px]">S{season} E{episode}{episodeName ? ` · ${episodeName}` : ''}</p>
            )}
          </div>

          {/* Network speed */}
          {netSpeed !== null && (
            <span className={`hidden lg:block text-[10px] font-mono ${healthColor} flex-shrink-0`}>
              {netSpeed > 999 ? `${(netSpeed/1000).toFixed(1)}M` : `${netSpeed}k`}
            </span>
          )}

          {/* Quality picker */}
          {levels.length > 0 && (
            <div className="relative flex-shrink-0">
              <button onClick={() => setShowQuality(q => !q)}
                className={`flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg transition-colors ${showQuality ? 'text-brand bg-brand/10' : 'text-white/70 hover:text-white'}`}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                </svg>
                {activeQLabel}
              </button>
              {showQuality && (
                <div className="absolute bottom-full right-0 mb-2 rounded-xl overflow-hidden shadow-deep z-30"
                  style={{ background:'rgba(7,8,12,0.97)', border:'1px solid rgba(255,255,255,0.08)', minWidth:148 }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 px-3 pt-2 pb-1">Quality</p>
                  <button onClick={() => setQuality(-1)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-dark-hover transition-colors ${currentLevel===-1?'text-brand':'text-slate-300'}`}>
                    <span>Auto</span>
                    {currentLevel===-1 && hlsLevel>=0 && levels[hlsLevel] && <span className="text-[10px] text-slate-500">{qualityLabel(levels[hlsLevel])}</span>}
                  </button>
                  {[...levels].reverse().map((lvl, ri) => {
                    const idx = levels.length - 1 - ri
                    return (
                      <button key={idx} onClick={() => setQuality(idx)}
                        className={`w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-dark-hover transition-colors ${currentLevel===idx?'text-brand':'text-slate-300'}`}>
                        <span>{qualityLabel(lvl)}</span>
                        <span className="text-[10px] text-slate-600">{Math.round((lvl.bitrate||0)/1000)}k</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Sleep timer */}
          <div className="relative flex-shrink-0">
            <button onClick={e => { e.stopPropagation(); setShowSleep(s => !s) }}
              className={`w-8 h-8 flex items-center justify-center text-lg transition-colors ${sleepTimer!==null?'text-brand':'text-white/70 hover:text-white'}`}
              title="Sleep timer">😴</button>
            {showSleep && (
              <div className="absolute bottom-full right-0 mb-2 rounded-xl overflow-hidden shadow-deep z-30"
                style={{ background:'rgba(7,8,12,0.97)', border:'1px solid rgba(255,255,255,0.08)', minWidth:140 }}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 px-3 pt-2 pb-1">Sleep Timer</p>
                {sleepTimer !== null && (
                  <button onClick={() => { setSleepTimer(null); setShowSleep(false) }}
                    className="w-full px-3 py-2 text-xs text-red-400 hover:bg-dark-hover text-left transition-colors">
                    Cancel ({sleepLeft !== null ? fmt(sleepLeft) : '--'})
                  </button>
                )}
                {[15,30,45,60].map(m => (
                  <button key={m} onClick={() => { setSleepTimer(m); setShowSleep(false) }}
                    className={`w-full px-3 py-2 text-xs hover:bg-dark-hover text-left transition-colors ${sleepTimer===m?'text-brand':'text-slate-300'}`}>
                    {m} min
                  </button>
                ))}
                <button onClick={() => { setSleepTimer(Math.ceil((duration - currentTime) / 60) || 30); setShowSleep(false) }}
                  className="w-full px-3 py-2 text-xs text-slate-300 hover:bg-dark-hover text-left transition-colors border-t border-dark-border">
                  End of episode
                </button>
              </div>
            )}
          </div>

          {/* PiP */}
          {typeof document !== 'undefined' && document.pictureInPictureEnabled && (
            <button onClick={togglePiP}
              className={`hidden sm:flex w-8 h-8 items-center justify-center transition-colors ${isPiP?'text-brand':'text-white/70 hover:text-white'}`}
              title="Picture in Picture (P)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="20" height="14" rx="2"/>
                <rect x="10" y="9" width="10" height="8" rx="1" fill="currentColor" stroke="none" opacity="0.6"/>
              </svg>
            </button>
          )}

          {/* Fullscreen */}
          <button onClick={toggleFS}
            className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white transition-colors"
            title="Fullscreen (F)">
            {isFullscreen
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>}
          </button>
        </div>
      </div>
    </div>
  )
}
