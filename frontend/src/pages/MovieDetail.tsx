// frontend/src/pages/MovieDetail.tsx — FULL REPLACEMENT
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'
import { backdrop, poster, rating, year, runtime } from '../services/tmdb'
import TrailerModal  from '../components/TrailerModal'
import CastSection   from '../components/CastSection'
import SimilarRow    from '../components/SimilarRow'
import StarRating    from '../components/StarRating'
import ShareButton   from '../components/ShareButton'
import { useWatchlistStore } from '../stores/watchlistStore'
import { useAuthStore } from '../context/authStore'

interface Video { key: string; type: string; site: string; official: boolean }

export default function MovieDetail() {
  const { id }    = useParams()
  const navigate  = useNavigate()
  const { user }  = useAuthStore()
  const { items: wl, add: addWL, remove: removeWL } = useWatchlistStore()

  const [movie,      setMovie]      = useState<any>(null)
  const [cast,       setCast]       = useState<any[]>([])
  const [videos,     setVideos]     = useState<Video[]>([])
  const [ratingData, setRatingData] = useState({ avgRating: 0, totalRatings: 0, myRating: 0 })
  const [loading,    setLoading]    = useState(true)
  const [trailerKey, setTrailerKey] = useState<string | null>(null)
  const [wlLoading,  setWlLoading]  = useState(false)

  const inWL = wl.some(w => w.movieId === Number(id))

  useEffect(() => {
    window.scrollTo(0, 0)
    setLoading(true)
    Promise.all([
      api.get(`/movies/${id}`),
      api.get(`/movies/${id}/credits`),
      api.get(`/movies/${id}/videos`),
      api.get(`/ratings/${id}?type=movie`).catch(() => ({ data: { avgRating: 0, totalRatings: 0, myRating: 0 } })),
    ]).then(([m, c, v, r]) => {
      setMovie(m.data)
      setCast(c.data.cast || [])
      setVideos(v.data.results || [])
      setRatingData(r.data)
    }).finally(() => setLoading(false))
  }, [id])

  const trailer = videos.find(v => v.type === 'Trailer' && v.site === 'YouTube' && v.official)
               || videos.find(v => v.type === 'Trailer' && v.site === 'YouTube')

  const toggleWL = async () => {
    if (!user || wlLoading || !movie) return
    setWlLoading(true)
    try {
      if (inWL) {
        await removeWL(Number(id))
      } else {
        await addWL({
          movieId:  Number(id),
          title:    movie.title,
          poster:   movie.poster_path || '',
          backdrop: movie.backdrop_path || '',
          rating:   movie.vote_average || 0,
          year:     year(movie.release_date),
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

  if (!movie) return (
    <div className="pt-14 min-h-screen flex items-center justify-center text-slate-500">Movie not found</div>
  )

  const genres  = (movie.genres || []).map((g: any) => g.name).join(' · ')
  const studios = (movie.production_companies || []).slice(0, 2).map((c: any) => c.name).join(', ')

  return (
    <div className="pt-14 min-h-screen">

      {/* Trailer modal */}
      {trailerKey && (
        <TrailerModal videoKey={trailerKey} title={movie.title} onClose={() => setTrailerKey(null)} />
      )}

      {/* Hero backdrop */}
      <div className="relative h-[250px] sm:h-[420px] overflow-hidden">
        <img src={backdrop(movie.backdrop_path, 'w1280')} alt={movie.title} className="w-full h-full object-cover object-top" />
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
            <img src={poster(movie.poster_path)} alt={movie.title}
              className="w-32 sm:w-44 rounded-2xl shadow-2xl ring-1 ring-white/10" />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 pt-12 sm:pt-16">
            <h1 className="text-2xl sm:text-4xl font-black leading-tight mb-2">{movie.title}</h1>

            {movie.tagline && (
              <p className="text-brand text-sm italic mb-3">"{movie.tagline}"</p>
            )}

            <div className="flex flex-wrap gap-2 items-center mb-3">
              <span className="text-yellow-400 font-bold">★ {rating(movie.vote_average)}</span>
              <span className="text-slate-400 text-sm">{year(movie.release_date)}</span>
              {movie.runtime && <span className="text-slate-400 text-sm">{runtime(movie.runtime)}</span>}
              {genres && <span className="text-slate-500 text-sm">{genres}</span>}
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 mb-4">
              <button onClick={() => navigate(`/player/movie/${id}`)}
                className="btn-primary px-5 py-2.5 text-sm flex items-center gap-2">
                ▶ Play Now
              </button>
              {trailer && (
                <button onClick={() => setTrailerKey(trailer.key)}
                  className="btn-secondary px-4 py-2.5 text-sm flex items-center gap-2">
                  🎬 Trailer
                </button>
              )}
              <button onClick={toggleWL} disabled={wlLoading}
                className={`px-4 py-2.5 text-sm rounded-xl border font-semibold transition-all flex items-center gap-2 ${
                  inWL ? 'bg-brand/15 border-brand text-brand' : 'bg-dark-card border-dark-border text-slate-300 hover:border-brand'
                }`}>
                {wlLoading ? <div className="w-4 h-4 border border-current border-t-transparent rounded-full animate-spin" />
                  : inWL ? '✓ Watchlisted' : '+ Watchlist'}
              </button>
              <ShareButton title={movie.title} />
            </div>

            {/* User rating */}
            <StarRating
              tmdbId={Number(id)}
              type="movie"
              initialRating={ratingData.myRating}
              avgRating={ratingData.avgRating}
              totalRatings={ratingData.totalRatings}
            />
          </div>
        </div>

        {/* Overview */}
        <div className="bg-dark-surface border border-dark-border rounded-2xl p-4 sm:p-5 mb-6">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 mb-2">Overview</h3>
          <p className="text-slate-300 text-sm leading-relaxed">{movie.overview || 'No overview available.'}</p>

          {studios && (
            <p className="text-xs text-slate-600 mt-3">Production: {studios}</p>
          )}
        </div>

        {/* Cast */}
        <div className="mb-6">
          <CastSection cast={cast} loading={false} />
        </div>

        {/* Similar */}
        <div className="mb-6">
          <SimilarRow tmdbId={Number(id)} type="movie" />
        </div>
      </div>
    </div>
  )
}
