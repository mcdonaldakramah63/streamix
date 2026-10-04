// frontend/src/pages/Search.tsx — FULL REPLACEMENT
// FIX: replaced non-existent kidsStore with profileStore's activeProfile.isKids
import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../services/api'
import MovieCard from '../components/MovieCard'
import Icon from '../components/Icon'
import { track } from '../utils/track'
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

const GENRES: [number, string][] = [[28, 'Action'], [12, 'Adventure'], [16, 'Animation'], [35, 'Comedy'], [80, 'Crime'], [99, 'Documentary'],
  [18, 'Drama'], [10751, 'Family'], [14, 'Fantasy'], [27, 'Horror'], [9648, 'Mystery'], [10749, 'Romance'], [878, 'Sci-Fi'], [53, 'Thriller'],
  [10759, 'Action & Adventure (TV)'], [10765, 'Sci-Fi & Fantasy (TV)'], [10762, 'Kids (TV)']]
const LANGS: [string, string][] = [['en', 'English'], ['ja', 'Japanese'], ['ko', 'Korean'], ['zh', 'Chinese'], ['hi', 'Hindi'], ['es', 'Spanish'],
  ['fr', 'French'], ['de', 'German'], ['it', 'Italian'], ['pt', 'Portuguese'], ['tr', 'Turkish'], ['th', 'Thai']]

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
  const [didYouMean,  setDidYouMean]  = useState<string | null>(null)
  // The engine's reading of the query: a person's work, a year, series vs film
  const [person, setPerson] = useState<{ id: number; name: string; profile_path?: string | null } | null>(null)
  // Instant suggestions while typing (known titles + what people here searched)
  const [suggest, setSuggest] = useState<{ id: number; media_type: 'movie' | 'tv'; title: string; year?: string; poster_path?: string | null }[]>([])
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2 || isKidsMode) { setSuggest([]); return }
    const t = setTimeout(() => {
      api.get('/movies/suggest', { params: { q } }).then(r => setSuggest(r.data.items || [])).catch(() => setSuggest([]))
    }, 120)
    return () => clearTimeout(t)
  }, [query, isKidsMode])
  /** Teach the engine what people open for a query (ranks it higher for the next person) */
  const logClick = (q: string, m: { id: number; media_type?: string; title?: string; name?: string; poster_path?: string | null; release_date?: string; first_air_date?: string }) => {
    if (!q.trim()) return
    api.post('/movies/search-click', { q: q.trim(), type: m.media_type === 'tv' ? 'tv' : 'movie', id: m.id, title: m.title || m.name || '',
      poster: m.poster_path || '', year: (m.release_date || m.first_air_date || '').slice(0, 4) }).catch(() => {})
  }
  const debRef = useRef<ReturnType<typeof setTimeout>>()

  // Filters (applied to the loaded results)
  const [showFilters, setShowFilters] = useState(false)
  const [fGenre,  setFGenre]  = useState(0)
  const [fFrom,   setFFrom]   = useState('')
  const [fTo,     setFTo]     = useState('')
  const [fRating, setFRating] = useState(0)
  const [fLang,   setFLang]   = useState('')
  const activeFilters = [fGenre, fFrom, fTo, fRating, fLang].filter(Boolean).length
  const clearFilters = () => { setFGenre(0); setFFrom(''); setFTo(''); setFRating(0); setFLang('') }
  const shown = results.filter(m => {
    const year = Number((m.release_date || m.first_air_date || '').slice(0, 4)) || 0
    if (fGenre && !(m.genre_ids || []).includes(fGenre)) return false
    if (fFrom && (!year || year < Number(fFrom))) return false
    if (fTo && (!year || year > Number(fTo))) return false
    if (fRating && (m.vote_average || 0) < fRating) return false
    if (fLang && (m as any).original_language !== fLang) return false
    return true
  })

  // "Surprise me": a random well-rated title
  const [surprising, setSurprising] = useState(false)
  const surprise = async () => {
    setSurprising(true)
    try {
      let pick: Movie | undefined, type: 'movie' | 'tv' = Math.random() < 0.7 ? 'movie' : 'tv'
      if (isKidsMode) {
        const sec = ['shows', 'cartoons', 'anime', 'animated-movies', 'family'][Math.floor(Math.random() * 5)]
        const { data } = await api.get('/movies/kids-browse', { params: { section: sec, page: 1 + Math.floor(Math.random() * 3) } })
        pick = data.results[Math.floor(Math.random() * data.results.length)]
        type = pick?.media_type === 'tv' ? 'tv' : 'movie'
      } else {
        const { data } = await api.get('/movies/discover', { params: {
          type, sort_by: 'vote_average.desc', 'vote_count.gte': 800, page: 1 + Math.floor(Math.random() * 15),
          ...(fGenre ? { with_genres: fGenre } : {}),
        } })
        pick = data.results[Math.floor(Math.random() * data.results.length)]
      }
      if (pick) navigate(isKidsMode ? (type === 'tv' ? `/player/tv/${pick.id}?season=1&episode=1` : `/player/movie/${pick.id}`) : `/${type === 'tv' ? 'tv' : 'movie'}/${pick.id}`)
    } catch { /* try again */ }
    finally { setSurprising(false) }
  }

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
      // Typo-tolerant search, ranked for the active profile
      const res = await api.get('/movies/smart-search', {
        params: { query: q.trim(), page: pg, ...(tab !== 'all' ? { type: tab } : {}), ...(activeProfile ? { profile: activeProfile._id } : {}) },
      })
      if (pg === 1) { setDidYouMean(res.data.didYouMean || null); setPerson(res.data.person || null) }

      let allResults: Movie[] = (res.data.results || []).filter((r: Movie) => r.media_type !== 'person')
        .map((r: Movie) => (tab === 'all' ? r : { ...r, media_type: tab }))
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
  }, [tab, isKidsMode, activeProfile?._id])

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
          onFocusCapture={e => { e.currentTarget.style.borderColor = 'rgba(229,9,20,0.4)' }}
          onBlurCapture={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className="text-ink-faint flex-shrink-0">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            onKeyDown={e => { if (e.key === 'Escape' || e.key === 'Enter') setFocused(false) }}
            role="combobox" aria-expanded={focused && suggest.length > 0} aria-controls="search-suggest" aria-autocomplete="list"
            placeholder={isKidsMode ? 'Search kids content...' : 'Search movies, TV shows...'}
            autoFocus
            className="bg-transparent outline-none text-white text-sm flex-1 placeholder-slate-500 min-w-0"
          />
          {query && (
            <button
              onClick={() => { setQuery(''); setResults([]); setTotal(0) }}
              className="text-ink-faint hover:text-white transition-colors text-lg leading-none flex-shrink-0"
            >×</button>
          )}
        </div>

        {focused && suggest.length > 0 && (
          <ul id="search-suggest" role="listbox" className="mt-2 rounded-2xl overflow-hidden bg-dark-card border border-white/[0.06] shadow-deep">
            {suggest.slice(0, 6).map(sg => (
              <li key={`${sg.media_type}:${sg.id}`} role="option" aria-selected={false}>
                <button onMouseDown={e => e.preventDefault()} onClick={() => { logClick(query, sg); track('search_click', sg.media_type, sg.id); navigate(sg.media_type === 'tv' ? `/tv/${sg.id}` : `/movie/${sg.id}`) }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-white/[0.06]">
                  {sg.poster_path ? <img src={`https://image.tmdb.org/t/p/w92${sg.poster_path}`} alt="" className="w-8 h-12 rounded-md object-cover flex-shrink-0" /> : <span className="w-8 h-12 rounded-md bg-dark-void flex-shrink-0" />}
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-white truncate">{sg.title}</span>
                    <span className="block text-xs text-ink-faint">{sg.year || ''}{sg.year ? ' · ' : ''}{sg.media_type === 'tv' ? 'Series' : 'Movie'}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Type tabs */}
        {debouncedQ && (
          <div className="flex gap-1.5 mt-3 flex-wrap">
            {(['all', 'movie', 'tv'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); setResults([]); setPage(1) }}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all capitalize"
                style={{
                  background: tab === t ? '#e50914' : 'rgba(255,255,255,0.06)',
                  color: tab === t ? '#0f131c' : 'rgba(255,255,255,0.55)',
                  border: `1px solid ${tab === t ? '#e50914' : 'rgba(255,255,255,0.08)'}`,
                }}
              >
                {t === 'all' ? 'All' : t === 'movie' ? 'Movies' : 'TV'}
              </button>
            ))}
            <button onClick={() => setShowFilters(f => !f)} aria-expanded={showFilters}
              className={`ml-auto px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 ${activeFilters ? 'bg-brand/15 text-brand-soft' : 'bg-white/[0.06] text-ink-muted hover:text-white'}`}>
              <Icon name="tune" size={15} />Filters{activeFilters ? ` (${activeFilters})` : ''}
            </button>
          </div>
        )}
        {debouncedQ && showFilters && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2 rounded-2xl bg-white/[0.03] border border-white/[0.06] p-3">
            <label className="text-[11px] text-ink-faint col-span-2 sm:col-span-1">Genre
              <select value={fGenre} onChange={e => setFGenre(Number(e.target.value))} className="input h-9 mt-1 !text-sm">
                <option value={0}>Any</option>
                {GENRES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </label>
            <label className="text-[11px] text-ink-faint">From year
              <input value={fFrom} onChange={e => setFFrom(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" placeholder="1990" className="input h-9 mt-1 !text-sm" />
            </label>
            <label className="text-[11px] text-ink-faint">To year
              <input value={fTo} onChange={e => setFTo(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" placeholder="2026" className="input h-9 mt-1 !text-sm" />
            </label>
            <label className="text-[11px] text-ink-faint">Rating
              <select value={fRating} onChange={e => setFRating(Number(e.target.value))} className="input h-9 mt-1 !text-sm">
                <option value={0}>Any</option><option value={6}>6+ ★</option><option value={7}>7+ ★</option><option value={8}>8+ ★</option>
              </select>
            </label>
            <label className="text-[11px] text-ink-faint">Language
              <select value={fLang} onChange={e => setFLang(e.target.value)} className="input h-9 mt-1 !text-sm">
                <option value="">Any</option>
                {LANGS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
              </select>
            </label>
            {activeFilters > 0 && <button onClick={clearFilters} className="col-span-2 sm:col-span-5 text-xs text-ink-faint hover:text-white text-left">Clear filters</button>}
          </div>
        )}
      </div>

      {/* Results */}
      <div className="max-w-6xl mx-auto">
        {person && debouncedQ && (
          <div className="flex items-center gap-3 mb-3">
            {person.profile_path && <img src={`https://image.tmdb.org/t/p/w185${person.profile_path}`} alt="" className="w-12 h-12 rounded-full object-cover" />}
            <p className="text-sm text-ink-muted">Showing work by <button onClick={() => navigate(`/person/${person.id}`)} className="text-white font-bold hover:underline">{person.name}</button></p>
          </div>
        )}
        {didYouMean && debouncedQ && (
          <p className="text-sm text-ink-muted mb-2">
            Showing results for <button onClick={() => setQuery(didYouMean)} className="text-white font-bold hover:underline">{didYouMean}</button>
          </p>
        )}
        {debouncedQ && !loading && results.length > 0 && (
          <p className="text-ink-faint text-xs mb-4">
            {shown.length.toLocaleString()} results{activeFilters ? ` (filtered from ${results.length})` : ''}
            {isKidsMode && total > results.length && (
              <span className="text-purple-400 ml-1.5">(filtered for kids)</span>
            )}
            {' '}for <span className="text-white font-medium">"{debouncedQ}"</span>
          </p>
        )}

        {results.length > 0 ? (
          <>
            {!shown.length && <p className="text-sm text-ink-faint text-center py-10">Nothing here matches your filters — load more results or <button onClick={clearFilters} className="text-brand-soft hover:underline">clear them</button>.</p>}
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2 sm:gap-3">
              {shown.map(m => (
                <MovieCard key={`${m.id}-${m.media_type || tab}`} movie={m}
                  onOpen={() => { track('search_click', m.media_type === 'tv' ? 'tv' : 'movie', m.id); logClick(debouncedQ, m) }} />
              ))}
            </div>
            {hasMore && (
              <div className="flex justify-center mt-8">
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className="px-6 py-2.5 rounded-xl text-sm font-semibold text-ink hover:text-white transition-all disabled:opacity-40"
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
          <div className="flex flex-col items-center justify-center py-24 text-ink-faint gap-4">
            <span className="text-6xl">{isKidsMode ? '🌟' : '🔍'}</span>
            <div className="text-center">
              <p className="text-base font-semibold text-ink-muted mb-1">
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
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="section-title flex-1">Explore</h2>
              <button onClick={surprise} disabled={surprising} className="btn-primary px-4 py-2 text-xs disabled:opacity-60">
                <Icon name={surprising ? 'progress_activity' : 'casino'} size={18} className={surprising ? 'animate-spin' : ''} />Surprise me
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
              {[
                { to: '/movies', label: 'Movies',   sub: 'Blockbusters & classics', icon: 'movie',   tone: 'from-brand/30' },
                { to: '/tv',     label: 'TV Shows', sub: 'Series to binge',         icon: 'live_tv', tone: 'from-cyan/25' },
                { to: '/anime',  label: 'Anime',    sub: 'Direct HLS streams',      icon: 'animation', tone: 'from-gold/25' },
              ].map(c => (
                <button key={c.to} onClick={() => navigate(c.to)}
                  className={`card p-5 text-left bg-gradient-to-br ${c.tone} to-transparent hover:shadow-focus transition-all`}>
                  <Icon name={c.icon} size={28} className="text-white" />
                  <p className="text-white font-extrabold text-lg mt-3">{c.label}</p>
                  <p className="text-ink-muted text-sm">{c.sub}</p>
                </button>
              ))}
            </div>
            <h3 className="text-label-sm uppercase text-ink-faint mb-3">Browse by genre</h3>
            <div className="flex flex-wrap gap-2">
              {[[28,'Action'],[12,'Adventure'],[16,'Animation'],[35,'Comedy'],[80,'Crime'],[99,'Documentary'],[18,'Drama'],[10751,'Family'],[14,'Fantasy'],[27,'Horror'],[9648,'Mystery'],[10749,'Romance'],[878,'Sci-Fi'],[53,'Thriller']].map(([id, label]) => (
                <button key={id} onClick={() => navigate(`/movies?genre=${id}`)}
                  className="px-4 py-2 rounded-full bg-dark-card text-ink-muted hover:text-white hover:bg-dark-border text-sm font-semibold transition-colors">
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
