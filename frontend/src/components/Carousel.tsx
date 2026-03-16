import { useRef } from 'react'
import { Movie } from '../types'
import MovieCard from './MovieCard'

interface Props {
  title: string
  movies: Movie[]
  loading?: boolean
}

export default function Carousel({ title, movies, loading }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  const scroll = (dir: 'left' | 'right') => {
    if (ref.current) ref.current.scrollBy({ left: dir === 'right' ? 600 : -600, behavior: 'smooth' })
  }

  return (
    <section className="py-3 px-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-slate-100">{title}</h2>
        <div className="flex gap-1">
          <button onClick={() => scroll('left')}  className="w-7 h-7 rounded-full bg-dark-card border border-dark-border flex items-center justify-center text-slate-400 hover:text-white hover:border-brand transition-colors text-sm">‹</button>
          <button onClick={() => scroll('right')} className="w-7 h-7 rounded-full bg-dark-card border border-dark-border flex items-center justify-center text-slate-400 hover:text-white hover:border-brand transition-colors text-sm">›</button>
        </div>
      </div>
      <div ref={ref} className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
        {loading
          ? Array(10).fill(0).map((_, i) => (
              <div key={i} className="flex-shrink-0 w-36">
                <div className="w-full aspect-[2/3] rounded-lg bg-dark-card animate-pulse" />
                <div className="h-3 bg-dark-card rounded mt-2 animate-pulse" />
              </div>
            ))
          : movies.map(m => <MovieCard key={m.id} movie={m} />)
        }
      </div>
    </section>
  )
}
