// frontend/src/components/Carousel.tsx — FULL REPLACEMENT
import { useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Movie } from '../types'

const IMG      = 'https://image.tmdb.org/t/p/w300'
const FALLBACK = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQ1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQ1MCIgZmlsbD0iIzEzMTYxZiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LXNpemU9IjU2IiBmaWxsPSIjMWUyMjM1Ij7wn46cPC90ZXh0Pjwvc3ZnPg=='

interface Props {
  title:    string
  movies:   Movie[]
  loading?: boolean
  seeAll?:  string
}

function SkeletonCard() {
  return (
    <div className="flex-shrink-0 w-28 sm:w-36" style={{ aspectRatio: '2/3' }}>
      <div className="w-full h-full skeleton rounded-xl" />
    </div>
  )
}

export default function Carousel({ title, movies, loading, seeAll }: Props) {
  const navigate    = useNavigate()
  const scrollRef   = useRef<HTMLDivElement>(null)
  const [canLeft,  setCanLeft]  = useState(false)
  const [canRight, setCanRight] = useState(true)

  const updateArrows = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanLeft(el.scrollLeft > 10)
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 10)
  }, [])

  const scroll = (dir: 'left' | 'right') => {
    const el = scrollRef.current
    if (!el) return
    const amount = el.clientWidth * 0.75
    el.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' })
    setTimeout(updateArrows, 400)
  }

  if (loading) {
    return (
      <section className="mb-6 sm:mb-8">
        <div className="flex items-center justify-between px-3 sm:px-6 mb-3">
          <div className="h-5 w-40 skeleton rounded" />
        </div>
        <div className="flex gap-2 sm:gap-3 overflow-hidden px-3 sm:px-6">
          {Array(7).fill(0).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </section>
    )
  }

  if (!movies.length) return null

  return (
    <section className="mb-6 sm:mb-8 relative group/section">

      {/* Header */}
      <div className="flex items-center justify-between px-3 sm:px-6 mb-3 sm:mb-4">
        <h2 className="section-title">{title}</h2>
        {seeAll && (
          <button onClick={() => navigate(seeAll)}
            className="text-xs text-slate-500 hover:text-brand transition-colors font-medium">
            See all →
          </button>
        )}
      </div>

      {/* Scroll container */}
      <div className="relative">

        {/* Left arrow */}
        <button
          onClick={() => scroll('left')}
          disabled={!canLeft}
          className={`carousel-btn left-2 ${!canLeft ? 'opacity-0 pointer-events-none' : 'group-hover/section:opacity-100'}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="m15 18-6-6 6-6"/>
          </svg>
        </button>

        {/* Right arrow */}
        <button
          onClick={() => scroll('right')}
          disabled={!canRight}
          className={`carousel-btn right-2 ${!canRight ? 'opacity-0 pointer-events-none' : 'group-hover/section:opacity-100'}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="m9 18 6-6-6-6"/>
          </svg>
        </button>

        {/* Cards */}
        <div
          ref={scrollRef}
          onScroll={updateArrows}
          className="flex gap-2 sm:gap-3 overflow-x-auto scrollbar-hide px-3 sm:px-6 pb-1">
          {movies.map(movie => (
            <CarouselCard key={movie.id} movie={movie} />
          ))}
        </div>
      </div>
    </section>
  )
}

function CarouselCard({ movie }: { movie: Movie }) {
  const navigate  = useNavigate()
  const [imgErr, setImgErr] = useState(false)

  const title  = movie.title || movie.name || ''
  const yr     = (movie.release_date || movie.first_air_date || '').slice(0,4)
  const rt     = movie.vote_average || 0
  const isTV   = !!movie.name && !movie.title
  const type   = isTV ? 'tv' : 'movie'

  const goDetail = () => navigate(type === 'tv' ? `/tv/${movie.id}` : `/movie/${movie.id}`)
  const goPlay   = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigate(type === 'tv' ? `/player/tv/${movie.id}?season=1&episode=1` : `/player/movie/${movie.id}`)
  }

  return (
    <div
      onClick={goDetail}
      className="flex-shrink-0 w-28 sm:w-36 cursor-pointer group"
      style={{ aspectRatio: '2/3' }}>

      <div className="relative w-full h-full rounded-xl overflow-hidden bg-dark-card">
        <img
          src={!imgErr && movie.poster_path ? IMG + movie.poster_path : FALLBACK}
          alt={title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
          onError={() => setImgErr(true)}
        />

        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#07080c]/95 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Rating badge */}
        {rt >= 7.5 && (
          <div className="absolute top-1.5 left-1.5 badge-gold text-[10px] px-1.5 py-0.5">
            ★ {rt.toFixed(1)}
          </div>
        )}

        {/* Bottom on hover */}
        <div className="absolute bottom-0 left-0 right-0 p-2 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
          <p className="text-white text-[11px] font-semibold leading-tight mb-1.5 line-clamp-2">{title}</p>
          {yr && <p className="text-slate-400 text-[10px] mb-1.5">{yr}</p>}
          <button onClick={goPlay}
            className="w-full bg-brand text-dark text-[10px] font-bold py-1.5 rounded-lg hover:bg-brand-light transition-colors active:scale-95">
            ▶ Play
          </button>
        </div>
      </div>
    </div>
  )
}
