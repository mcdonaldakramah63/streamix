// frontend/src/pages/Player.tsx — FULL REPLACEMENT
// KEY FIXES:
//   1. Anime auto-detected from TMDB data (Japanese + Animation) — NOT from route param
//   2. useConsumet + HLSPlayer restored for anime
//   3. Speed control, subtitles, auto-play next
//   4. Source switcher for non-anime
//   5. Episode sidebar desktop + mobile
import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import api            from '../services/api'
import HLSPlayer      from '../components/HLSPlayer'
import { useConsumet }            from '../hooks/useConsumet'
import { useContinueWatching }    from '../stores/continueWatchingStore'
import { useProfileStore }        from '../stores/profileStore'

// ── Embed sources ─────────────────────────────────────────────────────────────
const MOVIE_SOURCES = [
  { label: 'VidSrc',     url: (id: string) => `https://vidsrc.to/embed/movie/${id}` },
  { label: 'VidSrc 2',   url: (id: string) => `https://vidsrc.me/embed/movie?tmdb=${id}` },
  { label: 'AutoEmbed',  url: (id: string) => `https://autoembed.co/movie/tmdb/${id}` },
  { label: 'Embed.su',   url: (id: string) => `https://embed.su/embed/movie/${id}` },
  { label: '2Embed',     url: (id: string) => `https://www.2embed.cc/embed/${id}` },
  { label: 'Multiembed', url: (id: string) => `https://multiembed.mov/?video_id=${id}&tmdb=1` },
]
const TV_SOURCES = [
  { label: 'VidSrc',     url: (id: string, s=1, e=1) => `https://vidsrc.to/embed/tv/${id}/${s}/${e}` },
  { label: 'VidSrc 2',   url: (id: string, s=1, e=1) => `https://vidsrc.me/embed/tv?tmdb=${id}&season=${s}&episode=${e}` },
  { label: 'AutoEmbed',  url: (id: string, s=1, e=1) => `https://autoembed.co/tv/tmdb/${id}-${s}-${e}` },
  { label: 'Embed.su',   url: (id: string, s=1, e=1) => `https://embed.su/embed/tv/${id}/${s}/${e}` },
  { label: 'Multiembed', url: (id: string, s=1, e=1) => `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}` },
]

// ── Detect anime from TMDB data ────────────────────────────────────────────────
function detectAnime(media: any): boolean {
  if (!media) return false
  return (
    media.original_language === 'ja' ||
    (media.genres || []).some((g: any) => g.id === 16) ||
    (media.origin_country || []).includes('JP')
  )
}

const IMG = (p: string | null, s = 'w780') =>
  p ? `https://image.tmdb.org/t/p/${s}${p}` : ''

interface Episode {
  id:             number
  name:           string
  episode_number: number
  still_path:     string | null
  overview:       string
  runtime:        number | null
}

export default function Player() {
  const { type, id } = useParams<{ type: string; id: string }>()
  const [params, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const season  = Number(params.get('season')  || 1)
  const episode = Number(params.get('episode') || 1)
  const isTV    = type === 'tv'

  // ── Stores & hooks ─────────────────────────────────────────────────────────
  const { save, saveTimestamp }  = useContinueWatching()
  const { findAnimeStream, loading: animeLoading } = useConsumet()
  const { recordWatch }          = useProfileStore()

  // ── State ──────────────────────────────────────────────────────────────────
  const [media,        setMedia]        = useState<any>(null)
  const [episodes,     setEpisodes]     = useState<Episode[]>([])
  const [curEp,        setCurEp]        = useState<Episode | null>(null)
  const [mediaLoading, setMediaLoading] = useState(true)
  const [sourceIdx,    setSourceIdx]    = useState(0)
  const [iframeKey,    setIframeKey]    = useState(0)
  const [showEpList,   setShowEpList]   = useState(false)

  // Anime-specific state
  const [isAnime,    setIsAnime]    = useState(false)
  const [hlsSrc,     setHlsSrc]     = useState<string | null>(null)
  const [subtitles,  setSubtitles]  = useState<{ url:string; lang:string; label:string }[]>([])
  const [streamMode, setStreamMode] = useState<'searching'|'hls'|'iframe'>('searching')
  const [animeErr,   setAnimeErr]   = useState(false)

  // Auto-play next countdown
  const [nextCountdown, setNextCountdown] = useState<number | null>(null)

  // Progress refs
  const curTimeRef = useRef(0)
  const curDurRef  = useRef(0)
  const savedRef   = useRef('')
  const tsRef      = useRef<ReturnType<typeof setInterval>>()
  const mediaRef   = useRef<any>(null)
  const curEpRef   = useRef<Episode | null>(null)

  useEffect(() => { mediaRef.current = media  }, [media])
  useEffect(() => { curEpRef.current = curEp  }, [curEp])

  // ── Fetch media ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return
    setMediaLoading(true)
    savedRef.current = ''
    setIsAnime(false)
    setHlsSrc(null)
    setSubtitles([])
    setStreamMode('searching')
    setAnimeErr(false)
    curTimeRef.current = 0
    curDurRef.current  = 0

    const endpoint = isTV ? `/movies/tv/${id}` : `/movies/${id}`
    api.get(endpoint)
      .then(r => setMedia(r.data))
      .catch(console.error)
      .finally(() => setMediaLoading(false))
  }, [id, isTV])

  // ── Fetch episodes ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isTV || !id) return
    api.get(`/movies/tv/${id}/season/${season}`)
      .then(r => {
        const eps: Episode[] = r.data.episodes || []
        setEpisodes(eps)
        setCurEp(eps.find(e => e.episode_number === episode) || null)
      })
      .catch(() => setEpisodes([]))
  }, [id, isTV, season])

  useEffect(() => {
    if (!episodes.length) return
    setCurEp(episodes.find(e => e.episode_number === episode) || null)
  }, [episode, episodes])

  // ── Detect anime + find stream ─────────────────────────────────────────────
  useEffect(() => {
    if (!media) return
    const title = media.title || media.name || ''
    if (!title) return

    const key = isTV ? `${id}-s${season}e${episode}` : String(id)
    if (savedRef.current === key) return
    savedRef.current = key

    const anime = detectAnime(media)
    setIsAnime(anime)

    if (anime && isTV) {
      // Use aniwatch HLS
      setStreamMode('searching')
      setHlsSrc(null)
      setAnimeErr(false)

      findAnimeStream(title, season, episode).then(result => {
        if (result?.provider === 'hls' && result.sources.length) {
          setHlsSrc(result.sources[0].url)
          setSubtitles(result.subtitles)
          setStreamMode('hls')
          doSave(0)
        } else {
          // HLS failed → fall back to iframe
          console.log('[Player] Anime HLS not available, falling back to iframe')
          setAnimeErr(true)
          setStreamMode('iframe')
          doSave(0)
        }
      })
    } else {
      // Normal movie/TV → iframe
      setStreamMode('iframe')
      doSave(0)
    }

    // Record watch for profile recommendations (after 30s)
    const genres = (media.genres || []).map((g: any) => g.id)
    const lang   = media.original_language || 'en'
    const t = setTimeout(() => recordWatch(Number(id), title, isTV ? 'tv' : 'movie', genres, lang, false), 30_000)
    return () => clearTimeout(t)
  }, [media, season, episode]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save continue watching ─────────────────────────────────────────────────
  const doSave = useCallback((progress: number) => {
    const m  = mediaRef.current
    const ep = curEpRef.current
    if (!m || !id) return
    const durationMins = isTV
      ? (ep?.runtime || (m as any)?.episode_run_time?.[0] || 45)
      : (m.runtime || 110)
    save({
      movieId:     Number(id),
      title:       m.title || m.name || '',
      poster:      m.poster_path   || '',
      backdrop:    m.backdrop_path || '',
      type:        isTV ? 'tv' : 'movie',
      season:      isTV ? season  : undefined,
      episode:     isTV ? episode : undefined,
      episodeName: ep?.name || undefined,
      progress,
      timestamp:   curTimeRef.current || 0,
      duration:    curDurRef.current  || undefined,
      durationMins,
    })
  }, [id, isTV, season, episode, save])

  // ── Auto-save timestamp every 30s ─────────────────────────────────────────
  useEffect(() => {
    tsRef.current = setInterval(() => {
      if (curTimeRef.current > 2) {
        doSave(Math.min(Math.round((curTimeRef.current / (curDurRef.current || 1)) * 100), 99))
        saveTimestamp(Number(id), curTimeRef.current, curDurRef.current || undefined)
      }
    }, 30_000)
    return () => {
      clearInterval(tsRef.current)
      if (curTimeRef.current > 2) {
        saveTimestamp(Number(id), curTimeRef.current, curDurRef.current || undefined)
      }
    }
  }, [doSave, id, saveTimestamp])

  // ── Auto-next countdown ────────────────────────────────────────────────────
  useEffect(() => {
    if (nextCountdown === null) return
    if (nextCountdown <= 0) { goEpisode(episode + 1); return }
    const t = setTimeout(() => setNextCountdown(n => (n ?? 1) - 1), 1000)
    return () => clearTimeout(t)
  }, [nextCountdown]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Navigation ─────────────────────────────────────────────────────────────
  const goEpisode = (ep: number, s = season) => {
    setNextCountdown(null)
    savedRef.current = ''
    setSearchParams({ season: String(s), episode: String(ep) })
    setIframeKey(k => k + 1)
  }

  const goSeason = (s: number) => { goEpisode(1, s) }

  const prevEp = episodes.find(e => e.episode_number === episode - 1)
  const nextEp = episodes.find(e => e.episode_number === episode + 1)

  const title  = media?.title || media?.name || ''
  const poster = IMG(media?.poster_path, 'w342')

  const sources = isTV ? TV_SOURCES : MOVIE_SOURCES
  const iframeUrl = isTV
    ? sources[sourceIdx]?.url(id!, season, episode)
    : sources[sourceIdx]?.url(id!)

  // ── HLS player callbacks ───────────────────────────────────────────────────
  const onTimeUpdate = useCallback((t: number, d: number) => {
    curTimeRef.current = t
    curDurRef.current  = d
  }, [])

  const onEnded = useCallback(() => {
    doSave(100)
    if (isTV && nextEp) setNextCountdown(10)
  }, [doSave, isTV, nextEp])

  // ── Render video area ──────────────────────────────────────────────────────
  const renderVideo = () => {
    if (mediaLoading || streamMode === 'searching') {
      return (
        <div className="w-full bg-black flex flex-col items-center justify-center gap-3" style={{ aspectRatio:'16/9' }}>
          <div className="w-10 h-10 border-2 border-dark-border border-t-brand rounded-full animate-spin"/>
          <p className="text-slate-500 text-sm">
            {animeLoading ? 'Finding anime stream…' : 'Loading…'}
          </p>
        </div>
      )
    }

    if (streamMode === 'hls' && hlsSrc) {
      return (
        <HLSPlayer
          src={hlsSrc}
          movieId={Number(id)}
          title={title}
          poster={poster || undefined}
          type="tv"
          season={season}
          episode={episode}
          episodeName={curEp?.name || undefined}
          subtitleTracks={subtitles}
          onEnded={onEnded}
          onTimeUpdate={onTimeUpdate}
        />
      )
    }

    // iframe (normal movies/TV or anime fallback)
    return (
      <div className="relative w-full bg-black" style={{ aspectRatio:'16/9' }}>
        {animeErr && (
          <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 bg-yellow-500/20 border border-yellow-500/30 text-yellow-300 text-[10px] font-bold px-2 py-1 rounded-full">
            ⚡ HLS blocked — using embed fallback
          </div>
        )}
        <iframe
          key={`${iframeKey}-${sourceIdx}-${id}-${season}-${episode}`}
          src={iframeUrl}
          className="absolute inset-0 w-full h-full border-0"
          allowFullScreen
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
          title={title}
          referrerPolicy="no-referrer"
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#07080c] flex flex-col">

      {/* ── Top bar ── */}
      <div className="h-14 flex items-center gap-3 px-4 border-b border-dark-border flex-shrink-0"
        style={{ background:'rgba(7,8,12,0.97)', backdropFilter:'blur(12px)' }}>
        <button onClick={() => navigate(-1)} aria-label="Go back"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-dark-hover transition-all">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m15 18-6-6 6-6"/>
          </svg>
        </button>

        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-semibold truncate" style={{ fontFamily:'Syne, sans-serif' }}>{title}</p>
          <div className="flex items-center gap-2 text-[10px]">
            {isTV && <span className="text-slate-500">S{String(season).padStart(2,'0')} E{String(episode).padStart(2,'0')}{curEp?.name ? ` · ${curEp.name}` : ''}</span>}
            {isAnime && streamMode === 'hls'    && <span className="text-green-400 font-bold">● HLS</span>}
            {isAnime && streamMode === 'iframe'  && <span className="text-yellow-400 font-bold">● Embed</span>}
            {streamMode === 'searching'          && <span className="text-brand font-bold animate-pulse">● Searching…</span>}
          </div>
        </div>

        {isTV && (
          <button onClick={() => setShowEpList(s => !s)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${showEpList ? 'bg-brand/20 text-brand border border-brand/30' : 'text-slate-400 border border-dark-border hover:text-white'}`}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
            Episodes
          </button>
        )}
      </div>

      {/* ── Content ── */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">

          {/* Video */}
          {renderVideo()}

          {/* Auto-next banner */}
          {nextCountdown !== null && nextCountdown > 0 && nextEp && (
            <div className="mx-4 mt-3 flex items-center justify-between gap-3 p-3 rounded-xl border border-brand/30 bg-brand/5">
              <div>
                <p className="text-white text-sm font-semibold">Next: {nextEp.name}</p>
                <p className="text-slate-500 text-xs">Playing in {nextCountdown}s</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setNextCountdown(null); goEpisode(episode + 1) }}
                  className="btn-primary px-4 py-1.5 text-sm">Play Now</button>
                <button onClick={() => setNextCountdown(null)}
                  className="btn-secondary px-3 py-1.5 text-sm">Cancel</button>
              </div>
            </div>
          )}

          {/* Source switcher */}
          {streamMode !== 'hls' && (
            <div className="flex gap-1.5 px-4 py-3 overflow-x-auto scrollbar-hide border-b border-dark-border flex-shrink-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 self-center mr-1 flex-shrink-0">Source:</span>
              {sources.map((s, i) => (
                <button key={i} onClick={() => { setSourceIdx(i); setIframeKey(k => k+1) }}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    i === sourceIdx ? 'bg-brand/20 text-brand border border-brand/40' : 'text-slate-500 border border-dark-border hover:text-slate-300'
                  }`}>
                  {s.label}
                </button>
              ))}
            </div>
          )}

          {/* Season + Prev/Next nav */}
          {isTV && (
            <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border gap-3 flex-wrap">
              {/* Season pills */}
              {(media?.number_of_seasons || 1) > 1 && (
                <div className="flex gap-1 overflow-x-auto scrollbar-hide">
                  {Array.from({ length: media.number_of_seasons }, (_, i) => i + 1).map(s => (
                    <button key={s} onClick={() => goSeason(s)}
                      className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${s === season ? 'bg-brand/20 text-brand' : 'text-slate-500 hover:text-slate-300'}`}>
                      S{s}
                    </button>
                  ))}
                </div>
              )}

              {/* Prev / Next */}
              <div className="flex items-center gap-2 ml-auto">
                <button onClick={() => prevEp && goEpisode(prevEp.episode_number)} disabled={!prevEp}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-dark-border text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
                  Prev
                </button>
                <span className="text-slate-600 text-xs">E{String(episode).padStart(2,'0')}</span>
                <button onClick={() => nextEp && goEpisode(nextEp.episode_number)} disabled={!nextEp}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-dark-border text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                  Next
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
                </button>
              </div>
            </div>
          )}

          {/* Episode info */}
          {curEp && (
            <div className="px-4 py-4 border-b border-dark-border flex gap-3">
              {curEp.still_path && (
                <img src={IMG(curEp.still_path, 'w300')} alt="" className="w-28 rounded-lg object-cover flex-shrink-0 hidden sm:block"/>
              )}
              <div>
                <p className="text-white font-semibold text-sm">{curEp.name}</p>
                <p className="text-slate-500 text-xs mt-0.5 line-clamp-3">{curEp.overview}</p>
                {curEp.runtime && <p className="text-slate-600 text-[10px] mt-1">⏱ {curEp.runtime} min</p>}
              </div>
            </div>
          )}

          {/* Movie info */}
          {!isTV && media && (
            <div className="px-4 py-4">
              <h2 className="text-white font-bold mb-1" style={{ fontFamily:'Syne, sans-serif' }}>{title}</h2>
              {media.overview && <p className="text-slate-400 text-sm leading-relaxed line-clamp-3">{media.overview}</p>}
              <div className="flex gap-3 mt-2 text-xs text-slate-600 flex-wrap">
                {media.release_date && <span>📅 {media.release_date.slice(0,4)}</span>}
                {media.vote_average > 0 && <span>★ {media.vote_average.toFixed(1)}</span>}
                {media.runtime && <span>⏱ {media.runtime} min</span>}
                {isAnime && <span className="text-pink-400 font-bold">🎌 Anime</span>}
              </div>
            </div>
          )}
        </div>

        {/* ── Desktop episode sidebar ── */}
        {isTV && showEpList && (
          <div className="w-64 xl:w-80 border-l border-dark-border flex-shrink-0 hidden md:flex flex-col overflow-hidden">
            <div className="px-3 py-3 border-b border-dark-border flex-shrink-0">
              <p className="text-white font-semibold text-sm">
                {isAnime ? 'Episodes' : `Season ${season} Episodes`}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {episodes.map(ep => {
                const active = ep.episode_number === episode
                return (
                  <button key={ep.id} onClick={() => goEpisode(ep.episode_number)}
                    className={`w-full text-left px-3 py-3 flex items-start gap-2.5 border-b border-dark-border/40 transition-colors ${active ? 'bg-brand/10 border-l-2 border-l-brand' : 'hover:bg-dark-hover'}`}>
                    <span className={`text-xs font-mono mt-0.5 flex-shrink-0 w-6 ${active ? 'text-brand font-bold' : 'text-slate-600'}`}>
                      {String(ep.episode_number).padStart(2,'0')}
                    </span>
                    <div className="min-w-0">
                      <p className={`text-xs font-medium truncate ${active ? 'text-brand' : 'text-slate-300'}`}>{ep.name}</p>
                      {ep.runtime && <p className="text-[10px] text-slate-600 mt-0.5">{ep.runtime}m</p>}
                    </div>
                    {active && <svg width="10" height="10" viewBox="0 0 24 24" fill="#14b8a6" className="flex-shrink-0 mt-1"><polygon points="5,3 19,12 5,21"/></svg>}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Mobile episode drawer ── */}
      {isTV && showEpList && (
        <div className="md:hidden border-t border-dark-border overflow-x-auto">
          <div className="flex gap-2 p-2">
            {episodes.map(ep => {
              const active = ep.episode_number === episode
              return (
                <button key={ep.id} onClick={() => { goEpisode(ep.episode_number); setShowEpList(false) }}
                  className={`flex-shrink-0 w-12 h-12 rounded-xl text-xs font-bold transition-all ${active ? 'bg-brand text-dark' : 'bg-dark-card text-slate-400 border border-dark-border'}`}>
                  {ep.episode_number}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
