import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Movie } from '../types'
import { searchContent } from '../services/api'
import MovieCard from '../components/MovieCard'

export default function Search() {
  const [params] = useSearchParams()
  const query = params.get('q') || ''
  const [results, setResults] = useState<Movie[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<'all' | 'movie' | 'tv'>('all')

  useEffect(() => {
    if (!query) return
    setLoading(true)
    searchContent(query)
      .then(r => setResults(r.data.results ?? []))
      .finally(() => setLoading(false))
  }, [query])

  const filtered = filter === 'all' ? results : results.filter(r => r.media_type === filter)

  return (
    <div className="pt-20 max-w-6xl mx-auto px-4 pb-12">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-xl font-bold">
          {query ? `Results for "${query}"` : 'Search'}
          {!loading && results.length > 0 && <span className="text-slate-500 text-base font-normal ml-2">({filtered.length})</span>}
        </h1>
        <div className="flex gap-2">
          {(['all', 'movie', 'tv'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors capitalize ${filter === f ? 'bg-brand text-dark' : 'bg-dark-card border border-dark-border text-slate-400 hover:text-white'}`}>
              {f === 'tv' ? 'TV Shows' : f === 'all' ? 'All' : 'Movies'}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
          {Array(12).fill(0).map((_, i) => (
            <div key={i}><div className="aspect-[2/3] rounded-lg bg-dark-card animate-pulse" /></div>
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && query && (
        <div className="text-center text-slate-500 py-20">No results found for "{query}"</div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
          {filtered.map(m => <MovieCard key={m.id} movie={m} />)}
        </div>
      )}
    </div>
  )
}
