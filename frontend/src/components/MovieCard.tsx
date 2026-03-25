// frontend/src/components/MovieCard.tsx — FULL REPLACEMENT
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Movie } from '../types'
import { useAuthStore }      from '../context/authStore'
import { useWatchlistStore } from '../stores/watchlistStore'

const IMG      = 'https://image.tmdb.org/t/p/w300'
const FALLBACK = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQ1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQ1MCIgZmlsbD0iIzEzMTYxZiIvPjx0ZXh0IHg9IjUwJSIgeT0iNDglIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LXNpemU9IjU2IiBmaWxsPSIjMWUyMjM1Ij7wn46cPC90ZXh0Pjx0ZXh0IHg9IjUwJSIgeT0iNjIlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LXNpemU9IjEyIiBmaWxsPSIjMzM0MTU1Ij5ObyBJbWFnZTwvdGV4dD48L3N2Zz4='

const GENRE_MAP: Record<number,string> = {
  28:'Action',12:'Adventure',16:'Animation',35:'Comedy',80:'Crime',
  18:'Drama',10751:'Family',14:'Fantasy',27:'Horror',9648:'Mystery',
  10749:'Romance',878:'Sci-Fi',53:'Thriller',10752:'War',37:'Western',
  10759:'Action',10765:'Sci-Fi',10762:'Kids',
}

interface Props {
  movie:     Movie
  showType?: boolean
}

export default function MovieCard({ movie, showType = false }: Props) {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { items: wl, add: addWL, remove: removeWL } = useWatchlistStore()

  const [imgErr,    setImgErr]    = useState(false)
  const [wlLoading, setWlLoading] = useState(false)

  const title  = movie.title || movie.name || ''
  const yr     = (movie.release_date || movie.first_air_date || '').slice(0,4)
  const rt     = movie.vote_average || 0
  const isTV   = !!movie.name && !movie.title
  const type   = isTV ? 'tv' : 'movie'
  const inWL   = wl.some(w => w.movieId === movie.id)
  const genres = (movie.genre_ids || []).slice(0,2).map(id => GENRE_MAP[id]).filter(Boolean)

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
      inWL ? await removeWL(movie.id) : await addWL({
        movieId: movie.id, title,
        poster:   movie.poster_path   || '',
        backdrop: movie.backdrop_path || '',
        rating:   rt, year: yr,
      })
    } finally { setWlLoading(false) }
  }

  return (
    <div
      onClick={goDetail}
      className="group relative cursor-pointer rounded-xl overflow-hidden bg-dark-card select-none"
      style={{ aspectRatio: '2/3' }}>

      {/* ── Poster image ── */}
      <img
        src={!imgErr && movie.poster_path ? IMG + movie.poster_path : FALLBACK}
        alt={title}
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        loading="lazy"
        draggable={false}
        onError={() => setImgErr(true)}
      />

      {/* ── Gradient overlay — always present, darkens on hover ── */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#07080c] via-transparent to-transparent opacity-60 group-hover:opacity-90 transition-opacity duration-300" />

      {/* ── Top badges ── */}
      <div className="absolute top-2 left-2 flex flex-col gap-1 z-10">
        {rt >= 8 && (
          <span className="badge-gold text-[10px] px-1.5 py-0.5">
            ★ {rt.toFixed(1)}
          </span>
        )}
        {showType && (
          <span className={`badge text-[10px] px-1.5 py-0.5 ${
            type === 'tv'
              ? 'bg-blue-500/20 border border-blue-500/30 text-blue-300'
              : 'bg-dark-border/80 border border-dark-border text-slate-400'
          }`}>
            {type === 'tv' ? 'TV' : 'Film'}
          </span>
        )}
      </div>

      {/* ── Watchlist button ── */}
      {user && (
        <button
          onClick={toggleWL}
          disabled={wlLoading}
          className={`absolute top-2 right-2 z-10 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-200 opacity-0 group-hover:opacity-100 ${
            inWL
              ? 'bg-brand text-dark shadow-brand-sm'
              : 'bg-black/60 text-white hover:bg-brand hover:text-dark'
          }`}>
          {wlLoading
            ? <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
            : inWL ? '✓' : '+'}
        </button>
      )}

      {/* ── Bottom info — slides up on hover ── */}
      <div className="absolute bottom-0 left-0 right-0 p-2.5 z-10 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out">

        <p className="text-white text-xs font-semibold leading-tight mb-1.5 line-clamp-2"
          style={{ fontFamily: 'DM Sans, sans-serif' }}>
          {title}
        </p>

        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          {rt > 0 && rt < 8 && (
            <span className="text-gold text-[10px] font-semibold">★ {rt.toFixed(1)}</span>
          )}
          {yr && <span className="text-slate-500 text-[10px]">{yr}</span>}
          {genres.slice(0,1).map(g => (
            <span key={g} className="text-[10px] text-slate-500 border border-dark-border px-1.5 py-0.5 rounded-full">
              {g}
            </span>
          ))}
        </div>

        <button
          onClick={goPlay}
          className="w-full bg-brand text-dark text-[11px] font-bold py-1.5 rounded-lg hover:bg-brand-light transition-colors active:scale-95">
          ▶ Play
        </button>
      </div>
    </div>
  )
}
