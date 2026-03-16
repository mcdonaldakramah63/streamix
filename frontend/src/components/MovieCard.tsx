import { Link } from 'react-router-dom'
import { Movie } from '../types'
import { poster, year, rating } from '../services/tmdb'

interface Props {
  movie: Movie
  size?: 'sm' | 'md'
}

export default function MovieCard({ movie, size = 'md' }: Props) {
  const isTV = movie.media_type === 'tv' || !!movie.first_air_date
  const path = isTV ? `/tv/${movie.id}` : `/movie/${movie.id}`
  const title = movie.title || movie.name || ''
  const date = movie.release_date || movie.first_air_date || ''

  return (
    <Link to={path} className={`card-hover block flex-shrink-0 ${size === 'sm' ? 'w-28' : 'w-36'}`}>
      <div className="relative rounded-lg overflow-hidden bg-dark-card group">
        <img
          src={poster(movie.poster_path)}
          alt={title}
          loading="lazy"
          className="w-full aspect-[2/3] object-cover"
          onError={(e) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/200x300?text=No+Image' }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="absolute bottom-0 left-0 right-0 p-2 translate-y-2 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all">
          <div className="text-yellow-400 text-xs font-bold">★ {rating(movie.vote_average)}</div>
        </div>
      </div>
      <div className="mt-1.5 px-0.5">
        <div className="text-xs font-semibold text-slate-200 truncate">{title}</div>
        <div className="text-xs text-slate-500">{year(date)}</div>
      </div>
    </Link>
  )
}
