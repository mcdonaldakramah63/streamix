// frontend/src/components/MovieCard.tsx — cinematic 2:3 poster card (Stitch design)
import { useEffect, useRef, useState } from 'react'
import api, { prefetch } from '../services/api'
import { usePrefs } from '../stores/profileStore'
import { useTop10 } from '../stores/top10Store'
import { useNavigate } from 'react-router-dom'
import { useWatchlistStore } from '../stores/watchlistStore'
import { useAuthStore } from '../context/authStore'
import Icon from './Icon'

export interface CardMovie {
  id:              number
  title?:          string
  name?:           string
  poster_path?:    string | null
  backdrop_path?:  string | null
  vote_average?:   number
  release_date?:   string
  first_air_date?: string
  media_type?:     string
  overview?:       string
  /** Why it was recommended ("Because you watched Inception") */
  reason?:         string
}

interface Props {
  /** Called before opening the title (e.g. search records the click) */
  onOpen?:   () => void
  movie:     CardMovie
  type?:     'movie' | 'tv'
  showType?: boolean
  rank?:     number
}

const IMG = (p: string | null | undefined, s = 'w342') => (p ? `https://image.tmdb.org/t/p/${s}${p}` : '')

/** Explicit type wins, then TMDB's media_type, then "has a name but no title" */
export function mediaTypeOf(movie: CardMovie, type?: 'movie' | 'tv'): 'movie' | 'tv' {
  if (type) return type
  if (movie.media_type === 'tv' || movie.media_type === 'movie') return movie.media_type
  return movie.name && !movie.title ? 'tv' : 'movie'
}

export default function MovieCard({ movie, type, showType, rank, onOpen }: Props) {
  const navigate = useNavigate()
  const user     = useAuthStore(s => s.user)
  const inWL     = useWatchlistStore(s => s.items.some(i => i.movieId === movie.id))
  const toggle   = useWatchlistStore(s => s.toggle)

  const [imgErr, setImgErr] = useState(false)
  const [busy,   setBusy]   = useState(false)

  // Netflix-style "TOP 10" badge for today's most-watched titles
  const top = useTop10(s => s.rank.get(`${mediaTypeOf(movie, type)}:${movie.id}`))

  // Hover preview: a muted trailer after hovering ~1s (desktop, when the profile allows it)
  const { autoplayPreviews } = usePrefs()
  const [preview, setPreview] = useState<string | null>(null)
  const hoverT = useRef<ReturnType<typeof setTimeout>>()
  const canPreview = autoplayPreviews && typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches
  const startPreview = () => {
    // Load the details now so the title page opens instantly if they click
    prefetchT.current = setTimeout(() => prefetch(mediaTypeOf(movie, type) === 'tv' ? `/movies/tv/${movie.id}` : `/movies/${movie.id}`), 250)
    if (!canPreview) return
    hoverT.current = setTimeout(async () => {
      try {
        const kind = mediaTypeOf(movie, type)
        const { data } = await api.get(kind === 'tv' ? `/movies/tv/${movie.id}/videos` : `/movies/${movie.id}/videos`)
        const v = (data.results || []).find((x: any) => x.site === 'YouTube' && x.type === 'Trailer') || (data.results || []).find((x: any) => x.site === 'YouTube')
        if (v && /^[\w-]{6,20}$/.test(v.key)) setPreview(v.key)
      } catch { /* no preview */ }
    }, 1100)
  }
  const prefetchT = useRef<ReturnType<typeof setTimeout>>()
  const stopPreview = () => { clearTimeout(hoverT.current); clearTimeout(prefetchT.current); setPreview(null) }
  useEffect(() => () => clearTimeout(hoverT.current), [])

  const mediaType = mediaTypeOf(movie, type)
  const isTV   = mediaType === 'tv'
  const title  = movie.title || movie.name || ''
  const year   = (movie.release_date || movie.first_air_date || '').slice(0, 4)
  const rating = movie.vote_average || 0

  const handleWL = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!user) { navigate('/login'); return }
    if (busy) return
    setBusy(true)
    try {
      await toggle({
        movieId: movie.id, title,
        poster: movie.poster_path || '', backdrop: movie.backdrop_path || '',
        rating, year, type: mediaType,
      })
    } finally { setBusy(false) }
  }

  const open = () => { onOpen?.(); navigate(isTV ? `/tv/${movie.id}` : `/movie/${movie.id}`) }
  const play = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigate(isTV ? `/player/tv/${movie.id}?season=1&episode=1` : `/player/movie/${movie.id}`)
  }

  return (
    <div className="group flex flex-col rounded-2xl overflow-hidden bg-dark-card cursor-pointer shadow-md transition-all duration-300 hover:shadow-focus hover:-translate-y-0.5"
      onClick={open} role="link" tabIndex={0} onKeyDown={e => e.key === 'Enter' && open()}
      onMouseEnter={startPreview} onMouseLeave={stopPreview}>
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-dark-void">
        {!imgErr && movie.poster_path ? (
          <img src={IMG(movie.poster_path)} alt={title} loading="lazy" onError={() => setImgErr(true)}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 px-3 text-center text-ink-faint">
            <Icon name={isTV ? 'live_tv' : 'movie'} size={32} />
            <p className="text-[11px] line-clamp-3 font-semibold">{title}</p>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-dark-card via-transparent to-transparent" />
        {preview && (
          <iframe title={`${title} trailer`} aria-hidden="true" tabIndex={-1}
            src={`https://www.youtube-nocookie.com/embed/${preview}?autoplay=1&mute=1&controls=0&playsinline=1&loop=1&playlist=${preview}&modestbranding=1&rel=0`}
            className="absolute inset-0 w-[300%] h-full -left-full pointer-events-none border-0 animate-fade-in" allow="autoplay; encrypted-media" />
        )}

        {rank && (
          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-brand/90 text-white text-tech-pill uppercase">Top {rank}</span>
        )}
        {!rank && top && (
          <span className="absolute top-2 left-2 w-8 h-10 rounded-sm bg-brand text-white flex flex-col items-center justify-center leading-none shadow-brand-sm" title={`#${top} today`}>
            <span className="text-[8px] font-black tracking-wider">TOP</span><span className="text-sm font-black">10</span>
          </span>
        )}
        {showType && !rank && !top && (
          <span className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-tech-pill uppercase backdrop-blur-md ${isTV ? 'bg-cyan/20 text-cyan' : 'bg-dark-void/70 text-ink'}`}>
            {isTV ? 'Series' : 'Movie'}
          </span>
        )}

        <button onClick={handleWL} disabled={busy} aria-label={inWL ? 'Remove from My List' : 'Add to My List'}
          className={`absolute top-2 right-2 w-8 h-8 rounded-full backdrop-blur-md flex items-center justify-center transition-colors ${
            inWL ? 'bg-brand text-white shadow-brand-sm' : 'bg-dark-void/70 text-ink hover:text-brand-soft'
          }`}>
          {busy
            ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
            : <Icon name={inWL ? 'bookmark_added' : 'bookmark_add'} size={18} fill={inWL} />}
        </button>

        <button onClick={play} aria-label={`Play ${title}`}
          className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-brand text-white flex items-center justify-center shadow-brand opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 transition-all duration-200">
          <Icon name="play_arrow" size={28} fill />
        </button>
      </div>

      <div className="p-3 flex flex-col gap-1">
        <h3 className="text-[13px] font-bold text-ink truncate leading-tight">{title}</h3>
        {movie.reason && <p className="text-[10.5px] text-cyan/90 truncate leading-tight" title={movie.reason}>{movie.reason}</p>}
        <div className="flex items-center justify-between text-xs text-ink-faint">
          <span>{year || '—'}</span>
          {rating > 0 && (
            <span className="flex items-center gap-0.5 text-gold font-extrabold text-[11px]">
              <Icon name="star" size={13} fill />{rating.toFixed(1)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
