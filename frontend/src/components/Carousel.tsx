// frontend/src/components/Carousel.tsx — horizontal media rail
import { useRef, useState, useCallback, useEffect } from 'react'
import { track } from '../utils/track'
import { useNavigate } from 'react-router-dom'
import MovieCard, { CardMovie, mediaTypeOf } from './MovieCard'
import { useHidden } from '../stores/profileStore'
import Icon from './Icon'

interface Props {
  title:    string
  movies:   CardMovie[]
  loading?: boolean
  seeAll?:  string
  icon?:    string
  accent?:  'brand' | 'gold' | 'cyan'
  ranked?:  boolean
  /** Recommendation row kind: clicks are reported so the server learns which rows this profile uses */
  trackRow?: string
}

const ACCENT = {
  brand: 'bg-brand shadow-[0_0_8px_#e50914]',
  gold:  'bg-gold shadow-[0_0_8px_#f59e0b]',
  cyan:  'bg-cyan shadow-[0_0_8px_#4cd7f6]',
}

export function RailHeader({ title, icon, accent = 'brand', right }: { title: string; icon?: string; accent?: keyof typeof ACCENT; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 sm:px-6 lg:px-12 mb-3">
      <div className="flex items-center gap-2 min-w-0">
        {icon
          ? <Icon name={icon} size={20} className={accent === 'gold' ? 'text-gold' : accent === 'cyan' ? 'text-cyan' : 'text-brand'} fill />
          : <span className={`w-1.5 h-4 rounded-full ${ACCENT[accent]}`} />}
        <h2 className="section-title truncate">{title}</h2>
      </div>
      {right}
    </div>
  )
}

export default function Carousel({ title, movies: all, loading, seeAll, icon, accent = 'brand', ranked, trackRow }: Props) {
  const navigate = useNavigate()
  // Titles the profile marked "Not for me" never show up in rows
  const hidden = useHidden()
  const movies = hidden.size ? all.filter(m => !hidden.has(`${mediaTypeOf(m)}:${m.id}`)) : all
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canLeft,  setCanLeft]  = useState(false)
  const [canRight, setCanRight] = useState(false)

  const updateArrows = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanLeft(el.scrollLeft > 10)
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 10)
  }, [])

  useEffect(() => { updateArrows() }, [movies.length, updateArrows])

  const scroll = (dir: 'left' | 'right') => {
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({ left: (dir === 'left' ? -1 : 1) * el.clientWidth * 0.8, behavior: 'smooth' })
  }

  if (loading) {
    return (
      <section className="mb-8 sm:mb-10">
        <div className="px-4 sm:px-6 lg:px-12 mb-3"><div className="h-5 w-44 skeleton rounded-full" /></div>
        <div className="flex gap-3 overflow-hidden px-4 sm:px-6 lg:px-12">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-36 sm:w-44 skeleton" style={{ aspectRatio: '2/3.6' }} />
          ))}
        </div>
      </section>
    )
  }

  if (!movies.length) return null

  return (
    <section className="mb-8 sm:mb-10 relative group/section">
      <RailHeader title={title} icon={icon} accent={accent} right={seeAll && (
        <button onClick={() => navigate(seeAll)} className="text-label-sm uppercase text-brand-soft hover:text-white transition-colors">
          View all
        </button>
      )} />

      <div className="relative">
        <button onClick={() => scroll('left')} aria-label="Scroll left"
          className={`carousel-btn left-3 hidden sm:flex ${canLeft ? 'group-hover/section:opacity-100' : 'pointer-events-none'}`}>
          <Icon name="chevron_left" size={24} />
        </button>
        <button onClick={() => scroll('right')} aria-label="Scroll right"
          className={`carousel-btn right-3 hidden sm:flex ${canRight ? 'group-hover/section:opacity-100' : 'pointer-events-none'}`}>
          <Icon name="chevron_right" size={24} />
        </button>

        <div ref={scrollRef} onScroll={updateArrows}
          className="flex gap-3 sm:gap-4 overflow-x-auto scrollbar-hide px-4 sm:px-6 lg:px-12 pb-2 snap-x">
          {movies.map((movie, i) => (
            <div key={`${movie.media_type || ''}-${movie.id}`}
              onClickCapture={trackRow ? () => track('detail', mediaTypeOf(movie), movie.id, { row: trackRow, source: 'home' }) : undefined}
              className={`relative flex-shrink-0 snap-start ${ranked ? 'w-44 sm:w-52 pl-10 sm:pl-12 flex items-end' : 'w-36 sm:w-44'}`}>
              {ranked && (
                <span className="absolute left-0 bottom-14 text-[72px] sm:text-[88px] font-extrabold leading-none text-dark-high select-none pointer-events-none"
                  style={{ WebkitTextStroke: '1px rgba(255,255,255,0.12)' }}>{i + 1}</span>
              )}
              <div className="relative w-full"><MovieCard movie={movie} /></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
