// frontend/src/pages/Search.tsx — FULL REPLACEMENT
import { useEffect, useState, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import api from '../services/api'
import { Movie } from '../types'
import MovieCard from '../components/MovieCard'

type Tab = 'all' | 'movie' | 'tv' | 'anime'

const YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 40 }, (_, i) => YEAR - i)

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'all',   label: 'All',    icon: '🌟' },
  { key: 'movie', label: 'Movies', icon: '🎬' },
  { key: 'tv',    label: 'TV',     icon: '📺' },
  { key: 'anime', label: 'Anime',  icon: '🎌' },
]

const POPULAR = ['Naruto', 'Breaking Bad', 'Inception', 'One Piece', 'The Bear', 'Dune', 'Avatar']

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate  = useNavigate()

  const initialQ  = searchParams.get('q') || ''
  const [input,   setInput]   = useState(initialQ)
  const [query,   setQuery]   = useState(initialQ)
  const [tab,     setTab]     = useState<Tab>('all')
  const [year,    setYear]    = useState(0)
  const [results, setResults] = useState<Movie[]>([])
  const [loading, setLoading] = useState(false)
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(1)
  const [hasMore, setHasMore] = useState(false)

  const debRef = useRef<ReturnType<typeof setTimeout>>()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    clearTimeout(debRef.current)
    debRef.current = setTimeout(() => {
      setQuery(input)
      setSearchParams(input ? { q: input } : {}, { replace: true })
    }, 300)
    return () => clearTimeout(debRef.current)
  }, [input])

  useEffect(() => {
    if (!query.trim()) { setResults([]); setTotal(0); return }
    setPage(1); doSearch(1, true)
  }, [query, tab, year])

  const doSearch = async (pg: number, reset: boolean) => {
    setLoading(true)
    try {
      const type = tab === 'all' ? 'multi' : tab === 'anime' ? 'tv' : tab
      const { data } = await api.get('/movies/search', {
        params: { query: query.trim(), type, page: pg, year: year || undefined }
      })
      let items: Movie[] = data.results || []
      if (tab === 'anime') {
        items = items.filter((r:any) => r.original_language==='ja' || r.origin_country?.includes('JP') || r.genre_ids?.includes(16))
      }
      reset ? setResults(items) : setResults(p => [...p, ...items])
      setTotal(data.total_results || 0)
      setHasMore(pg < (data.total_pages || 1))
      setPage(pg)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  return (
    <div className="pt-16 min-h-screen">

      {/* Search header */}
      <div className="px-4 sm:px-6 py-6 sm:py-8 border-b border-dark-border"
        style={{ background: 'linear-gradient(to bottom, rgba(20,184,166,0.04) 0%, transparent 100%)' }}>
        <div className="max-w-2xl mx-auto">
          <div className="relative">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              ref={inputRef}
              autoFocus
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Search movies, TV shows, anime…"
              className="input pl-12 pr-12 py-4 text-base rounded-2xl"
              style={{ fontSize: '16px' }}
            />
            {input && (
              <button onClick={() => { setInput(''); setQuery(''); inputRef.current?.focus() }}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white w-6 h-6 flex items-center justify-center rounded-full hover:bg-dark-hover transition-all">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6 6 18M6 6l12 12"/>
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-5">

        {/* Filters row */}
        {query && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
            {/* Tabs */}
            <div className="flex gap-1 bg-dark-surface border border-dark-border rounded-xl p-1 w-fit">
              {TABS.map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    tab === t.key ? 'bg-brand text-dark' : 'text-slate-400 hover:text-white'
                  }`}>
                  <span>{t.icon}</span>{t.label}
                </button>
              ))}
            </div>

            {/* Year */}
            <select value={year} onChange={e => setYear(Number(e.target.value))}
              className="bg-dark-surface border border-dark-border rounded-xl px-3 py-2 text-xs text-slate-300 outline-none cursor-pointer hover:border-brand/50 transition-colors w-fit">
              <option value={0}>Any Year</option>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>

            {!loading && total > 0 && (
              <span className="text-xs text-slate-600 sm:ml-auto">{total.toLocaleString()} results</span>
            )}
          </div>
        )}

        {/* Empty state */}
        {!query && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <div className="w-20 h-20 rounded-full bg-dark-surface border border-dark-border flex items-center justify-center text-4xl mb-5">
              🔍
            </div>
            <h2 className="text-xl font-bold text-white mb-1" style={{ fontFamily:'Syne, sans-serif' }}>
              Search Streamix
            </h2>
            <p className="text-sm mb-8">Find movies, TV shows, and anime</p>

            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-600 mb-3">Popular searches</p>
            <div className="flex flex-wrap gap-2 justify-center max-w-sm">
              {POPULAR.map(s => (
                <button key={s} onClick={() => setInput(s)}
                  className="px-4 py-2 glass rounded-xl text-sm text-slate-300 hover:text-white hover:border-brand/50 transition-all">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        {query && (
          loading && results.length === 0 ? (
            <div className="movie-card-grid">
              {Array(18).fill(0).map((_, i) => (
                <div key={i} className="skeleton rounded-xl" style={{ aspectRatio:'2/3' }} />
              ))}
            </div>
          ) : results.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
              <div className="text-5xl mb-4">😕</div>
              <p className="text-base font-semibold text-white mb-1">No results for "{query}"</p>
              <p className="text-sm">Try a different spelling or keyword</p>
            </div>
          ) : (
            <>
              <div className="movie-card-grid">
                {results.map(m => <MovieCard key={m.id} movie={m} showType={tab==='all'} />)}
              </div>
              {hasMore && (
                <div className="flex justify-center mt-8">
                  <button onClick={() => doSearch(page+1, false)} disabled={loading}
                    className="btn-secondary px-8 py-2.5 text-sm disabled:opacity-50">
                    {loading ? 'Loading…' : 'Load More'}
                  </button>
                </div>
              )}
            </>
          )
        )}
      </div>
    </div>
  )
}
