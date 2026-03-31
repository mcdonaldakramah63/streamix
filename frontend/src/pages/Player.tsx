// frontend/src/pages/Player.tsx — FULL REPLACEMENT
// Handles: movie iframes, TV iframes, anime HLS with quality switching
import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import api from '../services/api'
import HLSPlayer from '../components/HLSPlayer'
import { useContinueWatchingStore } from '../stores/continueWatchingStore'
import { useProfileStore }          from '../stores/profileStore'

// ── Source definitions ────────────────────────────────────────────────────────
interface Source {
  label:     string
  getUrl:    (id: string, s?: number, e?: number) => string
  isHLS?:    boolean
  quality?:  string
}

const MOVIE_SOURCES: Source[] = [
  { label: 'VidSrc',    getUrl: id => `https://vidsrc.to/embed/movie/${id}` },
  { label: 'VidSrc 2',  getUrl: id => `https://vidsrc.me/embed/movie?tmdb=${id}` },
  { label: 'AutoEmbed', getUrl: id => `https://autoembed.co/movie/tmdb/${id}` },
  { label: 'Embed.su',  getUrl: id => `https://embed.su/embed/movie/${id}` },
  { label: '2Embed',    getUrl: id => `https://www.2embed.cc/embed/${id}` },
  { label: 'Multiembed',getUrl: id => `https://multiembed.mov/?video_id=${id}&tmdb=1` },
]

const TV_SOURCES: Source[] = [
  { label: 'VidSrc',    getUrl: (id,s,e) => `https://vidsrc.to/embed/tv/${id}/${s}/${e}` },
  { label: 'VidSrc 2',  getUrl: (id,s,e) => `https://vidsrc.me/embed/tv?tmdb=${id}&season=${s}&episode=${e}` },
  { label: 'AutoEmbed', getUrl: (id,s,e) => `https://autoembed.co/tv/tmdb/${id}-${s}-${e}` },
  { label: 'Embed.su',  getUrl: (id,s,e) => `https://embed.su/embed/tv/${id}/${s}/${e}` },
  { label: 'Multiembed',getUrl: (id,s,e) => `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}` },
]

// ── Types ─────────────────────────────────────────────────────────────────────
interface EpisodeInfo {
  id:            number
  name:          string
  episode_number:number
  still_path:    string | null
  overview:      string
  runtime:       number | null
}

interface AnimeEpisode {
  id:    string
  title: string | null
  number:number
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const IMG = (p: string|null, s = 'w780') => p ? `https://image.tmdb.org/t/p/${s}${p}` : ''

// ── Player page ───────────────────────────────────────────────────────────────
export default function Player() {
  const { type, id } = useParams<{ type: string; id: string }>()
  const [params]     = useSearchParams()
  const navigate     = useNavigate()

  const isAnime = type === 'anime'
  const isTV    = type === 'tv' || type === 'anime'

  // ── Parse query params ────────────────────────────────────────────────────
  const initSeason  = parseInt(params.get('season')  || '1', 10)
  const initEpisode = parseInt(params.get('episode') || '1', 10)

  // ── State ─────────────────────────────────────────────────────────────────
  const [season,        setSeason]        = useState(initSeason)
  const [episode,       setEpisode]       = useState(initEpisode)
  const [sourceIdx,     setSourceIdx]     = useState(0)
  const [tmdbInfo,      setTmdbInfo]      = useState<any>(null)
  const [episodes,      setEpisodes]      = useState<EpisodeInfo[]>([])
  const [animeEpisodes, setAnimeEpisodes] = useState<AnimeEpisode[]>([])
  const [hlsSrc,        setHlsSrc]        = useState<string | null>(null)
  const [hlsLoading,    setHlsLoading]    = useState(false)
  const [loadingInfo,   setLoadingInfo]   = useState(true)
  const [showEpList,    setShowEpList]    = useState(false)
  const [resumeTime,    setResumeTime]    = useState(0)
  const [iframeKey,     setIframeKey]     = useState(0)  // force iframe reload

  const { get: getCW, save: saveCW } = useContinueWatchingStore()
  const { recordWatch }              = useProfileStore()

  const currentEpInfo = episodes.find(e => e.episode_number === episode) || null
  const sources       = isTV ? TV_SOURCES : MOVIE_SOURCES

  // ── Fetch TMDB info ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return
    setLoadingInfo(true)

    const endpoint = isTV ? `/movies/tv/${id}` : `/movies/${id}`
    api.get(endpoint)
      .then(r => setTmdbInfo(r.data))
      .catch(console.error)
      .finally(() => setLoadingInfo(false))
  }, [id, isTV])

  // ── Fetch episode list for TV ──────────────────────────────────────────────
  useEffect(() => {
    if (!isTV || !id || isAnime) return
    api.get(`/movies/tv/${id}/season/${season}`)
      .then(r => setEpisodes(r.data.episodes || []))
      .catch(() => setEpisodes([]))
  }, [id, isTV, isAnime, season])

  // ── Fetch anime episodes ───────────────────────────────────────────────────
  useEffect(() => {
    if (!isAnime || !id) return
    api.get(`/stream/anime/info/${id}`)
      .then(r => setAnimeEpisodes(r.data.episodes || []))
      .catch(() => setAnimeEpisodes([]))
  }, [isAnime, id])

  // ── Fetch anime HLS stream ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isAnime || !id || !animeEpisodes.length) return
    const ep = animeEpisodes.find(e => e.number === episode) || animeEpisodes[episode - 1]
    if (!ep) return

    setHlsSrc(null)
    setHlsLoading(true)
    api.get(`/stream/anime/watch`, { params: { episodeId: ep.id } })
      .then(r => {
        const sources: any[] = r.data.sources || []
        const best = sources.find(s => s.quality === '1080p')
          || sources.find(s => s.quality === '720p')
          || sources.find(s => s.isM3U8)
          || sources[0]
        if (best?.url) {
          // Route through proxy to fix CORS
          const proxyUrl = `/api/stream/proxy?url=${encodeURIComponent(best.url)}`
          setHlsSrc(proxyUrl)
        }
      })
      .catch(console.error)
      .finally(() => setHlsLoading(false))
  }, [isAnime, id, episode, animeEpisodes])

  // ── Resume time ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return
    const cw = getCW(Number(id))
    if (cw?.timestamp && cw.timestamp > 30) setResumeTime(cw.timestamp)
  }, [id, getCW])

  // ── Record watch for recommendations ──────────────────────────────────────
  useEffect(() => {
    if (!tmdbInfo) return
    const genres = (tmdbInfo.genres || []).map((g: any) => g.id)
    const title  = tmdbInfo.title || tmdbInfo.name || ''
    const lang   = tmdbInfo.original_language || 'en'
    const t      = setTimeout(() => recordWatch(Number(id), title, isTV ? 'tv' : 'movie', genres, lang, false), 60_000)
    return () => clearTimeout(t)
  }, [tmdbInfo, id, isTV, recordWatch])

  // ── Navigation helpers ─────────────────────────────────────────────────────
  const prevEpisode = useCallback(() => {
    if (episode > 1) setEpisode(e => e - 1)
    else if (season > 1) { setSeason(s => s - 1); setEpisode(1) }
  }, [episode, season])

  const nextEpisode = useCallback(() => {
    const total = isAnime ? animeEpisodes.length : episodes.length
    if (episode < total) setEpisode(e => e + 1)
    else {
      const totalSeasons = tmdbInfo?.number_of_seasons || 1
      if (season < totalSeasons) { setSeason(s => s + 1); setEpisode(1) }
    }
  }, [episode, episodes.length, animeEpisodes.length, season, tmdbInfo, isAnime])

  const title        = tmdbInfo?.title || tmdbInfo?.name || 'Streamix Player'
  const poster       = IMG(tmdbInfo?.poster_path, 'w342')
  const backdrop     = IMG(tmdbInfo?.backdrop_path)
  const iframeUrl    = isTV
    ? (sources[sourceIdx]?.getUrl(id!, season, episode) || '')
    : (sources[sourceIdx]?.getUrl(id!)                  || '')

  // ── Seasons list ───────────────────────────────────────────────────────────
  const totalSeasons = tmdbInfo?.number_of_seasons || 1
  const seasonList   = Array.from({ length: totalSeasons }, (_, i) => i + 1)

  // ── Mini header label ──────────────────────────────────────────────────────
  const subLabel = isTV
    ? `S${String(season).padStart(2,'0')} E${String(episode).padStart(2,'0')}${currentEpInfo?.name ? ` · ${currentEpInfo.name}` : ''}`
    : `${tmdbInfo?.release_date?.slice(0,4) || ''}`

  return (
    <div className="min-h-screen bg-[#07080c] flex flex-col">

      {/* ── Top bar ── */}
      <div className="h-14 flex items-center gap-3 px-4 border-b border-dark-border flex-shrink-0"
        style={{ background: 'rgba(7,8,12,0.95)', backdropFilter: 'blur(12px)' }}>
        <button onClick={() => navigate(-1)}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-dark-hover transition-all">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m15 18-6-6 6-6"/>
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-semibold truncate" style={{ fontFamily: 'Syne, sans-serif' }}>{title}</p>
          {subLabel && <p className="text-slate-500 text-[11px] truncate">{subLabel}</p>}
        </div>
        {isTV && (
          <button onClick={() => setShowEpList(s => !s)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${showEpList ? 'bg-brand/20 text-brand border border-brand/30' : 'text-slate-400 hover:text-white border border-dark-border'}`}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
            Episodes
          </button>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Main video area ── */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* ── Video ── */}
          <div className="relative bg-black w-full" style={{ aspectRatio: '16/9' }}>
            {isAnime ? (
              hlsLoading ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <div className="w-10 h-10 border-2 border-dark-border border-t-brand rounded-full animate-spin" />
                  <p className="text-slate-500 text-sm">Fetching anime stream…</p>
                </div>
              ) : hlsSrc ? (
                <HLSPlayer
                  src={hlsSrc}
                  movieId={Number(id)}
                  title={title}
                  poster={poster || undefined}
                  type="tv"
                  season={season}
                  episode={episode}
                  episodeName={animeEpisodes.find(e => e.number === episode)?.title || undefined}
                  startTime={resumeTime}
                  onEnded={nextEpisode}
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                  <span className="text-4xl">😞</span>
                  <p className="text-white font-semibold">Stream not available</p>
                  <p className="text-slate-500 text-sm">Try another episode or check back later</p>
                </div>
              )
            ) : (
              <iframe
                key={`${iframeKey}-${sourceIdx}-${episode}-${season}`}
                src={iframeUrl}
                className="absolute inset-0 w-full h-full border-0"
                allowFullScreen
                allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                title={title}
                referrerPolicy="no-referrer"
              />
            )}
          </div>

          {/* ── Source switcher (iframes only) ── */}
          {!isAnime && (
            <div className="flex gap-1.5 px-3 sm:px-4 py-3 overflow-x-auto scrollbar-hide border-b border-dark-border flex-shrink-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 self-center mr-1 flex-shrink-0">Source:</span>
              {sources.map((s, i) => (
                <button key={i} onClick={() => { setSourceIdx(i); setIframeKey(k => k+1) }}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    i === sourceIdx
                      ? 'bg-brand/20 text-brand border border-brand/40'
                      : 'text-slate-500 border border-dark-border hover:border-slate-600 hover:text-slate-300'
                  }`}>
                  {s.label}
                </button>
              ))}
            </div>
          )}

          {/* ── Season / Episode navigation ── */}
          {isTV && (
            <div className="flex items-center justify-between px-3 sm:px-4 py-3 border-b border-dark-border flex-shrink-0 gap-3 flex-wrap">
              {/* Seasons */}
              {!isAnime && totalSeasons > 1 && (
                <div className="flex gap-1 overflow-x-auto scrollbar-hide">
                  {seasonList.map(s => (
                    <button key={s} onClick={() => { setSeason(s); setEpisode(1) }}
                      className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        s === season ? 'bg-brand/20 text-brand' : 'text-slate-500 hover:text-slate-300'
                      }`}>
                      S{s}
                    </button>
                  ))}
                </div>
              )}

              {/* Prev / Next */}
              <div className="flex items-center gap-2 ml-auto flex-shrink-0">
                <button onClick={prevEpisode} disabled={episode <= 1 && season <= 1}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-dark-border text-slate-400 hover:text-white hover:border-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
                  Prev
                </button>
                <span className="text-slate-600 text-xs font-mono">
                  E{String(episode).padStart(2,'0')}
                </span>
                <button onClick={nextEpisode}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-dark-border text-slate-400 hover:text-white hover:border-slate-600 transition-all">
                  Next
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
                </button>
              </div>
            </div>
          )}

          {/* ── Current episode info ── */}
          {currentEpInfo && (
            <div className="px-4 py-4 border-b border-dark-border flex gap-3">
              {currentEpInfo.still_path && (
                <img src={IMG(currentEpInfo.still_path, 'w300')} alt=""
                  className="w-28 rounded-lg object-cover flex-shrink-0 hidden sm:block" />
              )}
              <div>
                <p className="text-white font-semibold text-sm">{currentEpInfo.name}</p>
                <p className="text-slate-500 text-xs mt-0.5 line-clamp-2">{currentEpInfo.overview}</p>
                {currentEpInfo.runtime && (
                  <p className="text-slate-600 text-[10px] mt-1">⏱ {currentEpInfo.runtime} min</p>
                )}
              </div>
            </div>
          )}

          {/* ── Movie info ── */}
          {!isTV && tmdbInfo && (
            <div className="px-4 py-4">
              <h2 className="text-white font-bold text-base mb-1" style={{ fontFamily: 'Syne, sans-serif' }}>{title}</h2>
              {tmdbInfo.overview && (
                <p className="text-slate-400 text-sm leading-relaxed line-clamp-3">{tmdbInfo.overview}</p>
              )}
              <div className="flex gap-3 mt-2 text-xs text-slate-600">
                {tmdbInfo.release_date && <span>📅 {tmdbInfo.release_date.slice(0,4)}</span>}
                {tmdbInfo.vote_average > 0 && <span>★ {tmdbInfo.vote_average.toFixed(1)}</span>}
                {tmdbInfo.runtime && <span>⏱ {tmdbInfo.runtime} min</span>}
              </div>
            </div>
          )}
        </div>

        {/* ── Episode sidebar ── */}
        {isTV && showEpList && (
          <div className="w-64 xl:w-80 border-l border-dark-border flex-shrink-0 overflow-y-auto hidden md:flex flex-col">
            <div className="px-3 py-3 border-b border-dark-border flex-shrink-0">
              <p className="text-white font-semibold text-sm">{isAnime ? 'Episodes' : `Season ${season}`}</p>
            </div>

            <div className="flex-1 overflow-y-auto">
              {(isAnime ? animeEpisodes : episodes).map((ep: any) => {
                const epNum   = isAnime ? ep.number : ep.episode_number
                const epTitle = isAnime ? (ep.title || `Episode ${ep.number}`) : ep.name
                const isActive = epNum === episode

                return (
                  <button key={epNum}
                    onClick={() => { setEpisode(epNum); if (!isAnime) setIframeKey(k => k+1) }}
                    className={`w-full text-left px-3 py-3 flex items-start gap-2.5 border-b border-dark-border/50 transition-colors ${
                      isActive ? 'bg-brand/10 border-l-2 border-l-brand' : 'hover:bg-dark-hover'
                    }`}>
                    <span className={`text-xs font-mono mt-0.5 flex-shrink-0 ${isActive ? 'text-brand font-bold' : 'text-slate-600'}`}>
                      {String(epNum).padStart(2,'0')}
                    </span>
                    <div className="min-w-0">
                      <p className={`text-xs font-medium truncate ${isActive ? 'text-brand' : 'text-slate-300'}`}>
                        {epTitle}
                      </p>
                      {!isAnime && (ep as EpisodeInfo).runtime && (
                        <p className="text-[10px] text-slate-600 mt-0.5">{(ep as EpisodeInfo).runtime} min</p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Mobile episode list drawer ── */}
      {isTV && showEpList && (
        <div className="md:hidden border-t border-dark-border max-h-48 overflow-y-auto">
          <div className="flex gap-2 p-2 overflow-x-auto scrollbar-hide">
            {(isAnime ? animeEpisodes : episodes).map((ep: any) => {
              const epNum = isAnime ? ep.number : ep.episode_number
              return (
                <button key={epNum}
                  onClick={() => { setEpisode(epNum); setShowEpList(false); if (!isAnime) setIframeKey(k => k+1) }}
                  className={`flex-shrink-0 w-12 h-12 rounded-xl text-xs font-bold transition-all ${
                    epNum === episode ? 'bg-brand text-dark' : 'bg-dark-card text-slate-400 border border-dark-border'
                  }`}>
                  {epNum}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
