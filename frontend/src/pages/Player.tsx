// frontend/src/pages/Player.tsx — FULL REPLACEMENT
import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { Movie, Episode } from '../types'
import { fetchMovieDetails, fetchTVDetails, fetchSeason } from '../services/api'
import { poster, rating, year, runtime } from '../services/tmdb'
import HLSPlayer     from '../components/HLSPlayer'
import VideoPlayer   from '../components/VideoPlayer'
import DownloadLinks from '../components/DownloadLinks'
import { useContinueWatching }        from '../stores/continueWatchingStore'
import { useConsumet, HLSSource }     from '../hooks/useConsumet'

export default function Player() {
  const { type, id }          = useParams<{ type: string; id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const season  = Number(searchParams.get('season')  || 1)
  const episode = Number(searchParams.get('episode') || 1)

  const { save, saveTimestamp, get: getCW } = useContinueWatching()
  const { findAnimeStream, loading: consumetLoading } = useConsumet()

  const [media,        setMedia]        = useState<Movie | null>(null)
  const [episodes,     setEpisodes]     = useState<Episode[]>([])
  const [curEp,        setCurEp]        = useState<Episode | null>(null)
  const [showDL,       setShowDL]       = useState(false)
  const [sidebarOpen,  setSidebarOpen]  = useState(false)
  const [mediaLoading, setMediaLoading] = useState(true)

  // Stream state
  const [hlsSources,  setHlsSources]  = useState<HLSSource[] | null>(null)
  const [subtitles,   setSubtitles]   = useState<any[]>([])
  const [streamMode,  setStreamMode]  = useState<'searching' | 'hls' | 'iframe'>('searching')
  const [startAt,     setStartAt]     = useState(0)

  const mediaRef  = useRef<Movie | null>(null)
  const curEpRef  = useRef<Episode | null>(null)
  const savedRef  = useRef('')
  const tsRef     = useRef<ReturnType<typeof setInterval>>()
  const curTime   = useRef(0)
  const curDur    = useRef(0)

  useEffect(() => { mediaRef.current = media }, [media])
  useEffect(() => { curEpRef.current = curEp  }, [curEp])

  // ── Fetch media ────────────────────────────────────────────────────────────
  useEffect(() => {
    window.scrollTo(0, 0)
    savedRef.current = ''
    setMediaLoading(true)
    setStreamMode('searching')
    setHlsSources(null)
    curTime.current = 0
    curDur.current  = 0
    ;(type === 'tv' ? fetchTVDetails : fetchMovieDetails)(Number(id))
      .then(r => setMedia(r.data))
      .finally(() => setMediaLoading(false))
  }, [id, type])

  // ── Fetch episodes ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (type !== 'tv') return
    fetchSeason(Number(id), season).then(r => {
      const eps: Episode[] = r.data.episodes ?? []
      setEpisodes(eps)
      setCurEp(eps.find(e => e.episode_number === episode) ?? null)
    })
  }, [id, type, season])

  useEffect(() => {
    if (!episodes.length) return
    setCurEp(episodes.find(e => e.episode_number === episode) ?? null)
  }, [episode, episodes])

  // ── Find stream once media is ready ───────────────────────────────────────
  useEffect(() => {
    if (!media) return
    const title = media.title || media.name || ''
    if (!title) return

    const key = type === 'tv' ? `${id}-s${season}e${episode}` : String(id)
    if (savedRef.current === key) return
    savedRef.current = key

    // Get resume timestamp
    const cwEntry  = getCW(Number(id))
    const resumeAt = (cwEntry?.episode === episode && cwEntry?.season === season)
      ? (cwEntry?.timestamp || 0)
      : 0

    const tryStream = async () => {
      setStreamMode('searching')

      // Detect anime: Japanese origin OR animation genre
      const isAnime = (
        (media as any)?.original_language === 'ja' ||
        (media as any)?.genres?.some((g: any) => g.id === 16) ||
        (media as any)?.origin_country?.includes('JP')
      )

      let result = null

      if (isAnime && type === 'tv') {
        result = await findAnimeStream(title, season, episode)
      }
      // Movie HLS not implemented yet — go straight to iframe
      // (movies/non-anime TV use iframe sources)

      if (result && result.sources.length > 0) {
        setHlsSources(result.sources)
        setSubtitles(result.subtitles)
        setStartAt(resumeAt)
        setStreamMode('hls')
      } else {
        setStreamMode('iframe')
      }

      // Register in continue watching
      doSave(0, resumeAt)
    }

    tryStream()
  }, [media, curEp, season, episode])

  // ── Save CW entry ──────────────────────────────────────────────────────────
  const doSave = useCallback((progress: number, timestamp: number) => {
    const m  = mediaRef.current
    const ep = curEpRef.current
    if (!m || !id) return
    const durationMins = type === 'tv'
      ? (ep?.runtime || (m as any)?.episode_run_time?.[0] || 45)
      : (m.runtime   || 110)
    save({
      movieId:     Number(id),
      title:       m.title || m.name || '',
      poster:      m.poster_path   || '',
      backdrop:    m.backdrop_path || '',
      type:        type as 'movie' | 'tv',
      season:      type === 'tv' ? season  : undefined,
      episode:     type === 'tv' ? episode : undefined,
      episodeName: ep?.name || undefined,
      progress,
      timestamp,
      duration:    curDur.current || undefined,
      durationMins,
    })
  }, [id, type, season, episode, save])

  // ── Time update from HLS player ────────────────────────────────────────────
  const handleTimeUpdate = useCallback((t: number, d: number) => {
    curTime.current = t
    curDur.current  = d
  }, [])

  // Auto-save timestamp every 10 seconds
  useEffect(() => {
    tsRef.current = setInterval(() => {
      if (curTime.current > 2) {
        saveTimestamp(Number(id), curTime.current, curDur.current || undefined)
      }
    }, 10_000)
    return () => {
      clearInterval(tsRef.current)
      if (curTime.current > 2) {
        saveTimestamp(Number(id), curTime.current, curDur.current || undefined)
      }
    }
  }, [id, saveTimestamp])

  // ─────────────────────────────────────────────────────────────────────────
  const title  = media?.title || media?.name || ''
  const imdbId = media?.external_ids?.imdb_id

  const goEpisode = (ep: number, s = season) => {
    savedRef.current = ''
    setStreamMode('searching')
    setHlsSources(null)
    setSearchParams({ season: String(s), episode: String(ep) })
  }

  const prevEp = episodes.find(e => e.episode_number === episode - 1)
  const nextEp = episodes.find(e => e.episode_number === episode + 1)

  // Best m3u8 source — prefer 1080p
  const bestSource = hlsSources?.find(s => s.quality?.includes('1080'))
                  || hlsSources?.find(s => s.quality?.includes('720'))
                  || hlsSources?.[0]

  return (
    <div className="pt-14 min-h-screen bg-black">
      <div className="max-w-7xl mx-auto">

        {/* Top bar */}
        <div className="flex items-center gap-2 px-3 sm:px-4 py-3 flex-wrap">
          <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-brand text-sm flex-shrink-0">
            ← Back
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-white text-sm sm:text-base truncate">{title}</p>
            <p className="text-xs flex items-center gap-2 flex-wrap">
              {type === 'tv' && (
                <span className="text-brand">
                  Season {season} · Episode {episode}{curEp ? ` — ${curEp.name}` : ''}
                </span>
              )}
              {streamMode === 'hls' && (
                <span className="text-emerald-400 font-semibold">● HLS · quality selector available</span>
              )}
              {streamMode === 'iframe' && (
                <span className="text-yellow-400">● Embed</span>
              )}
              {streamMode === 'searching' && (
                <span className="text-slate-500">● Finding stream…</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button onClick={() => setShowDL(p => !p)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                showDL ? 'bg-brand text-dark border-brand' : 'bg-dark-card border-dark-border text-slate-300 hover:border-brand'
              }`}>
              ⬇ <span className="hidden sm:inline">Download</span>
            </button>
            {type === 'tv' && (
              <button onClick={() => setSidebarOpen(p => !p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  sidebarOpen ? 'bg-dark-border text-white border-dark-border' : 'bg-dark-card border-dark-border text-slate-400 hover:text-white'
                }`}>
                ☰ <span className="hidden sm:inline">Episodes</span>
              </button>
            )}
          </div>
        </div>

        {/* Player + sidebar */}
        <div className={`flex flex-col ${type === 'tv' && sidebarOpen ? 'lg:flex-row' : ''} gap-0 sm:gap-4 px-0 sm:px-4`}>
          <div className={type === 'tv' && sidebarOpen ? 'flex-1 min-w-0' : 'w-full'}>

            {/* Video */}
            <div className="rounded-none sm:rounded-xl overflow-hidden border-y sm:border border-dark-border">
              {mediaLoading || streamMode === 'searching' ? (
                <div className="aspect-video flex flex-col items-center justify-center bg-dark-surface gap-3">
                  <div className="w-10 h-10 border-2 border-dark-border border-t-brand rounded-full animate-spin" />
                  <p className="text-sm text-slate-400">
                    {consumetLoading ? 'Finding best stream…' : 'Loading…'}
                  </p>
                </div>
              ) : streamMode === 'hls' && bestSource ? (
                <HLSPlayer
                  key={`hls-${id}-${season}-${episode}`}
                  src={bestSource.url}
                  poster={media?.backdrop_path
                    ? `https://image.tmdb.org/t/p/w1280${media.backdrop_path}`
                    : undefined}
                  startAt={startAt}
                  subtitles={subtitles}
                  onTimeUpdate={handleTimeUpdate}
                  onEnded={() => nextEp && goEpisode(nextEp.episode_number)}
                />
              ) : (
                <VideoPlayer
                  tmdbId={Number(id)}
                  imdbId={imdbId}
                  type={type as 'movie' | 'tv'}
                  season={season}
                  episode={episode}
                />
              )}
            </div>

            {/* Prev / Next */}
            {type === 'tv' && (
              <div className="flex items-center justify-between px-3 sm:px-0 mt-3 gap-2">
                <button
                  onClick={() => prevEp && goEpisode(prevEp.episode_number)}
                  disabled={!prevEp}
                  className="flex-1 flex justify-center px-3 py-2.5 bg-dark-card border border-dark-border rounded-xl text-sm text-slate-400 hover:border-brand hover:text-white disabled:opacity-30 transition-all">
                  ← Prev
                </button>
                <span className="text-xs text-slate-600 tabular-nums">{episode} / {episodes.length}</span>
                <button
                  onClick={() => nextEp && goEpisode(nextEp.episode_number)}
                  disabled={!nextEp}
                  className="flex-1 flex justify-center px-3 py-2.5 bg-dark-card border border-dark-border rounded-xl text-sm text-slate-400 hover:border-brand hover:text-white disabled:opacity-30 transition-all">
                  Next →
                </button>
              </div>
            )}

            {/* Downloads */}
            {showDL && (
              <div className="mt-3 px-3 sm:px-0">
                <DownloadLinks
                  title={title}
                  imdbId={imdbId}
                  tmdbId={Number(id)}
                  type={type as 'movie' | 'tv'}
                  season={season}
                  episode={episode}
                />
              </div>
            )}

            {/* Media info */}
            {media && (
              <div className="mt-3 mx-3 sm:mx-0 flex gap-3 bg-dark-surface border border-dark-border rounded-xl p-3 sm:p-4 mb-4">
                <img
                  src={poster(media.poster_path)}
                  alt=""
                  className="w-14 sm:w-20 rounded-lg hidden sm:block flex-shrink-0"
                />
                <div>
                  <h2 className="font-bold text-white text-sm sm:text-base mb-1">{title}</h2>
                  <div className="flex gap-2 items-center text-xs text-slate-400 mb-2 flex-wrap">
                    <span className="text-yellow-400 font-bold">★ {rating(media.vote_average)}</span>
                    <span>{year(media.release_date || media.first_air_date)}</span>
                    {media.runtime && <span>{runtime(media.runtime)}</span>}
                    {streamMode === 'hls' && (
                      <span className="text-emerald-400 font-semibold">✓ Direct stream</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed line-clamp-3">
                    {curEp?.overview || media.overview}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Episode sidebar */}
          {type === 'tv' && sidebarOpen && (
            <div className="w-full lg:w-72 flex-shrink-0 px-3 sm:px-0 mb-4">
              <div className="bg-dark-surface border border-dark-border rounded-xl overflow-hidden">
                <div className="p-3 border-b border-dark-border bg-dark-card">
                  <p className="text-xs text-slate-500 mb-2 font-semibold uppercase tracking-wider">Season</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {media?.seasons?.filter(s => s.season_number > 0).map(s => (
                      <button
                        key={s.id}
                        onClick={() => goEpisode(1, s.season_number)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                          season === s.season_number
                            ? 'bg-brand text-dark'
                            : 'bg-dark-surface border border-dark-border text-slate-400 hover:text-white'
                        }`}>
                        S{s.season_number}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="overflow-y-auto max-h-64 lg:max-h-[55vh]">
                  {episodes.length === 0 ? (
                    <div className="p-4 text-center text-slate-600 text-sm">Loading...</div>
                  ) : episodes.map(ep => (
                    <button
                      key={ep.id}
                      onClick={() => goEpisode(ep.episode_number)}
                      className={`w-full flex gap-3 items-center p-3 text-left border-b border-dark-border/50 transition-all hover:bg-dark-card ${
                        ep.episode_number === episode ? 'bg-brand/10 border-l-2 border-l-brand' : ''
                      }`}>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black flex-shrink-0 ${
                        ep.episode_number === episode ? 'bg-brand text-dark' : 'bg-dark-card text-slate-500'
                      }`}>
                        {ep.episode_number}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-slate-200 truncate">{ep.name}</div>
                        {ep.runtime && <div className="text-xs text-slate-600">{ep.runtime}m</div>}
                      </div>
                      {ep.episode_number === episode && <span className="text-brand text-xs">▶</span>}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
