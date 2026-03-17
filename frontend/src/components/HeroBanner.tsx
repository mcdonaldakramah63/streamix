import { useNavigate } from 'react-router-dom'
import { Movie } from '../types'
import { backdrop, rating, year, runtime } from '../services/tmdb'

interface Props { movie: Movie | null; loading?: boolean }

export default function HeroBanner({ movie, loading }: Props) {
  const navigate = useNavigate()

  if (loading || !movie) {
    return <div className="w-full h-[300px] sm:h-[420px] md:h-[480px] bg-dark-surface animate-pulse" />
  }

  const isTV  = !!movie.first_air_date
  const title = movie.title || movie.name || ''
  const date  = movie.release_date || movie.first_air_date || ''

  return (
    <div className="relative w-full h-[300px] sm:h-[420px] md:h-[480px] overflow-hidden">
      <img src={backdrop(movie.backdrop_path)} alt={title}
        className="w-full h-full object-cover object-top" />
      <div className="absolute inset-0 bg-dark/50" />
      <div className="absolute inset-0 bg-gradient-to-t from-dark via-dark/30 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-dark/80 via-dark/30 to-transparent" />

      <div className="absolute bottom-6 sm:bottom-14 left-4 sm:left-6 right-4 sm:right-auto sm:max-w-lg">
        <span className="inline-block bg-brand text-dark text-xs font-black px-2.5 py-1 rounded-full uppercase tracking-widest mb-2 sm:mb-3">
          🔥 Trending
        </span>
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-black leading-tight mb-2 tracking-tight line-clamp-2">{title}</h1>
        <div className="flex items-center gap-2 sm:gap-3 text-sm text-slate-400 mb-2 sm:mb-3 flex-wrap">
          <span className="bg-brand/15 border border-brand/30 text-brand px-2 py-0.5 rounded-full text-xs font-bold">★ {rating(movie.vote_average)}</span>
          <span className="text-xs sm:text-sm">{year(date)}</span>
          {movie.runtime && <span className="text-xs sm:text-sm hidden sm:inline">{runtime(movie.runtime)}</span>}
        </div>
        <p className="text-xs sm:text-sm text-slate-400 leading-relaxed mb-3 sm:mb-5 line-clamp-2 sm:line-clamp-3 hidden sm:block">{movie.overview}</p>
        <div className="flex gap-2 sm:gap-3">
          <button onClick={() => navigate(`/player/${isTV ? 'tv' : 'movie'}/${movie.id}`)}
            className="btn-primary text-xs sm:text-sm px-4 sm:px-5 py-2 sm:py-2.5 flex items-center gap-1.5">
            ▶ Play
          </button>
          <button onClick={() => navigate(isTV ? `/tv/${movie.id}` : `/movie/${movie.id}`)}
            className="btn-secondary text-xs sm:text-sm px-4 sm:px-5 py-2 sm:py-2.5">
            More Info
          </button>
        </div>
      </div>
    </div>
  )
}
