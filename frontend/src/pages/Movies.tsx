// frontend/src/pages/Movies.tsx — FULL REPLACEMENT
import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Movie } from '../types'
import api from '../services/api'
import { backdrop, rating, year } from '../services/tmdb'
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
  { id: 99,    label: 'Documentary',  icon: '🎥' },
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

const SORT_OPTIONS = [
  { value: 'popularity.desc',   label: '🔥 Most Popular'    },
  { value: 'vote_average.desc', label: '⭐ Top Rated'        },
  { value: 'release_date.desc', label: '🆕 Newest First'    },
  { value: 'release_date.asc',  label: '📅 Oldest First'    },
  { value: 'revenue.desc',      label: '💰 Highest Grossing' },
  { value: 'vote_count.desc',   label: '🗳️ Most Voted'       },
]

function SkeletonCard() {
  return <div className="aspect-[2/3] rounded-xl bg-dark-card animate-pulse" />
}

function SkeletonGrid({ n = 18 }: { n?: number }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2 sm:gap-3">
      {Array(n).fill(0).map((_, i) => <SkeletonCard key={i} />)}
    </div>
  )
}

export default function Movies() {
  const navigate = useNavigate()

  const [trending,  setTrending]  = useState<Movie[]>([])
  const [topRated,  setTopRated]  = useState<Movie[]>([])
  const [upcoming,  setUpcoming]  = useState<Movie[]>([])
  const [nowPlaying,setNowPlaying]= useState<Movie[]>([])
  const [heroLoad,  setHeroLoad]  = useState(true)

  const [movies,    setMovies]    = useState<Movie[]>([])
  const [page,      setPage]      = useState(1)
  const [hasMore,   setHasMore]   = useState(true)
  const [busy,      setBusy]      = useState(false)
  const [gridLoad,  setGridLoad]  = useState(true)

  const [genre,     setGenre]     = useState(0)
  const [sort,      setSort]      = useState('popularity.desc')
  const [search,    setSearch]    = useState('')
  const [searchQ,   setSearchQ]   = useState('')
  const [tab,       setTab]       = useState<'discover'|'search'>('discover')

  const debRef = useRef<ReturnType<typeof setTimeout>>()

  // Hero + carousels
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
    }).catch(console.error).finally(() => setHeroLoad(false))
  }, [])

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
      const results: Movie[] = (data.results || [])
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
    debRef.current = setTimeout(() => { setSearchQ(search); setTab(search ? 'search' : 'discover') }, 500)
    return () => clearTimeout(debRef.current)
  }, [search])

  const loadMore = useCallback(() => { if (!busy && hasMore) fetchMovies(page + 1, false) }, [busy, hasMore, page, fetchMovies])
  const sentinel = useInfiniteScroll(loadMore, hasMore && !busy && !gridLoad)

  const hero = trending[0]

  return (
    <div className="pt-14 min-h-screen">

      {/* ── Hero Banner ── */}
      {heroLoad ? (
        <div className="h-[300px] sm:h-[460px] bg-dark-surface animate-pulse" />
      ) : hero ? (
        <div className="relative h-[300px] sm:h-[460px] overflow-hidden">
          <img src={backdrop(hero.backdrop_path, 'w1280')} alt={hero.title} className="w-full h-full object-cover object-center" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, rgba(6,9,15,0.95) 0%, rgba(6,9,15,0.6) 50%, rgba(6,9,15,0.2) 100%)' }} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(6,9,15,1) 0%, transparent 60%)' }} />
          <div className="absolute bottom-6 sm:bottom-12 left-4 sm:left-8 right-4 max-w-xl">
            <span className="inline-flex items-center gap-1.5 bg-brand/20 border border-brand/40 text-brand text-xs font-bold px-3 py-1 rounded-full mb-3">
              🔥 Trending Now
            </span>
            <h1 className="text-2xl sm:text-5xl font-black leading-tight mb-2 drop-shadow-lg">{hero.title}</h1>
            <div className="flex gap-2 items-center mb-3 flex-wrap">
              <span className="text-yellow-400 font-bold text-sm">★ {rating(hero.vote_average)}</span>
              <span className="text-slate-400 text-sm">{year(hero.release_date)}</span>
            </div>
            <p className="text-slate-300 text-sm leading-relaxed line-clamp-2 mb-5 hidden sm:block max-w-md">{hero.overview}</p>
            <div className="flex gap-2">
              <button onClick={() => navigate(`/player/movie/${hero.id}`)} className="btn-primary px-5 py-2.5 text-sm gap-2 flex items-center">
                ▶ Play Now
              </button>
              <button onClick={() => navigate(`/movie/${hero.id}`)} className="btn-secondary px-5 py-2.5 text-sm">
                More Info
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Carousels ── */}
      <Carousel title="🔥 Trending This Week" movies={trending}   loading={heroLoad} />
      <Carousel title="🎬 Now Playing"        movies={nowPlaying} loading={heroLoad} />
      <Carousel title="⭐ Top Rated All Time" movies={topRated}   loading={heroLoad} />
      <Carousel title="🗓 Coming Soon"        movies={upcoming}   loading={heroLoad} />

      {/* ── Browse ── */}
      <section className="px-3 sm:px-6 py-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-white">🎬 Browse Movies</h2>
            {!gridLoad && <p className="text-xs text-slate-500 mt-0.5">{movies.length.toLocaleString()} movies</p>}
          </div>

          {/* Search bar */}
          <div className="flex items-center gap-2 bg-dark-surface border border-dark-border rounded-xl px-4 py-2.5 flex-1 sm:max-w-sm focus-within:border-brand/50 transition-colors">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-500 flex-shrink-0">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search movies..."
              className="bg-transparent outline-none text-sm text-white placeholder-slate-500 flex-1" />
            {search && <button onClick={() => setSearch('')} className="text-slate-500 hover:text-white">✕</button>}
          </div>
        </div>

        {/* Genre pills + sort — hidden during search */}
        {tab === 'discover' && (
          <>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-3 mb-3 -mx-3 px-3 sm:-mx-6 sm:px-6">
              {GENRES.map(g => (
                <button key={g.id} onClick={() => setGenre(g.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold flex-shrink-0 transition-all whitespace-nowrap border ${
                    genre === g.id
                      ? 'bg-brand text-dark border-brand shadow-lg shadow-brand/20 scale-105'
                      : 'bg-dark-card border-dark-border text-slate-400 hover:border-brand/50 hover:text-white'
                  }`}>
                  <span>{g.icon}</span> {g.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 mb-5">
              <span className="text-xs text-slate-500 flex-shrink-0">Sort:</span>
              <select value={sort} onChange={e => setSort(e.target.value)}
                className="bg-dark-card border border-dark-border rounded-lg px-3 py-1.5 text-xs text-slate-300 outline-none cursor-pointer hover:border-brand transition-colors flex-shrink-0">
                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </>
        )}

        {/* Search label */}
        {tab === 'search' && searchQ && (
          <div className="flex items-center gap-3 mb-5">
            <p className="text-sm text-slate-400">Results for <span className="text-white font-semibold">"{searchQ}"</span></p>
            <button onClick={() => { setSearch(''); setSearchQ(''); setTab('discover') }}
              className="text-xs text-brand hover:underline">Clear</button>
          </div>
        )}

        {/* Movie grid */}
        {gridLoad ? <SkeletonGrid /> : movies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
            <span className="text-5xl">🎬</span>
            <p className="text-base">No movies found{searchQ ? ` for "${searchQ}"` : ''}</p>
            <button onClick={() => { setGenre(0); setSort('popularity.desc'); setSearch('') }}
              className="text-brand text-sm hover:underline">Reset filters</button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2 sm:gap-3">
              {movies.map(m => <MovieCard key={m.id} movie={m} />)}
            </div>
            <div ref={sentinel} className="h-4 mt-4" />
            {busy && (
              <div className="flex justify-center py-6">
                <div className="w-7 h-7 border-2 border-dark-border border-t-brand rounded-full animate-spin" />
              </div>
            )}
            {!hasMore && movies.length > 0 && (
              <p className="text-center text-xs text-slate-600 py-8">✓ You've seen everything</p>
            )}
          </>
        )}
      </section>
    </div>
  )
}
