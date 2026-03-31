// frontend/src/pages/Player.tsx — FULL REPLACEMENT
import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { Movie, Episode } from '../types'
import { fetchMovieDetails, fetchTVDetails, fetchSeason } from '../services/api'
import VideoPlayer   from '../components/VideoPlayer'
import DownloadLinks from '../components/DownloadLinks'
import { useContinueWatching } from '../stores/continueWatchingStore'
import { useProfileStore }     from '../stores/profileStore'
import { useConsumet }         from '../hooks/useConsumet'
import HLSPlayer               from '../components/HLSPlayer'
import type { HLSSource }      from '../hooks/useConsumet'

const TYPICAL_MOVIE = 110
const TYPICAL_EP    = 45

export default function Player() {
  const { type, id }          = useParams<{ type: string; id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const season  = Number(searchParams.get('season')  || 1)
  const episode = Number(searchParams.get('episode') || 1)

  const { save, saveTimestamp }  = useContinueWatching()
  const { recordWatch }          = useProfileStore()
  const { findAnimeStream, loading: animeLoading } = useConsumet()

  const [media,        setMedia]        = useState<Movie | null>(null)
  const [episodes,     setEpisodes]     = useState<Episode[]>([])
  const [curEp,        setCurEp]        = useState<Episode | null>(null)
  const [showDL,       setShowDL]       = useState(false)
  const [sidebarOpen,  setSidebarOpen]  = useState(false)
  const [mediaLoading, setMediaLoading] = useState(true)

  const [hlsSources,  setHlsSources]  = useState<HLSSource[]|null>(null)
  const [subtitles,   setSubtitles]   = useState<any[]>([])
  const [streamMode,  setStreamMode]  = useState<'searching'|'hls'|'iframe'>('searching')
  const [startAt,     setStartAt]     = useState(0)

  const mediaRef = useRef<Movie|null>(null)
  const curEpRef = useRef<Episode|null>(null)
  const savedRef = useRef('')
  const tsRef    = useRef<ReturnType<typeof setInterval>>()
  const curTime  = useRef(0)
  const curDur   = useRef(0)

  useEffect(() => { mediaRef.current = media }, [media])
  useEffect(() => { curEpRef.current = curEp  }, [curEp])

  useEffect(() => {
    window.scrollTo(0,0)
    savedRef.current = ''
    setMediaLoading(true)
    setStreamMode('searching')
    setHlsSources(null)
    curTime.current = 0; curDur.current = 0
    ;(type==='tv' ? fetchTVDetails : fetchMovieDetails)(Number(id))
      .then(r => setMedia(r.data))
      .finally(() => setMediaLoading(false))
  }, [id, type])

  useEffect(() => {
    if (type!=='tv') return
    fetchSeason(Number(id), season).then(r => {
      const eps: Episode[] = r.data.episodes ?? []
      setEpisodes(eps)
      setCurEp(eps.find(e => e.episode_number===episode) ?? null)
    })
  }, [id, type, season])

  useEffect(() => {
    if (!episodes.length) return
    setCurEp(episodes.find(e => e.episode_number===episode) ?? null)
  }, [episode, episodes])

  // Find stream + record watch
  useEffect(() => {
    if (!media) return
    const title = media.title || media.name || ''
    if (!title) return
    const key = type==='tv' ? `${id}-s${season}e${episode}` : String(id)
    if (savedRef.current===key) return
    savedRef.current = key

    const isAnime = (media as any)?.original_language==='ja' ||
      (media as any)?.genres?.some((g: any) => g.id===16)

    const tryStream = async () => {
      setStreamMode('searching')
      let result = null
      if (isAnime && type==='tv') result = await findAnimeStream(title, season, episode)
      if (result?.sources?.length) {
        setHlsSources(result.sources); setSubtitles(result.subtitles||[]); setStartAt(0); setStreamMode('hls')
      } else {
        setStreamMode('iframe')
      }
      doSave(0)

      // Record watch in profile for recommendations
      const genres = (media as any)?.genre_ids || ((media as any)?.genres||[]).map((g: any) => g.id)
      recordWatch(Number(id), title, type as 'movie'|'tv', genres, (media as any)?.original_language || 'en')
    }
    tryStream()
  }, [media, curEp, season, episode])

  const doSave = useCallback((progress: number) => {
    const m = mediaRef.current; const ep = curEpRef.current
    if (!m || !id) return
    save({
      movieId: Number(id), title: m.title||m.name||'',
      poster: m.poster_path||'', backdrop: m.backdrop_path||'',
      type: type as 'movie'|'tv',
      season:      type==='tv' ? season  : undefined,
      episode:     type==='tv' ? episode : undefined,
      episodeName: ep?.name,
      progress, timestamp: curTime.current||0, duration: curDur.current||undefined,
      durationMins: type==='tv' ? (ep?.runtime||TYPICAL_EP) : (m.runtime||TYPICAL_MOVIE),
    })
  }, [id, type, season, episode, save])

  const handleTimeUpdate = useCallback((t: number, d: number) => {
    curTime.current = t; curDur.current = d
  }, [])

  useEffect(() => {
    tsRef.current = setInterval(() => {
      if (curTime.current > 2) saveTimestamp(Number(id), curTime.current, curDur.current||undefined)
    }, 10_000)
    return () => {
      clearInterval(tsRef.current)
      if (curTime.current > 2) saveTimestamp(Number(id), curTime.current, curDur.current||undefined)
    }
  }, [id, saveTimestamp])

  const title  = media?.title || media?.name || ''
  const imdbId = (media as any)?.external_ids?.imdb_id

  const goEpisode = (ep: number, s = season) => {
    savedRef.current = ''; setStreamMode('searching'); setHlsSources(null)
    setSearchParams({ season: String(s), episode: String(ep) })
  }

  const prevEp = episodes.find(e => e.episode_number === episode-1)
  const nextEp = episodes.find(e => e.episode_number === episode+1)
  const bestSrc = hlsSources?.find(s => s.quality?.includes('1080')) || hlsSources?.find(s => s.quality?.includes('720')) || hlsSources?.[0]

  const renderPlayer = () => {
    if (mediaLoading || streamMode==='searching') {
      return (
        <div className="aspect-video flex flex-col items-center justify-center bg-dark-surface gap-3">
          <div className="w-10 h-10 border-2 border-dark-border border-t-brand rounded-full animate-spin" />
          <p className="text-sm text-slate-500">{animeLoading?'Finding stream…':'Loading…'}</p>
        </div>
      )
    }
    if (streamMode==='hls' && bestSrc) {
      return (
        <HLSPlayer
          key={`hls-${id}-${season}-${episode}`}
          src={bestSrc.url}
          poster={media?.backdrop_path ? `https://image.tmdb.org/t/p/w1280${media.backdrop_path}` : undefined}
          startAt={startAt}
          subtitles={subtitles}
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => { doSave(99); if (nextEp) setNextEpCountdown(true) }}
          autoplayNext={!!nextEp}
          nextLabel={nextEp ? `S${season}E${nextEp.episode_number} — ${nextEp.name||''}` : undefined}
          onNextEpisode={() => nextEp && goEpisode(nextEp.episode_number)}
          title={title}
        />
      )
    }
    return (
      <VideoPlayer tmdbId={Number(id)} imdbId={imdbId} type={type as 'movie'|'tv'} season={season} episode={episode} />
    )
  }

  // Unused state — remove in production but kept for compat
  const [, setNextEpCountdown] = useState(false)

  return (
    <div className="pt-16 min-h-screen bg-[#07080c]">
      <div className="max-w-7xl mx-auto">

        {/* Top bar */}
        <div className="flex items-center gap-3 px-3 sm:px-4 py-3 flex-wrap">
          <button onClick={() => navigate(-1)} className="btn-ghost text-sm px-2 py-1.5 flex items-center gap-1.5 text-slate-400 hover:text-white">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m15 18-6-6 6-6"/></svg>
            Back
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-white text-sm sm:text-base truncate" style={{ fontFamily:'Syne, sans-serif' }}>{title}</p>
            <div className="flex items-center gap-2 flex-wrap">
              {type==='tv' && <p className="text-brand text-xs">S{season} · E{episode}{curEp?` — ${curEp.name}`:''}</p>}
              {streamMode==='hls'    && <span className="badge text-[10px] bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 px-2 py-0.5">● HLS</span>}
              {streamMode==='iframe' && <span className="badge text-[10px] bg-yellow-500/15 border border-yellow-500/25 text-yellow-400 px-2 py-0.5">● Embed</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => setShowDL(p => !p)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${showDL?'bg-brand text-dark border-brand':'bg-dark-card border-dark-border text-slate-400 hover:border-brand/40 hover:text-white'}`}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              <span className="hidden sm:inline">Download</span>
            </button>
            {type==='tv' && (
              <button onClick={() => setSidebarOpen(p => !p)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${sidebarOpen?'bg-dark-hover text-white border-dark-border':'bg-dark-card border-dark-border text-slate-400 hover:text-white'}`}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
                <span className="hidden sm:inline">Episodes</span>
              </button>
            )}
          </div>
        </div>

        {/* Player + sidebar */}
        <div className={`flex flex-col ${type==='tv'&&sidebarOpen?'lg:flex-row':''} gap-0 sm:gap-4 px-0 sm:px-4`}>
          <div className={type==='tv'&&sidebarOpen?'flex-1 min-w-0':'w-full'}>
            <div className="rounded-none sm:rounded-2xl overflow-hidden border-y sm:border border-dark-border">
              {renderPlayer()}
            </div>

            {type==='tv' && (
              <div className="flex items-center gap-2 px-3 sm:px-0 mt-3">
                <button onClick={() => prevEp&&goEpisode(prevEp.episode_number)} disabled={!prevEp}
                  className="flex-1 btn-secondary py-2.5 text-sm disabled:opacity-30 flex items-center justify-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m15 18-6-6 6-6"/></svg>
                  Previous
                </button>
                <span className="text-xs text-slate-700 tabular-nums px-2">{episode}/{episodes.length}</span>
                <button onClick={() => nextEp&&goEpisode(nextEp.episode_number)} disabled={!nextEp}
                  className="flex-1 btn-secondary py-2.5 text-sm disabled:opacity-30 flex items-center justify-center gap-1.5">
                  Next
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m9 18 6-6-6-6"/></svg>
                </button>
              </div>
            )}

            {showDL && (
              <div className="mt-3 px-3 sm:px-0">
                <DownloadLinks title={title} imdbId={imdbId} tmdbId={Number(id)} type={type as 'movie'|'tv'} season={season} episode={episode} />
              </div>
            )}

            {media && (
              <div className="mt-3 mx-3 sm:mx-0 card p-4 mb-6 flex gap-4">
                {media.poster_path && (
                  <img src={`https://image.tmdb.org/t/p/w92${media.poster_path}`} alt=""
                    className="w-12 rounded-xl flex-shrink-0 hidden sm:block" />
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-white text-sm truncate mb-1" style={{ fontFamily:'Syne, sans-serif' }}>{title}</h3>
                  <div className="flex gap-2 items-center text-xs text-slate-500 mb-2">
                    {(media.vote_average||0) > 0 && <span className="text-gold">★ {media.vote_average?.toFixed(1)}</span>}
                    <span>{(media.release_date||(media as any).first_air_date||'').slice(0,4)}</span>
                    {media.runtime && <span>{Math.floor(media.runtime/60)}h {media.runtime%60}m</span>}
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">{curEp?.overview||media.overview}</p>
                </div>
              </div>
            )}
          </div>

          {/* Episode sidebar */}
          {type==='tv'&&sidebarOpen && (
            <div className="w-full lg:w-72 flex-shrink-0 px-3 sm:px-0 mb-4">
              <div className="card overflow-hidden">
                <div className="p-3 border-b border-dark-border bg-dark-surface">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-2">Season</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {(media as any)?.seasons?.filter((s: any) => s.season_number > 0).map((s: any) => (
                      <button key={s.id} onClick={() => goEpisode(1, s.season_number)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${season===s.season_number?'bg-brand text-dark':'bg-dark-card border border-dark-border text-slate-400 hover:text-white'}`}>
                        S{s.season_number}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="overflow-y-auto" style={{ maxHeight:'60vh' }}>
                  {episodes.length===0 ? (
                    <div className="p-6 text-center text-slate-600 text-sm">Loading…</div>
                  ) : episodes.map(ep => (
                    <button key={ep.id} onClick={() => goEpisode(ep.episode_number)}
                      className={`w-full flex items-center gap-3 p-3 text-left border-b border-dark-border/40 transition-all hover:bg-dark-hover ${ep.episode_number===episode?'bg-brand/8 border-l-2 border-l-brand':''}`}>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black flex-shrink-0 ${ep.episode_number===episode?'bg-brand text-dark':'bg-dark-surface text-slate-500'}`}>
                        {ep.episode_number}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-slate-200 truncate">{ep.name}</div>
                        {ep.runtime && <div className="text-[10px] text-slate-600 mt-0.5">{ep.runtime}m</div>}
                      </div>
                      {ep.episode_number===episode && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-brand flex-shrink-0"><polygon points="5,3 19,12 5,21"/></svg>
                      )}
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
