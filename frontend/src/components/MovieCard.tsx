// frontend/src/components/MovieCard.tsx — FULL REPLACEMENT
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Movie } from '../types'
import { useAuthStore } from '../context/authStore'
import { useWatchlistStore } from '../stores/watchlistStore'

const IMG      = 'https://image.tmdb.org/t/p/w300'
const FALLBACK = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQ1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQ1MCIgZmlsbD0iIzBkMTExNyIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LXNpemU9IjY0IiBmaWxsPSIjMWEyMDJjIj7wn46cPC90ZXh0Pjwvc3ZnPg=='

const GENRE_MAP: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy',
  80: 'Crime', 18: 'Drama', 10751: 'Family', 14: 'Fantasy',
  27: 'Horror', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
  53: 'Thriller', 10752: 'War', 37: 'Western', 10759: 'Action',
  10765: 'Sci-Fi', 10762: 'Kids',
}

interface Props {
  movie:    Movie
  showType?: boolean
}

export default function MovieCard({ movie, showType = false }: Props) {
  const navigate   = useNavigate()
  const { user }   = useAuthStore()
  const { items: wl, add: addWL, remove: removeWL } = useWatchlistStore()

  const [imgErr,    setImgErr]    = useState(false)
  const [wlLoading, setWlLoading] = useState(false)

  const title    = movie.title || movie.name || ''
  const yr       = (movie.release_date || movie.first_air_date || '').slice(0, 4)
  const rt       = movie.vote_average
  const isTV     = !!movie.name && !movie.title
  const type     = isTV ? 'tv' : 'movie'
  const inWL     = wl.some(w => w.movieId === movie.id)
  const genres   = (movie.genre_ids || []).slice(0, 2).map(id => GENRE_MAP[id]).filter(Boolean)

  const goDetail = () => navigate(type === 'tv' ? `/tv/${movie.id}` : `/movie/${movie.id}`)
  const goPlay   = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigate(type === 'tv' ? `/player/tv/${movie.id}?season=1&episode=1` : `/player/movie/${movie.id}`)
  }

  const toggleWL = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!user || wlLoading) return
    setWlLoading(true)
    try {
      if (inWL) {
        await removeWL(movie.id)
      } else {
        await addWL({
          movieId:  movie.id,
          title,
          poster:   movie.poster_path || '',
          backdrop: movie.backdrop_path || '',
          rating:   rt || 0,
          year:     yr,
        })
      }
    } finally {
      setWlLoading(false)
    }
  }

  return (
    <div
      onClick={goDetail}
      className="group relative cursor-pointer rounded-xl overflow-hidden bg-dark-card border border-dark-border hover:border-brand/50 transition-all duration-300 hover:shadow-xl hover:shadow-brand/10 hover:-translate-y-0.5">

      {/* Poster */}
      <div className="aspect-[2/3] overflow-hidden">
        <img
          src={!imgErr && movie.poster_path ? IMG + movie.poster_path : FALLBACK}
          alt={title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
          onError={() => setImgErr(true)}
        />
      </div>

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      {/* Top badges */}
      <div className="absolute top-2 left-2 flex flex-col gap-1">
        {rt >= 8 && (
          <span className="bg-brand/90 text-dark text-xs font-black px-1.5 py-0.5 rounded-full">
            ★ {rt.toFixed(1)}
          </span>
        )}
        {showType && (
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
            type === 'tv' ? 'bg-blue-500/80 text-white' : 'bg-dark-card/80 text-slate-300'
          }`}>
            {type === 'tv' ? 'TV' : 'Movie'}
          </span>
        )}
      </div>

      {/* Watchlist button */}
      {user && (
        <button
          onClick={toggleWL}
          disabled={wlLoading}
          className={`absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-sm transition-all opacity-0 group-hover:opacity-100 ${
            inWL
              ? 'bg-brand text-dark'
              : 'bg-black/60 text-white hover:bg-brand hover:text-dark'
          }`}>
          {wlLoading
            ? <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
            : inWL ? '✓' : '+'
          }
        </button>
      )}

      {/* Bottom info — shows on hover */}
      <div className="absolute bottom-0 left-0 right-0 p-2.5 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
        <p className="text-white text-xs font-bold truncate mb-1">{title}</p>

        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          {rt > 0 && rt < 8 && <span className="text-yellow-400 text-xs">★ {rt.toFixed(1)}</span>}
          {yr && <span className="text-slate-400 text-xs">{yr}</span>}
          {genres.map(g => (
            <span key={g} className="bg-dark-card/80 text-slate-300 text-xs px-1.5 py-0.5 rounded-full">{g}</span>
          ))}
        </div>

        {/* Play button */}
        <button
          onClick={goPlay}
          className="w-full bg-brand text-dark text-xs font-black py-1.5 rounded-lg hover:bg-brand-dark transition-colors active:scale-95">
          ▶ Play
        </button>
      </div>
    </div>
  )
}
