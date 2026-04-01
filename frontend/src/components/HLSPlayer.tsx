// frontend/src/components/HLSPlayer.tsx — FULL REPLACEMENT
// NEW: subtitle track support, speed control (0.5x–2x), accessibility
import { useEffect, useRef, useState, useCallback } from 'react'
import Hls, { Level, ErrorData, HlsConfig } from 'hls.js'

export interface SubtitleTrack {
  url:   string
  lang:  string
  label: string
}

export interface HLSPlayerProps {
  src:            string
  movieId:        number
  title:          string
  poster?:        string
  type?:          'movie' | 'tv'
  season?:        number
  episode?:       number
  episodeName?:   string
  subtitleTracks?:SubtitleTrack[]
  startTime?:     number
  onEnded?:       () => void
  onTimeUpdate?:  (seconds: number, duration: number) => void
}

const HLS_CONFIG: Partial<HlsConfig> = {
  maxBufferLength:            30,
  maxMaxBufferLength:         600,
  maxBufferSize:              60 * 1000 * 1000,
  backBufferLength:           30,
  maxBufferHole:              0.3,
  abrEwmaDefaultEstimate:     500_000,
  abrBandWidthFactor:         0.95,
  abrBandWidthUpFactor:       0.7,
  startLevel:                 -1,
  testBandwidth:              true,
  fragLoadingMaxRetry:        6,
  fragLoadingRetryDelay:      1000,
  fragLoadingTimeOut:         20_000,
  manifestLoadingMaxRetry:    4,
  manifestLoadingTimeOut:     10_000,
  levelLoadingMaxRetry:       4,
  levelLoadingTimeOut:        10_000,
  xhrSetup: xhr => { xhr.withCredentials = false },
  enableWorker: true,
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]

function qualityLabel(level: Level): string {
  const h = level.height
  if (!h) return `${Math.round((level.bitrate || 0) / 1000)}k`
  if (h >= 2160) return '4K'
  if (h >= 1080) return '1080p'
  if (h >= 720)  return '720p'
  if (h >= 480)  return '480p'
  if (h >= 360)  return '360p'
  return `${h}p`
}

function fmt(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  return h > 0
    ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
    : `${m}:${String(sec).padStart(2,'0')}`
}

export default function HLSPlayer({
  src, movieId, title, poster, type = 'movie',
  season, episode, episodeName,
  subtitleTracks = [], startTime = 0,
  onEnded, onTimeUpdate,
}: HLSPlayerProps) {
  const videoRef   = useRef<HTMLVideoElement>(null)
  const hlsRef     = useRef<Hls | null>(null)
  const wrapRef    = useRef<HTMLDivElement>(null)
  const hideTimer  = useRef<ReturnType<typeof setTimeout>>()
  const retriesRef = useRef(0)

  // ── State ──────────────────────────────────────────────────────────────────
  const [playing,      setPlaying]      = useState(false)
  const [muted,        setMuted]        = useState(false)
  const [volume,       setVolume]       = useState(1)
  const [currentTime,  setCurrentTime]  = useState(0)
  const [duration,     setDuration]     = useState(0)
  const [buffered,     setBuffered]     = useState(0)
  const [isFS,         setIsFS]         = useState(false)
  const [isPiP,        setIsPiP]        = useState(false)
  const [showCtrl,     setShowCtrl]     = useState(true)
  const [showQuality,  setShowQuality]  = useState(false)
  const [showSpeed,    setShowSpeed]    = useState(false)
  const [showSubs,     setShowSubs]     = useState(false)
  const [showSleep,    setShowSleep]    = useState(false)
  const [levels,       setLevels]       = useState<Level[]>([])
  const [currentLevel, setCurrentLevel] = useState(-1)
  const [hlsLevel,     setHlsLevel]     = useState(-1)
  const [isLoading,    setIsLoading]    = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [retries,      setRetries]      = useState(0)
  const [skipFb,       setSkipFb]       = useState<string | null>(null)
  const [speed,        setSpeed]        = useState(1)
  const [subIdx,       setSubIdx]       = useState(-1)  // -1 = off
  const [sleepTimer,   setSleepTimer]   = useState<number | null>(null)
  const [sleepLeft,    setSleepLeft]    = useState<number | null>(null)
  const [bufHealth,    setBufHealth]    = useState<'good'|'low'|'critical'>('good')
  const [netSpeed,     setNetSpeed]     = useState<number | null>(null)

  // ── Init HLS ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return

    setError(null); setIsLoading(true); setLevels([]); setCurrentLevel(-1)
    retriesRef.current = 0; setRetries(0)

    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }

    if (!Hls.isSupported() && video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src
      if (startTime > 0) video.currentTime = startTime
      video.play().catch(() => {})
      setIsLoading(false)
      return
    }
    if (!Hls.isSupported()) { setError('HLS not supported in this browser.'); setIsLoading(false); return }

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
          retriesRef.current++; setRetries(retriesRef.current)
          setTimeout(() => hls.startLoad(), 1000 * retriesRef.current)
        } else { setError('Network error — check your connection.') }
      } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        hls.recoverMediaError()
      } else { setError('Playback error. Try refreshing.') }
    })

    return () => { hls.destroy(); hlsRef.current = null }
  }, [src]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Video events ───────────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current; if (!video) return

    const handlers = {
      play:           () => setPlaying(true),
      pause:          () => setPlaying(false),
      waiting:        () => setIsLoading(true),
      canplay:        () => setIsLoading(false),
      durationchange: () => setDuration(video.duration || 0),
      volumechange:   () => { setVolume(video.volume); setMuted(video.muted) },
      ended:          () => { setPlaying(false); onEnded?.() },
      enterpictureinpicture: () => setIsPiP(true),
      leavepictureinpicture: () => setIsPiP(false),
      timeupdate: () => {
        const t = video.currentTime, d = video.duration || 0
        setCurrentTime(t)
        if (video.buffered.length) setBuffered(video.buffered.end(video.buffered.length - 1))
        const ahead = (video.buffered.length ? video.buffered.end(video.buffered.length-1) : 0) - t
        setBufHealth(ahead < 2 ? 'critical' : ahead < 5 ? 'low' : 'good')
        onTimeUpdate?.(t, d)
      },
    }

    Object.entries(handlers).forEach(([ev, fn]) => video.addEventListener(ev, fn as any))
    const fsHandler = () => setIsFS(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', fsHandler)

    return () => {
      Object.entries(handlers).forEach(([ev, fn]) => video.removeEventListener(ev, fn as any))
      document.removeEventListener('fullscreenchange', fsHandler)
    }
  }, [onEnded, onTimeUpdate])

  // ── Media Session ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!('mediaSession' in navigator) || !videoRef.current) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title, artist: type === 'tv' && season ? `S${season} · E${episode}` : 'Streamix',
      album: episodeName || title,
      artwork: poster ? [{ src: poster, sizes:'512x512', type:'image/jpeg' }] : [],
    })
    const v = videoRef.current
    navigator.mediaSession.setActionHandler('play',         () => v.play())
    navigator.mediaSession.setActionHandler('pause',        () => v.pause())
    navigator.mediaSession.setActionHandler('seekbackward', () => { v.currentTime = Math.max(0, v.currentTime - 10) })
    navigator.mediaSession.setActionHandler('seekforward',  () => { v.currentTime = Math.min(v.currentTime + 10, v.duration || 0) })
  }, [title, type, season, episode, episodeName, poster])

  // ── Subtitle tracks ────────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current; if (!video) return
    // Remove old tracks
    Array.from(video.querySelectorAll('track')).forEach(t => t.remove())
    // Add new tracks
    subtitleTracks.forEach((s, i) => {
      const track = document.createElement('track')
      track.src   = s.url
      track.kind  = 'subtitles'
      track.label = s.label
      track.srclang = s.lang
      track.default = i === 0
      video.appendChild(track)
    })
    // Control visibility via subIdx
    Array.from(video.textTracks).forEach((t, i) => {
      t.mode = i === subIdx ? 'showing' : 'disabled'
    })
  }, [subtitleTracks]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync subtitle visibility
  useEffect(() => {
    const video = videoRef.current; if (!video) return
    Array.from(video.textTracks).forEach((t, i) => {
      t.mode = i === subIdx ? 'showing' : 'disabled'
    })
  }, [subIdx])

  // ── Speed ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed
  }, [speed])

  // ── Sleep timer ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (sleepTimer === null) { setSleepLeft(null); return }
    setSleepLeft(sleepTimer * 60)
    const id = setInterval(() => {
      setSleepLeft(s => {
        if (s === null || s <= 1) { clearInterval(id); videoRef.current?.pause(); setSleepTimer(null); return null }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [sleepTimer])

  // ── Auto-hide controls ─────────────────────────────────────────────────────
  const resetHide = useCallback(() => {
    setShowCtrl(true); clearTimeout(hideTimer.current)
    if (playing) hideTimer.current = setTimeout(() => setShowCtrl(false), 3000)
  }, [playing])

  // ── Actions ────────────────────────────────────────────────────────────────
  const togglePlay = () => {
    const v = videoRef.current; if (!v) return
    v.paused ? v.play().catch(()=>{}) : v.pause()
    resetHide()
  }
  const skip = (n: number) => {
    const v = videoRef.current; if (!v) return
    v.currentTime = Math.max(0, Math.min(v.currentTime + n, v.duration || 0))
    setSkipFb(n > 0 ? `+${n}s` : `${n}s`)
    setTimeout(() => setSkipFb(null), 700)
  }
  const seekTo    = (pct: number) => { const v = videoRef.current; if (v?.duration) v.currentTime = pct * v.duration }
  const setVol    = (n: number)   => { const v = videoRef.current; if (v) { v.volume = n; if (n > 0) v.muted = false } }
  const toggleMute = () => { const v = videoRef.current; if (v) v.muted = !v.muted }
  const toggleFS  = async () => {
    try { !document.fullscreenElement ? await wrapRef.current?.requestFullscreen() : await document.exitFullscreen() } catch {}
  }
  const togglePiP = async () => {
    try { document.pictureInPictureElement ? await document.exitPictureInPicture() : await videoRef.current?.requestPictureInPicture() } catch {}
  }
  const setQuality = (lvl: number) => {
    if (!hlsRef.current) return; hlsRef.current.currentLevel = lvl; setCurrentLevel(lvl); setShowQuality(false)
  }

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (['INPUT','TEXTAREA','SELECT'].includes(tag)) return
      switch(e.key) {
        case ' ': case 'k': e.preventDefault(); togglePlay(); break
        case 'ArrowLeft':   e.preventDefault(); skip(-10);   break
        case 'ArrowRight':  e.preventDefault(); skip(10);    break
        case 'ArrowUp':     e.preventDefault(); setVol(Math.min(1, volume + 0.1)); break
        case 'ArrowDown':   e.preventDefault(); setVol(Math.max(0, volume - 0.1)); break
        case 'm': toggleMute(); break
        case 'f': toggleFS();   break
        case 'p': togglePiP();  break
        case 'j': skip(-10);    break
        case 'l': skip(30);     break
        case '>': setSpeed(s => Math.min(2, SPEEDS[SPEEDS.indexOf(s) + 1] || 2)); break
        case '<': setSpeed(s => Math.max(0.5, SPEEDS[SPEEDS.indexOf(s) - 1] || 0.5)); break
      }
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [volume, playing]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Computed ───────────────────────────────────────────────────────────────
  const pct    = duration > 0 ? (currentTime / duration) * 100 : 0
  const bufPct = duration > 0 ? (buffered    / duration) * 100 : 0
  const healthColor = bufHealth === 'critical' ? 'text-red-400' : bufHealth === 'low' ? 'text-yellow-400' : 'text-green-400'
  const qlabel = currentLevel === -1
    ? (hlsLevel >= 0 && levels[hlsLevel] ? `Auto (${qualityLabel(levels[hlsLevel])})` : 'Auto')
    : (levels[currentLevel] ? qualityLabel(levels[currentLevel]) : 'Auto')

  const SettingsMenu = ({ show, children }: { show: boolean; children: React.ReactNode }) =>
    show ? (
      <div className="absolute bottom-full right-0 mb-2 rounded-xl overflow-hidden shadow-deep z-30"
        style={{ background:'rgba(7,8,12,0.97)', border:'1px solid rgba(255,255,255,0.08)', minWidth:148 }}>
        {children}
      </div>
    ) : null

  return (
    <div
      ref={wrapRef}
      className="relative w-full bg-black overflow-hidden select-none"
      style={{ aspectRatio:'16/9' }}
      onMouseMove={resetHide}
      onMouseLeave={() => playing && setShowCtrl(false)}
      onClick={togglePlay}
      role="region"
      aria-label="Video player"
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        poster={poster}
        playsInline
        preload="auto"
        aria-label={title}
      />

      {/* Loading */}
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 z-10 pointer-events-none">
          <div className="w-12 h-12 border-2 border-white/20 border-t-brand rounded-full animate-spin mb-2" role="status" aria-label="Loading"/>
          {retries > 0 && <p className="text-white/40 text-xs">Retrying… {retries}/5</p>}
          {netSpeed !== null && <p className="text-white/30 text-[10px] mt-0.5">{netSpeed > 999 ? `${(netSpeed/1000).toFixed(1)} Mbps` : `${netSpeed} kbps`}</p>}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20 px-6 text-center">
          <span className="text-4xl mb-3">⚠️</span>
          <p className="text-white font-semibold mb-3">{error}</p>
          <button className="btn-primary px-6 py-2 text-sm" onClick={e => { e.stopPropagation(); setError(null); retriesRef.current = 0; setRetries(0) }}>
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
          <div className={`w-1.5 h-1.5 rounded-full ${bufHealth==='critical'?'bg-red-400 animate-pulse':'bg-yellow-400'}`}/>
          {bufHealth === 'critical' ? 'Buffering…' : 'Low buffer'}
        </div>
      )}

      {/* Sleep badge */}
      {sleepLeft !== null && (
        <div className="absolute top-3 right-3 z-20 bg-black/60 text-white text-[10px] font-bold px-2 py-1 rounded-full pointer-events-none">
          😴 {fmt(sleepLeft)}
        </div>
      )}

      {/* Speed badge (when not 1x) */}
      {speed !== 1 && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-black/60 text-brand text-[11px] font-bold px-2 py-1 rounded-full pointer-events-none">
          {speed}×
        </div>
      )}

      {/* Controls */}
      <div
        className={`absolute inset-0 flex flex-col justify-end z-20 transition-opacity duration-300 ${showCtrl || !playing ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ background:'linear-gradient(to top,rgba(0,0,0,0.85) 0%,transparent 40%)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Seek bar */}
        <div className="px-3 sm:px-4 mb-2">
          <div className="relative h-1 rounded-full cursor-pointer group/bar"
            style={{ background:'rgba(255,255,255,0.15)' }}
            role="slider" aria-label="Seek" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}
            onClick={e => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); seekTo((e.clientX-r.left)/r.width) }}>
            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width:`${bufPct}%`, background:'rgba(255,255,255,0.2)' }}/>
            <div className="absolute inset-y-0 left-0 rounded-full bg-brand transition-all" style={{ width:`${pct}%` }}/>
            <div className="absolute w-3 h-3 rounded-full bg-brand opacity-0 group-hover/bar:opacity-100 transition-opacity"
              style={{ left:`${pct}%`, top:'50%', transform:'translate(-50%,-50%)' }}/>
          </div>
          <div className="flex justify-between text-[10px] text-white/50 mt-1 font-mono">
            <span>{fmt(currentTime)}</span>
            <span>{fmt(duration)}</span>
          </div>
        </div>

        {/* Control row */}
        <div className="flex items-center gap-1.5 px-3 sm:px-4 pb-3 sm:pb-4">

          {/* Play/pause */}
          <button onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}
            className="w-9 h-9 flex items-center justify-center text-white hover:text-brand transition-colors">
            {playing
              ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>}
          </button>

          {/* -10s / +10s */}
          <button onClick={() => skip(-10)} aria-label="Rewind 10 seconds"
            className="hidden sm:flex w-8 h-8 items-center justify-center text-white/70 hover:text-white transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.64"/>
            </svg>
          </button>
          <button onClick={() => skip(10)} aria-label="Forward 10 seconds"
            className="hidden sm:flex w-8 h-8 items-center justify-center text-white/70 hover:text-white transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.49-4.64"/>
            </svg>
          </button>

          {/* Volume */}
          <div className="hidden sm:flex items-center gap-1">
            <button onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'}
              className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white transition-colors">
              {muted || volume === 0
                ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>}
            </button>
            <input type="range" min="0" max="1" step="0.05" value={muted?0:volume}
              onChange={e => setVol(Number(e.target.value))}
              aria-label="Volume"
              className="w-16 sm:w-20 accent-brand cursor-pointer"/>
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

          {/* Subtitles */}
          {subtitleTracks.length > 0 && (
            <div className="relative flex-shrink-0">
              <button onClick={() => { setShowSubs(s=>!s); setShowQuality(false); setShowSpeed(false); setShowSleep(false) }}
                aria-label="Subtitles" aria-expanded={showSubs}
                className={`flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg transition-colors ${showSubs||subIdx>=0?'text-brand bg-brand/10':'text-white/70 hover:text-white'}`}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="6" width="20" height="12" rx="2"/>
                  <line x1="7" y1="12" x2="17" y2="12"/><line x1="7" y1="16" x2="13" y2="16"/>
                </svg>
                CC
              </button>
              <SettingsMenu show={showSubs}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 px-3 pt-2 pb-1">Subtitles</p>
                <button onClick={() => setSubIdx(-1)}
                  className={`w-full px-3 py-2 text-xs text-left hover:bg-dark-hover transition-colors ${subIdx===-1?'text-brand':'text-slate-300'}`}>
                  Off
                </button>
                {subtitleTracks.map((t,i) => (
                  <button key={i} onClick={() => { setSubIdx(i); setShowSubs(false) }}
                    className={`w-full px-3 py-2 text-xs text-left hover:bg-dark-hover transition-colors ${subIdx===i?'text-brand':'text-slate-300'}`}>
                    {t.label}
                  </button>
                ))}
              </SettingsMenu>
            </div>
          )}

          {/* Speed control */}
          <div className="relative flex-shrink-0">
            <button onClick={() => { setShowSpeed(s=>!s); setShowQuality(false); setShowSubs(false); setShowSleep(false) }}
              aria-label="Playback speed" aria-expanded={showSpeed}
              className={`text-[11px] font-bold px-2 py-1 rounded-lg transition-colors ${showSpeed?'text-brand bg-brand/10':'text-white/70 hover:text-white'}`}>
              {speed}×
            </button>
            <SettingsMenu show={showSpeed}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 px-3 pt-2 pb-1">Speed</p>
              {SPEEDS.map(s => (
                <button key={s} onClick={() => { setSpeed(s); setShowSpeed(false) }}
                  className={`w-full px-3 py-2 text-xs text-left hover:bg-dark-hover transition-colors ${speed===s?'text-brand':'text-slate-300'}`}>
                  {s}×{s===1?' (Normal)':''}
                </button>
              ))}
            </SettingsMenu>
          </div>

          {/* Quality */}
          {levels.length > 0 && (
            <div className="relative flex-shrink-0">
              <button onClick={() => { setShowQuality(q=>!q); setShowSpeed(false); setShowSubs(false); setShowSleep(false) }}
                aria-label="Video quality" aria-expanded={showQuality}
                className={`flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg transition-colors ${showQuality?'text-brand bg-brand/10':'text-white/70 hover:text-white'}`}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                </svg>
                {qlabel}
              </button>
              <SettingsMenu show={showQuality}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 px-3 pt-2 pb-1">Quality</p>
                <button onClick={() => setQuality(-1)}
                  className={`w-full flex justify-between px-3 py-2 text-xs hover:bg-dark-hover transition-colors ${currentLevel===-1?'text-brand':'text-slate-300'}`}>
                  <span>Auto</span>
                  {currentLevel===-1 && hlsLevel>=0 && levels[hlsLevel] && <span className="text-slate-500">{qualityLabel(levels[hlsLevel])}</span>}
                </button>
                {[...levels].reverse().map((lvl, ri) => {
                  const idx = levels.length - 1 - ri
                  return (
                    <button key={idx} onClick={() => setQuality(idx)}
                      className={`w-full flex justify-between px-3 py-2 text-xs hover:bg-dark-hover transition-colors ${currentLevel===idx?'text-brand':'text-slate-300'}`}>
                      <span>{qualityLabel(lvl)}</span>
                      <span className="text-slate-600">{Math.round((lvl.bitrate||0)/1000)}k</span>
                    </button>
                  )
                })}
              </SettingsMenu>
            </div>
          )}

          {/* Sleep timer */}
          <div className="relative flex-shrink-0">
            <button onClick={() => { setShowSleep(s=>!s); setShowQuality(false); setShowSpeed(false); setShowSubs(false) }}
              aria-label="Sleep timer" aria-expanded={showSleep}
              className={`w-8 h-8 flex items-center justify-center text-lg transition-colors ${sleepTimer!==null?'text-brand':'text-white/70 hover:text-white'}`}>
              😴
            </button>
            <SettingsMenu show={showSleep}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 px-3 pt-2 pb-1">Sleep Timer</p>
              {sleepTimer !== null && (
                <button onClick={() => { setSleepTimer(null); setShowSleep(false) }}
                  className="w-full px-3 py-2 text-xs text-red-400 hover:bg-dark-hover text-left transition-colors">
                  Cancel ({sleepLeft !== null ? fmt(sleepLeft) : '--'})
                </button>
              )}
              {[15,30,45,60].map(m => (
                <button key={m} onClick={() => { setSleepTimer(m); setShowSleep(false) }}
                  className={`w-full px-3 py-2 text-xs text-left hover:bg-dark-hover transition-colors ${sleepTimer===m?'text-brand':'text-slate-300'}`}>
                  {m} min
                </button>
              ))}
              <button onClick={() => { setSleepTimer(Math.ceil((duration-currentTime)/60)||30); setShowSleep(false) }}
                className="w-full px-3 py-2 text-xs text-slate-300 hover:bg-dark-hover text-left transition-colors border-t border-dark-border">
                End of episode
              </button>
            </SettingsMenu>
          </div>

          {/* PiP */}
          {typeof document !== 'undefined' && document.pictureInPictureEnabled && (
            <button onClick={togglePiP} aria-label="Picture in Picture"
              className={`hidden sm:flex w-8 h-8 items-center justify-center transition-colors ${isPiP?'text-brand':'text-white/70 hover:text-white'}`}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="20" height="14" rx="2"/>
                <rect x="10" y="9" width="10" height="8" rx="1" fill="currentColor" stroke="none" opacity="0.6"/>
              </svg>
            </button>
          )}

          {/* Fullscreen */}
          <button onClick={toggleFS} aria-label={isFS ? 'Exit fullscreen' : 'Enter fullscreen'}
            className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white transition-colors">
            {isFS
              ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>
              : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>}
          </button>
        </div>
      </div>
    </div>
  )
}
