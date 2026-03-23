// frontend/src/pages/Search.tsx — FULL REPLACEMENT
import { useEffect, useState, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import api from '../services/api'
import { Movie } from '../types'
import MovieCard from '../components/MovieCard'

type Tab = 'all' | 'movie' | 'tv' | 'anime'

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 40 }, (_, i) => CURRENT_YEAR - i)

const GENRE_MAP: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy',
  80: 'Crime', 18: 'Drama', 10751: 'Family', 14: 'Fantasy',
  27: 'Horror', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
  53: 'Thriller',
}

function SkeletonCard() {
  return <div className="aspect-[2/3] rounded-xl bg-dark-card animate-pulse" />
}

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const initialQ = searchParams.get('q') || ''
  const [query,   setQuery]   = useState(initialQ)
  const [input,   setInput]   = useState(initialQ)
  const [tab,     setTab]     = useState<Tab>('all')
  const [year,    setYear]    = useState(0)
  const [results, setResults] = useState<Movie[]>([])
  const [loading, setLoading] = useState(false)
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(1)
  const [hasMore, setHasMore] = useState(false)

  const debRef = useRef<ReturnType<typeof setTimeout>>()

  // Debounce input
  useEffect(() => {
    clearTimeout(debRef.current)
    debRef.current = setTimeout(() => {
      setQuery(input)
      setSearchParams(input ? { q: input } : {}, { replace: true })
    }, 350)
    return () => clearTimeout(debRef.current)
  }, [input])

  // Search on query / tab / year change
  useEffect(() => {
    if (!query.trim()) { setResults([]); setTotal(0); return }
    setPage(1)
    doSearch(1, true)
  }, [query, tab, year])

  const doSearch = async (pg: number, reset: boolean) => {
    setLoading(true)
    try {
      const type = tab === 'all' ? 'multi' : tab === 'anime' ? 'tv' : tab

      const { data } = await api.get('/movies/search', {
        params: { query: query.trim(), type, page: pg, year: year || undefined }
      })

      let items: Movie[] = data.results || []

      // Filter for anime tab — Japanese animation
      if (tab === 'anime') {
        items = items.filter(r =>
          r.original_language === 'ja' ||
          r.origin_country?.includes('JP') ||
          r.genre_ids?.includes(16)
        )
      }

      reset ? setResults(items) : setResults(p => [...p, ...items])
      setTotal(data.total_results || 0)
      setHasMore(pg < (data.total_pages || 1))
      setPage(pg)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: 'all',   label: 'All',    icon: '🌟' },
    { key: 'movie', label: 'Movies', icon: '🎬' },
    { key: 'tv',    label: 'TV',     icon: '📺' },
    { key: 'anime', label: 'Anime',  icon: '🎌' },
  ]

  return (
    <div className="pt-14 min-h-screen px-3 sm:px-6 py-6">

      {/* Search bar */}
      <div className="max-w-2xl mx-auto mb-6">
        <div className="relative">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            autoFocus
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Search movies, shows, anime..."
            className="w-full bg-dark-surface border border-dark-border rounded-2xl pl-11 pr-12 py-4 text-white text-base outline-none focus:border-brand/50 transition-colors placeholder-slate-500"
          />
          {input && (
            <button onClick={() => { setInput(''); setQuery('') }}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6 6 18M6 6l12 12"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Tabs + filters */}
      {query && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
          {/* Tabs */}
          <div className="flex gap-1.5 bg-dark-surface border border-dark-border rounded-xl p-1">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  tab === t.key
                    ? 'bg-brand text-dark'
                    : 'text-slate-400 hover:text-white'
                }`}>
                <span>{t.icon}</span> {t.label}
              </button>
            ))}
          </div>

          {/* Year filter */}
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="bg-dark-surface border border-dark-border rounded-xl px-3 py-2 text-xs text-slate-300 outline-none cursor-pointer hover:border-brand transition-colors">
            <option value={0}>Any Year</option>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>

          {/* Result count */}
          {!loading && total > 0 && (
            <span className="text-xs text-slate-500 ml-auto">
              {total.toLocaleString()} results
            </span>
          )}
        </div>
      )}

      {/* Empty state */}
      {!query && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <div className="text-6xl mb-4">🔍</div>
          <h2 className="text-xl font-bold text-white mb-2">Search Streamix</h2>
          <p className="text-sm">Find movies, TV shows, and anime</p>

          {/* Popular searches */}
          <div className="mt-8 text-center">
            <p className="text-xs text-slate-600 mb-3 uppercase tracking-widest">Popular right now</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {['Naruto', 'Breaking Bad', 'Avatar', 'Inception', 'One Piece', 'The Bear'].map(s => (
                <button key={s} onClick={() => setInput(s)}
                  className="px-4 py-2 bg-dark-card border border-dark-border rounded-full text-sm text-slate-300 hover:border-brand hover:text-white transition-all">
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {query && (
        <>
          {loading && results.length === 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2 sm:gap-3">
              {Array(18).fill(0).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : results.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
              <div className="text-5xl mb-3">😕</div>
              <p className="text-base font-semibold text-white mb-1">No results for "{query}"</p>
              <p className="text-sm">Try a different spelling or keyword</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2 sm:gap-3">
                {results.map(m => <MovieCard key={m.id} movie={m} showType={tab === 'all'} />)}
              </div>

              {hasMore && (
                <div className="flex justify-center mt-6">
                  <button
                    onClick={() => doSearch(page + 1, false)}
                    disabled={loading}
                    className="btn-secondary px-8 py-2.5 text-sm disabled:opacity-50">
                    {loading ? 'Loading…' : 'Load More'}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
