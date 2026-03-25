// frontend/src/pages/TVDetail.tsx — FULL REPLACEMENT
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'
import TrailerModal from '../components/TrailerModal'
import CastSection  from '../components/CastSection'
import SimilarRow   from '../components/SimilarRow'
import StarRating   from '../components/StarRating'
import ShareButton  from '../components/ShareButton'
import { useWatchlistStore } from '../stores/watchlistStore'
import { useAuthStore }      from '../context/authStore'

const BD = (p: string|null) => p ? `https://image.tmdb.org/t/p/w1280${p}` : ''
const PS = (p: string|null) => p ? `https://image.tmdb.org/t/p/w342${p}` : ''
const YR = (d?: string) => d?.slice(0,4) || ''
const RT = (n?: number) => n ? n.toFixed(1) : '—'

interface Video { key: string; type: string; site: string; official: boolean }

export default function TVDetail() {
  const { id }    = useParams()
  const navigate  = useNavigate()
  const { user }  = useAuthStore()
  const { items: wl, add: addWL, remove: removeWL } = useWatchlistStore()

  const [show,       setShow]       = useState<any>(null)
  const [cast,       setCast]       = useState<any[]>([])
  const [videos,     setVideos]     = useState<Video[]>([])
  const [ratingData, setRatingData] = useState({ avgRating:0, totalRatings:0, myRating:0 })
  const [loading,    setLoading]    = useState(true)
  const [trailerKey, setTrailerKey] = useState<string|null>(null)
  const [selSeason,  setSelSeason]  = useState(1)
  const [wlLoading,  setWlLoading]  = useState(false)

  const inWL = wl.some(w => w.movieId === Number(id))

  useEffect(() => {
    window.scrollTo(0,0)
    setLoading(true)
    Promise.all([
      api.get(`/movies/tv/${id}`),
      api.get(`/movies/tv/${id}/credits`),
      api.get(`/movies/tv/${id}/videos`),
      api.get(`/ratings/${id}?type=tv`).catch(() => ({ data: { avgRating:0, totalRatings:0, myRating:0 } })),
    ]).then(([s,c,v,r]) => {
      setShow(s.data); setCast(c.data.cast||[]); setVideos(v.data.results||[]); setRatingData(r.data)
      setSelSeason(1)
    }).finally(() => setLoading(false))
  }, [id])

  const trailer  = videos.find(v => v.type==='Trailer' && v.site==='YouTube' && v.official)
                || videos.find(v => v.type==='Trailer' && v.site==='YouTube')

  const toggleWL = async () => {
    if (!user || wlLoading || !show) return
    setWlLoading(true)
    try {
      inWL ? await removeWL(Number(id)) : await addWL({
        movieId: Number(id), title: show.name,
        poster: show.poster_path||'', backdrop: show.backdrop_path||'',
        rating: show.vote_average||0, year: YR(show.first_air_date),
      })
    } finally { setWlLoading(false) }
  }

  if (loading) return (
    <div className="pt-16 min-h-screen">
      <div className="skeleton" style={{ height: 'clamp(220px,40vw,420px)' }} />
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-4">
        <div className="h-8 skeleton rounded w-2/3" />
        <div className="h-4 skeleton rounded w-1/2" />
        <div className="h-24 skeleton rounded" />
      </div>
    </div>
  )

  if (!show) return <div className="pt-16 min-h-screen flex items-center justify-center text-slate-500">Show not found</div>

  const seasons      = (show.seasons||[]).filter((s:any) => s.season_number > 0)
  const selSeasonData= seasons.find((s:any) => s.season_number === selSeason)
  const genres       = (show.genres||[]).map((g:any) => g.name)

  const statusColor = show.status === 'Returning Series'
    ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
    : show.status === 'Ended'
    ? 'bg-slate-500/20 border-slate-500/30 text-slate-400'
    : 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400'

  return (
    <div className="min-h-screen">
      {trailerKey && <TrailerModal videoKey={trailerKey} title={show.name} onClose={() => setTrailerKey(null)} />}

      {/* Hero */}
      <div className="relative overflow-hidden" style={{ height: 'clamp(220px, 40vw, 460px)' }}>
        <img src={BD(show.backdrop_path)} alt="" className="absolute inset-0 w-full h-full object-cover object-top" />
        <div className="absolute inset-0 bg-hero-gradient" />
        <div className="absolute inset-0" style={{ background:'linear-gradient(to top, #07080c 0%, transparent 45%)' }} />
        <button onClick={() => navigate(-1)}
          className="absolute top-20 left-4 sm:left-6 flex items-center gap-1.5 text-white/70 hover:text-white text-sm glass px-3 py-1.5 rounded-xl transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m15 18-6-6 6-6"/></svg>
          Back
        </button>
        {trailer && (
          <button onClick={() => setTrailerKey(trailer.key)} className="absolute inset-0 flex items-center justify-center group">
            <div className="w-16 h-16 rounded-full glass border border-white/20 flex items-center justify-center group-hover:bg-brand group-hover:border-brand transition-all duration-300 shadow-deep">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="white" className="ml-1"><polygon points="5,3 19,12 5,21"/></svg>
            </div>
          </button>
        )}
      </div>

      <div className="max-w-5xl mx-auto px-3 sm:px-6 -mt-12 sm:-mt-20 relative z-10 pb-16">
        <div className="flex gap-4 sm:gap-7 mb-8">
          <div className="flex-shrink-0 hidden sm:block">
            <img src={PS(show.poster_path)} alt={show.name} className="w-24 sm:w-40 rounded-2xl shadow-deep ring-1 ring-white/10" />
          </div>

          <div className="flex-1 min-w-0 pt-8 sm:pt-14">
            <h1 className="font-bold leading-tight mb-2 text-shadow"
              style={{ fontFamily:'Syne, sans-serif', fontSize:'clamp(1.4rem,3.5vw,2.5rem)' }}>
              {show.name}
            </h1>

            {show.tagline && <p className="text-brand text-sm italic mb-3 opacity-80">"{show.tagline}"</p>}

            <div className="flex flex-wrap gap-2 items-center mb-2">
              <span className="badge-gold">★ {RT(show.vote_average)}</span>
              <span className="text-slate-400 text-sm">{YR(show.first_air_date)}</span>
              <span className="text-slate-400 text-sm">{seasons.length} Seasons</span>
              <span className="text-slate-400 text-sm">{show.number_of_episodes} Eps</span>
              {show.status && <span className={`badge text-xs border ${statusColor}`}>{show.status}</span>}
            </div>

            {genres.length > 0 && (
              <div className="flex gap-1.5 flex-wrap mb-4">
                {genres.slice(0,4).map((g:string) => (
                  <span key={g} className="text-xs text-slate-500 border border-dark-border px-2 py-0.5 rounded-full hidden sm:inline">{g}</span>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2 mb-4">
              <button onClick={() => navigate(`/player/tv/${id}?season=1&episode=1`)} className="btn-primary px-5 py-2.5 text-sm">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                Watch S1E1
              </button>
              {trailer && (
                <button onClick={() => setTrailerKey(trailer.key)} className="btn-secondary px-4 py-2.5 text-sm">🎬 Trailer</button>
              )}
              <button onClick={toggleWL} disabled={wlLoading}
                className={`px-4 py-2.5 text-sm rounded-xl border font-medium transition-all flex items-center gap-2 ${
                  inWL ? 'bg-brand/10 border-brand/40 text-brand' : 'bg-dark-card border-dark-border text-slate-300 hover:border-brand/50'
                }`}>
                {wlLoading ? <div className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />
                  : inWL ? '✓ Saved' : '+ Watchlist'}
              </button>
              <ShareButton title={show.name} />
            </div>

            <StarRating tmdbId={Number(id)} type="tv"
              initialRating={ratingData.myRating} avgRating={ratingData.avgRating} totalRatings={ratingData.totalRatings} />
          </div>
        </div>

        {/* Overview */}
        <div className="card p-5 sm:p-6 mb-6">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">Overview</h3>
          <p className="text-slate-300 text-sm sm:text-base leading-relaxed">{show.overview || 'No overview available.'}</p>
        </div>

        {/* Seasons */}
        {seasons.length > 0 && (
          <div className="card p-5 sm:p-6 mb-6">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">Seasons</h3>
            <div className="flex gap-2 flex-wrap mb-4">
              {seasons.map((s:any) => (
                <button key={s.season_number} onClick={() => setSelSeason(s.season_number)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    selSeason === s.season_number ? 'bg-brand text-dark' : 'bg-dark-surface border border-dark-border text-slate-400 hover:text-white'
                  }`}>
                  S{s.season_number}
                </button>
              ))}
            </div>

            {selSeasonData && (
              <div className="flex gap-4 items-start">
                {selSeasonData.poster_path && (
                  <img src={`https://image.tmdb.org/t/p/w154${selSeasonData.poster_path}`} alt=""
                    className="w-16 rounded-xl flex-shrink-0 hidden sm:block shadow-card" />
                )}
                <div className="flex-1">
                  <p className="text-white font-semibold text-sm mb-0.5">{selSeasonData.name}</p>
                  <p className="text-slate-500 text-xs mb-2">{selSeasonData.episode_count} episodes · {YR(selSeasonData.air_date)}</p>
                  {selSeasonData.overview && (
                    <p className="text-slate-400 text-xs leading-relaxed line-clamp-3 mb-3">{selSeasonData.overview}</p>
                  )}
                  <button onClick={() => navigate(`/player/tv/${id}?season=${selSeason}&episode=1`)}
                    className="btn-primary px-4 py-1.5 text-xs">
                    ▶ Watch Season {selSeason}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mb-6"><CastSection cast={cast} loading={false} /></div>
        <div className="mb-6"><SimilarRow tmdbId={Number(id)} type="tv" /></div>
      </div>
    </div>
  )
}
