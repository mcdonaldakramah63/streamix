// frontend/src/components/HLSPlayer.tsx — FULL REPLACEMENT
// Adds: PiP, sleep timer, chapters, Chromecast, autoplay next, keyboard shortcuts
import { useEffect, useRef, useState, useCallback } from 'react'
import { usePiP } from '../hooks/usePWA'
import SleepTimer from './SleepTimer'

declare const Hls: any
declare const cast: any
declare const chrome: any

interface Chapter { title: string; startTime: number }

interface Props {
  src:            string
  poster?:        string
  startAt?:       number
  onTimeUpdate?:  (time: number, duration: number) => void
  onEnded?:       () => void
  subtitles?:     { url: string; lang: string; label: string }[]
  chapters?:      Chapter[]
  autoplayNext?:  boolean
  nextLabel?:     string
  onNextEpisode?: () => void
  title?:         string
}

function fmt(s: number): string {
  if (!s || isNaN(s)) return '0:00'
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60)
  return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}` : `${m}:${String(sec).padStart(2,'0')}`
}

export default function HLSPlayer({
  src, poster, startAt = 0, onTimeUpdate, onEnded,
  subtitles = [], chapters = [], autoplayNext, nextLabel, onNextEpisode, title,
}: Props) {
  const videoRef  = useRef<HTMLVideoElement>(null)
  const hlsRef    = useRef<any>(null)
  const wrapRef   = useRef<HTMLDivElement>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout>>()
  const seeked    = useRef(false)

  const { isPiP, toggle: togglePiP, supported: pipSupported } = usePiP(videoRef)

  const [playing,   setPlaying]   = useState(false)
  const [muted,     setMuted]     = useState(false)
  const [volume,    setVolume]    = useState(1)
  const [curTime,   setCurTime]   = useState(0)
  const [duration,  setDuration]  = useState(0)
  const [buffered,  setBuffered]  = useState(0)
  const [showCtrl,  setShowCtrl]  = useState(true)
  const [fullscr,   setFullscr]   = useState(false)
  const [quality,   setQuality]   = useState('Auto')
  const [qualities, setQualities] = useState<string[]>(['Auto'])
  const [showQMenu, setShowQMenu] = useState(false)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string|null>(null)
  const [subIdx,    setSubIdx]    = useState(-1)
  const [skipAnim,  setSkipAnim]  = useState<null|'back'|'fwd'>(null)
  const [nextCountdown, setNextCountdown] = useState<number|null>(null)
  const [curChapter, setCurChapter] = useState<Chapter|null>(null)
  const [castAvail, setCastAvail] = useState(false)
  const [isSleeping, setIsSleeping] = useState(false)

  // ── HLS init ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return
    if (hlsRef.current) { try { hlsRef.current.destroy() } catch {} hlsRef.current = null }
    setLoading(true); setError(null); seeked.current = false

    if (typeof Hls !== 'undefined' && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, backBufferLength: 60, maxBufferLength: 30 })
      hlsRef.current = hls
      hls.loadSource(src)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, (_: any, data: any) => {
        setLoading(false)
        const qs = ['Auto', ...(data.levels||[]).map((l: any) => `${l.height}p`).filter(Boolean)
          .sort((a: string, b: string) => parseInt(b) - parseInt(a))]
        setQualities([...new Set(qs)] as string[])
        video.play().catch(() => {})
      })
      hls.on(Hls.Events.ERROR, (_: any, d: any) => {
        if (d.fatal) {
          setLoading(false)
          if (d.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError()
          else setError('Stream error. Try another server.')
        }
      })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src
      video.addEventListener('loadedmetadata', () => setLoading(false), { once: true })
      video.play().catch(() => {})
    } else {
      setError('HLS not supported.'); setLoading(false)
    }
    return () => { if (hlsRef.current) { try { hlsRef.current.destroy() } catch {} hlsRef.current = null } }
  }, [src])

  // ── Seek to startAt ──────────────────────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current
    if (!v || !startAt || startAt < 2 || seeked.current) return
    const trySeek = () => {
      if (v.duration && !isNaN(v.duration) && v.duration > startAt + 5) {
        v.currentTime = startAt; seeked.current = true
      }
    }
    v.addEventListener('loadedmetadata', trySeek)
    v.addEventListener('canplay', trySeek)
    return () => { v.removeEventListener('loadedmetadata', trySeek); v.removeEventListener('canplay', trySeek) }
  }, [startAt, src])

  // ── Video events ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current; if (!v) return
    const onPlay    = () => { setPlaying(true); setLoading(false) }
    const onPause   = () => setPlaying(false)
    const onWait    = () => setLoading(true)
    const onPlaying = () => { setLoading(false); setError(null) }
    const onEnd     = () => {
      setPlaying(false)
      onEnded?.()
      // Auto-play next episode countdown
      if (autoplayNext && onNextEpisode) {
        setNextCountdown(10)
      }
    }
    const onTime = () => {
      const t = v.currentTime, d = v.duration || 0
      setCurTime(t); setDuration(d)
      onTimeUpdate?.(t, d)
      if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1))
      // Update current chapter
      if (chapters.length) {
        const ch = [...chapters].reverse().find(c => t >= c.startTime)
        setCurChapter(ch || null)
      }
    }
    const onErr = () => { setLoading(false); setError('Video error. Try another server.') }
    v.addEventListener('play', onPlay); v.addEventListener('pause', onPause)
    v.addEventListener('waiting', onWait); v.addEventListener('playing', onPlaying)
    v.addEventListener('ended', onEnd); v.addEventListener('timeupdate', onTime)
    v.addEventListener('durationchange', onTime); v.addEventListener('error', onErr)
    return () => {
      v.removeEventListener('play', onPlay); v.removeEventListener('pause', onPause)
      v.removeEventListener('waiting', onWait); v.removeEventListener('playing', onPlaying)
      v.removeEventListener('ended', onEnd); v.removeEventListener('timeupdate', onTime)
      v.removeEventListener('durationchange', onTime); v.removeEventListener('error', onErr)
    }
  }, [onTimeUpdate, onEnded, autoplayNext, onNextEpisode, chapters])

  // ── Auto-play next countdown ─────────────────────────────────────────────────
  useEffect(() => {
    if (nextCountdown === null) return
    if (nextCountdown <= 0) { onNextEpisode?.(); setNextCountdown(null); return }
    const t = setTimeout(() => setNextCountdown(n => (n ?? 1) - 1), 1000)
    return () => clearTimeout(t)
  }, [nextCountdown, onNextEpisode])

  // ── Fullscreen ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const fn = () => setFullscr(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', fn)
    return () => document.removeEventListener('fullscreenchange', fn)
  }, [])

  // ── Chromecast availability ───────────────────────────────────────────────────
  useEffect(() => {
    const checkCast = () => {
      if (typeof cast !== 'undefined' && cast.framework) setCastAvail(true)
    }
    window.addEventListener('cast_api_ready' as any, checkCast)
    checkCast()
    return () => window.removeEventListener('cast_api_ready' as any, checkCast)
  }, [])

  // ── Sleep timer handler ───────────────────────────────────────────────────────
  const handleSleepExpire = useCallback(() => {
    const v = videoRef.current; if (v) v.pause()
    setIsSleeping(true)
  }, [])

  // ── Auto-hide controls ────────────────────────────────────────────────────────
  const resetHide = useCallback(() => {
    setShowCtrl(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setShowCtrl(false)
    }, 3000)
  }, [])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (['INPUT','TEXTAREA','SELECT'].includes((e.target as HTMLElement).tagName)) return
      const v = videoRef.current; if (!v) return
      switch (e.key) {
        case ' ': case 'k': e.preventDefault(); v.paused ? v.play() : v.pause(); resetHide(); break
        case 'ArrowLeft': case 'j':
          e.preventDefault(); v.currentTime = Math.max(0, v.currentTime - 10)
          setSkipAnim('back'); setTimeout(() => setSkipAnim(null), 600); resetHide(); break
        case 'ArrowRight': case 'l':
          e.preventDefault(); v.currentTime = Math.min(v.duration||Infinity, v.currentTime + 10)
          setSkipAnim('fwd'); setTimeout(() => setSkipAnim(null), 600); resetHide(); break
        case 'ArrowUp':   e.preventDefault(); v.volume = Math.min(1, v.volume+0.1); setVolume(v.volume); break
        case 'ArrowDown': e.preventDefault(); v.volume = Math.max(0, v.volume-0.1); setVolume(v.volume); break
        case 'm': case 'M': v.muted = !v.muted; setMuted(v.muted); break
        case 'f': case 'F': e.preventDefault()
          document.fullscreenElement ? document.exitFullscreen() : wrapRef.current?.requestFullscreen(); break
        case 'p': case 'P': e.preventDefault(); if (pipSupported) togglePiP(); break
      }
    }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [resetHide, pipSupported, togglePiP])

  // ── Controls ──────────────────────────────────────────────────────────────────
  const togglePlay = () => { const v = videoRef.current; if (!v) return; v.paused ? v.play() : v.pause(); resetHide() }
  const skip = (s: number) => {
    const v = videoRef.current; if (!v) return
    v.currentTime = Math.max(0, Math.min(v.currentTime + s, v.duration||Infinity))
    setSkipAnim(s > 0 ? 'fwd' : 'back'); setTimeout(() => setSkipAnim(null), 600); resetHide()
  }
  const handleSeek  = (val: number) => { const v = videoRef.current; if (!v) return; v.currentTime = val; setCurTime(val) }
  const handleVol   = (val: number) => { const v = videoRef.current; if (!v) return; v.volume = val; v.muted = val===0; setVolume(val); setMuted(val===0) }
  const toggleMute  = () => { const v = videoRef.current; if (!v) return; v.muted = !v.muted; setMuted(v.muted) }
  const toggleFS    = async () => { try { document.fullscreenElement ? await document.exitFullscreen() : await wrapRef.current?.requestFullscreen() } catch {} }
  const setQ = (q: string) => {
    setQuality(q); setShowQMenu(false)
    const hls = hlsRef.current; if (!hls) return
    if (q === 'Auto') { hls.currentLevel = -1; return }
    const idx = hls.levels?.findIndex((l: any) => `${l.height}p` === q) ?? -1
    if (idx >= 0) hls.currentLevel = idx
  }

  const pct    = duration > 0 ? (curTime  / duration) * 100 : 0
  const bufPct = duration > 0 ? (buffered / duration) * 100 : 0

  return (
    <div ref={wrapRef}
      className="relative w-full bg-black select-none"
      style={{ aspectRatio: fullscr ? undefined : '16/9', height: fullscr ? '100vh' : undefined }}
      onMouseMove={resetHide} onTouchStart={resetHide}
      onClick={e => { if ((e.target as HTMLElement).closest('.ctrl')) return; togglePlay() }}>

      <video ref={videoRef} className="absolute inset-0 w-full h-full" poster={poster} playsInline crossOrigin="anonymous">
        {subtitles.map((s, i) => (
          <track key={i} kind="subtitles" src={s.url} srcLang={s.lang} label={s.label} default={i === subIdx} />
        ))}
      </video>

      {/* Loading */}
      {loading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
          <div className="w-14 h-14 border-2 border-white/20 border-t-white rounded-full animate-spin mb-3" />
          <p className="text-white/60 text-sm">Loading stream…</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/80 p-6 text-center pointer-events-auto">
          <div className="text-4xl mb-3">⚠️</div>
          <p className="text-white font-semibold mb-2">Stream Error</p>
          <p className="text-slate-400 text-sm mb-4">{error}</p>
          <button onClick={() => { setError(null); setLoading(true); videoRef.current?.load() }}
            className="px-5 py-2 bg-brand text-dark rounded-lg text-sm font-bold">Retry</button>
        </div>
      )}

      {/* Sleep expired overlay */}
      {isSleeping && (
        <div className="absolute inset-0 z-30 bg-black/90 flex flex-col items-center justify-center pointer-events-auto">
          <div className="text-5xl mb-4">😴</div>
          <p className="text-white font-bold text-lg mb-2">Sleep Timer Ended</p>
          <p className="text-slate-400 text-sm mb-5">Playback was paused automatically</p>
          <button onClick={() => { setIsSleeping(false); videoRef.current?.play() }}
            className="btn-primary px-6 py-2.5">Continue Watching</button>
        </div>
      )}

      {/* Skip animations */}
      {skipAnim && (
        <div className={`absolute top-1/2 -translate-y-1/2 pointer-events-none z-20 ${skipAnim==='back'?'left-8':'right-8'}`}>
          <div className="bg-white/20 backdrop-blur rounded-full px-4 py-2 text-white font-bold text-sm animate-ping-once">
            {skipAnim==='back'?'« 10s':'10s »'}
          </div>
        </div>
      )}

      {/* Chapter title */}
      {curChapter && showCtrl && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs font-medium px-3 py-1.5 rounded-full pointer-events-none z-10">
          {curChapter.title}
        </div>
      )}

      {/* Double-tap zones */}
      <div className="absolute inset-0 flex pointer-events-none z-10">
        <div className="flex-1 pointer-events-auto" onDoubleClick={() => skip(-10)} />
        <div className="flex-1 pointer-events-auto" onDoubleClick={() => skip(10)} />
      </div>

      {/* Auto-play next overlay */}
      {nextCountdown !== null && nextCountdown > 0 && (
        <div className="absolute bottom-20 right-4 z-30 pointer-events-auto">
          <div className="glass rounded-2xl p-4 border border-brand/30 animate-slide-up max-w-[260px]">
            <p className="text-xs text-slate-400 mb-1">Up Next</p>
            <p className="text-white font-semibold text-sm mb-3">{nextLabel || 'Next Episode'}</p>
            <div className="flex items-center gap-2">
              <button onClick={() => { onNextEpisode?.(); setNextCountdown(null) }}
                className="btn-primary flex-1 py-2 text-xs">
                Play Now
              </button>
              <button onClick={() => setNextCountdown(null)}
                className="btn-secondary px-3 py-2 text-xs">
                Cancel ({nextCountdown}s)
              </button>
            </div>
            {/* Progress ring */}
            <div className="absolute top-3 right-3 w-6 h-6">
              <svg className="w-6 h-6 -rotate-90" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
                <circle cx="12" cy="12" r="10" fill="none" stroke="#14b8a6" strokeWidth="2"
                  strokeDasharray={`${(1 - nextCountdown/10) * 62.8} 62.8`} />
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* Controls overlay */}
      <div
        className={`ctrl absolute inset-0 flex flex-col justify-end z-20 transition-opacity duration-300 ${showCtrl||!playing?'opacity-100':'opacity-0 pointer-events-none'}`}
        style={{ background: 'linear-gradient(transparent 40%, rgba(0,0,0,0.9) 100%)' }}>

        {/* Keyboard hint */}
        {showCtrl && !playing && (
          <div className="absolute top-3 right-3 text-[10px] text-white/25 hidden sm:flex gap-3">
            <span>Space=Play</span><span>←/→=10s</span><span>F=Fullscreen</span><span>P=PiP</span>
          </div>
        )}

        {/* Title */}
        {title && (
          <div className="px-4 pb-1">
            <p className="text-white/80 text-xs font-medium truncate">{title}</p>
          </div>
        )}

        {/* Seek bar with chapters */}
        <div className="relative px-4 pb-1 group/seek">
          {/* Chapter markers */}
          {chapters.length > 0 && duration > 0 && (
            <div className="absolute left-4 right-4 top-1/2 -translate-y-1/2 pointer-events-none">
              {chapters.slice(1).map((ch, i) => (
                <div key={i} className="absolute w-0.5 h-3 bg-white/40 -translate-y-1/2 top-1/2 rounded-full"
                  style={{ left: `${(ch.startTime / duration) * 100}%` }} />
              ))}
            </div>
          )}
          <div className="absolute left-4 right-4 h-1 bg-white/20 rounded-full top-1/2 -translate-y-1/2 pointer-events-none">
            <div className="h-full bg-white/30 rounded-full" style={{ width:`${bufPct}%` }} />
            <div className="absolute top-0 h-full bg-brand rounded-full" style={{ width:`${pct}%` }} />
          </div>
          <input type="range" min={0} max={duration||100} step={0.5} value={curTime}
            onChange={e => handleSeek(Number(e.target.value))}
            className="relative w-full h-1 appearance-none bg-transparent cursor-pointer z-10" />
        </div>

        {/* Bottom row */}
        <div className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 pb-3 pt-1 flex-wrap">
          {/* Play/Pause */}
          <button onClick={togglePlay} className="text-white hover:text-brand transition-colors">
            {playing
              ? <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
              : <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
            }
          </button>
          <button onClick={() => skip(-10)} className="text-white/70 hover:text-white text-xs font-bold hidden sm:block px-0.5">-10</button>
          <button onClick={() => skip(10)}  className="text-white/70 hover:text-white text-xs font-bold hidden sm:block px-0.5">+10</button>

          {/* Volume */}
          <button onClick={toggleMute} className="text-white/80 hover:text-white">
            {muted||volume===0
              ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
            }
          </button>
          <input type="range" min={0} max={1} step={0.05} value={muted?0:volume}
            onChange={e => handleVol(Number(e.target.value))}
            className="w-14 sm:w-20 h-1 appearance-none bg-white/20 rounded-full cursor-pointer hidden sm:block" />

          {/* Time */}
          <span className="text-white text-xs tabular-nums ml-1">{fmt(curTime)} / {fmt(duration)}</span>

          <div className="flex-1" />

          {/* Sleep timer */}
          <div className="ctrl hidden sm:block">
            <SleepTimer onExpire={handleSleepExpire} />
          </div>

          {/* CC */}
          {subtitles.length > 0 && (
            <button onClick={() => {
              const v = videoRef.current; if (!v) return
              const next = subIdx+1 >= subtitles.length ? -1 : subIdx+1
              setSubIdx(next)
              for (let i = 0; i < v.textTracks.length; i++) v.textTracks[i].mode = i===next?'showing':'hidden'
            }} className={`text-xs px-2 py-1 rounded border transition-colors ${subIdx>=0?'border-brand text-brand':'border-white/20 text-white/60'}`}>
              CC
            </button>
          )}

          {/* Quality */}
          <div className="relative ctrl">
            <button onClick={() => setShowQMenu(p => !p)}
              className="text-xs px-2 py-1 rounded border border-white/20 text-white/70 hover:text-white transition-colors">
              {quality}
            </button>
            {showQMenu && (
              <div className="absolute bottom-full right-0 mb-2 bg-black/95 border border-white/10 rounded-xl overflow-hidden min-w-[80px] z-50">
                {qualities.map(q => (
                  <button key={q} onClick={() => setQ(q)}
                    className={`block w-full px-4 py-2 text-xs text-left hover:bg-white/10 ${quality===q?'text-brand':'text-white'}`}>{q}</button>
                ))}
              </div>
            )}
          </div>

          {/* PiP */}
          {pipSupported && (
            <button onClick={togglePiP} title="Picture in Picture"
              className={`text-white/80 hover:text-white transition-colors ${isPiP?'text-brand':''}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="20" height="14" rx="2"/>
                <rect x="12" y="10" width="8" height="5" rx="1" fill="currentColor" stroke="none"/>
              </svg>
            </button>
          )}

          {/* Chromecast */}
          {castAvail && (
            <button title="Cast to TV" className="text-white/80 hover:text-white transition-colors">
              <google-cast-launcher />
            </button>
          )}

          {/* Fullscreen */}
          <button onClick={toggleFS} className="text-white/80 hover:text-white">
            {fullscr
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
            }
          </button>
        </div>
      </div>

      <style>{`
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:13px;height:13px;border-radius:50%;background:#14b8a6;cursor:pointer;}
        input[type=range]::-moz-range-thumb{width:13px;height:13px;border-radius:50%;background:#14b8a6;cursor:pointer;border:none;}
        @keyframes ping-once{0%{opacity:1;transform:translateY(-50%) scale(1)}100%{opacity:0;transform:translateY(-50%) scale(1.5)}}
        .animate-ping-once{animation:ping-once 0.6s ease-out forwards;}
      `}</style>
    </div>
  )
}
