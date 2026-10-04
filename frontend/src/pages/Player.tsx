// frontend/src/pages/Player.tsx
// Anime (Japanese animation, TV) → aniwatch HLS via the backend proxy, falling back to embeds.
// Everything else → third-party embed iframes with a source switcher.
// ?offline=<key> plays a title saved in Downloads.
import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import api from '../services/api'
import HLSPlayer from '../components/HLSPlayer'
import DownloadButton from '../components/DownloadButton'
import LibraryDownloadButton from '../components/LibraryDownloadButton'
import Icon from '../components/Icon'
import { useConsumet } from '../hooks/useConsumet'
import { sendProgress } from '../hooks/useWebSocket'
import { useContinueWatching } from '../stores/continueWatchingStore'
import { useProfileStore, usePrefs } from '../stores/profileStore'
import { useDownloadStore, Playback } from '../stores/downloadStore'
import { usePartyStore, onPartySync, PartyMedia } from '../stores/partyStore'
import { onWsMessage, wsSend } from '../hooks/useWebSocket'
import PartyPanel, { PartyOverlay } from '../components/party/PartyPanel'
import { useKidsStore } from '../stores/kidsStore'
import ReportProblem from '../components/ReportProblem'
import { askPin } from '../utils/pinPrompt'
import { track } from '../utils/track'
import YouTubeEmbed, { YouTubeError } from '../components/YouTubeEmbed'

// ── Embed sources ─────────────────────────────────────────────────────────────
// The server ranks providers (health checks + what happened in viewers' sessions — see backend
// utils/sourceHealth.js); this list is only the fallback when that answer can't be fetched.
interface Src { id: string; label: string; url: (id: string, s?: number, e?: number) => string }
const fromTemplate = (id: string, label: string, tpl: string): Src =>
  ({ id, label, url: (tid, s = 1, e = 1) => tpl.replace('{id}', tid).replace('{s}', String(s)).replace('{e}', String(e)) })
const FALLBACK: [string, string, string, string][] = [
  ['vidsrc', 'VidSrc', 'https://vidsrc.sh/embed/movie/{id}', 'https://vidsrc.sh/embed/tv/{id}/{s}/{e}'],
  ['vidsrc2', 'VidSrc 2', 'https://vidsrc.sh/embed/movie?tmdb={id}', 'https://vidsrc.sh/embed/tv?tmdb={id}&season={s}&episode={e}'],
  ['vidlink', 'VidLink', 'https://vidlink.pro/movie/{id}', 'https://vidlink.pro/tv/{id}/{s}/{e}'],
  ['autoembed', 'AutoEmbed', 'https://autoembed.co/movie/tmdb/{id}', 'https://autoembed.co/tv/tmdb/{id}-{s}-{e}'],
  ['2embed', '2Embed', 'https://www.2embed.cc/embed/{id}', 'https://www.2embed.cc/embedtv/{id}&s={s}&e={e}'],
  ['multiembed', 'Multiembed', 'https://multiembed.mov/?video_id={id}&tmdb=1', 'https://multiembed.mov/?video_id={id}&tmdb=1&s={s}&e={e}'],
]
const MOVIE_SOURCES: Src[] = FALLBACK.map(([id, l, m]) => fromTemplate(id, l, m))
const TV_SOURCES: Src[] = FALLBACK.map(([id, l, , t]) => fromTemplate(id, l, t))
const MOVIE_DEFAULT_SOURCE = 0

/** Tell the server how a provider did for this session (feeds its ranking) */
const reportSource = (source: string, type: 'movie' | 'tv', ok: boolean) =>
  api.post('/stream/source-outcome', { source, type, ok }).catch(() => { /* best effort */ })

// Function to fetch VidSrc direct HLS stream
async function fetchVidSrcDirect(tmdbId: string, isTV: boolean = false, season?: number, episode?: number): Promise<{url: string, type: 'hls' | 'embed'} | null> {
  try {
    let url = `/stream/vidsrc/${tmdbId}`
    if (isTV && season && episode) {
      url += `?season=${season}&episode=${episode}`
    }
    const response = await api.get(url)
    if (response.data.success) {
      return response.data
    }
    return null
  } catch (error) {
    console.error('Failed to fetch VidSrc direct stream:', error)
    return null
  }
}

// Japanese-origin animation only — Western cartoons stay on the embed path
function detectAnime(media: any): boolean {
  if (!media) return false
  const japanese = media.original_language === 'ja' || (media.origin_country || []).includes('JP')
  const animated = (media.genres || []).some((g: any) => g.id === 16)
  return japanese && animated
}

const IMG = (p: string | null | undefined, s = 'w780') => (p ? `https://image.tmdb.org/t/p/${s}${p}` : '')

interface Episode {
  id: number; name: string; episode_number: number
  still_path: string | null; overview: string; runtime: number | null
}

type Mode = 'searching' | 'hls' | 'iframe' | 'offline' | 'library' | 'official'

/** A free, official upload of this episode/movie by its rights holder (YouTube) */
interface OfficialVid { videoId: string; season: number | null; episode: number | null; channel: string; title: string }

/** A video an admin added to the Streamix library and linked to this title */
interface LibFile { _id: string; title: string; format: string; playUrl: string; season: number | null; episode: number | null; sizeBytes?: number | null
  subtitles?: { url: string; lang: string; label: string }[]
  markers?: { introStart: number | null; introEnd: number | null; creditsStart: number | null } }

export default function Player() {
  const { type, id } = useParams<{ type: string; id: string }>()
  const [params, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const isTV       = type === 'tv'
  const season     = Number(params.get('season')  || 1)
  const episode    = Number(params.get('episode') || 1)
  const offlineKey = params.get('offline')

  const { save }            = useContinueWatching()
  const { findAnimeStream } = useConsumet()
  const { recordWatch }     = useProfileStore()
  const getPlayback         = useDownloadStore(s => s.getPlayback)

  const [media,        setMedia]        = useState<any>(null)
  const [episodes,     setEpisodes]     = useState<Episode[]>([])
  const [mediaLoading, setMediaLoading] = useState(true)
  const [sourceIdx,    setSourceIdx]    = useState(() => (type === 'tv' ? 0 : MOVIE_DEFAULT_SOURCE))
  const [showEpList,   setShowEpList]   = useState(false)
  // Phones: long seasons start the list near the episode being watched ("show earlier" / "show more" expand it)
  const [epRange,      setEpRange]      = useState<{ key: string; before: number; after: number }>({ key: '', before: 2, after: 10 })
  const [isAnime,      setIsAnime]      = useState(false)
  const [hlsSrc,       setHlsSrc]       = useState<string | null>(null)
  const [subtitles,    setSubtitles]    = useState<{ url: string; lang: string; label: string }[]>([])
  const [mode,         setMode]         = useState<Mode>('searching')
  // Providers best-first from the server (falls back to the built-in list)
  const [rankedMovie, setRankedMovie] = useState<Src[] | null>(null)
  const [rankedTv,    setRankedTv]    = useState<Src[] | null>(null)
  useEffect(() => {
    const t = type === 'tv' ? 'tv' : 'movie'
    api.get('/stream/sources', { params: { type: t } }).then(r => {
      const list: Src[] = (r.data.sources || []).map((x: any) => fromTemplate(x.id, x.label, x.template))
      if (list.length) (t === 'tv' ? setRankedTv : setRankedMovie)(list)
    }).catch(() => {})
  }, [type])
  // Session outcome per provider: 3+ minutes watched = it works; switching away within a minute = it didn't
  const switchingRef = useRef(false)
  const pickOnlineRef = useRef<() => void>(() => {})
  const [animeErr,     setAnimeErr]     = useState(false)
  const [offline,      setOffline]      = useState<Playback | null>(null)
  const [offlineErr,   setOfflineErr]   = useState(false)
  const [startTime,    setStartTime]    = useState(0)
  const [nextCountdown, setNextCountdown] = useState<number | null>(null)
  const [vidsrcHlsSrc, setVidsrcHlsSrc] = useState<string | null>(null)
  const [vidsrcLoading, setVidsrcLoading] = useState(false)
  const [libFiles,     setLibFiles]     = useState<LibFile[]>([])
  const [libIdx,       setLibIdx]       = useState(0)
  const [animeMarkers, setAnimeMarkers] = useState<LibFile['markers'] | null>(null)
  const [videoEl,      setVideoEl]      = useState<HTMLVideoElement | null>(null)
  const [streamLimit,  setStreamLimit]  = useState<number | null>(null)
  const [reporting,    setReporting]    = useState(false)
  // Official free episodes for this title (all of them — the episode list marks which are free)
  const [officialAll,  setOfficialAll]  = useState<OfficialVid[]>([])
  const [officialNote, setOfficialNote] = useState<string | null>(null)
  const officialFor = (s: number, e: number) => officialAll.find(v => (isTV ? v.season === s && v.episode === e : true)) || null

  // Progress bookkeeping (refs so timers always see fresh values)
  const curTimeRef = useRef(0)
  const curDurRef  = useRef(0)
  const mediaRef   = useRef<any>(null)
  const epRef      = useRef<Episode | null>(null)
  const modeRef    = useRef<Mode>('searching')
  const startedKey = useRef('')

  const curEp = episodes.find(e => e.episode_number === episode) || null
  useEffect(() => { mediaRef.current = media }, [media])
  useEffect(() => { epRef.current = curEp }, [curEp])
  useEffect(() => { modeRef.current = mode }, [mode])

  const epKey = isTV ? `${id}-s${season}e${episode}` : String(id)

  // Moving between a movie and a show (same page component) resets to that type's default source
  useEffect(() => { setSourceIdx(isTV ? 0 : MOVIE_DEFAULT_SOURCE) }, [isTV])

  useEffect(() => {
    setOfficialAll([])
    if (!id || offlineKey) return
    api.get(`/anime/official/title/${isTV ? 'tv' : 'movie'}/${id}`).then(r => setOfficialAll(r.data.videos || [])).catch(() => {})
  }, [id, isTV, offlineKey])

  // ── Offline source ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!offlineKey) { setOffline(null); return }
    let pb: Playback | null = null
    let cancelled = false
    getPlayback(offlineKey).then(res => {
      if (cancelled) { res?.release(); return }
      if (!res) { setOfflineErr(true); return }
      pb = res
      setOffline(res)
      setMode('offline')
    })
    return () => { cancelled = true; pb?.release() }
  }, [offlineKey, getPlayback])

  // ── Profile preferences, maturity rating, "still watching" ─────────────────
  const prefs = usePrefs()
  const prefsRef = useRef(prefs); prefsRef.current = prefs
  const [cert, setCert] = useState<{ rating: string | null; level: string | null } | null>(null)
  const [unlocked, setUnlocked] = useState(false)
  const [stillWatching, setStillWatching] = useState(false)
  const [manualNext, setManualNext] = useState(false)
  const autoAdvances = useRef(0)
  useEffect(() => {
    // Any real interaction resets the "still watching" counter
    const reset = () => { autoAdvances.current = 0 }
    window.addEventListener('pointerdown', reset); window.addEventListener('keydown', reset)
    return () => { window.removeEventListener('pointerdown', reset); window.removeEventListener('keydown', reset) }
  }, [])
  useEffect(() => { setManualNext(false); setUnlocked(false) }, [id, season, episode])
  useEffect(() => {
    if (!id || offlineKey) return
    api.get(`/movies/rating/${isTV ? 'tv' : 'movie'}/${id}`).then(r => setCert(r.data)).catch(() => setCert(null))
  }, [id, isTV, offlineKey])
  const LEVELS = ['7', '13', '16', 'all']
  const isKidProfileNow = useProfileStore(s => !!s.activeProfile?.isKids)
  const maturityLocked = !unlocked && !isKidProfileNow && !!cert?.level &&
    LEVELS.indexOf(cert.level) > LEVELS.indexOf(prefs.maturity)
  const unlockMaturity = async () => {
    const pin = await askPin('Parent PIN', `${cert?.rating} is above this profile's maturity setting`)
    if (!pin) return
    try { await api.post('/profiles/parent-pin', { pin }); setUnlocked(true) }
    catch { alert('Wrong PIN') }
  }

  // ── Media details ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return
    setMediaLoading(true)
    api.get(isTV ? `/movies/tv/${id}` : `/movies/${id}`)
      .then(r => setMedia(r.data))
      .catch(() => setMedia(null))
      .finally(() => setMediaLoading(false))
  }, [id, isTV])

  useEffect(() => {
    if (!isTV || !id) return
    api.get(`/movies/tv/${id}/season/${season}`)
      .then(r => setEpisodes(r.data.episodes || []))
      .catch(() => setEpisodes([]))
  }, [id, isTV, season])

  // ── Save continue-watching entry ───────────────────────────────────────────
  const durationSecs = useCallback(() => {
    if (curDurRef.current > 0) return curDurRef.current
    const m = mediaRef.current, ep = epRef.current
    const mins = isTV ? (ep?.runtime || m?.episode_run_time?.[0] || 45) : (m?.runtime || 110)
    return mins * 60
  }, [isTV])

  const doSave = useCallback((forceProgress?: number) => {
    const m = mediaRef.current
    if (!m || !id) return
    const dur = durationSecs()
    const t = curTimeRef.current
    const progress = forceProgress ?? Math.min(99, Math.round(t / dur * 100))
    save({
      movieId:      Number(id),
      title:        m.title || m.name || '',
      poster:       m.poster_path   || '',
      backdrop:     m.backdrop_path || '',
      type:         isTV ? 'tv' : 'movie',
      season:       isTV ? season  : undefined,
      episode:      isTV ? episode : undefined,
      episodeName:  epRef.current?.name || undefined,
      progress,
      timestamp:    Math.floor(t),
      duration:     Math.floor(dur),
      durationMins: Math.round(dur / 60),
    })
    sendProgress(Number(id), Math.floor(t), Math.floor(dur), isTV ? season : undefined, isTV ? episode : undefined)
    // Per-profile episode progress (✓ marks on the series page)
    const prof = useProfileStore.getState().activeProfile
    if (isTV && prof && progress > 0) api.post(`/profiles/${prof._id}/episodes`, { tmdbId: Number(id), season, episode, progress }).catch(() => {})
  }, [id, isTV, season, episode, save, durationSecs])

  // ── Pick the stream for this title / episode ───────────────────────────────
  useEffect(() => {
    if (offlineKey || !media) return
    const title = media.title || media.name || ''
    if (!title || startedKey.current === epKey) return
    startedKey.current = epKey
    track('play', isTV ? 'tv' : 'movie', Number(id))

    // Resume where this episode/movie was left off
    const prev = useContinueWatching.getState().get(Number(id))
    const sameEp = prev && (!isTV || (prev.season === season && prev.episode === episode))
    const resumeAt = sameEp && prev.progress < 97 ? prev.timestamp || 0 : 0
    curTimeRef.current = resumeAt
    curDurRef.current  = sameEp && prev.duration ? prev.duration : 0
    setStartTime(resumeAt)

    const anime = detectAnime(media)
    setIsAnime(anime)
    setHlsSrc(null); setSubtitles([]); setAnimeErr(false); setLibFiles([]); setLibIdx(0); setAnimeMarkers(null)

    const pickOnline = () => {
      if (anime && isTV) {
        findAnimeStream(title, season, episode).then(result => {
          if (startedKey.current !== epKey) return
          if (result?.provider === 'hls' && result.sources.length) {
            setHlsSrc(result.sources[0].url)
            setSubtitles(result.subtitles)
            setAnimeMarkers(result.markers || null)
            setMode('hls')
          } else {
            setAnimeErr(true)
            setMode('iframe')
          }
        })
      } else {
        setMode('iframe')
      }
    }

    // Order: files in the Streamix library → the rights holder's free official upload → other sources
    setMode('searching'); setOfficialNote(null)
    Promise.all([
      api.get<LibFile[]>(`/library/for/${isTV ? 'tv' : 'movie'}/${id}`, { params: isTV ? { season, episode } : {} }).then(r => r.data, () => [] as LibFile[]),
      api.get(`/anime/official/title/${isTV ? 'tv' : 'movie'}/${id}`).then(r => (r.data.videos || []) as OfficialVid[], () => [] as OfficialVid[]),
    ]).then(([files, vids]) => {
      if (startedKey.current !== epKey) return
      setOfficialAll(vids)
      const official = vids.find(v => (isTV ? v.season === season && v.episode === episode : true))
      if (files.length) { setLibFiles(files); setMode('library') }
      else if (official) setMode('official')
      else pickOnline()
    })
    pickOnlineRef.current = pickOnline
    doSave(sameEp ? prev.progress : 0)

    const genres = (media.genres || []).map((g: any) => g.id)
    const t = setTimeout(() => recordWatch(Number(id), title, isTV ? 'tv' : 'movie', genres, media.original_language || 'en', false), 30_000)
    return () => clearTimeout(t)
  }, [media, epKey, offlineKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Embeds can't report playback time — count visible watch time instead ──
  useEffect(() => {
    if (mode !== 'iframe') return
    const tick = setInterval(() => {
      if (document.visibilityState === 'visible') curTimeRef.current += 1
    }, 1000)
    return () => clearInterval(tick)
  }, [mode])

  // Tell the recommendation engine how much of this was really watched (every 3 min + on leaving)
  useEffect(() => {
    if (offlineKey || !media) return
    let lastT = curTimeRef.current
    const report = () => {
      const t = curTimeRef.current, d = durationSecs()
      const watched = Math.max(0, Math.min(t - lastT, 30 * 60))
      if (watched < 20) return
      lastT = t
      const m = mediaRef.current
      recordWatch(Number(id), m?.title || m?.name || '', isTV ? 'tv' : 'movie', (m?.genres || []).map((g: any) => g.id),
        m?.original_language || 'en', false, { progress: d ? Math.min(99, Math.round(t / d * 100)) : 0, seconds: Math.round(watched) })
    }
    const iv = setInterval(report, 3 * 60 * 1000)
    return () => { clearInterval(iv); report() }
  }, [epKey, media?.id, offlineKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Periodic save + final save when leaving the episode/page
  useEffect(() => {
    if (offlineKey) return
    const iv = setInterval(() => { if (curTimeRef.current > 5 && modeRef.current !== 'searching') doSave() }, 15_000)
    return () => {
      clearInterval(iv)
      if (curTimeRef.current > 5 && modeRef.current !== 'searching') doSave()
    }
  }, [doSave, offlineKey])

  // ── Episode navigation ─────────────────────────────────────────────────────
  const totalSeasons = media?.number_of_seasons || 1
  const prevEp = episodes.find(e => e.episode_number === episode - 1)
  const nextEp = episodes.find(e => e.episode_number === episode + 1)
  const hasNextSeason = !nextEp && season < totalSeasons

  const goEpisode = useCallback((ep: number, s = season) => {
    setNextCountdown(null)
    setSearchParams({ season: String(s), episode: String(ep) })
  }, [season, setSearchParams])

  const goNext = useCallback(() => {
    if (nextEp) goEpisode(nextEp.episode_number)
    else if (hasNextSeason) goEpisode(1, season + 1)
  }, [nextEp, hasNextSeason, season, goEpisode])

  useEffect(() => {
    if (nextCountdown === null) return
    if (nextCountdown <= 0) {
      // Three episodes in a row with nobody touching anything → "Are you still watching?"
      autoAdvances.current += 1
      if (autoAdvances.current >= 3) { setNextCountdown(null); setStillWatching(true); return }
      goNext(); return
    }
    const t = setTimeout(() => setNextCountdown(n => (n ?? 1) - 1), 1000)
    return () => clearTimeout(t)
  }, [nextCountdown, goNext])

  const onTimeUpdate = useCallback((t: number, d: number) => { curTimeRef.current = t; if (d) curDurRef.current = d }, [])
  const onEnded = useCallback(() => {
    doSave(100)
    const m = mediaRef.current
    if (m) recordWatch(Number(id), m.title || m.name || '', isTV ? 'tv' : 'movie', (m.genres || []).map((g: any) => g.id), m.original_language || 'en', true)
    if (isTV && (nextEp || hasNextSeason) && !offlineKey) {
      if (prefsRef.current.autoplayNext) setNextCountdown(10)
      else setManualNext(true)
    }
  }, [doSave, recordWatch, id, isTV, nextEp, hasNextSeason, offlineKey])

  const canGoNext = isTV && !!(nextEp || hasNextSeason) && !offlineKey

  // ── Watch party ────────────────────────────────────────────────────────────
  const party      = usePartyStore()
  const inParty    = !!party.code
  const isHost     = party.isHost()
  const canSync    = mode === 'hls' || mode === 'library'
  const partyGuest = inParty && !isHost
  const thisMedia: PartyMedia = {
    type: isTV ? 'tv' : 'movie', id: Number(id), season: isTV ? season : null, episode: isTV ? episode : null,
    title: media?.title || media?.name || '', poster: media?.poster_path ? IMG(media.poster_path, 'w185') : '',
  }

  // ?party=CODE in the link → join it
  const partyParam = params.get('party')
  useEffect(() => {
    if (!partyParam || offlineKey || party.code === partyParam.toUpperCase()) return
    const a = useProfileStore.getState().activeProfile
    party.join(partyParam, { name: a?.name || 'Viewer', avatar: a?.avatar, color: a?.color, avatarImage: a?.avatarImage })
    party.setPanel(true)
  }, [partyParam]) // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving the player leaves the party
  useEffect(() => () => { if (usePartyStore.getState().code) usePartyStore.getState().leave() }, [])

  // Host changed episode/title → everyone follows
  useEffect(() => { if (isHost && media) party.setMedia(thisMedia) }, [isHost, epKey, media?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Guest: go wherever the host is
  useEffect(() => {
    const m = party.media
    if (!partyGuest || !m || !m.id) return
    const same = m.type === (isTV ? 'tv' : 'movie') && m.id === Number(id) && (m.type !== 'tv' || (m.season === season && m.episode === episode))
    if (same) return
    navigate(m.type === 'tv'
      ? `/player/tv/${m.id}?season=${m.season || 1}&episode=${m.episode || 1}&party=${party.code}`
      : `/player/movie/${m.id}?party=${party.code}`, { replace: true })
  }, [party.media, partyGuest]) // eslint-disable-line react-hooks/exhaustive-deps

  // Host: broadcast play / pause / seek, plus a heartbeat
  useEffect(() => {
    if (!isHost || !canSync || !videoEl) return
    const v = videoEl
    const push = (seek = false) => party.sync(!v.paused, v.currentTime, seek)
    const onPlay = () => push(), onPause = () => push(), onSeek = () => push(true)
    v.addEventListener('play', onPlay); v.addEventListener('pause', onPause); v.addEventListener('seeked', onSeek)
    const beat = setInterval(() => push(), 4000)
    push(true)
    return () => { v.removeEventListener('play', onPlay); v.removeEventListener('pause', onPause); v.removeEventListener('seeked', onSeek); clearInterval(beat) }
  }, [isHost, canSync, videoEl]) // eslint-disable-line react-hooks/exhaustive-deps

  // Guest: follow the host
  useEffect(() => {
    if (!partyGuest || !canSync || !videoEl) return
    const v = videoEl
    const apply = (m: { playing: boolean; time: number; at: number; seek?: boolean }) => {
      const expected = m.time + (m.playing ? (Date.now() - m.at) / 1000 + 0.2 : 0)
      if (m.seek || Math.abs(v.currentTime - expected) > 1.5) v.currentTime = expected
      if (m.playing && v.paused) v.play().catch(() => {})
      if (!m.playing && !v.paused) v.pause()
    }
    const last = usePartyStore.getState().lastSync
    if (last) apply({ ...last, seek: true })
    party.requestSync()
    return onPartySync(apply)
  }, [partyGuest, canSync, videoEl]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Screens playing at once (only matters if an admin set a limit) ─────────
  const playingSomething = !offlineKey && (mode === 'hls' || mode === 'library' || mode === 'iframe' || mode === 'official')
  useEffect(() => {
    if (!playingSomething) return
    const off = onWsMessage(m => {
      if (m.type === 'STREAM_LIMIT') { setStreamLimit(m.max); videoEl?.pause() }
      else if (m.type === 'STREAM_OK') setStreamLimit(null)
    })
    wsSend({ type: 'WATCHING' })
    const beat = setInterval(() => wsSend({ type: 'WATCHING' }), 60_000)
    return () => { off(); clearInterval(beat); wsSend({ type: 'STOPPED' }) }
  }, [playingSomething, videoEl])

  // ── VidSrc Direct HLS handler ───────────────────────────────────────────────
  const loadVidSrcDirect = useCallback(async () => {
    if (!id) return
    setVidsrcLoading(true)
    try {
      const result = await fetchVidSrcDirect(id, isTV, season, episode)
      if (result && result.type === 'hls' && result.url) {
        setVidsrcHlsSrc(result.url)
        setMode('hls')
        setHlsSrc(result.url)
        setSubtitles([])
      } else {
        // If no direct HLS, fall back to embed
        setVidsrcHlsSrc(null)
        setMode('iframe')
      }
    } catch (error) {
      console.error('VidSrc direct failed:', error)
      setMode('iframe')
    } finally {
      setVidsrcLoading(false)
    }
  }, [id, isTV, season, episode])

  // Kids profiles: titles a parent blocked (or didn't allow) don't play
  const isKidProfile = useProfileStore(s => !!s.activeProfile?.isKids)
  const kidsStatus   = useKidsStore(s => s.status)
  const kidBlocked   = isKidProfile && !!kidsStatus && !useKidsStore.getState().titleAllowed(isTV ? 'tv' : 'movie', Number(id))

  const title   = media?.title || media?.name || offline?.item.title || ''
  // Pause screen details
  const playerInfo = media ? {
    overview: (isTV && curEp?.overview) || media.overview,
    year: (media.release_date || media.first_air_date || '').slice(0, 4),
    rating: cert?.rating || undefined,
    cast: (media.credits?.cast || []).slice(0, 6).map((c: any) => c.name),
  } : undefined
  const poster  = IMG(media?.poster_path || offline?.item.poster, 'w342')
  const sources = (isTV ? rankedTv : rankedMovie) || (isTV ? TV_SOURCES : MOVIE_SOURCES)
  const iframeUrl = sources[sourceIdx]?.url(id!, season, episode)

  const currentSourceId = sources[sourceIdx]?.id
  useEffect(() => {
    if (mode !== 'iframe' || !currentSourceId || offlineKey) return
    const t0 = Date.now(), mediaT: 'movie' | 'tv' = isTV ? 'tv' : 'movie'
    let reported = false
    const okTimer = setTimeout(() => { if (document.visibilityState === 'visible') { reported = true; reportSource(currentSourceId, mediaT, true) } }, 180_000)
    return () => {
      clearTimeout(okTimer)
      if (!reported && switchingRef.current && Date.now() - t0 < 60_000) reportSource(currentSourceId, mediaT, false)
      switchingRef.current = false
    }
  }, [mode, currentSourceId, epKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Video area ─────────────────────────────────────────────────────────────
  const renderVideo = () => {
    if (maturityLocked) {
      return (
        <div className="w-full aspect-video bg-dark-void flex flex-col items-center justify-center gap-3 text-center px-6">
          <Icon name="lock" size={40} className="text-gold" />
          <p className="text-white font-bold text-lg">Rated {cert?.rating}</p>
          <p className="text-ink-muted text-sm max-w-sm">This is above the maturity setting for this profile. A parent can unlock it, or change the setting in Profile → Playback.</p>
          <div className="flex gap-2"><button onClick={unlockMaturity} className="btn-primary">Unlock with PIN</button><button onClick={() => navigate(-1)} className="btn-secondary">Go back</button></div>
        </div>
      )
    }
    if (stillWatching) {
      return (
        <div className="w-full aspect-video bg-dark-void flex flex-col items-center justify-center gap-4 text-center px-6">
          <p className="text-white font-black text-2xl sm:text-3xl">Are you still watching {title}?</p>
          <div className="flex gap-2">
            <button onClick={() => { autoAdvances.current = 0; setStillWatching(false); goNext() }} className="btn-primary px-6">Continue watching</button>
            <button onClick={() => { setStillWatching(false); navigate(-1) }} className="btn-secondary px-6">Back</button>
          </div>
        </div>
      )
    }
    if (kidBlocked) {
      return (
        <div className="w-full aspect-video bg-dark-void flex flex-col items-center justify-center gap-3 text-center px-6">
          <span className="text-5xl" aria-hidden="true">🙈</span>
          <p className="text-white font-bold text-lg">This one needs a grown-up's OK</p>
          <p className="text-ink-muted text-sm">Ask a parent to allow it in Kids controls.</p>
          <button onClick={() => navigate('/kids')} className="btn-secondary">Back to Kids</button>
        </div>
      )
    }
    if (offlineKey) {
      if (offlineErr) return (
        <div className="w-full aspect-video bg-dark-void flex flex-col items-center justify-center gap-3 text-center px-6">
          <Icon name="cloud_off" size={40} className="text-brand" />
          <p className="text-white font-bold">This download is no longer available</p>
          <button onClick={() => navigate('/downloads')} className="btn-secondary">Go to Downloads</button>
        </div>
      )
      if (!offline) return <div className="w-full aspect-video bg-black flex items-center justify-center"><div className="w-10 h-10 border-2 border-white/10 border-t-brand rounded-full animate-spin" /></div>
      return (
        <HLSPlayer src={offline.url} isFile={offline.format === 'mp4'} title={title} poster={poster || undefined}
          type={offline.item.type} season={offline.item.season} episode={offline.item.episode} episodeName={offline.item.episodeName} />
      )
    }

    if (mediaLoading || mode === 'searching') {
      return (
        <div className="w-full aspect-video bg-black flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 border-2 border-white/10 border-t-brand rounded-full animate-spin" />
          <p className="text-ink-muted text-sm">{isAnime ? 'Finding the anime stream…' : 'Loading…'}</p>
        </div>
      )
    }

    if (!media) {
      return (
        <div className="w-full aspect-video bg-dark-void flex flex-col items-center justify-center gap-3">
          <Icon name="error" size={40} className="text-brand" />
          <p className="text-white font-bold">Couldn't load this title</p>
          <button onClick={() => navigate(-1)} className="btn-secondary">Go back</button>
        </div>
      )
    }

    if (mode === 'library' && libFiles[libIdx]) {
      const f = libFiles[libIdx]
      return (
        <HLSPlayer key={f._id} src={f.playUrl} isFile={f.format !== 'hls'} title={title} poster={IMG(media.backdrop_path, 'w1280') || poster || undefined}
          type={isTV ? 'tv' : 'movie'} season={isTV ? season : undefined} episode={isTV ? episode : undefined} episodeName={curEp?.name || undefined}
          startTime={startTime} onEnded={onEnded} onTimeUpdate={onTimeUpdate} subtitleTracks={f.subtitles || []}
          onVideo={setVideoEl} markers={f.markers || undefined} onNext={canGoNext ? goNext : undefined} locked={partyGuest} preferredSubLang={prefs.subtitleLang} quality={prefs.quality} info={playerInfo} />
      )
    }

    const officialNow = officialFor(season, episode)
    if (mode === 'official' && officialNow) {
      return (
        <YouTubeEmbed key={officialNow.videoId} videoId={officialNow.videoId} title={title} startTime={startTime}
          onTime={onTimeUpdate} onEnded={onEnded}
          onPlaying={() => setTimeout(() => api.post(`/anime/official/${officialNow.videoId}/outcome`, { ok: true }).catch(() => {}), 60_000)}
          onError={(kind: YouTubeError) => {
            if (kind !== 'timeout') api.post(`/anime/official/${officialNow.videoId}/outcome`, { ok: false }).catch(() => {})
            setOfficialNote(kind === 'blocked' ? 'The official upload isn’t available in your region — switched to another source'
              : kind === 'timeout' ? 'YouTube didn’t respond — switched to another source' : 'The official upload was removed — switched to another source')
            setOfficialAll(list => list.filter(v => v.videoId !== officialNow.videoId))
            pickOnlineRef.current()
          }} />
      )
    }

    if (mode === 'hls' && hlsSrc) {
      return (
        <HLSPlayer src={hlsSrc} title={title} poster={poster || undefined} type="tv"
          season={season} episode={episode} episodeName={curEp?.name || undefined}
          subtitleTracks={subtitles} startTime={startTime} onEnded={onEnded} onTimeUpdate={onTimeUpdate}
          onVideo={setVideoEl} markers={animeMarkers || undefined} onNext={canGoNext ? goNext : undefined} locked={partyGuest} preferredSubLang={prefs.subtitleLang} quality={prefs.quality} info={playerInfo} />
      )
    }

    return (
      <div className="relative w-full aspect-video bg-black">
        {animeErr && (
          <div className="absolute top-3 left-3 z-10 tech-pill text-gold !bg-dark-void/80">Direct stream unavailable — using embed</div>
        )}
        <iframe key={`${sourceIdx}-${epKey}`} src={iframeUrl} title={title}
          className="absolute inset-0 w-full h-full border-0" allowFullScreen
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media" referrerPolicy="no-referrer" />
      </div>
    )
  }

  const showEpisodes = isTV && !offlineKey && episodes.length > 0

  return (
    <div className="min-h-screen bg-dark-void flex flex-col">
      {/* Top bar */}
      <header className="h-14 sm:h-16 flex items-center gap-2 sm:gap-3 px-2 sm:px-5 flex-shrink-0 bg-dark-void/95 backdrop-blur-xl border-b border-white/[0.05] phoneland:hidden">
        <button onClick={() => navigate(-1)} aria-label="Go back" className="btn-icon w-10 h-10"><Icon name="arrow_back" size={22} /></button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-white font-bold truncate">{title}</p>
            {mode === 'hls'     && <span className="tech-pill hidden sm:inline-flex flex-shrink-0 !bg-brand/20 !border-brand/30 text-brand-soft">HLS</span>}
            {mode === 'library' && <span className="tech-pill hidden sm:inline-flex flex-shrink-0 !bg-gold/15 !border-gold/30 text-gold">Streamix</span>}
            {mode === 'official' && <span className="tech-pill hidden sm:inline-flex flex-shrink-0 !bg-cyan/15 !border-cyan/30 text-cyan">Official · Free</span>}
            {mode === 'offline' && <span className="tech-pill hidden sm:inline-flex flex-shrink-0 !bg-cyan/15 !border-cyan/30 text-cyan">Offline</span>}
            {mode === 'iframe' && isAnime && <span className="tech-pill hidden sm:inline-flex flex-shrink-0 text-gold">Embed</span>}
          </div>
          {isTV && (
            <p className="text-xs text-ink-faint truncate">S{season}:E{episode}{curEp?.name ? ` • ${curEp.name}` : ''}</p>
          )}
        </div>
        {mode === 'library' && libFiles[libIdx] && libFiles[libIdx].format !== 'hls' && (
          <LibraryDownloadButton id={libFiles[libIdx]._id} sizeBytes={libFiles[libIdx].sizeBytes} compact />
        )}
        {mode === 'hls' && hlsSrc && media && (
          <DownloadButton compact params={{
            movieId: Number(id), title, poster: media.poster_path || '', type: 'tv',
            season, episode, episodeName: curEp?.name, streamUrl: hlsSrc, quality: '720p',
          }} />
        )}
        {!offlineKey && media && (
          <button onClick={() => setReporting(true)} aria-label="Report a problem" title="Report a problem"
            className="btn-icon w-10 h-10 text-ink-faint hover:text-gold"><Icon name="flag" size={20} /></button>
        )}
        {reporting && media && (
          <ReportProblem onClose={() => setReporting(false)} target={{
            type: isTV ? 'tv' : 'movie', tmdbId: Number(id), season: isTV ? season : undefined, episode: isTV ? episode : undefined, title,
            source: mode === 'library' ? 'Streamix' : mode === 'hls' ? (vidsrcHlsSrc ? 'VidSrc Direct' : 'Anime stream') : sources[sourceIdx]?.label || 'Embed',
          }} />
        )}
        {!offlineKey && media && (
          <button onClick={() => { party.setPanel(!party.panelOpen); if (!party.panelOpen) setShowEpList(false) }} aria-expanded={party.panelOpen}
            aria-label="Watch party" title="Watch party"
            className={`relative h-10 rounded-full flex items-center gap-1.5 text-xs font-bold transition-all px-3 sm:px-4 ${party.panelOpen || inParty ? 'bg-brand text-white shadow-brand-sm' : 'bg-dark-border text-ink hover:bg-dark-high'}`}>
            <Icon name="groups" size={18} /><span className="hidden sm:inline">{inParty ? `Party · ${party.members.length}` : 'Watch party'}</span>
            {party.unread > 0 && !party.panelOpen && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-gold text-dark-void text-[10px] font-black flex items-center justify-center">{party.unread}</span>
            )}
          </button>
        )}
        {showEpisodes && (
          <button onClick={() => { setShowEpList(s => !s); party.setPanel(false) }} aria-expanded={showEpList} aria-label="Episodes"
            className={`hidden md:flex h-10 px-4 rounded-full items-center gap-1.5 text-xs font-bold transition-all ${showEpList ? 'bg-brand text-white shadow-brand-sm' : 'bg-dark-border text-ink hover:bg-dark-high'}`}>
            <Icon name="video_library" size={18} /> Episodes
          </button>
        )}
      </header>

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 flex flex-col min-w-0 md:overflow-y-auto">
          <div className="relative w-full max-w-[1600px] mx-auto max-md:sticky max-md:top-0 max-md:z-30 bg-black phoneland:static phoneland:max-w-[calc(100dvh*16/9)]">
            {renderVideo()}
            {inParty && <PartyOverlay />}
            {streamLimit !== null && (
              <div className="absolute inset-0 z-50 bg-dark-void/95 flex flex-col items-center justify-center gap-3 text-center px-6">
                <Icon name="devices" size={40} className="text-brand" />
                <p className="text-white font-bold">Too many screens</p>
                <p className="text-ink-muted text-sm max-w-sm">Your account can play on {streamLimit} screen{streamLimit === 1 ? '' : 's'} at a time. Stop watching on another device, then try again.</p>
                <button onClick={() => wsSend({ type: 'WATCHING' })} className="btn-primary">Try again</button>
              </div>
            )}
          </div>

          <div className="w-full max-w-[1600px] mx-auto">
            {manualNext && nextCountdown === null && (
              <div className="mx-4 mt-4 flex items-center justify-between gap-3 p-3 rounded-2xl glass">
                <p className="text-white text-sm font-bold truncate">Up next: {nextEp ? nextEp.name : `Season ${season + 1}`}</p>
                <button onClick={() => { setManualNext(false); goNext() }} className="btn-primary px-4 py-2 flex-shrink-0">Play next</button>
              </div>
            )}
            {nextCountdown !== null && nextCountdown > 0 && (
              <div className="mx-4 mt-4 flex items-center justify-between gap-3 p-3 rounded-2xl glass">
                <div className="min-w-0">
                  <p className="text-white text-sm font-bold truncate">Up next: {nextEp ? nextEp.name : `Season ${season + 1}`}</p>
                  <p className="text-ink-faint text-xs">Playing in {nextCountdown}s</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={goNext} className="btn-primary px-4 py-2">Play now</button>
                  <button onClick={() => setNextCountdown(null)} className="btn-secondary px-4 py-2">Cancel</button>
                </div>
              </div>
            )}

            {officialNote && mode !== 'official' && (
              <div role="status" className="mx-4 mt-3 flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-xs bg-gold/10 text-gold border border-gold/20">
                <Icon name="info" size={16} className="mt-px flex-shrink-0" />{officialNote}
              </div>
            )}
            {(mode === 'iframe' || mode === 'library' || mode === 'official') && !offlineKey && (
              <div className="flex items-center gap-2 px-4 py-3 overflow-x-auto scrollbar-hide">
                <span className="text-label-sm uppercase text-ink-faint flex-shrink-0 mr-1">Source</span>
                {officialFor(season, episode) && (
                  <button onClick={() => { setVidsrcHlsSrc(null); setMode('official') }} title={`Free and official, from ${officialFor(season, episode)!.channel} on YouTube`}
                    className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
                      mode === 'official' ? 'bg-cyan text-dark-void' : 'bg-dark-card text-cyan hover:bg-cyan/15'
                    }`}>
                    <Icon name="verified" size={14} />Official · {officialFor(season, episode)!.channel}
                  </button>
                )}
                {libFiles.map((f, i) => (
                  <button key={f._id} onClick={() => { setLibIdx(i); setVidsrcHlsSrc(null); setMode('library') }}
                    title={f.title}
                    className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
                      mode === 'library' && i === libIdx ? 'bg-gold text-dark-void' : 'bg-dark-card text-gold hover:bg-gold/15'
                    }`}>
                    <Icon name="verified" size={14} />
                    Streamix{libFiles.length > 1 ? ` ${i + 1}` : ''}
                  </button>
                ))}
                <button 
                  onClick={loadVidSrcDirect} 
                  disabled={vidsrcLoading}
                  className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
                    vidsrcHlsSrc ? 'bg-green-600 text-white shadow-green-900/20' : 'bg-dark-card text-ink-muted hover:text-white hover:bg-green-900/30'
                  } ${vidsrcLoading ? 'opacity-50 cursor-wait' : ''}`}
                >
                  {vidsrcLoading ? (
                    <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Icon name="play_circle" size={14} />
                  )}
                  VidSrc Direct
                </button>
                {sources.map((s, i) => (
                  <button key={s.label} onClick={() => { if (i !== sourceIdx) switchingRef.current = true; setSourceIdx(i); setVidsrcHlsSrc(null); setMode('iframe') }}
                    className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                      mode === 'iframe' && i === sourceIdx && !vidsrcHlsSrc ? 'bg-brand text-white shadow-brand-sm' : 'bg-dark-card text-ink-muted hover:text-white'
                    }`}>
                    {s.label}
                  </button>
                ))}
              </div>
            )}

            {isTV && !offlineKey && (
              <div className="flex items-center justify-between gap-3 px-4 py-3 flex-wrap">
                {totalSeasons > 1 && (
                  <div className="flex gap-1.5 overflow-x-auto scrollbar-hide max-sm:w-full">
                    {Array.from({ length: totalSeasons }, (_, i) => i + 1).map(s => (
                      <button key={s} onClick={() => goEpisode(1, s)}
                        className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold ${s === season ? 'bg-white/10 text-white' : 'text-ink-faint hover:text-white'}`}>
                        S{s}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
                  <button onClick={() => prevEp && goEpisode(prevEp.episode_number)} disabled={!prevEp} className="btn-secondary flex-1 sm:flex-none px-4 py-2 text-xs disabled:opacity-30">
                    <Icon name="skip_previous" size={18} /> Prev
                  </button>
                  <button onClick={goNext} disabled={!nextEp && !hasNextSeason} className="btn-secondary flex-1 sm:flex-none px-4 py-2 text-xs disabled:opacity-30">
                    Next <Icon name="skip_next" size={18} />
                  </button>
                </div>
              </div>
            )}

            {(curEp || (!isTV && media)) && (
              <div className="px-4 py-4 flex gap-4">
                {curEp?.still_path && <img src={IMG(curEp.still_path, 'w300')} alt="" className="w-40 rounded-xl object-cover flex-shrink-0 hidden sm:block" />}
                <div className="min-w-0">
                  <p className="text-white font-bold">{curEp ? curEp.name : media.title}</p>
                  <div className="flex gap-3 mt-1 text-xs text-ink-faint flex-wrap">
                    {!isTV && media?.release_date && <span>{media.release_date.slice(0, 4)}</span>}
                    {(curEp?.runtime || (!isTV && media?.runtime)) && <span>{curEp?.runtime || media.runtime} min</span>}
                    {!isTV && media?.vote_average > 0 && <span className="text-gold font-bold">★ {media.vote_average.toFixed(1)}</span>}
                    {isAnime && <span className="text-brand-soft font-bold">Anime</span>}
                  </div>
                  <p className="text-ink-muted text-sm mt-2 line-clamp-3 max-w-3xl">{curEp ? curEp.overview : media.overview}</p>
                </div>
              </div>
            )}

            {/* Phones & small tablets: the season's episodes right here (desktop has the sidebar) */}
            {showEpisodes && (
              <section className="hidden max-md:block phoneland:block px-3 pb-24" aria-label={`Season ${season} episodes`}>
                <p className="text-label-sm uppercase text-ink-faint px-1 pb-2">Season {season} · {episodes.length} episodes</p>
                {(() => {
                  const key = `${id}:${season}:${episode}`
                  const range = epRange.key === key ? epRange : { key, before: 2, after: 10 }
                  const cur = Math.max(0, episodes.findIndex(e => e.episode_number === episode))
                  const long = episodes.length > 14
                  const from = long ? Math.max(0, cur - range.before) : 0
                  const to = long ? Math.min(episodes.length, cur + 1 + range.after) : episodes.length
                  return (<>
                {from > 0 && (
                  <button onClick={() => setEpRange({ ...range, before: range.before + from })}
                    className="w-full mb-1 py-2.5 rounded-xl bg-white/[0.04] text-ink text-xs font-bold flex items-center justify-center gap-1.5 active:bg-white/[0.08]">
                    <Icon name="expand_less" size={18} /> Show {from} earlier episode{from === 1 ? '' : 's'}
                  </button>
                )}
                <ul className="space-y-1">
                  {episodes.slice(from, to).map(ep => {
                    const active = ep.episode_number === episode
                    const airs = (ep as any).air_date as string | undefined
                    const upcoming = !!airs && new Date(airs + 'T00:00:00') > new Date()
                    return (
                      <li key={ep.id} className={upcoming && !active ? 'opacity-50' : ''}>
                        <button onClick={() => { goEpisode(ep.episode_number); window.scrollTo({ top: 0, behavior: 'smooth' }) }} aria-current={active ? 'true' : undefined}
                          className={`w-full text-left p-2 rounded-2xl flex gap-3 items-center ${active ? 'bg-brand/10' : 'active:bg-white/[0.04]'}`}>
                          <div className="relative w-28 aspect-video rounded-xl overflow-hidden bg-dark-card flex-shrink-0">
                            {ep.still_path && <img src={IMG(ep.still_path, 'w300')} alt="" loading="lazy" className="w-full h-full object-cover" />}
                            {active && <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-brand"><Icon name="equalizer" size={22} /></span>}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm font-bold line-clamp-2 ${active ? 'text-brand-soft' : 'text-white'}`}>{ep.episode_number}. {ep.name}</p>
                            <p className="text-[11px] text-ink-faint mt-0.5">
                              {upcoming
                                ? <span className="text-gold font-bold">Airs {new Date(airs + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                                : [ep.runtime ? `${ep.runtime} min` : '', airs || ''].filter(Boolean).join(' · ')}
                              {!upcoming && officialFor(season, ep.episode_number) && <span className="ml-1.5 px-1.5 py-px rounded bg-cyan/15 text-cyan font-bold">FREE</span>}
                            </p>
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
                {to < episodes.length && (
                  <button onClick={() => setEpRange({ ...range, after: range.after + 20 })}
                    className="w-full mt-1 py-2.5 rounded-xl bg-white/[0.04] text-ink text-xs font-bold flex items-center justify-center gap-1.5 active:bg-white/[0.08]">
                    <Icon name="expand_more" size={18} /> Show more ({episodes.length - to} left)
                  </button>
                )}
                  </>)
                })()}
              </section>
            )}
          </div>
        </div>

        {/* Watch party: side panel on desktop, bottom sheet on phones */}
        {party.panelOpen && media && (
          <>
            <aside className="w-80 border-l border-white/[0.06] flex-shrink-0 hidden md:flex flex-col max-h-[calc(100vh-4rem)] sticky top-16">
              <PartyPanel media={thisMedia} canSync={canSync} onClose={() => party.setPanel(false)} />
            </aside>
            <div className="md:hidden fixed inset-x-0 bottom-0 z-[120] h-[62vh] rounded-t-3xl overflow-hidden shadow-deep border-t border-white/[0.08] animate-slide-up">
              <PartyPanel media={thisMedia} canSync={canSync} onClose={() => party.setPanel(false)} />
            </div>
          </>
        )}

        {/* Desktop episode sidebar */}
        {showEpisodes && showEpList && (
          <aside className="w-72 xl:w-80 border-l border-white/[0.06] flex-shrink-0 hidden md:flex flex-col bg-dark">
            <p className="px-4 py-3 text-sm font-bold text-white border-b border-white/[0.06]">Season {season}</p>
            <div className="flex-1 overflow-y-auto">
              {episodes.map(ep => {
                const active = ep.episode_number === episode
                return (
                  <button key={ep.id} onClick={() => goEpisode(ep.episode_number)}
                    className={`w-full text-left px-3 py-2.5 flex gap-3 items-center transition-colors ${active ? 'bg-brand/10' : 'hover:bg-white/[0.04]'}`}>
                    <div className="relative w-24 aspect-video rounded-lg overflow-hidden bg-dark-card flex-shrink-0">
                      {ep.still_path && <img src={IMG(ep.still_path, 'w185')} alt="" loading="lazy" className="w-full h-full object-cover" />}
                      {active && <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-brand"><Icon name="equalizer" size={22} /></span>}
                    </div>
                    <div className="min-w-0">
                      <p className={`text-xs font-bold truncate ${active ? 'text-brand-soft' : 'text-ink'}`}>{ep.episode_number}. {ep.name}</p>
                      <p className="text-[11px] text-ink-faint mt-0.5">
                        {ep.runtime ? `${ep.runtime}m` : ''}
                        {officialFor(season, ep.episode_number) && <span className="ml-1.5 px-1.5 py-px rounded bg-cyan/15 text-cyan font-bold" title="Free, official upload">FREE</span>}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </aside>
        )}
      </div>


    </div>
  )
}
