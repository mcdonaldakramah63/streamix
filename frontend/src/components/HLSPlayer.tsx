// frontend/src/components/HLSPlayer.tsx — custom HLS player (Stitch "Cinema Video Player")
import { createPortal } from 'react-dom'
import { useEffect, useRef, useState, useCallback, useId, useMemo, createContext, useContext } from 'react'
import Hls, { Level, ErrorData, HlsConfig } from 'hls.js'
import Icon from './Icon'

export interface SubtitleTrack { url: string; lang: string; label: string }

export interface HLSPlayerProps {
  src:             string
  title:           string
  poster?:         string
  type?:           'movie' | 'tv'
  season?:         number
  episode?:        number
  episodeName?:    string
  subtitleTracks?: SubtitleTrack[]
  startTime?:      number
  /** Plain file (e.g. an offline MP4) instead of an HLS playlist */
  isFile?:         boolean
  onEnded?:        () => void
  onTimeUpdate?:   (seconds: number, duration: number) => void
  /** Gives the parent the <video> element (watch parties control it directly) */
  onVideo?:        (video: HTMLVideoElement | null) => void
  /** Seconds: intro to offer skipping, and where the credits start */
  markers?:        { introStart?: number | null; introEnd?: number | null; creditsStart?: number | null }
  /** Shown as "Next episode" when the credits start */
  onNext?:         () => void
  /** A watch-party guest can't control playback */
  locked?:         boolean
  /** Profile preferences: subtitle language to turn on automatically, and data usage */
  preferredSubLang?: string
  quality?:          'auto' | 'saver' | 'high'
  /** Shown on the pause screen (like Prime Video's X-Ray / Netflix's "You're watching") */
  info?:             { overview?: string; year?: string; rating?: string; cast?: string[] }
}

// ── Remembered player settings (per browser) ─────────────────────────────────
export interface SubStyle { size: number; color: string; bg: number }
interface Prefs { speed: number; volume: number; boost: number; autoSkip: boolean; sub: SubStyle }
const PREFS_KEY = 'streamix.player'
const DEFAULT_PREFS: Prefs = { speed: 1, volume: 1, boost: 1, autoSkip: false, sub: { size: 100, color: '#ffffff', bg: 0.6 } }
function loadPrefs(): Prefs {
  try { const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); return { ...DEFAULT_PREFS, ...p, sub: { ...DEFAULT_PREFS.sub, ...(p.sub || {}) } } }
  catch { return DEFAULT_PREFS }
}
function savePrefs(p: Partial<Prefs>) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify({ ...loadPrefs(), ...p })) } catch { /* private mode */ }
}

const SUB_SIZES  = [75, 100, 125, 150, 200]
const SUB_COLORS = ['#ffffff', '#ffe066', '#7df9ff', '#b7ff8a', '#ffb4aa']
const SUB_BGS    = [0, 0.3, 0.6, 1] // includes the default (0.6)
const BOOSTS     = [1, 1.5, 2, 3]

/** .srt → WebVTT (browsers only read VTT) */
function toVtt(text: string): string {
  const t = text.replace(/^\uFEFF/, '').replace(/\r/g, '')
  if (/^WEBVTT/.test(t)) return t
  return 'WEBVTT\n\n' + t.replace(/^\d+\n(?=\d{2}:\d{2})/gm, '').replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
}

const HLS_CONFIG: Partial<HlsConfig> = {
  maxBufferLength:         30,
  maxMaxBufferLength:      600,
  maxBufferSize:           60 * 1000 * 1000,
  backBufferLength:        30,
  maxBufferHole:           0.3,
  abrEwmaDefaultEstimate:  500_000,
  abrBandWidthFactor:      0.95,
  abrBandWidthUpFactor:    0.7,
  startLevel:              -1,
  fragLoadingMaxRetry:     6,
  fragLoadingRetryDelay:   1000,
  fragLoadingTimeOut:      20_000,
  manifestLoadingMaxRetry: 4,
  manifestLoadingTimeOut:  10_000,
  levelLoadingMaxRetry:    4,
  levelLoadingTimeOut:     10_000,
  enableWorker:            true,
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]

const LANG_NAME: Record<string, string> = { en: 'english', es: 'spanish', fr: 'french', de: 'german', pt: 'portuguese', it: 'italian', ja: 'japanese', ko: 'korean', zh: 'chinese', ar: 'arabic', hi: 'hindi' }

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
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60)
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}

/**
 * Where menus open, by the player's own size:
 *  • phone-sized player on the page → a bottom sheet over the page (room for big tap targets, like YouTube / Netflix)
 *  • phone-sized player in fullscreen → a sheet inside the player (the page isn't visible then)
 *  • big player → a popover above its button, never taller than the player
 */
const PlayerLayout = createContext<{ compact: boolean; fs: boolean; host: HTMLElement | null; close: () => void }>({ compact: false, fs: false, host: null, close: () => {} })
const InSheet = createContext(false)

function MenuPanel({ open, heading, children }: { open: boolean; heading: string; children: React.ReactNode }) {
  const { compact, fs, host, close } = useContext(PlayerLayout)
  // Phone-sized or short players (a phone held sideways) get sheets; big players get popovers
  const small = compact || (host ? host.clientHeight < 440 : false)
  const pageSheet = open && small && !fs
  // The page behind a sheet shouldn't scroll
  useEffect(() => {
    if (!pageSheet) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [pageSheet])
  if (!open) return null
  const header = (
    <div className="flex items-center px-5 pt-1 pb-2 flex-shrink-0">
      <p className="text-white font-bold flex-1">{heading}</p>
      <button onClick={close} aria-label="Close" className="w-10 h-10 -mr-2 rounded-full flex items-center justify-center text-ink hover:text-white active:bg-white/[0.06]"><Icon name="close" size={22} /></button>
    </div>
  )
  if (pageSheet) {
    return createPortal(
      <div className="fixed inset-0 z-[200] flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={heading} onClick={close}>
        <div className="absolute inset-0 bg-black/60 animate-fade-in" />
        <div className="relative w-full max-w-lg sm:max-w-2xl mx-auto max-h-[85dvh] phoneland:max-h-[96dvh] flex flex-col bg-dark-surface rounded-t-3xl border-t border-white/[0.06] shadow-deep animate-slide-up pb-[max(env(safe-area-inset-bottom),12px)]"
          onClick={e => e.stopPropagation()}>
          <div className="mx-auto mt-2.5 mb-1 w-10 h-1 rounded-full bg-white/20 flex-shrink-0" aria-hidden="true" />
          {header}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain [&_.sxp-menu-scroll]:max-h-none [&_.sxp-menu-scroll]:min-w-0">
            <InSheet.Provider value={true}>{children}</InSheet.Provider>
          </div>
        </div>
      </div>,
      document.body,
    )
  }
  if (small && host) {
    return createPortal(
      <div className="absolute inset-0 z-40 bg-dark-void/95 backdrop-blur-md flex flex-col animate-fade-in" role="dialog" aria-label={heading}
        onClick={e => e.stopPropagation()}>
        <div className="pt-2">{header}</div>
        <div className="flex-1 min-h-0 overflow-y-auto pb-2 [&_.sxp-menu-scroll]:max-h-none [&_.sxp-menu-scroll]:min-w-0">
          <InSheet.Provider value={true}>{children}</InSheet.Provider>
        </div>
      </div>,
      host,
    )
  }
  return (
    <div className="absolute bottom-full right-0 mb-2 min-w-[160px] overflow-y-auto overflow-x-hidden overscroll-contain glass rounded-2xl shadow-deep z-30 animate-scale-in"
      style={{ maxHeight: host ? Math.max(160, Math.min(480, host.clientHeight - 96)) : 480 }}>
      <p className="text-label-sm uppercase text-ink-faint px-3.5 pt-3 pb-1">{heading}</p>
      {children}
    </div>
  )
}

function MenuItem({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  const sheet = useContext(InSheet)
  return (
    <button onClick={onClick} aria-pressed={active}
      className={`w-full flex items-center justify-between gap-3 text-left hover:bg-white/[0.06] active:bg-white/[0.08] ${
        sheet ? 'px-5 py-3.5 phoneland:py-2.5 text-sm font-semibold' : 'px-3.5 py-2 text-xs font-semibold'} ${active ? 'text-brand-soft' : 'text-ink'}`}>
      <span className="flex-1 min-w-0 flex items-center justify-between gap-3">{children}</span>
      {sheet && <Icon name="check" size={20} className={active ? 'text-brand-soft' : 'invisible'} />}
    </button>
  )
}

/** Section label inside a menu */
function MenuLabel({ children }: { children: React.ReactNode }) {
  const sheet = useContext(InSheet)
  return <p className={`text-label-sm uppercase text-ink-faint ${sheet ? 'px-5 pt-4 pb-2 phoneland:pt-1 phoneland:pb-1.5' : 'px-3.5 pt-3 pb-1'}`}>{children}</p>
}

/** Subtitles: pick a track (or load your own), then size / colour / background with a live preview */
function SubtitleMenu({ tracks, current, style, onPick, onLoadFile, onStyle }: {
  tracks: SubtitleTrack[]; current: number; style: SubStyle
  onPick: (i: number) => void; onLoadFile: () => void; onStyle: (p: Partial<SubStyle>) => void
}) {
  const sheet = useContext(InSheet)
  const pill = (on: boolean) => `${sheet ? 'h-10 phoneland:h-8 text-xs' : 'h-8 text-[11px]'} rounded-xl font-bold transition-colors ${on ? 'bg-brand text-white' : 'bg-white/[0.06] text-ink hover:bg-white/[0.1]'}`
  const pad = sheet ? 'px-5' : 'px-3.5'
  // Older saved values (0.4, 0.75…) light up the closest choice
  const bgPick = SUB_BGS.reduce((best, o) => (Math.abs(o - style.bg) < Math.abs(best - style.bg) ? o : best), SUB_BGS[0])
  return (
    <div className={sheet ? '' : 'w-[272px]'}>
      {/* sheets on wider screens: tracks and style side by side */}
      <div className={sheet ? 'sm:grid sm:grid-cols-2 sm:gap-2' : ''}>
        <div>
          <MenuLabel>Language</MenuLabel>
          <MenuItem active={current === -1} onClick={() => onPick(-1)}>Off</MenuItem>
          {tracks.map((t, i) => (
            <MenuItem key={t.url} active={current === i} onClick={() => onPick(i)}>
              <span className="truncate">{t.label}</span>
              {t.lang && t.lang !== 'xx' && <span className="text-[10px] uppercase text-ink-faint flex-shrink-0">{t.lang}</span>}
            </MenuItem>
          ))}
          {!tracks.length && <p className={`${pad} py-1 text-xs text-ink-faint`}>No subtitles came with this video.</p>}
          <MenuItem active={false} onClick={onLoadFile}>
            <span className="flex items-center gap-2"><Icon name="upload_file" size={sheet ? 20 : 16} />Load .srt / .vtt file…</span>
          </MenuItem>
        </div>

        <div>
          <MenuLabel>Style</MenuLabel>
          {/* Live preview */}
          <div className={`${pad} pb-3 phoneland:pb-2`}>
            <div className="h-16 phoneland:h-10 rounded-xl bg-gradient-to-br from-[#2a3346] via-[#1b2130] to-[#3b2b2b] flex items-center justify-center overflow-hidden">
              <span className="px-2 py-0.5 rounded font-semibold leading-snug text-center"
                style={{ color: style.color, background: `rgba(0,0,0,${style.bg})`, fontSize: `${Math.round(14 * style.size / 100)}px` }}>
                This is how subtitles look
              </span>
            </div>
          </div>
          <p className={`${pad} text-[11px] text-ink-faint pb-1.5`}>Size</p>
          <div className={`grid grid-cols-5 gap-1.5 ${pad} pb-3 phoneland:pb-2`}>
            {SUB_SIZES.map(z => (
              <button key={z} onClick={() => onStyle({ size: z })} aria-pressed={style.size === z} className={pill(style.size === z)}>{z}%</button>
            ))}
          </div>
          <p className={`${pad} text-[11px] text-ink-faint pb-1.5`}>Colour</p>
          <div className={`flex gap-3 ${pad} pb-3 phoneland:pb-2`}>
            {SUB_COLORS.map(c => (
              <button key={c} onClick={() => onStyle({ color: c })} aria-label={`Subtitle colour ${c}`} aria-pressed={style.color === c}
                className={`${sheet ? 'w-10 h-10 phoneland:w-8 phoneland:h-8' : 'w-7 h-7'} rounded-full border-2 flex items-center justify-center transition-transform active:scale-90 ${style.color === c ? 'border-brand scale-110' : 'border-white/20'}`}
                style={{ background: c }}>
                {style.color === c && <Icon name="check" size={sheet ? 18 : 14} className="text-dark-void" />}
              </button>
            ))}
          </div>
          <p className={`${pad} text-[11px] text-ink-faint pb-1.5`}>Background</p>
          <div className={`grid grid-cols-4 gap-1.5 ${pad} pb-3`}>
            {SUB_BGS.map(o => (
              <button key={o} onClick={() => onStyle({ bg: o })} aria-pressed={bgPick === o} className={pill(bgPick === o)}>{o === 0 ? 'None' : `${Math.round(o * 100)}%`}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

type Menu = null | 'quality' | 'speed' | 'subs' | 'sleep' | 'audio' | 'tracks' | 'more'

export default function HLSPlayer({
  src, title, poster, type = 'movie', season, episode, episodeName,
  subtitleTracks = [], startTime = 0, isFile = false, onEnded, onTimeUpdate, onVideo, markers, onNext, locked = false,
  preferredSubLang = '', quality = 'auto', info,
}: HLSPlayerProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const prefs0 = useMemo(loadPrefs, [])
  const videoRef   = useRef<HTMLVideoElement>(null)
  const hlsRef     = useRef<Hls | null>(null)
  const wrapRef    = useRef<HTMLDivElement>(null)
  // The player's own size decides the layout (a 360×200 strip on a phone vs. a full-screen TV)
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    const el = wrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => { const { width, height } = e.contentRect; setCompact(width < 560 || height < 300) })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const hideTimer  = useRef<ReturnType<typeof setTimeout>>()
  const retriesRef = useRef(0)
  const cbRef      = useRef({ onEnded, onTimeUpdate })
  cbRef.current    = { onEnded, onTimeUpdate }

  const [reloadKey,    setReloadKey]    = useState(0)
  const [playing,      setPlaying]      = useState(false)
  const [muted,        setMuted]        = useState(false)
  const [volume,       setVolume]       = useState(1)
  const [currentTime,  setCurrentTime]  = useState(0)
  const [duration,     setDuration]     = useState(0)
  const [buffered,     setBuffered]     = useState(0)
  const [isFS,         setIsFS]         = useState(false)
  const [isPiP,        setIsPiP]        = useState(false)
  const [showCtrl,     setShowCtrl]     = useState(true)
  const [menu,         setMenu]         = useState<Menu>(null)
  const menuOpen = useRef(false)
  menuOpen.current = menu !== null
  const [levels,       setLevels]       = useState<Level[]>([])
  const [currentLevel, setCurrentLevel] = useState(-1)
  const [hlsLevel,     setHlsLevel]     = useState(-1)
  const [isLoading,    setIsLoading]    = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [retries,      setRetries]      = useState(0)
  const [skipFb,       setSkipFb]       = useState<string | null>(null)
  const [speed,        setSpeed]        = useState(prefs0.speed)
  const [subIdx,       setSubIdx]       = useState(-1)
  const [localSubs,    setLocalSubs]    = useState<SubtitleTrack[]>([])
  const [subStyle,     setSubStyle]     = useState<SubStyle>(prefs0.sub)
  const [boost,        setBoost]        = useState(1)
  const [autoSkip,     setAutoSkip]     = useState(prefs0.autoSkip)
  const [castOk,       setCastOk]       = useState(false)
  const [toast,        setToast]        = useState<string | null>(null)
  const audioRef = useRef<{ ctx: AudioContext; gain: GainNode } | null>(null)
  const fileRef  = useRef<HTMLInputElement>(null)
  const allSubs  = useMemo(() => [...subtitleTracks, ...localSubs], [subtitleTracks, localSubs])
  const [sleepLeft,    setSleepLeft]    = useState<number | null>(null)
  const [netSpeed,     setNetSpeed]     = useState<number | null>(null)
  const [audioTracks,  setAudioTracks]  = useState<{ name: string; lang: string }[]>([])
  const [audioIdx,     setAudioIdx]     = useState(0)
  const [pausedLong,   setPausedLong]   = useState(false)

  useEffect(() => {
    const v = videoRef.current
    if (v) v.volume = prefs0.volume
    onVideo?.(v)
    return () => onVideo?.(null)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load source ────────────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return
    setError(null); setIsLoading(true); setLevels([]); setCurrentLevel(-1); setHlsLevel(-1)
    retriesRef.current = 0; setRetries(0)

    const seekStart = () => { if (startTime > 5 && (!video.duration || startTime < video.duration - 10)) video.currentTime = startTime }

    if (isFile || (!Hls.isSupported() && video.canPlayType('application/vnd.apple.mpegurl'))) {
      video.src = src
      video.addEventListener('loadedmetadata', seekStart, { once: true })
      video.play().catch(() => {})
      return () => { video.removeAttribute('src'); video.load() }
    }
    if (!Hls.isSupported()) { setError('HLS playback is not supported in this browser.'); setIsLoading(false); return }

    const hls = new Hls(HLS_CONFIG)
    hlsRef.current = hls
    hls.loadSource(src)
    hls.attachMedia(video)

    hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
      setLevels(data.levels)
      // Data usage preference: cap at ~480p to save data, or start at the best level
      const sd = data.levels.reduce((best: number, l: Level, i: number) => (l.height && l.height <= 480 ? i : best), -1)
      if (quality === 'saver' && sd >= 0) hls.autoLevelCapping = sd
      if (quality === 'high' && data.levels.length) hls.nextLevel = data.levels.length - 1
      setIsLoading(false)
      seekStart()
      video.play().catch(() => {})
    })
    hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => setHlsLevel(data.level))
    // Alternate audio (other languages / descriptive audio) when the stream has it
    hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_e, data) => {
      setAudioTracks(data.audioTracks.map(t => ({ name: t.name || t.lang || 'Audio', lang: t.lang || '' })))
      setAudioIdx(hls.audioTrack)
    })
    hls.on(Hls.Events.FRAG_LOADED, (_e, data) => {
      const st = data.frag.stats
      const ms = st.loading.end - st.loading.start
      if (ms > 0 && st.total) setNetSpeed(Math.round((st.total * 8) / (ms / 1000) / 1000))
    })
    hls.on(Hls.Events.ERROR, (_e: string, data: ErrorData) => {
      if (!data.fatal) return
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        if (retriesRef.current < 5) {
          retriesRef.current++; setRetries(retriesRef.current)
          setTimeout(() => hls.startLoad(), 1000 * retriesRef.current)
        } else setError('Network error — the stream stopped responding.')
      } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        hls.recoverMediaError()
      } else setError('Playback error.')
    })

    return () => { hls.destroy(); hlsRef.current = null }
  }, [src, isFile, reloadKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Video element events ───────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const handlers: Record<string, () => void> = {
      play:           () => setPlaying(true),
      pause:          () => setPlaying(false),
      waiting:        () => setIsLoading(true),
      playing:        () => setIsLoading(false),
      canplay:        () => setIsLoading(false),
      durationchange: () => setDuration(video.duration || 0),
      volumechange:   () => { setVolume(video.volume); setMuted(video.muted); savePrefs({ volume: video.volume }) },
      ended:          () => { setPlaying(false); cbRef.current.onEnded?.() },
      enterpictureinpicture: () => setIsPiP(true),
      leavepictureinpicture: () => setIsPiP(false),
      error:          () => { if (isFile) setError('This file could not be played.') },
      timeupdate:     () => {
        const t = video.currentTime, d = video.duration || 0
        setCurrentTime(t)
        if (video.buffered.length) setBuffered(video.buffered.end(video.buffered.length - 1))
        cbRef.current.onTimeUpdate?.(t, d)
      },
    }
    Object.entries(handlers).forEach(([ev, fn]) => video.addEventListener(ev, fn))
    const fsHandler = () => setIsFS(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', fsHandler)
    return () => {
      Object.entries(handlers).forEach(([ev, fn]) => video.removeEventListener(ev, fn))
      document.removeEventListener('fullscreenchange', fsHandler)
    }
  }, [isFile])

  // ── Media Session (lock screen controls) ───────────────────────────────────
  useEffect(() => {
    if (!('mediaSession' in navigator) || !videoRef.current) return
    const v = videoRef.current
    navigator.mediaSession.metadata = new MediaMetadata({
      title, artist: type === 'tv' && season ? `S${season} · E${episode}` : 'Streamix',
      album: episodeName || title,
      artwork: poster ? [{ src: poster, sizes: '342x513', type: 'image/jpeg' }] : [],
    })
    navigator.mediaSession.setActionHandler('play',         () => v.play())
    navigator.mediaSession.setActionHandler('pause',        () => v.pause())
    navigator.mediaSession.setActionHandler('seekbackward', () => { v.currentTime = Math.max(0, v.currentTime - 10) })
    navigator.mediaSession.setActionHandler('seekforward',  () => { v.currentTime = Math.min(v.currentTime + 10, v.duration || 0) })
  }, [title, type, season, episode, episodeName, poster])

  // ── Subtitles ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    Array.from(video.querySelectorAll('track')).forEach(t => t.remove())
    allSubs.forEach(s => {
      const track = document.createElement('track')
      track.src = s.url; track.kind = 'subtitles'; track.label = s.label; track.srclang = s.lang
      video.appendChild(track)
    })
    // Newly loaded file → show it; otherwise the profile's preferred language, if the video has it
    const pref = preferredSubLang ? allSubs.findIndex(t => t.lang.toLowerCase().startsWith(preferredSubLang) || t.label.toLowerCase().startsWith(LANG_NAME[preferredSubLang] || '~')) : -1
    setSubIdx(localSubs.length ? allSubs.length - 1 : pref)
  }, [allSubs]) // eslint-disable-line react-hooks/exhaustive-deps

  // Pause screen after a few seconds paused (title, synopsis, cast)
  useEffect(() => {
    if (playing || !info || error || isLoading) { setPausedLong(false); return }
    const t = setTimeout(() => setPausedLong(true), 5000)
    return () => clearTimeout(t)
  }, [playing, info, error, isLoading])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    Array.from(video.textTracks).forEach((t, i) => { t.mode = i === subIdx ? 'showing' : 'disabled' })
  }, [subIdx, allSubs])

  // Uploaded subtitle files live only in this tab
  useEffect(() => () => localSubs.forEach(s => URL.revokeObjectURL(s.url)), [localSubs])
  const loadSubFile = async (file: File) => {
    if (file.size > 3 * 1024 * 1024) { flash('Subtitle file is too big'); return }
    const vtt = toVtt(await file.text())
    const url = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }))
    setLocalSubs(l => [...l, { url, lang: 'xx', label: file.name.replace(/\.(srt|vtt)$/i, '').slice(0, 30) || 'My subtitles' }])
    setMenu(null)
  }
  const updateSubStyle = (p: Partial<SubStyle>) => setSubStyle(s => { const n = { ...s, ...p }; savePrefs({ sub: n }); return n })

  useEffect(() => { if (videoRef.current) videoRef.current.playbackRate = speed; savePrefs({ speed }) }, [speed])

  // ── Volume boost (Web Audio) — only for same-origin media, otherwise the browser would mute it ──
  const canBoost = typeof AudioContext !== 'undefined' && (src.startsWith('/') || src.startsWith('blob:') || src.startsWith(location.origin))
  const applyBoost = (b: number) => {
    const v = videoRef.current
    if (!v || !canBoost) return
    try {
      if (!audioRef.current && b > 1) {
        const ctx = new AudioContext()
        const gain = ctx.createGain()
        ctx.createMediaElementSource(v).connect(gain).connect(ctx.destination)
        audioRef.current = { ctx, gain }
      }
      if (audioRef.current) { audioRef.current.gain.gain.value = b; audioRef.current.ctx.resume().catch(() => {}) }
      setBoost(b); savePrefs({ boost: b })
    } catch { flash("Volume boost isn't available for this video") }
  }
  useEffect(() => () => { audioRef.current?.ctx.close().catch(() => {}) }, [])

  // ── Casting (Chromecast / AirPlay through the browser) ─────────────────────
  useEffect(() => {
    const v = videoRef.current as any
    if (!v) return
    if (v.webkitShowPlaybackTargetPicker) { setCastOk(true); return }
    if (!v.remote?.watchAvailability) return
    let id: number | undefined
    v.remote.watchAvailability((ok: boolean) => setCastOk(ok)).then((n: number) => { id = n }).catch(() => setCastOk(false))
    return () => { if (id !== undefined) v.remote.cancelWatchAvailability(id).catch(() => {}) }
  }, [src])
  const cast = async () => {
    const v = videoRef.current as any
    try {
      if (v?.webkitShowPlaybackTargetPicker) v.webkitShowPlaybackTargetPicker()
      else await v?.remote?.prompt()
    } catch (e: any) {
      flash(e?.name === 'NotSupportedError' ? "This stream can't be cast — try a downloaded or library video" : 'No cast device found')
    }
  }

  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(null), 2600) }

  // ── Skip intro / credits ───────────────────────────────────────────────────
  const introEnd = markers?.introEnd ?? null
  const inIntro = introEnd != null && currentTime >= (markers?.introStart ?? 0) && currentTime < introEnd - 1
  const inCredits = markers?.creditsStart != null && currentTime >= markers.creditsStart && duration > 0 && currentTime < duration - 1
  const skippedFor = useRef<number | null>(null)
  useEffect(() => {
    if (inIntro && autoSkip && !locked && skippedFor.current !== introEnd && videoRef.current) {
      skippedFor.current = introEnd
      videoRef.current.currentTime = introEnd!
      flash('Skipped intro')
    }
  }, [inIntro, autoSkip, introEnd, locked])

  // ── Sleep timer ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (sleepLeft === null) return
    if (sleepLeft <= 0) { videoRef.current?.pause(); setSleepLeft(null); return }
    const t = setTimeout(() => setSleepLeft(s => (s === null ? null : s - 1)), 1000)
    return () => clearTimeout(t)
  }, [sleepLeft])

  // ── Controls visibility ────────────────────────────────────────────────────
  const poke = useCallback(() => {
    setShowCtrl(true)
    clearTimeout(hideTimer.current)
    // Auto-hide while playing — but never while a menu is open (someone is still choosing)
    hideTimer.current = setTimeout(() => { if (!videoRef.current?.paused && !menuOpen.current) setShowCtrl(false) }, 3000)
  }, [])
  useEffect(() => () => clearTimeout(hideTimer.current), [])
  useEffect(() => { if (menu === null) poke() }, [menu, poke])

  // Were the controls already up before this tap? touchstart / mousemove turn them on just before the click
  // arrives, so "up" means up for a moment (0.4 s), not merely visible now
  const visibleNow = useRef(false)
  const shownAt = useRef(0)
  // Start the auto-hide countdown as soon as playback starts, not only after the first touch
  useEffect(() => { if (playing) poke() }, [playing, poke])

  // ── Actions ────────────────────────────────────────────────────────────────
  const lockedMsg = () => { flash('The party host controls playback'); poke() }
  // Phones: double-tap the left/right side to skip 10 s (single tap still plays/pauses)
  const lastTap = useRef<{ t: number; x: number } | null>(null)
  const tapTimer = useRef<ReturnType<typeof setTimeout>>()
  const onVideoTap = (e: React.MouseEvent<HTMLVideoElement>) => {
    const coarse = window.matchMedia('(pointer: coarse)').matches
    if (!coarse) return togglePlay()
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const now = Date.now()
    if (lastTap.current && now - lastTap.current.t < 300) {
      clearTimeout(tapTimer.current); lastTap.current = null
      if (x < 0.4) return skip(-10)
      if (x > 0.6) return skip(10)
      return togglePlay()
    }
    const wasUp = visibleNow.current && now - shownAt.current > 400
    lastTap.current = { t: now, x }
    clearTimeout(tapTimer.current)
    // Single tap: show the controls, or hide them if they were already up (like YouTube / Netflix on phones)
    tapTimer.current = setTimeout(() => {
      lastTap.current = null
      if (wasUp && !videoRef.current?.paused) { clearTimeout(hideTimer.current); setShowCtrl(false); setMenu(null) }
      else poke()
    }, 300)
  }

  const togglePlay = () => { if (locked) return lockedMsg(); const v = videoRef.current; if (!v) return; v.paused ? v.play().catch(() => {}) : v.pause(); poke() }
  const skip = (n: number) => {
    if (locked) return lockedMsg()
    const v = videoRef.current; if (!v) return
    v.currentTime = Math.max(0, Math.min(v.currentTime + n, v.duration || 0))
    setSkipFb(n > 0 ? `+${n}s` : `${n}s`); setTimeout(() => setSkipFb(null), 700); poke()
  }
  const seekTo     = (pct: number) => { if (locked) return lockedMsg(); const v = videoRef.current; if (v?.duration) v.currentTime = Math.max(0, Math.min(1, pct)) * v.duration }
  const setVol     = (n: number) => { const v = videoRef.current; if (v) { v.volume = Math.max(0, Math.min(1, n)); if (n > 0) v.muted = false } }
  const toggleMute = () => { const v = videoRef.current; if (v) v.muted = !v.muted }
  const toggleFS   = async () => {
    try {
      if (document.fullscreenElement) { await document.exitFullscreen(); (screen.orientation as any)?.unlock?.(); return }
      const el = wrapRef.current as any
      if (el?.requestFullscreen) {
        await el.requestFullscreen()
        // Phones: watch sideways (Android Chrome allows this once fullscreen)
        if (window.matchMedia('(pointer: coarse)').matches) await (screen.orientation as any)?.lock?.('landscape').catch?.(() => {})
      } else if ((videoRef.current as any)?.webkitEnterFullscreen) {
        (videoRef.current as any).webkitEnterFullscreen() // iPhone Safari: only the video element can go fullscreen
      }
    } catch { /* unsupported */ }
  }
  const togglePiP  = async () => { try { document.pictureInPictureElement ? await document.exitPictureInPicture() : await videoRef.current?.requestPictureInPicture() } catch { /* unsupported */ } }
  const setQuality = (lvl: number) => { if (hlsRef.current) hlsRef.current.currentLevel = lvl; setCurrentLevel(lvl); setMenu(null) }

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  const keyRef = useRef<(e: KeyboardEvent) => void>()
  keyRef.current = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return
    const v = videoRef.current
    switch (e.key) {
      case ' ': case 'k': e.preventDefault(); togglePlay(); break
      case 'ArrowLeft': case 'j': e.preventDefault(); skip(-10); break
      case 'ArrowRight': e.preventDefault(); skip(10); break
      case 'l': skip(30); break
      case 'ArrowUp':   e.preventDefault(); setVol((v?.volume ?? 1) + 0.1); break
      case 'ArrowDown': e.preventDefault(); setVol((v?.volume ?? 1) - 0.1); break
      case 'Escape': if (menu) { e.preventDefault(); setMenu(null) } break
      case 'm': toggleMute(); break
      case 'f': toggleFS(); break
      case 'p': togglePiP(); break
      case '>': setSpeed(s => SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(s) + 1)]); break
      case '<': setSpeed(s => SPEEDS[Math.max(0, SPEEDS.indexOf(s) - 1)]); break
    }
  }
  useEffect(() => {
    const fn = (e: KeyboardEvent) => keyRef.current?.(e)
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [])

  const pct    = duration > 0 ? (currentTime / duration) * 100 : 0
  const bufPct = duration > 0 ? (buffered / duration) * 100 : 0
  const qlabel = currentLevel === -1
    ? (hlsLevel >= 0 && levels[hlsLevel] ? `Auto · ${qualityLabel(levels[hlsLevel])}` : 'Auto')
    : (levels[currentLevel] ? qualityLabel(levels[currentLevel]) : 'Auto')
  const visible = showCtrl || !playing
  if (visible && !visibleNow.current) shownAt.current = Date.now()
  visibleNow.current = visible

  // Subtitles step up above the controls while they're showing, and back down when they hide (like YouTube)
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const track = Array.from(v.textTracks).find(t => t.mode === 'showing')
    if (!track) return
    const place = () => Array.from(track.cues || []).forEach(c => { (c as VTTCue).line = visible ? (compact ? -3 : -5) : 'auto' })
    place()
    track.addEventListener('cuechange', place)
    return () => track.removeEventListener('cuechange', place)
  }, [visible, compact, subIdx, allSubs])

  // Seek bar: tap or drag (pointer events cover mouse, touch and pen)
  const scrubbing = useRef(false)
  const [scrubPct, setScrubPct] = useState<number | null>(null)
  const barPct = (e: React.PointerEvent<HTMLDivElement>) => { const r = e.currentTarget.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) }
  const onBarDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (locked) return lockedMsg()
    scrubbing.current = true
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setScrubPct(barPct(e)); poke()
  }
  const onBarMove = (e: React.PointerEvent<HTMLDivElement>) => { if (scrubbing.current) { setScrubPct(barPct(e)); poke() } }
  const onBarUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubbing.current) return
    scrubbing.current = false
    seekTo(barPct(e)); setScrubPct(null)
  }

  const puck = `${compact ? 'w-9 h-9' : 'w-10 h-10'} rounded-full bg-dark-border/70 backdrop-blur-md flex items-center justify-center text-ink hover:text-white active:scale-95 transition-all flex-shrink-0`
  const layout = { compact, fs: isFS, host: wrapRef.current, close: () => setMenu(null) }

  return (
    <PlayerLayout.Provider value={layout}>
    <div ref={wrapRef} className={`sxp-${uid} relative w-full bg-black overflow-hidden select-none group/player`} style={{ aspectRatio: '16/9' }}
      onMouseMove={poke} onTouchStart={poke} onMouseLeave={() => playing && setShowCtrl(false)}
      role="region" aria-label={`Video player: ${title}`}>
      <video ref={videoRef} className="w-full h-full object-contain" poster={poster} playsInline preload="auto" onClick={onVideoTap} x-webkit-airplay="allow" />
      {pausedLong && info && !compact && (
        <div className="absolute inset-0 z-[15] bg-gradient-to-r from-dark-void/95 via-dark-void/70 to-transparent flex items-center pointer-events-none animate-fade-in">
          <div className="max-w-lg px-6 sm:px-12">
            <p className="text-ink-faint text-xs uppercase tracking-widest mb-2">You're watching</p>
            <p className="text-white text-2xl sm:text-4xl font-black leading-tight">{title}</p>
            {type === 'tv' && season != null && <p className="text-ink text-sm mt-1">S{season}:E{episode}{episodeName ? ` · ${episodeName}` : ''}</p>}
            <p className="text-ink-muted text-xs mt-2 flex gap-2">{info.year && <span>{info.year}</span>}{info.rating && <span className="px-1.5 border border-white/40 rounded text-white/90">{info.rating}</span>}</p>
            {info.overview && <p className="text-ink text-sm mt-3 line-clamp-4 hidden sm:block">{info.overview}</p>}
            {!!info.cast?.length && <p className="text-ink-faint text-xs mt-3 hidden sm:block"><span className="text-ink-muted">Cast:</span> {info.cast.slice(0, 6).join(', ')}</p>}
          </div>
        </div>
      )}
      <style>{`.sxp-${uid} video::cue { font-size: ${subStyle.size}%; color: ${subStyle.color}; background-color: rgba(0,0,0,${subStyle.bg}); line-height: 1.35; }`}</style>
      <input ref={fileRef} type="file" accept=".srt,.vtt,text/vtt" className="hidden" aria-hidden="true" tabIndex={-1}
        onChange={e => { const f = e.target.files?.[0]; if (f) loadSubFile(f); e.target.value = '' }} />

      {toast && <div role="status" className="absolute top-6 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-full glass text-white text-sm font-semibold">{toast}</div>}

      {(inIntro || (inCredits && onNext)) && !error && !locked && (
        <div className={`absolute z-30 flex gap-2 ${compact ? 'right-2 bottom-12 [&>button]:px-3 [&>button]:py-1.5 [&>button]:text-xs' : 'right-4 sm:right-6 bottom-28 sm:bottom-32'}`}>
          {inIntro && (
            <button onClick={() => { if (videoRef.current && introEnd) videoRef.current.currentTime = introEnd }}
              className="px-5 py-2.5 rounded-xl bg-white text-dark-void text-sm font-extrabold shadow-deep hover:scale-105 active:scale-95 transition-transform flex items-center gap-1.5">
              <Icon name="fast_forward" size={20} fill /> Skip intro
            </button>
          )}
          {inCredits && onNext && (
            <button onClick={onNext}
              className="px-5 py-2.5 rounded-xl bg-white text-dark-void text-sm font-extrabold shadow-deep hover:scale-105 active:scale-95 transition-transform flex items-center gap-1.5">
              <Icon name="skip_next" size={20} fill /> Next episode
            </button>
          )}
        </div>
      )}

      {isLoading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 z-10 pointer-events-none">
          <div className="w-12 h-12 border-2 border-white/15 border-t-brand rounded-full animate-spin" role="status" aria-label="Loading" />
          {retries > 0 && <p className="text-white/50 text-xs mt-2">Reconnecting… {retries}/5</p>}
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-dark-void/90 z-30 px-6 text-center">
          <div className="w-16 h-16 rounded-full bg-brand/15 flex items-center justify-center text-brand mb-4"><Icon name="error" size={34} /></div>
          <p className="text-white font-bold mb-1">Playback interrupted</p>
          <p className="text-ink-muted text-sm mb-5">{error}</p>
          <button className="btn-primary" onClick={() => setReloadKey(k => k + 1)}><Icon name="refresh" size={20} /> Try again</button>
        </div>
      )}

      {skipFb && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 pointer-events-none px-4 py-1.5 rounded-full glass text-white font-bold">{skipFb}</div>
      )}

      {/* HUD */}
      <div className={`absolute inset-0 z-20 flex flex-col justify-between transition-opacity duration-300 pointer-events-none ${visible ? 'opacity-100' : 'opacity-0'}`}
        style={{ background: 'linear-gradient(to top, rgba(10,14,23,0.92) 0%, transparent 38%, transparent 70%, rgba(10,14,23,0.6) 100%)' }}>
        {/* Top badges */}
        <div className={`flex items-center justify-end gap-2 ${compact ? 'p-2 [&>*:not(:first-child)]:hidden' : 'p-3'}`}>
          {locked && <span className="tech-pill text-gold"><Icon name="groups" size={12} className="mr-1" />Host controls</span>}
          {boost > 1 && <span className="tech-pill text-gold">Boost {Math.round(boost * 100)}%</span>}
          {speed !== 1 && <span className="tech-pill text-brand-soft">{speed}×</span>}
          {sleepLeft !== null && <span className="tech-pill"><Icon name="bedtime" size={12} className="mr-1" />{fmt(sleepLeft)}</span>}
          {netSpeed !== null && <span className="tech-pill text-cyan hidden sm:inline-flex">{netSpeed > 999 ? `${(netSpeed / 1000).toFixed(1)} Mbps` : `${netSpeed} kbps`}</span>}
        </div>

        {/* Center: rewind / play / forward */}
        <div className={`flex items-center justify-center ${compact ? 'gap-6' : 'gap-8 sm:gap-12'} `}>
          <button onClick={() => skip(-10)} aria-label="Rewind 10 seconds" className={`${compact ? 'hidden' : 'flex'} ${visible ? 'pointer-events-auto' : ''} w-12 h-12 rounded-full bg-dark-border/60 backdrop-blur-md items-center justify-center text-ink hover:text-white active:scale-90 transition-all`}>
            <Icon name="replay_10" size={26} />
          </button>
          <button onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}
            className={`${compact ? 'w-12 h-12' : 'w-16 h-16 sm:w-20 sm:h-20'} ${visible ? 'pointer-events-auto' : ''} rounded-full bg-brand text-white flex items-center justify-center shadow-[0_0_30px_rgba(229,9,20,0.5)] hover:scale-105 active:scale-95 transition-all`}>
            <Icon name={playing ? 'pause' : 'play_arrow'} size={compact ? 30 : 40} fill />
          </button>
          <button onClick={() => skip(10)} aria-label="Forward 10 seconds" className={`${compact ? 'hidden' : 'flex'} ${visible ? 'pointer-events-auto' : ''} w-12 h-12 rounded-full bg-dark-border/60 backdrop-blur-md items-center justify-center text-ink hover:text-white active:scale-90 transition-all`}>
            <Icon name="forward_10" size={26} />
          </button>
        </div>

        {/* Bottom cluster */}
        <div className={`${compact ? 'px-2 pb-1.5' : 'px-3 sm:px-5 pb-3 sm:pb-4'} ${visible ? 'pointer-events-auto' : ''}`}>
          <div className={compact ? 'flex items-center gap-2' : ''}>
          {compact && <span className="text-[10px] font-mono text-ink w-11 text-right flex-shrink-0">{fmt(scrubPct != null ? scrubPct * duration : currentTime)}</span>}
          <div className={`relative ${compact ? 'h-8' : 'h-6'} flex-1 flex items-center cursor-pointer group/bar touch-none`} role="slider" aria-label="Seek"
            aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(currentTime)} tabIndex={0}
            onPointerDown={onBarDown} onPointerMove={onBarMove} onPointerUp={onBarUp} onPointerCancel={() => { scrubbing.current = false; setScrubPct(null) }}>
            <div className="absolute inset-x-0 h-1 rounded-full bg-white/15 overflow-hidden group-hover/bar:h-1.5 transition-all">
              <div className="h-full bg-white/35" style={{ width: `${bufPct}%` }} />
            </div>
            <div className={`relative h-1 group-hover/bar:h-1.5 bg-brand rounded-full shadow-[0_0_12px_#e50914] ${scrubPct != null ? '' : 'transition-all'}`} style={{ width: `${scrubPct != null ? scrubPct * 100 : pct}%` }}>
              <span className={`absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-[0_0_10px_#e50914] transition-transform ${compact || scrubPct != null ? 'scale-100' : 'scale-0 group-hover/bar:scale-100'}`} />
            </div>
          </div>
          {compact && <span className="text-[10px] font-mono text-ink-muted w-12 flex-shrink-0">-{fmt(Math.max(0, duration - currentTime))}</span>}
          </div>
          {!compact && (
            <div className="flex justify-between text-tech-pill font-mono text-ink-muted mt-1 mb-2">
              <span className="text-ink">{fmt(currentTime)}</span>
              <span>-{fmt(Math.max(0, duration - currentTime))}</span>
            </div>
          )}

          <div className={`flex items-center ${compact ? 'gap-1' : 'gap-1.5 sm:gap-2'}`}>
            <div className="hidden sm:flex items-center gap-1">
              <button onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'} className={puck}>
                <Icon name={muted || volume === 0 ? 'volume_off' : volume < 0.5 ? 'volume_down' : 'volume_up'} size={20} />
              </button>
              <input type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume} aria-label="Volume"
                onChange={e => setVol(Number(e.target.value))} className="w-20 accent-[#e50914] cursor-pointer" />
            </div>

            <div className={`flex-1 min-w-0 px-1 ${compact ? 'invisible' : ''}`}>
              <p className="text-white text-xs sm:text-sm font-bold truncate">{title}</p>
              {type === 'tv' && season != null && (
                <p className="text-ink-faint text-[11px] truncate">S{season}:E{episode}{episodeName ? ` • ${episodeName}` : ''}</p>
              )}
            </div>

            <div className="relative">
              <button onClick={() => setMenu(m => (m === 'subs' ? null : 'subs'))} aria-label="Subtitles" aria-expanded={menu === 'subs'}
                className={`${puck} ${subIdx >= 0 ? '!text-brand' : ''}`}><Icon name="closed_caption" size={20} fill={subIdx >= 0} /></button>
              <MenuPanel open={menu === 'subs'} heading="Subtitles">
                <SubtitleMenu tracks={allSubs} current={subIdx} style={subStyle}
                  onPick={i => { setSubIdx(i); setMenu(null) }}
                  onLoadFile={() => fileRef.current?.click()}
                  onStyle={updateSubStyle} />
              </MenuPanel>
            </div>

            {canBoost && !compact && (
              <div className="relative">
                <button onClick={() => setMenu(m => (m === 'audio' ? null : 'audio'))} aria-label="Volume boost" aria-expanded={menu === 'audio'}
                  className={`${puck} ${boost > 1 ? '!text-gold' : ''}`}><Icon name="graphic_eq" size={20} /></button>
                <MenuPanel open={menu === 'audio'} heading="Volume boost">
                  {BOOSTS.map(b => <MenuItem key={b} active={boost === b} onClick={() => { applyBoost(b); setMenu(null) }}>{b === 1 ? 'Off' : `${Math.round(b * 100)}%`}</MenuItem>)}
                </MenuPanel>
              </div>
            )}

            <div className="relative">
              <button onClick={() => setMenu(m => (m === 'speed' ? null : 'speed'))} aria-label="Playback speed" aria-expanded={menu === 'speed'}
                className={`${puck} text-[11px] font-extrabold w-auto px-3`}>{speed}×</button>
              <MenuPanel open={menu === 'speed'} heading="Speed">
                {SPEEDS.map(s => <MenuItem key={s} active={speed === s} onClick={() => { setSpeed(s); setMenu(null) }}>{s}×{s === 1 && <span className="text-ink-faint">Normal</span>}</MenuItem>)}
              </MenuPanel>
            </div>

            {audioTracks.length > 1 && !compact && (
              <div className="relative">
                <button onClick={() => setMenu(m => (m === 'tracks' ? null : 'tracks'))} aria-label="Audio language" aria-expanded={menu === 'tracks'} className={puck}>
                  <Icon name="translate" size={20} />
                </button>
                <MenuPanel open={menu === 'tracks'} heading="Audio">
                  {audioTracks.map((t, i) => (
                    <MenuItem key={i} active={audioIdx === i} onClick={() => { if (hlsRef.current) hlsRef.current.audioTrack = i; setAudioIdx(i); setMenu(null) }}>
                      {t.name}{t.lang && <span className="text-ink-faint uppercase">{t.lang}</span>}
                    </MenuItem>
                  ))}
                </MenuPanel>
              </div>
            )}

            {levels.length > 0 && !compact && (
              <div className="relative">
                <button onClick={() => setMenu(m => (m === 'quality' ? null : 'quality'))} aria-label="Quality" aria-expanded={menu === 'quality'}
                  className={`${puck} w-auto px-3 gap-1 text-[11px] font-extrabold`}>
                  <Icon name="hd" size={18} /><span className="hidden sm:inline">{qlabel}</span>
                </button>
                <MenuPanel open={menu === 'quality'} heading="Quality">
                  <MenuItem active={currentLevel === -1} onClick={() => setQuality(-1)}>
                    Auto{currentLevel === -1 && hlsLevel >= 0 && levels[hlsLevel] && <span className="text-ink-faint">{qualityLabel(levels[hlsLevel])}</span>}
                  </MenuItem>
                  {levels.map((lvl, idx) => ({ lvl, idx })).reverse().map(({ lvl, idx }) => (
                    <MenuItem key={idx} active={currentLevel === idx} onClick={() => setQuality(idx)}>
                      {qualityLabel(lvl)}<span className="text-ink-faint">{Math.round((lvl.bitrate || 0) / 1000)}k</span>
                    </MenuItem>
                  ))}
                </MenuPanel>
              </div>
            )}

            {!compact && <div className="relative">
              <button onClick={() => setMenu(m => (m === 'sleep' ? null : 'sleep'))} aria-label="Sleep timer" aria-expanded={menu === 'sleep'}
                className={`${puck} ${sleepLeft !== null ? '!text-brand' : ''}`}><Icon name="bedtime" size={20} /></button>
              <MenuPanel open={menu === 'sleep'} heading="Sleep timer">
                {sleepLeft !== null && <MenuItem active={false} onClick={() => { setSleepLeft(null); setMenu(null) }}>Cancel timer</MenuItem>}
                {[15, 30, 45, 60].map(m => <MenuItem key={m} active={false} onClick={() => { setSleepLeft(m * 60); setMenu(null) }}>{m} minutes</MenuItem>)}
                {duration > 0 && <MenuItem active={false} onClick={() => { setSleepLeft(Math.ceil(duration - currentTime)); setMenu(null) }}>End of {type === 'tv' ? 'episode' : 'movie'}</MenuItem>}
                {introEnd != null && (
                  <MenuItem active={autoSkip} onClick={() => { setAutoSkip(a => { savePrefs({ autoSkip: !a }); return !a }) }}>
                    Always skip intros<span>{autoSkip ? 'On' : 'Off'}</span>
                  </MenuItem>
                )}
              </MenuPanel>
            </div>}

            {/* Small player: everything else under "More" */}
            {compact && (
              <div className="relative">
                <button onClick={() => setMenu(m => (m === 'more' ? null : 'more'))} aria-label="More options" aria-expanded={menu === 'more'} className={puck}>
                  <Icon name="more_vert" size={20} />
                </button>
                <MenuPanel open={menu === 'more'} heading="More">
                  {levels.length > 0 && <>
                    <p className="text-label-sm uppercase text-ink-faint px-3.5 pt-2 pb-1">Quality</p>
                    <MenuItem active={currentLevel === -1} onClick={() => setQuality(-1)}>Auto</MenuItem>
                    {levels.map((lvl, idx) => ({ lvl, idx })).reverse().map(({ lvl, idx }) => (
                      <MenuItem key={idx} active={currentLevel === idx} onClick={() => setQuality(idx)}>{qualityLabel(lvl)}</MenuItem>
                    ))}
                  </>}
                  {audioTracks.length > 1 && <>
                    <p className="text-label-sm uppercase text-ink-faint px-3.5 pt-3 pb-1">Audio</p>
                    {audioTracks.map((t, i) => (
                      <MenuItem key={i} active={audioIdx === i} onClick={() => { if (hlsRef.current) hlsRef.current.audioTrack = i; setAudioIdx(i); setMenu(null) }}>{t.name}</MenuItem>
                    ))}
                  </>}
                  {canBoost && <>
                    <p className="text-label-sm uppercase text-ink-faint px-3.5 pt-3 pb-1">Volume boost</p>
                    <div className="flex gap-1 px-3 pb-1">
                      {BOOSTS.map(b => (
                        <button key={b} onClick={() => applyBoost(b)} aria-pressed={boost === b}
                          className={`flex-1 h-9 rounded-lg text-[11px] font-bold ${boost === b ? 'bg-brand text-white' : 'bg-white/[0.06] text-ink'}`}>{b === 1 ? 'Off' : `${Math.round(b * 100)}%`}</button>
                      ))}
                    </div>
                  </>}
                  <p className="text-label-sm uppercase text-ink-faint px-3.5 pt-3 pb-1">Sleep timer</p>
                  {sleepLeft !== null && <MenuItem active={false} onClick={() => { setSleepLeft(null); setMenu(null) }}>Cancel timer ({fmt(sleepLeft)})</MenuItem>}
                  <div className="flex gap-1 px-3 pb-1">
                    {[15, 30, 45, 60].map(m => (
                      <button key={m} onClick={() => { setSleepLeft(m * 60); setMenu(null) }} className="flex-1 h-9 rounded-lg text-[11px] font-bold bg-white/[0.06] text-ink">{m}m</button>
                    ))}
                  </div>
                  {introEnd != null && (
                    <MenuItem active={autoSkip} onClick={() => { setAutoSkip(a => { savePrefs({ autoSkip: !a }); return !a }) }}>
                      Always skip intros<span>{autoSkip ? 'On' : 'Off'}</span>
                    </MenuItem>
                  )}
                  {document.pictureInPictureEnabled && (
                    <MenuItem active={isPiP} onClick={() => { togglePiP(); setMenu(null) }}>Picture in picture</MenuItem>
                  )}
                </MenuPanel>
              </div>
            )}

            {castOk && (
              <button onClick={cast} aria-label="Cast to a TV" className={puck}><Icon name="cast" size={20} /></button>
            )}
            {document.pictureInPictureEnabled && (
              <button onClick={togglePiP} aria-label="Picture in picture" className={`${puck} hidden sm:flex ${isPiP ? '!text-brand' : ''}`}>
                <Icon name="picture_in_picture_alt" size={20} />
              </button>
            )}
            <button onClick={toggleFS} aria-label={isFS ? 'Exit fullscreen' : 'Fullscreen'} className={puck}>
              <Icon name={isFS ? 'fullscreen_exit' : 'fullscreen'} size={22} />
            </button>
          </div>
        </div>
      </div>
    </div>
    </PlayerLayout.Provider>
  )
}
