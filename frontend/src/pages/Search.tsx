// frontend/src/pages/Search.tsx — FULL REPLACEMENT
// FIX: replaced non-existent kidsStore with profileStore's activeProfile.isKids
import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../services/api'
import MovieCard from '../components/MovieCard'
import { useProfileStore } from '../stores/profileStore'

interface Movie {
  id: number
  title?: string
  name?: string
  poster_path: string | null
  backdrop_path: string | null
  vote_average?: number
  release_date?: string
  first_air_date?: string
  genre_ids?: number[]
  media_type?: string
}

// Kids-safe genre IDs
const KIDS_SAFE_GENRE_IDS = new Set([10751, 10762, 16, 35, 12, 14, 10770])
// Adult genres to explicitly block
const ADULT_GENRE_IDS = new Set([27, 53, 80, 10752, 10769])

function isKidsSafe(movie: Movie): boolean {
  const genres = movie.genre_ids || []
  if (genres.length === 0) return false
  if (genres.some(g => ADULT_GENRE_IDS.has(g))) return false
  return genres.some(g => KIDS_SAFE_GENRE_IDS.has(g))
}

type Tab = 'all' | 'movie' | 'tv'

export default function Search() {
  const navigate       = useNavigate()
  const [params]       = useSearchParams()
  const { activeProfile } = useProfileStore()
  const isKidsMode     = activeProfile?.isKids ?? false

  const initialQ = params.get('q') || ''

  const [query,       setQuery]       = useState(initialQ)
  const [debouncedQ,  setDebouncedQ]  = useState(initialQ)
  const [results,     setResults]     = useState<Movie[]>([])
  const [loading,     setLoading]     = useState(false)
  const [tab,         setTab]         = useState<Tab>('all')
  const [page,        setPage]        = useState(1)
  const [hasMore,     setHasMore]     = useState(false)
  const [total,       setTotal]       = useState(0)
  const debRef = useRef<ReturnType<typeof setTimeout>>()

  // Debounce
  useEffect(() => {
    clearTimeout(debRef.current)
    debRef.current = setTimeout(() => {
      setDebouncedQ(query)
      setPage(1)
      setResults([])
    }, 350)
    return () => clearTimeout(debRef.current)
  }, [query])

  // Sync from URL
  useEffect(() => {
    const q = params.get('q') || ''
    if (q !== query) { setQuery(q); setDebouncedQ(q) }
  }, [params])

  const fetchResults = useCallback(async (q: string, pg: number, append: boolean) => {
    if (!q.trim()) { setResults([]); setTotal(0); setHasMore(false); return }
    setLoading(true)
    try {
      const endpoint = tab === 'all' ? '/movies/search' : '/movies/search'
      const res = await api.get(endpoint, {
        params: { query: q.trim(), page: pg, ...(tab !== 'all' ? { type: tab } : {}) },
      })

      let allResults: Movie[] = res.data.results || []
      const totalPages = res.data.total_pages || 1
      setTotal(res.data.total_results || 0)

      // ── Kids mode filter ──────────────────────────────────────────
      if (isKidsMode) {
        allResults = allResults.filter(isKidsSafe)
      }
      // ─────────────────────────────────────────────────────────────

      setHasMore(pg < Math.min(totalPages, 10))
      setPage(pg)
      setResults(prev => append ? [...prev, ...allResults] : allResults)
    } catch (err) {
      console.error('[Search]', err)
    } finally {
      setLoading(false)
    }
  }, [tab, isKidsMode])

  useEffect(() => {
    setResults([])
    setPage(1)
    fetchResults(debouncedQ, 1, false)
  }, [debouncedQ, tab, isKidsMode])

  const loadMore = () => fetchResults(debouncedQ, page + 1, true)

  return (
    <div className="min-h-screen pt-20 pb-12 px-4 sm:px-6">

      {/* Search bar */}
      <div className="max-w-xl mx-auto mb-6">
        {isKidsMode && (
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold mb-3 w-fit"
            style={{ background: 'rgba(147,51,234,0.12)', border: '1px solid rgba(147,51,234,0.25)', color: '#c084fc' }}
          >
            <span>🌟</span>
            <span>Kids Mode — showing family-friendly content only</span>
          </div>
        )}

        <div
          className="flex items-center gap-3 rounded-2xl px-4 py-3 transition-colors"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
          onFocusCapture={e => { e.currentTarget.style.borderColor = 'rgba(20,184,166,0.4)' }}
          onBlurCapture={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className="text-slate-500 flex-shrink-0">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={isKidsMode ? 'Search kids content...' : 'Search movies, TV shows...'}
            autoFocus
            className="bg-transparent outline-none text-white text-sm flex-1 placeholder-slate-500 min-w-0"
          />
          {query && (
            <button
              onClick={() => { setQuery(''); setResults([]); setTotal(0) }}
              className="text-slate-500 hover:text-white transition-colors text-lg leading-none flex-shrink-0"
            >×</button>
          )}
        </div>

        {/* Type tabs */}
        {debouncedQ && (
          <div className="flex gap-1.5 mt-3">
            {(['all', 'movie', 'tv'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); setResults([]); setPage(1) }}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all capitalize"
                style={{
                  background: tab === t ? '#14b8a6' : 'rgba(255,255,255,0.06)',
                  color: tab === t ? '#07080c' : 'rgba(255,255,255,0.55)',
                  border: `1px solid ${tab === t ? '#14b8a6' : 'rgba(255,255,255,0.08)'}`,
                }}
              >
                {t === 'all' ? 'All' : t === 'movie' ? 'Movies' : 'TV'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Results */}
      <div className="max-w-6xl mx-auto">
        {debouncedQ && !loading && results.length > 0 && (
          <p className="text-slate-500 text-xs mb-4">
            {results.length.toLocaleString()} results
            {isKidsMode && total > results.length && (
              <span className="text-purple-400 ml-1.5">(filtered for kids)</span>
            )}
            {' '}for <span className="text-white font-medium">"{debouncedQ}"</span>
          </p>
        )}

        {results.length > 0 ? (
          <>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2 sm:gap-3">
              {results.map(m => (
                <MovieCard key={`${m.id}-${m.media_type || tab}`} movie={m} />
              ))}
            </div>
            {hasMore && (
              <div className="flex justify-center mt-8">
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className="px-6 py-2.5 rounded-xl text-sm font-semibold text-slate-300 hover:text-white transition-all disabled:opacity-40"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  {loading
                    ? <div className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />Loading...</div>
                    : 'Load More'}
                </button>
              </div>
            )}
          </>
        ) : loading ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2 sm:gap-3">
            {Array(14).fill(0).map((_, i) => (
              <div key={i} className="rounded-xl animate-pulse" style={{ aspectRatio: '2/3', background: 'rgba(255,255,255,0.06)' }} />
            ))}
          </div>
        ) : debouncedQ ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-500 gap-4">
            <span className="text-6xl">{isKidsMode ? '🌟' : '🔍'}</span>
            <div className="text-center">
              <p className="text-base font-semibold text-slate-400 mb-1">
                {isKidsMode ? 'No kids content found' : 'No results found'}
              </p>
              <p className="text-sm">
                {isKidsMode
                  ? `No family-friendly content matches "${debouncedQ}"`
                  : `Nothing matches "${debouncedQ}"`}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-slate-600 gap-3">
            <span className="text-5xl">{isKidsMode ? '🌟' : '🎬'}</span>
            <p className="text-sm">{isKidsMode ? 'Search for kids content' : 'Search for movies and TV shows'}</p>
          </div>
        )}
      </div>
    </div>
  )
}
