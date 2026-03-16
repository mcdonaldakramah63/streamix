import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Movie } from '../types'
import { fetchMovieDetails } from '../services/api'
import { backdrop, poster, avatar, rating, year, runtime } from '../services/tmdb'
import { useWatchlistStore } from '../context/watchlistStore'
import { useAuthStore } from '../context/authStore'
import Carousel from '../components/Carousel'

export default function MovieDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { add, remove, isInList, fetch: fetchWL } = useWatchlistStore()
  const [movie, setMovie] = useState<Movie | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.scrollTo(0, 0)
    setLoading(true)
    fetchMovieDetails(Number(id))
      .then(r => setMovie(r.data))
      .finally(() => setLoading(false))
    if (user) fetchWL()
  }, [id])

  if (loading) return (
    <div className="pt-14">
      <div className="w-full h-[420px] bg-dark-surface animate-pulse" />
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-4">
        {[300, 200, 400].map(w => <div key={w} className={`h-4 bg-dark-card rounded animate-pulse`} style={{ width: w }} />)}
      </div>
    </div>
  )

  if (!movie) return <div className="pt-20 text-center text-slate-400">Movie not found</div>

  const trailer = movie.videos?.results.find(v => v.site === 'YouTube' && v.type === 'Trailer')
  const director = movie.credits?.crew.find(c => c.job === 'Director')
  const inWL = isInList(movie.id)
  const imdbId = movie.external_ids?.imdb_id

  const handleWatchlist = () => {
    if (!user) return navigate('/login')
    if (inWL) remove(movie.id)
    else add({ movieId: movie.id, title: movie.title, poster: movie.poster_path ?? '', backdrop: movie.backdrop_path ?? '', rating: movie.vote_average, year: year(movie.release_date) })
  }

  return (
    <div className="pt-14">
      {/* Backdrop */}
      <div className="relative h-[420px] overflow-hidden">
        <img src={backdrop(movie.backdrop_path)} alt="" className="w-full h-full object-cover object-top" />
        <div className="absolute inset-0 bg-dark/50" />
        <div className="absolute inset-0 bg-gradient-to-t from-dark via-dark/30 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-dark/70 to-transparent" />
      </div>

      <div className="max-w-5xl mx-auto px-4 -mt-56 relative z-10">
        <div className="flex gap-6 items-end mb-8">
          <img src={poster(movie.poster_path)} alt={movie.title} className="w-36 rounded-xl shadow-2xl flex-shrink-0 hidden sm:block" />
          <div className="flex-1">
            <h1 className="text-3xl font-black mb-2 tracking-tight">{movie.title}</h1>
            <div className="flex flex-wrap gap-3 items-center text-sm text-slate-400 mb-3">
              <span className="bg-brand/15 border border-brand/30 text-brand px-2 py-0.5 rounded-full text-xs font-bold">★ {rating(movie.vote_average)}</span>
              <span>{year(movie.release_date)}</span>
              {movie.runtime && <span>{runtime(movie.runtime)}</span>}
              {director && <span>Directed by <span className="text-slate-200">{director.name}</span></span>}
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              {movie.genres?.map(g => (
                <span key={g.id} className="bg-brand/10 border border-brand/20 text-brand text-xs px-3 py-1 rounded-full">{g.name}</span>
              ))}
            </div>
            <div className="flex gap-3 flex-wrap">
              {imdbId && (
                <button onClick={() => navigate(`/player/movie/${movie.id}`)} className="btn-primary flex items-center gap-2">▶ Play Now</button>
              )}
              {trailer && (
                <a href={`https://youtube.com/watch?v=${trailer.key}`} target="_blank" rel="noreferrer" className="btn-secondary flex items-center gap-2">▶ Trailer</a>
              )}
              <button onClick={handleWatchlist} className={`btn-ghost flex items-center gap-2 ${inWL ? 'border-brand text-brand' : ''}`}>
                {inWL ? '✓ In Watchlist' : '+ Watchlist'}
              </button>
            </div>
          </div>
        </div>

        <p className="text-slate-300 leading-relaxed mb-8 max-w-3xl">{movie.overview}</p>

        {/* Cast */}
        {movie.credits?.cast?.length ? (
          <div className="mb-8">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Cast</h3>
            <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
              {movie.credits.cast.slice(0, 12).map(c => (
                <div key={c.id} className="flex-shrink-0 w-16 text-center">
                  <img src={avatar(c.profile_path)} alt={c.name} className="w-16 h-16 rounded-full object-cover bg-dark-card mb-1.5" onError={e => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(c.name)}&background=161b27&color=94a3b8` }} />
                  <div className="text-xs text-slate-300 leading-tight">{c.name}</div>
                  <div className="text-xs text-slate-500 leading-tight truncate">{c.character}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Recommendations */}
        {movie.recommendations?.results?.length ? (
          <Carousel title="More Like This" movies={movie.recommendations.results} />
        ) : null}
      </div>
    </div>
  )
}
