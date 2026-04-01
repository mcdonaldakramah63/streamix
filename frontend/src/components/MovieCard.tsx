// frontend/src/components/MovieCard.tsx — FULL REPLACEMENT
// FIX: uses useWatchlistStore with correct method names, shows login prompt if not authed
import { useState, useCallback } from 'react'
import { useNavigate }           from 'react-router-dom'
import { useWatchlistStore }     from '../stores/watchlistStore'
import { useAuthStore }          from '../context/authStore'

interface Movie {
  id:            number
  title?:        string
  name?:         string
  poster_path?:  string | null
  backdrop_path?:string | null
  vote_average?: number
  release_date?: string
  first_air_date?:string
  media_type?:   string
  overview?:     string
}

interface Props {
  movie:     Movie
  type?:     'movie' | 'tv'
  showType?: boolean
  rank?:     number
}

const IMG = (p: string | null | undefined, s = 'w342') =>
  p ? `https://image.tmdb.org/t/p/${s}${p}` : ''

export default function MovieCard({ movie, type, showType, rank }: Props) {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { isIn, add, remove, items } = useWatchlistStore()

  const [imgErr,   setImgErr]   = useState(false)
  const [wlBusy,   setWlBusy]   = useState(false)
  const [wlFeedback, setWlFeedback] = useState<'added' | 'removed' | null>(null)

  const isTV       = type === 'tv' || movie.media_type === 'tv' || !!movie.name
  const mediaType  = isTV ? 'tv' : 'movie'
  const title      = movie.title || movie.name || ''
  const year       = (movie.release_date || movie.first_air_date || '').slice(0, 4)
  const rating     = movie.vote_average || 0
  const inWL       = isIn(movie.id)

  const handleWL = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (!user) {
      navigate('/login')
      return
    }
    if (wlBusy) return

    setWlBusy(true)
    try {
      if (inWL) {
        await remove(movie.id)
        setWlFeedback('removed')
      } else {
        await add({
          movieId:  movie.id,
          title,
          poster:   movie.poster_path   || '',
          backdrop: movie.backdrop_path || '',
          rating,
          year,
          type:     mediaType,
        })
        setWlFeedback('added')
      }
      setTimeout(() => setWlFeedback(null), 1500)
    } catch (err) {
      console.error('[MovieCard] WL toggle failed:', err)
    } finally {
      setWlBusy(false)
    }
  }, [user, wlBusy, inWL, movie, title, rating, year, mediaType, add, remove, navigate])

  const handleClick = () =>
    navigate(isTV ? `/tv/${movie.id}` : `/movie/${movie.id}`)

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigate(isTV
      ? `/player/tv/${movie.id}?season=1&episode=1`
      : `/player/movie/${movie.id}`)
  }

  const posterSrc = !imgErr && movie.poster_path ? IMG(movie.poster_path) : ''

  return (
    <div
      className="group relative cursor-pointer flex-shrink-0"
      style={{ aspectRatio: '2/3' }}
      onClick={handleClick}
    >
      {/* Poster */}
      <div className="relative w-full h-full rounded-xl overflow-hidden bg-dark-card">
        {posterSrc ? (
          <img
            src={posterSrc}
            alt={title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            onError={() => setImgErr(true)}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-dark-surface px-2 text-center">
            <span className="text-3xl">{isTV ? '📺' : '🎬'}</span>
            <p className="text-[10px] text-slate-500 line-clamp-3 font-medium">{title}</p>
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

        {/* Rank badge */}
        {rank && (
          <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-brand text-dark text-[10px] font-black flex items-center justify-center shadow">
            {rank}
          </div>
        )}

        {/* Rating badge */}
        {rating >= 7 && (
          <div className="absolute top-2 right-2 flex items-center gap-0.5 bg-black/60 text-gold text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            ★ {rating.toFixed(1)}
          </div>
        )}

        {/* Type badge */}
        {showType && (
          <div className={`absolute top-2 ${rating >= 7 ? 'right-14' : 'right-2'} text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isTV ? 'bg-blue-500/80 text-white' : 'bg-brand/80 text-dark'}`}>
            {isTV ? 'TV' : 'Movie'}
          </div>
        )}

        {/* Hover actions */}
        <div className="absolute bottom-0 left-0 right-0 p-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-y-2 group-hover:translate-y-0">
          {/* Play */}
          <button
            onClick={handlePlay}
            className="flex-1 bg-brand text-dark text-[11px] font-bold py-1.5 rounded-lg hover:bg-brand-light active:scale-95 transition-all flex items-center justify-center gap-1"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5,3 19,12 5,21"/>
            </svg>
            Play
          </button>

          {/* Watchlist */}
          <button
            onClick={handleWL}
            disabled={wlBusy}
            className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-all active:scale-90 flex-shrink-0 ${
              inWL
                ? 'bg-brand/20 text-brand border border-brand/50'
                : 'bg-black/60 text-white border border-white/20 hover:border-brand/50'
            }`}
            title={inWL ? 'Remove from watchlist' : 'Add to watchlist'}
          >
            {wlBusy ? (
              <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
            ) : wlFeedback === 'added' ? (
              '✓'
            ) : wlFeedback === 'removed' ? (
              '–'
            ) : inWL ? (
              '✓'
            ) : (
              '+'
            )}
          </button>
        </div>
      </div>

      {/* Title below */}
      <div className="mt-1.5 px-0.5">
        <p className="text-[11px] sm:text-xs font-semibold text-slate-200 truncate leading-tight">{title}</p>
        {year && <p className="text-[10px] text-slate-600 mt-0.5">{year}</p>}
      </div>
    </div>
  )
}
