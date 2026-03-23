// frontend/src/pages/TVDetail.tsx — FULL REPLACEMENT
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'
import { backdrop, poster, rating, year } from '../services/tmdb'
import TrailerModal from '../components/TrailerModal'
import CastSection  from '../components/CastSection'
import SimilarRow   from '../components/SimilarRow'
import StarRating   from '../components/StarRating'
import ShareButton  from '../components/ShareButton'
import { useWatchlistStore } from '../stores/watchlistStore'
import { useAuthStore } from '../context/authStore'

interface Video { key: string; type: string; site: string; official: boolean }

export default function TVDetail() {
  const { id }    = useParams()
  const navigate  = useNavigate()
  const { user }  = useAuthStore()
  const { items: wl, add: addWL, remove: removeWL } = useWatchlistStore()

  const [show,       setShow]       = useState<any>(null)
  const [cast,       setCast]       = useState<any[]>([])
  const [videos,     setVideos]     = useState<Video[]>([])
  const [ratingData, setRatingData] = useState({ avgRating: 0, totalRatings: 0, myRating: 0 })
  const [loading,    setLoading]    = useState(true)
  const [trailerKey, setTrailerKey] = useState<string | null>(null)
  const [selSeason,  setSelSeason]  = useState(1)
  const [wlLoading,  setWlLoading]  = useState(false)

  const inWL = wl.some(w => w.movieId === Number(id))

  useEffect(() => {
    window.scrollTo(0, 0)
    setLoading(true)
    Promise.all([
      api.get(`/movies/tv/${id}`),
      api.get(`/movies/tv/${id}/credits`),
      api.get(`/movies/tv/${id}/videos`),
      api.get(`/ratings/${id}?type=tv`).catch(() => ({ data: { avgRating: 0, totalRatings: 0, myRating: 0 } })),
    ]).then(([s, c, v, r]) => {
      setShow(s.data)
      setCast(c.data.cast || [])
      setVideos(v.data.results || [])
      setRatingData(r.data)
      setSelSeason(1)
    }).finally(() => setLoading(false))
  }, [id])

  const trailer = videos.find(v => v.type === 'Trailer' && v.site === 'YouTube' && v.official)
               || videos.find(v => v.type === 'Trailer' && v.site === 'YouTube')

  const toggleWL = async () => {
    if (!user || wlLoading || !show) return
    setWlLoading(true)
    try {
      if (inWL) {
        await removeWL(Number(id))
      } else {
        await addWL({
          movieId:  Number(id),
          title:    show.name,
          poster:   show.poster_path || '',
          backdrop: show.backdrop_path || '',
          rating:   show.vote_average || 0,
          year:     year(show.first_air_date),
        })
      }
    } finally { setWlLoading(false) }
  }

  if (loading) {
    return (
      <div className="pt-14 min-h-screen">
        <div className="h-[250px] sm:h-[400px] bg-dark-surface animate-pulse" />
        <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
          <div className="h-8 bg-dark-card animate-pulse rounded w-1/2" />
          <div className="h-4 bg-dark-card animate-pulse rounded w-1/3" />
          <div className="h-20 bg-dark-card animate-pulse rounded" />
        </div>
      </div>
    )
  }

  if (!show) return (
    <div className="pt-14 min-h-screen flex items-center justify-center text-slate-500">Show not found</div>
  )

  const genres  = (show.genres || []).map((g: any) => g.name).join(' · ')
  const seasons = (show.seasons || []).filter((s: any) => s.season_number > 0)
  const selSeasonData = seasons.find((s: any) => s.season_number === selSeason)

  return (
    <div className="pt-14 min-h-screen">

      {trailerKey && (
        <TrailerModal videoKey={trailerKey} title={show.name} onClose={() => setTrailerKey(null)} />
      )}

      {/* Hero */}
      <div className="relative h-[250px] sm:h-[420px] overflow-hidden">
        <img src={backdrop(show.backdrop_path, 'w1280')} alt={show.name} className="w-full h-full object-cover object-top" />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(6,9,15,1) 0%, rgba(6,9,15,0.4) 60%, transparent 100%)' }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, rgba(6,9,15,0.8) 0%, transparent 60%)' }} />
        <button onClick={() => navigate(-1)} className="absolute top-4 left-4 text-white/70 hover:text-white bg-black/40 rounded-xl px-3 py-1.5 text-sm backdrop-blur">
          ← Back
        </button>
      </div>

      {/* Main content */}
      <div className="max-w-5xl mx-auto px-3 sm:px-6 -mt-16 sm:-mt-24 relative z-10 pb-12">
        <div className="flex gap-4 sm:gap-6 mb-6">

          {/* Poster */}
          <div className="flex-shrink-0 hidden sm:block">
            <img src={poster(show.poster_path)} alt={show.name}
              className="w-32 sm:w-44 rounded-2xl shadow-2xl ring-1 ring-white/10" />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 pt-12 sm:pt-16">
            <h1 className="text-2xl sm:text-4xl font-black leading-tight mb-2">{show.name}</h1>

            {show.tagline && (
              <p className="text-brand text-sm italic mb-3">"{show.tagline}"</p>
            )}

            <div className="flex flex-wrap gap-2 items-center mb-2">
              <span className="text-yellow-400 font-bold">★ {rating(show.vote_average)}</span>
              <span className="text-slate-400 text-sm">{year(show.first_air_date)}</span>
              <span className="text-slate-400 text-sm">{seasons.length} Season{seasons.length !== 1 ? 's' : ''}</span>
              <span className="text-slate-400 text-sm">{show.number_of_episodes} Episodes</span>
              {show.status && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  show.status === 'Returning Series'
                    ? 'bg-green-500/20 text-green-400'
                    : show.status === 'Ended'
                    ? 'bg-slate-500/20 text-slate-400'
                    : 'bg-yellow-500/20 text-yellow-400'
                }`}>{show.status}</span>
              )}
            </div>

            {genres && <p className="text-slate-500 text-sm mb-3">{genres}</p>}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 mb-4">
              <button onClick={() => navigate(`/player/tv/${id}?season=1&episode=1`)}
                className="btn-primary px-5 py-2.5 text-sm flex items-center gap-2">
                ▶ Play S1E1
              </button>
              {trailer && (
                <button onClick={() => setTrailerKey(trailer.key)}
                  className="btn-secondary px-4 py-2.5 text-sm">
                  🎬 Trailer
                </button>
              )}
              <button onClick={toggleWL} disabled={wlLoading}
                className={`px-4 py-2.5 text-sm rounded-xl border font-semibold transition-all flex items-center gap-2 ${
                  inWL ? 'bg-brand/15 border-brand text-brand' : 'bg-dark-card border-dark-border text-slate-300 hover:border-brand'
                }`}>
                {wlLoading
                  ? <div className="w-4 h-4 border border-current border-t-transparent rounded-full animate-spin" />
                  : inWL ? '✓ Watchlisted' : '+ Watchlist'}
              </button>
              <ShareButton title={show.name} />
            </div>

            {/* User rating */}
            <StarRating
              tmdbId={Number(id)}
              type="tv"
              initialRating={ratingData.myRating}
              avgRating={ratingData.avgRating}
              totalRatings={ratingData.totalRatings}
            />
          </div>
        </div>

        {/* Overview */}
        <div className="bg-dark-surface border border-dark-border rounded-2xl p-4 sm:p-5 mb-6">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 mb-2">Overview</h3>
          <p className="text-slate-300 text-sm leading-relaxed">{show.overview || 'No overview available.'}</p>
        </div>

        {/* Seasons */}
        {seasons.length > 0 && (
          <div className="bg-dark-surface border border-dark-border rounded-2xl p-4 sm:p-5 mb-6">
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 mb-3">Seasons</h3>
            <div className="flex gap-2 flex-wrap mb-4">
              {seasons.map((s: any) => (
                <button key={s.season_number} onClick={() => setSelSeason(s.season_number)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    selSeason === s.season_number ? 'bg-brand text-dark' : 'bg-dark-card border border-dark-border text-slate-400 hover:text-white'
                  }`}>
                  S{s.season_number}
                </button>
              ))}
            </div>
            {selSeasonData && (
              <div className="flex gap-3 items-start">
                {selSeasonData.poster_path && (
                  <img src={`https://image.tmdb.org/t/p/w154${selSeasonData.poster_path}`} alt=""
                    className="w-16 rounded-lg flex-shrink-0 hidden sm:block" />
                )}
                <div>
                  <p className="text-white font-bold text-sm mb-0.5">{selSeasonData.name}</p>
                  <p className="text-slate-500 text-xs mb-2">{selSeasonData.episode_count} episodes · {year(selSeasonData.air_date)}</p>
                  {selSeasonData.overview && (
                    <p className="text-slate-400 text-xs leading-relaxed line-clamp-3">{selSeasonData.overview}</p>
                  )}
                  <button onClick={() => navigate(`/player/tv/${id}?season=${selSeason}&episode=1`)}
                    className="mt-3 btn-primary px-4 py-1.5 text-xs">
                    ▶ Watch Season {selSeason}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Cast */}
        <div className="mb-6">
          <CastSection cast={cast} loading={false} />
        </div>

        {/* Similar */}
        <div className="mb-6">
          <SimilarRow tmdbId={Number(id)} type="tv" />
        </div>
      </div>
    </div>
  )
}
