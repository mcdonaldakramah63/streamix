// frontend/src/pages/Movies.tsx — FULL REPLACEMENT
import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Movie } from '../types'
import api from '../services/api'
import Carousel  from '../components/Carousel'
import MovieCard from '../components/MovieCard'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'

const GENRES = [
  { id: 0,     label: 'All',          icon: '🌟' },
  { id: 28,    label: 'Action',       icon: '💥' },
  { id: 12,    label: 'Adventure',    icon: '🌍' },
  { id: 16,    label: 'Animation',    icon: '🎨' },
  { id: 35,    label: 'Comedy',       icon: '😂' },
  { id: 80,    label: 'Crime',        icon: '🔫' },
  { id: 18,    label: 'Drama',        icon: '🎭' },
  { id: 10751, label: 'Family',       icon: '👨‍👩‍👧' },
  { id: 14,    label: 'Fantasy',      icon: '🧙' },
  { id: 36,    label: 'History',      icon: '📜' },
  { id: 27,    label: 'Horror',       icon: '👻' },
  { id: 10402, label: 'Music',        icon: '🎵' },
  { id: 9648,  label: 'Mystery',      icon: '🔍' },
  { id: 10749, label: 'Romance',      icon: '💕' },
  { id: 878,   label: 'Sci-Fi',       icon: '🚀' },
  { id: 53,    label: 'Thriller',     icon: '😰' },
  { id: 10752, label: 'War',          icon: '⚔️' },
  { id: 37,    label: 'Western',      icon: '🤠' },
]

const SORT = [
  { value: 'popularity.desc',   label: 'Most Popular'    },
  { value: 'vote_average.desc', label: 'Top Rated'       },
  { value: 'release_date.desc', label: 'Newest First'    },
  { value: 'release_date.asc',  label: 'Oldest First'    },
  { value: 'revenue.desc',      label: 'Highest Grossing' },
  { value: 'vote_count.desc',   label: 'Most Voted'      },
]

export default function Movies() {
  const navigate = useNavigate()

  // Carousels
  const [trending,   setTrending]   = useState<Movie[]>([])
  const [topRated,   setTopRated]   = useState<Movie[]>([])
  const [upcoming,   setUpcoming]   = useState<Movie[]>([])
  const [nowPlaying, setNowPlaying] = useState<Movie[]>([])
  const [heroLoad,   setHeroLoad]   = useState(true)

  // Browse
  const [movies,   setMovies]   = useState<Movie[]>([])
  const [page,     setPage]     = useState(1)
  const [hasMore,  setHasMore]  = useState(true)
  const [busy,     setBusy]     = useState(false)
  const [gridLoad, setGridLoad] = useState(true)

  // Filters
  const [genre,   setGenre]   = useState(0)
  const [sort,    setSort]    = useState('popularity.desc')
  const [search,  setSearch]  = useState('')
  const [searchQ, setSearchQ] = useState('')
  const [heroIdx, setHeroIdx] = useState(0)

  const debRef    = useRef<ReturnType<typeof setTimeout>>()
  const heroTimer = useRef<ReturnType<typeof setInterval>>()

  // Load carousels
  useEffect(() => {
    setHeroLoad(true)
    Promise.all([
      api.get('/movies/trending'),
      api.get('/movies/top-rated'),
      api.get('/movies/upcoming'),
      api.get('/movies/now-playing'),
    ]).then(([t, r, u, n]) => {
      setTrending(  t.data.results || [])
      setTopRated(  r.data.results || [])
      setUpcoming(  u.data.results || [])
      setNowPlaying(n.data.results || [])
    }).finally(() => setHeroLoad(false))
  }, [])

  // Auto-rotate hero
  useEffect(() => {
    if (!trending.length) return
    heroTimer.current = setInterval(() => setHeroIdx(i => (i + 1) % Math.min(trending.length, 5)), 5000)
    return () => clearInterval(heroTimer.current)
  }, [trending.length])

  // Fetch grid
  const fetchMovies = useCallback(async (pg: number, reset: boolean) => {
    if (pg === 1) setGridLoad(true); else setBusy(true)
    try {
      let data: any
      if (searchQ.trim()) {
        const res = await api.get('/movies/search', { params: { query: searchQ.trim(), page: pg } })
        data = res.data
      } else {
        const params: any = { page: pg, sort_by: sort, 'vote_count.gte': 50 }
        if (genre) params.with_genres = genre
        const res = await api.get('/movies/discover', { params })
        data = res.data
      }
      const results: Movie[] = data.results || []
      reset ? setMovies(results) : setMovies(p => [...p, ...results])
      setPage(pg)
      setHasMore(pg < Math.min(data.total_pages || 1, 50))
    } catch (e) { console.error(e) }
    finally { setGridLoad(false); setBusy(false) }
  }, [genre, sort, searchQ])

  useEffect(() => { setPage(1); setHasMore(true); fetchMovies(1, true) }, [genre, sort, searchQ])

  // Debounce search
  useEffect(() => {
    clearTimeout(debRef.current)
    debRef.current = setTimeout(() => setSearchQ(search), 450)
    return () => clearTimeout(debRef.current)
  }, [search])

  const loadMore = useCallback(() => { if (!busy && hasMore) fetchMovies(page + 1, false) }, [busy, hasMore, page, fetchMovies])
  const sentinel = useInfiniteScroll(loadMore, hasMore && !busy && !gridLoad)

  const hero = trending[heroIdx]

  return (
    <div className="min-h-screen">

      {/* ── Hero ── */}
      {heroLoad ? (
        <div className="skeleton" style={{ height: 'clamp(240px,45vw,460px)' }} />
      ) : hero ? (
        <div className="relative overflow-hidden" style={{ height: 'clamp(240px,45vw,460px)' }}>
          <img src={`https://image.tmdb.org/t/p/w1280${hero.backdrop_path}`} alt=""
            className="absolute inset-0 w-full h-full object-cover object-top" />
          <div className="absolute inset-0 bg-hero-gradient" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, #07080c 0%, transparent 45%)' }} />

          <div className="absolute bottom-8 sm:bottom-14 left-4 sm:left-8 right-4 max-w-xl">
            <span className="badge-brand text-[11px] mb-3 inline-flex">🎬 Featured Movie</span>
            <h1 className="font-bold text-shadow mb-2 leading-tight"
              style={{ fontFamily:'Syne, sans-serif', fontSize:'clamp(1.5rem, 4vw, 3rem)' }}>
              {hero.title}
            </h1>
            <div className="flex items-center gap-3 mb-4 text-sm text-slate-400">
              {hero.vote_average >= 7 && <span className="badge-gold">★ {hero.vote_average.toFixed(1)}</span>}
              <span>{hero.release_date?.slice(0,4)}</span>
            </div>
            <p className="text-slate-300 text-sm leading-relaxed line-clamp-2 mb-5 hidden sm:block max-w-md">{hero.overview}</p>
            <div className="flex gap-2.5">
              <button onClick={() => navigate(`/player/movie/${hero.id}`)} className="btn-primary px-5 py-2.5 text-sm">▶ Play Now</button>
              <button onClick={() => navigate(`/movie/${hero.id}`)}        className="btn-secondary px-5 py-2.5 text-sm">Info</button>
            </div>
          </div>

          {/* Dots */}
          <div className="absolute bottom-4 right-4 flex gap-1.5">
            {trending.slice(0,5).map((_, i) => (
              <button key={i} onClick={() => { setHeroIdx(i); clearInterval(heroTimer.current!) }}
                className={`rounded-full transition-all ${i === heroIdx ? 'w-5 h-1.5 bg-brand' : 'w-1.5 h-1.5 bg-white/30'}`} />
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Carousels ── */}
      <Carousel title="🔥 Trending"    movies={trending}   loading={heroLoad} />
      <Carousel title="🎬 Now Playing" movies={nowPlaying} loading={heroLoad} />
      <Carousel title="⭐ Top Rated"   movies={topRated}   loading={heroLoad} />
      <Carousel title="🗓 Coming Soon" movies={upcoming}   loading={heroLoad} />

      {/* ── Browse ── */}
      <section className="px-3 sm:px-6 pb-12 mt-2">

        {/* Header + search */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
          <div>
            <h2 className="section-title">Browse Movies</h2>
            {!gridLoad && !searchQ && (
              <p className="text-xs text-slate-600 mt-0.5">{movies.length}+ movies</p>
            )}
          </div>
          {/* Search */}
          <div className="sm:ml-auto flex items-center gap-2.5 bg-dark-surface border border-dark-border rounded-xl px-4 py-2.5 w-full sm:max-w-xs focus-within:border-brand/40 transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-500 flex-shrink-0">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search movies…"
              className="bg-transparent outline-none text-sm text-white placeholder-slate-500 flex-1" />
            {search && <button onClick={() => setSearch('')} className="text-slate-500 hover:text-white text-xs">✕</button>}
          </div>
        </div>

        {/* Genre pills */}
        {!searchQ && (
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-3 mb-3 -mx-3 px-3 sm:-mx-6 sm:px-6">
            {GENRES.map(g => (
              <button key={g.id} onClick={() => setGenre(g.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold flex-shrink-0 border transition-all whitespace-nowrap ${
                  genre === g.id
                    ? 'bg-brand text-dark border-brand shadow-brand-sm scale-105'
                    : 'bg-dark-card border-dark-border text-slate-400 hover:border-brand/40 hover:text-white'
                }`}>
                <span>{g.icon}</span>{g.label}
              </button>
            ))}
          </div>
        )}

        {/* Sort */}
        {!searchQ && (
          <div className="flex items-center gap-3 mb-5">
            <span className="text-xs text-slate-600 flex-shrink-0">Sort:</span>
            <select value={sort} onChange={e => setSort(e.target.value)}
              className="bg-dark-card border border-dark-border rounded-xl px-3 py-1.5 text-xs text-slate-300 outline-none cursor-pointer hover:border-brand/40 transition-colors">
              {SORT.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        )}

        {/* Search label */}
        {searchQ && (
          <div className="flex items-center gap-3 mb-5">
            <p className="text-sm text-slate-400">Results for <span className="text-white font-semibold">"{searchQ}"</span></p>
            <button onClick={() => { setSearch(''); setSearchQ('') }} className="text-xs text-brand hover:underline">Clear</button>
          </div>
        )}

        {/* Grid */}
        {gridLoad ? (
          <div className="movie-card-grid">
            {Array(18).fill(0).map((_, i) => (
              <div key={i} className="skeleton rounded-xl" style={{ aspectRatio:'2/3' }} />
            ))}
          </div>
        ) : movies.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-slate-500 gap-3">
            <span className="text-5xl">🎬</span>
            <p>No movies found{searchQ ? ` for "${searchQ}"` : ''}</p>
            <button onClick={() => { setGenre(0); setSort('popularity.desc'); setSearch('') }}
              className="text-brand text-sm hover:underline">Reset filters</button>
          </div>
        ) : (
          <>
            <div className="movie-card-grid">
              {movies.map(m => <MovieCard key={m.id} movie={m} />)}
            </div>
            <div ref={sentinel} className="h-4 mt-4" />
            {busy && (
              <div className="flex justify-center py-8">
                <div className="w-7 h-7 border-2 border-dark-border border-t-brand rounded-full animate-spin" />
              </div>
            )}
            {!hasMore && movies.length > 0 && (
              <p className="text-center text-xs text-slate-700 py-8">— End of list —</p>
            )}
          </>
        )}
      </section>
    </div>
  )
}
