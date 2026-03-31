// frontend/src/components/HLSPlayer.tsx — FULL REPLACEMENT
// Adaptive Bitrate HLS player with:
//   • HLS.js tuned for low-latency + ABR
//   • Quality level picker
//   • Media Session API (background playback / lock screen controls)
//   • Picture-in-Picture
//   • Sleep timer
//   • Keyboard shortcuts
//   • Auto-resume from last timestamp
//   • Skip intro / auto-next episode countdown
//   • Full error recovery with retry logic

import { useEffect, useRef, useState, useCallback } from 'react'
import Hls, { Level, ErrorData, HlsConfig } from 'hls.js'
import { useContinueWatchingStore } from '../stores/continueWatchingStore'

// ── Types ────────────────────────────────────────────────────────────────────
interface Props {
  src:          string          // m3u8 URL
  movieId:      number
  title:        string
  poster?:      string
  type?:        'movie' | 'tv'
  season?:      number
  episode?:     number
  episodeName?: string
  startTime?:   number          // seconds to start from
  onEnded?:     () => void
  onTimeUpdate?: (seconds: number, duration: number) => void
}

type BufferHealth = 'good' | 'low' | 'critical'

// ── HLS.js optimised config ──────────────────────────────────────────────────
const HLS_CONFIG: Partial<HlsConfig> = {
  // Buffer settings
  maxBufferLength:           30,    // max buffer ahead (seconds)
  maxMaxBufferLength:        600,   // absolute ceiling
  maxBufferSize:             60 * 1000 * 1000, // 60 MB
  backBufferLength:          30,    // keep 30s behind current position
  maxBufferHole:             0.3,   // tolerate 300ms gap before jump

  // ABR — bandwidth estimation
  abrEwmaDefaultEstimate:    500_000,   // initial estimate: 500 kbps
  abrEwmaFastLive:           3,
  abrEwmaSlowLive:           9,
  abrEwmaFastVoD:            4,
  abrEwmaSlowVoD:            15,
  abrBandWidthFactor:        0.95,      // use 95% of estimated bandwidth
  abrBandWidthUpFactor:      0.7,       // conservative upswitch

  // Startup
  startLevel:                -1,        // auto-select start level
  testBandwidth:             true,
  progressive:               false,
  lowLatencyMode:            false,     // VOD — not live

  // Fragmentation
  fragLoadingMaxRetry:       6,
  fragLoadingRetryDelay:     1000,
  fragLoadingMaxRetryTimeout:64_000,
  fragLoadingTimeOut:        20_000,

  // Manifest
  manifestLoadingMaxRetry:   4,
  manifestLoadingRetryDelay: 1000,
  manifestLoadingTimeOut:    10_000,

  // Level
  levelLoadingMaxRetry:      4,
  levelLoadingRetryDelay:    1000,
  levelLoadingTimeOut:       10_000,

  // XHR credentials (proxy)
  xhrSetup: (xhr) => {
    xhr.withCredentials = false
  },

  // Enable worker for better perf
  enableWorker:              true,
  enableSoftwareAES:         true,
}

// ── Quality label helper ─────────────────────────────────────────────────────
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

function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
  return `${m}:${String(sec).padStart(2,'0')}`
}

// ── Component ────────────────────────────────────────────────────────────────
export default function HLSPlayer({
  src, movieId, title, poster, type = 'movie',
  season, episode, episodeName, startTime = 0,
  onEnded, onTimeUpdate,
}: Props) {
  const videoRef  = useRef<HTMLVideoElement>(null)
  const hlsRef    = useRef<Hls | null>(null)
  const wrapRef   = useRef<HTMLDivElement>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout>>()
  const saveTimer = useRef<ReturnType<typeof setInterval>>()

  const { save, saveTimestamp } = useContinueWatchingStore()

  // ── UI state ────────────────────────────────────────────────────────────
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
  const [currentLevel, setCurrentLevel] = useState(-1)   // -1 = auto
  const [hlsLevel,     setHlsLevel]     = useState(-1)   // actual level hls chose
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [retries,      setRetries]      = useState(0)
  const [skipFeedback, setSkipFb]       = useState<string | null>(null)
  const [sleepTimer,   setSleepTimer]   = useState<number | null>(null)  // minutes
  const [sleepLeft,    setSleepLeft]    = useState<number | null>(null)  // seconds
  const [showSleep,    setShowSleep]    = useState(false)
  const [nextCountdown, setNextCountdown] = useState<number | null>(null)
  const [startedAt,    setStartedAt]    = useState(startTime)
  const [networkSpeed, setNetSpeed]     = useState<number | null>(null)  // kbps

  // ── Init HLS ────────────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return

    setError(null)
    setLoading(true)
    setLevels([])
    setCurrentLevel(-1)

    // Cleanup previous instance
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    // Native HLS (Safari / iOS)
    if (!Hls.isSupported() && video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src
      if (startedAt > 0) video.currentTime = startedAt
      video.play().catch(() => {})
      setLoading(false)
      return
    }

    if (!Hls.isSupported()) {
      setError('HLS playback is not supported in this browser.')
      setLoading(false)
      return
    }

    const hls = new Hls(HLS_CONFIG)
    hlsRef.current = hls

    hls.loadSource(src)
    hls.attachMedia(video)

    // ── Level / ABR events ──────────────────────────────────────────────
    hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
      setLevels(data.levels)
      setLoading(false)
      if (startedAt > 0) {
        video.currentTime = startedAt
        setStartedAt(0)
      }
      video.play().catch(() => {})
    })

    hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
      setHlsLevel(data.level)
    })

    hls.on(Hls.Events.LEVEL_UPDATED, (_e, data) => {
      if (data.level !== undefined) setHlsLevel(data.level)
    })

    // ── Fragment bandwidth estimation ────────────────────────────────────
    hls.on(Hls.Events.FRAG_LOADED, (_e, data) => {
      const stats = data.frag.stats
      if (stats?.loading?.end && stats?.loading?.start && stats?.total) {
        const ms  = stats.loading.end - stats.loading.start
        const bps = (stats.total * 8) / (ms / 1000)
        setNetSpeed(Math.round(bps / 1000))  // kbps
      }
    })

    // ── Buffer events ────────────────────────────────────────────────────
    hls.on(Hls.Events.BUFFER_STALLED_ERROR, () => setBufHealth('critical'))
    hls.on(Hls.Events.BUFFER_FLUSHING,      () => setBufHealth('low'))
    hls.on(Hls.Events.BUFFER_APPENDED,      () => setBufHealth('good'))

    // ── Error recovery ───────────────────────────────────────────────────
    hls.on(Hls.Events.ERROR, (_e: string, data: ErrorData) => {
      if (!data.fatal) return

      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        // Network errors — attempt recovery up to 5 times
        if (retries < 5) {
          setRetries(r => r + 1)
          setTimeout(() => hls.startLoad(), 1000 * (retries + 1))
        } else {
          setError('Network error — check your connection and retry.')
        }
      } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        hls.recoverMediaError()
      } else {
        setError('Playback error. Please try a different source.')
      }
    })

    return () => {
      hls.destroy()
      hlsRef.current = null
    }
  }, [src]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Video event listeners ────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onPlay        = () => setPlaying(true)
    const onPause       = () => setPlaying(false)
    const onWaiting     = () => setLoading(true)
    const onCanPlay     = () => setLoading(false)
    const onDurationChange = () => setDuration(video.duration || 0)
    const onVolumeChange = () => { setVolume(video.volume); setMuted(video.muted) }
    const onEnterPiP    = () => setIsPiP(true)
    const onLeavePiP    = () => setIsPiP(false)

    const onTimeUpdateNative = () => {
      const t = video.currentTime
      const d = video.duration || 0
      setCurrentTime(t)
      onTimeUpdate?.(t, d)

      // Buffered end
      if (video.buffered.length) {
        setBuffered(video.buffered.end(video.buffered.length - 1))
      }

      // Buffer health
      const ahead = (video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0) - t
      setBufHealth(ahead < 2 ? 'critical' : ahead < 5 ? 'low' : 'good')
    }

    const onEndedNative = () => {
      setPlaying(false)
      setNextCountdown(10)
      onEnded?.()
    }

    const onFS = () => setIsFullscreen(!!document.fullscreenElement)

    video.addEventListener('play',           onPlay)
    video.addEventListener('pause',          onPause)
    video.addEventListener('waiting',        onWaiting)
    video.addEventListener('canplay',        onCanPlay)
    video.addEventListener('durationchange', onDurationChange)
    video.addEventListener('volumechange',   onVolumeChange)
    video.addEventListener('timeupdate',     onTimeUpdateNative)
    video.addEventListener('ended',          onEndedNative)
    video.addEventListener('enterpictureinpicture', onEnterPiP)
    video.addEventListener('leavepictureinpicture', onLeavePiP)
    document.addEventListener('fullscreenchange', onFS)

    return () => {
      video.removeEventListener('play',           onPlay)
      video.removeEventListener('pause',          onPause)
      video.removeEventListener('waiting',        onWaiting)
      video.removeEventListener('canplay',        onCanPlay)
      video.removeEventListener('durationchange', onDurationChange)
      video.removeEventListener('volumechange',   onVolumeChange)
      video.removeEventListener('timeupdate',     onTimeUpdateNative)
      video.removeEventListener('ended',          onEndedNative)
      video.removeEventListener('enterpictureinpicture', onEnterPiP)
      video.removeEventListener('leavepictureinpicture', onLeavePiP)
      document.removeEventListener('fullscreenchange', onFS)
    }
  }, [onEnded, onTimeUpdate])

  // ── Media Session API (lock screen / background controls) ────────────────
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const video = videoRef.current
    if (!video) return

    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist:  type === 'tv' && season ? `Season ${season} · Episode ${episode}` : 'Streamix',
      album:   episodeName || title,
      artwork: poster ? [
        { src: poster, sizes: '512x512', type: 'image/jpeg' },
      ] : [],
    })

    const seek = (offset: number) => { video.currentTime = Math.max(0, video.currentTime + offset) }
    navigator.mediaSession.setActionHandler('play',         () => video.play())
    navigator.mediaSession.setActionHandler('pause',        () => video.pause())
    navigator.mediaSession.setActionHandler('seekbackward', () => seek(-10))
    navigator.mediaSession.setActionHandler('seekforward',  () => seek(10))
    navigator.mediaSession.setActionHandler('previoustrack',() => seek(-30))
    navigator.mediaSession.setActionHandler('nexttrack',    () => seek(30))

    const updatePositionState = () => {
      if (!video.duration || !isFinite(video.duration)) return
      try {
        navigator.mediaSession.setPositionState({
          duration:     video.duration,
          playbackRate: video.playbackRate,
          position:     video.currentTime,
        })
      } catch { /* ignore */ }
    }

    video.addEventListener('timeupdate', updatePositionState)
    return () => video.removeEventListener('timeupdate', updatePositionState)
  }, [title, type, season, episode, episodeName, poster])

  // ── Progress save (every 10s) ────────────────────────────────────────────
  useEffect(() => {
    saveTimer.current = setInterval(() => {
      const video = videoRef.current
      if (!video || !video.currentTime || !playing) return
      saveTimestamp(movieId, Math.floor(video.currentTime), video.duration || undefined)
    }, 10_000)
    return () => clearInterval(saveTimer.current)
  }, [movieId, playing, save, saveTimestamp])

  // Save on unmount
  useEffect(() => {
    return () => {
      const video = videoRef.current
      if (!video || !video.currentTime) return
      save({
        movieId, title,
        poster:       poster || '',
        backdrop:     '',
        type,
        season:       season   ?? undefined,
        episode:      episode  ?? undefined,
        episodeName:  episodeName ?? undefined,
        progress:     video.duration ? Math.round(video.currentTime / video.duration * 100) : 0,
        timestamp:    Math.floor(video.currentTime),
        duration:     video.duration || undefined,
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sleep timer countdown ────────────────────────────────────────────────
  useEffect(() => {
    if (sleepTimer === null) { setSleepLeft(null); return }
    setSleepLeft(sleepTimer * 60)
    const interval = setInterval(() => {
      setSleepLeft(s => {
        if (s === null || s <= 1) {
          clearInterval(interval)
          videoRef.current?.pause()
          setSleepTimer(null)
          return null
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [sleepTimer])

  // ── Next-episode countdown ───────────────────────────────────────────────
  useEffect(() => {
    if (nextCountdown === null) return
    if (nextCountdown <= 0)     { onEnded?.(); return }
    const t = setTimeout(() => setNextCountdown(n => (n ?? 1) - 1), 1000)
    return () => clearTimeout(t)
  }, [nextCountdown, onEnded])

  // ── Auto-hide controls ────────────────────────────────────────────────────
  const resetHideTimer = useCallback(() => {
    setShowControls(true)
    clearTimeout(hideTimer.current)
    if (playing) {
      hideTimer.current = setTimeout(() => setShowControls(false), 3000)
    }
  }, [playing])

  // ── Actions ──────────────────────────────────────────────────────────────
  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    v.paused ? v.play().catch(() => {}) : v.pause()
    resetHideTimer()
  }

  const seek = (offset: number) => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = Math.max(0, Math.min(v.currentTime + offset, v.duration || 0))
    const label = offset > 0 ? `+${offset}s ⏩` : `${offset}s ⏪`
    setSkipFb(label)
    setTimeout(() => setSkipFb(null), 700)
  }

  const seekTo = (pct: number) => {
    const v = videoRef.current
    if (!v || !v.duration) return
    v.currentTime = pct * v.duration
  }

  const toggleMute  = () => { if (videoRef.current) videoRef.current.muted = !videoRef.current.muted }
  const setVol      = (v: number) => { if (videoRef.current) { videoRef.current.volume = v; if (v > 0) videoRef.current.muted = false } }

  const toggleFS = async () => {
    try {
      if (!document.fullscreenElement) await wrapRef.current?.requestFullscreen()
      else                              await document.exitFullscreen()
    } catch { /* ignore */ }
  }

  const togglePiP = async () => {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture()
      else                                   await videoRef.current?.requestPictureInPicture()
    } catch { /* ignore */ }
  }

  const setQuality = (lvl: number) => {
    if (!hlsRef.current) return
    hlsRef.current.currentLevel = lvl
    setCurrentLevel(lvl)
    setShowQuality(false)
  }

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (['INPUT','TEXTAREA','SELECT'].includes((e.target as HTMLElement)?.tagName)) return
      switch (e.key) {
        case ' ': case 'k': e.preventDefault(); togglePlay();   break
        case 'ArrowLeft':   e.preventDefault(); seek(-10);      break
        case 'ArrowRight':  e.preventDefault(); seek(10);       break
        case 'ArrowUp':     e.preventDefault(); setVol(Math.min(1, volume + 0.1)); break
        case 'ArrowDown':   e.preventDefault(); setVol(Math.max(0, volume - 0.1)); break
        case 'm':           toggleMute();   break
        case 'f':           toggleFS();     break
        case 'p':           togglePiP();    break
        case 'l':           seek(30);       break
        case 'j':           seek(-10);      break
      }
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [volume, playing]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Progress pct helpers ─────────────────────────────────────────────────
  const pct     = duration > 0 ? (currentTime / duration) * 100 : 0
  const bufPct  = duration > 0 ? (buffered   / duration) * 100 : 0

  const healthColor = bufHealth === 'critical' ? 'text-red-400'
    : bufHealth === 'low' ? 'text-yellow-400' : 'text-green-400'

  const activeQuality = currentLevel === -1
    ? (hlsLevel >= 0 && levels[hlsLevel] ? `Auto (${qualityLabel(levels[hlsLevel])})` : 'Auto')
    : (levels[currentLevel] ? qualityLabel(levels[currentLevel]) : 'Auto')

  return (
    <div
      ref={wrapRef}
      className="relative w-full bg-black overflow-hidden group"
      style={{ aspectRatio: '16/9' }}
      onMouseMove={resetHideTimer}
      onMouseLeave={() => playing && setShowControls(false)}
      onClick={togglePlay}
    >
      {/* ── Video element ── */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        poster={poster}
        playsInline
        preload="auto"
      />

      {/* ── Buffering spinner ── */}
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 z-10 pointer-events-none">
          <div className="w-12 h-12 border-2 border-white/20 border-t-brand rounded-full animate-spin mb-3" />
          <p className="text-white/60 text-xs">
            {retries > 0 ? `Retrying… (${retries}/5)` : 'Loading…'}
          </p>
          {networkSpeed !== null && (
            <p className="text-white/40 text-[10px] mt-1">{networkSpeed} kbps</p>
          )}
        </div>
      )}

      {/* ── Error overlay ── */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20 px-6 text-center">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(239,68,68,0.8)" strokeWidth="1.5" className="mb-4">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p className="text-white font-semibold mb-2">{error}</p>
          <button
            className="btn-primary px-6 py-2 text-sm mt-2"
            onClick={e => { e.stopPropagation(); setError(null); setRetries(0); }}
          >
            Try Again
          </button>
        </div>
      )}

      {/* ── Skip feedback ── */}
      {skipFeedback && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none">
          <div className="bg-black/70 text-white font-bold text-sm px-4 py-2 rounded-full animate-fade-in">
            {skipFeedback}
          </div>
        </div>
      )}

      {/* ── Buffer health indicator ── */}
      {bufHealth !== 'good' && playing && !loading && (
        <div className={`absolute top-3 left-3 z-20 flex items-center gap-1.5 text-[10px] font-bold ${healthColor} bg-black/60 px-2 py-1 rounded-full pointer-events-none`}>
          <div className={`w-1.5 h-1.5 rounded-full ${bufHealth === 'critical' ? 'bg-red-400 animate-pulse' : 'bg-yellow-400'}`} />
          {bufHealth === 'critical' ? 'Buffering…' : 'Low buffer'}
        </div>
      )}

      {/* ── Sleep timer badge ── */}
      {sleepLeft !== null && (
        <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 text-[10px] font-bold text-white bg-black/60 px-2 py-1 rounded-full pointer-events-none">
          😴 {formatTime(sleepLeft)}
        </div>
      )}

      {/* ── Next episode countdown ── */}
      {nextCountdown !== null && nextCountdown > 0 && (
        <div className="absolute bottom-20 right-4 z-30 flex flex-col items-end gap-2">
          <div className="glass rounded-2xl px-4 py-3 border border-dark-border" onClick={e => e.stopPropagation()}>
            <p className="text-white text-sm font-semibold mb-2">Next episode in {nextCountdown}s</p>
            <div className="flex gap-2">
              <button className="btn-primary px-4 py-1.5 text-sm" onClick={() => { setNextCountdown(null); onEnded?.() }}>
                Play Now
              </button>
              <button className="btn-secondary px-3 py-1.5 text-sm" onClick={() => setNextCountdown(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Controls overlay ── */}
      <div
        className={`absolute inset-0 flex flex-col justify-end z-20 transition-opacity duration-300 ${showControls || !playing ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 40%)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Progress bar ── */}
        <div className="px-3 sm:px-4 mb-2">
          <div
            className="relative h-1 rounded-full cursor-pointer group/bar"
            style={{ background: 'rgba(255,255,255,0.15)' }}
            onClick={e => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
              seekTo((e.clientX - rect.left) / rect.width)
            }}
          >
            {/* Buffered */}
            <div className="absolute inset-y-0 left-0 rounded-full transition-all" style={{ width: `${bufPct}%`, background: 'rgba(255,255,255,0.2)' }} />
            {/* Played */}
            <div className="absolute inset-y-0 left-0 rounded-full transition-all" style={{ width: `${pct}%`, background: '#14b8a6' }} />
            {/* Thumb */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-brand shadow opacity-0 group-hover/bar:opacity-100 transition-opacity"
              style={{ left: `${pct}%`, transform: 'translate(-50%, -50%)' }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-white/50 mt-1 font-mono">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* ── Bottom controls ── */}
        <div className="flex items-center gap-2 px-3 sm:px-4 pb-3 sm:pb-4">
          {/* Play/pause */}
          <button onClick={togglePlay}
            className="w-9 h-9 flex items-center justify-center text-white hover:text-brand transition-colors">
            {playing
              ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
            }
          </button>

          {/* Skip -10 */}
          <button onClick={() => seek(-10)} className="hidden sm:flex w-8 h-8 items-center justify-center text-white/70 hover:text-white transition-colors" title="Back 10s (←)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2.5 2v6h6M2.66 15.57a10 10 0 1 0 .57-8.38"/>
              <text x="12" y="13" textAnchor="middle" fontSize="6" fill="currentColor" stroke="none" fontWeight="bold">10</text>
            </svg>
          </button>

          {/* Skip +10 */}
          <button onClick={() => seek(10)} className="hidden sm:flex w-8 h-8 items-center justify-center text-white/70 hover:text-white transition-colors" title="Forward 10s (→)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38"/>
              <text x="12" y="13" textAnchor="middle" fontSize="6" fill="currentColor" stroke="none" fontWeight="bold">10</text>
            </svg>
          </button>

          {/* Volume */}
          <div className="hidden sm:flex items-center gap-2">
            <button onClick={toggleMute} className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white transition-colors">
              {muted || volume === 0
                ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                : volume < 0.5
                ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
              }
            </button>
            <input
              type="range" min="0" max="1" step="0.05"
              value={muted ? 0 : volume}
              onChange={e => setVol(Number(e.target.value))}
              className="w-20 accent-brand cursor-pointer"
            />
          </div>

          {/* Title */}
          <div className="flex-1 min-w-0 px-2">
            <p className="text-white text-xs font-semibold truncate">{title}</p>
            {type === 'tv' && season && (
              <p className="text-white/40 text-[10px]">S{season} E{episode} {episodeName ? `· ${episodeName}` : ''}</p>
            )}
          </div>

          {/* Network speed */}
          {networkSpeed !== null && (
            <div className={`hidden lg:flex items-center gap-1 text-[10px] font-mono ${healthColor}`}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M1.51 5.51C4.72 2.3 9.11.5 12 .5s7.28 1.8 10.49 5.01L21 7l-1.5-1.5a12.9 12.9 0 0 0-15 0L3 7l-1.49-1.49zM12 4a12 12 0 0 0-8.49 3.51L5 9l7 7 7-7-1.51-1.49A12 12 0 0 0 12 4z"/></svg>
              {networkSpeed > 999 ? `${(networkSpeed/1000).toFixed(1)} Mbps` : `${networkSpeed} kbps`}
            </div>
          )}

          {/* Quality picker */}
          {levels.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowQuality(q => !q)}
                className="flex items-center gap-1 text-white/70 hover:text-white text-[11px] font-bold px-2 py-1 rounded-lg transition-colors"
                style={{ background: showQuality ? 'rgba(20,184,166,0.2)' : 'transparent' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                </svg>
                {activeQuality}
              </button>

              {showQuality && (
                <div className="absolute bottom-full right-0 mb-2 rounded-xl overflow-hidden shadow-deep z-30"
                  style={{ background: 'rgba(7,8,12,0.96)', border: '1px solid rgba(255,255,255,0.08)', minWidth: 150 }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 px-3 pt-2 pb-1">Quality</p>

                  {/* Auto */}
                  <button onClick={() => setQuality(-1)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-dark-hover transition-colors ${currentLevel === -1 ? 'text-brand' : 'text-slate-300'}`}>
                    <span>Auto</span>
                    {currentLevel === -1 && hlsLevel >= 0 && levels[hlsLevel] && (
                      <span className="text-[10px] text-slate-500">{qualityLabel(levels[hlsLevel])}</span>
                    )}
                  </button>

                  {/* Levels — highest first */}
                  {[...levels].reverse().map((lvl, ri) => {
                    const actualIdx = levels.length - 1 - ri
                    return (
                      <button key={actualIdx} onClick={() => setQuality(actualIdx)}
                        className={`w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-dark-hover transition-colors ${currentLevel === actualIdx ? 'text-brand' : 'text-slate-300'}`}>
                        <span>{qualityLabel(lvl)}</span>
                        <span className="text-[10px] text-slate-600">{Math.round((lvl.bitrate || 0) / 1000)} kbps</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Sleep timer */}
          <div className="relative">
            <button onClick={e => { e.stopPropagation(); setShowSleep(s => !s) }}
              className={`w-8 h-8 flex items-center justify-center text-white/70 hover:text-white transition-colors ${sleepTimer !== null ? 'text-brand' : ''}`}
              title="Sleep timer">
              😴
            </button>

            {showSleep && (
              <div className="absolute bottom-full right-0 mb-2 rounded-xl overflow-hidden shadow-deep z-30"
                style={{ background: 'rgba(7,8,12,0.96)', border: '1px solid rgba(255,255,255,0.08)', minWidth: 140 }}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 px-3 pt-2 pb-1">Sleep Timer</p>
                {sleepTimer !== null && (
                  <button onClick={() => { setSleepTimer(null); setShowSleep(false) }}
                    className="w-full px-3 py-2 text-xs text-red-400 hover:bg-dark-hover text-left transition-colors">
                    Cancel ({sleepLeft !== null ? formatTime(sleepLeft) : '--'})
                  </button>
                )}
                {[15,30,45,60].map(m => (
                  <button key={m} onClick={() => { setSleepTimer(m); setShowSleep(false) }}
                    className={`w-full px-3 py-2 text-xs hover:bg-dark-hover text-left transition-colors ${sleepTimer===m ? 'text-brand' : 'text-slate-300'}`}>
                    {m} minutes
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
          {document.pictureInPictureEnabled && (
            <button onClick={togglePiP}
              className={`hidden sm:flex w-8 h-8 items-center justify-center transition-colors ${isPiP ? 'text-brand' : 'text-white/70 hover:text-white'}`}
              title="Picture in Picture (P)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="20" height="14" rx="2"/>
                <rect x="10" y="9" width="10" height="8" rx="1" fill="currentColor" stroke="none" opacity="0.7"/>
              </svg>
            </button>
          )}

          {/* Fullscreen */}
          <button onClick={toggleFS}
            className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white transition-colors"
            title="Fullscreen (F)">
            {isFullscreen
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
