// frontend/src/pages/TVShows.tsx — FULL REPLACEMENT
import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Movie } from '../types'
import api from '../services/api'
import Carousel  from '../components/Carousel'
import MovieCard from '../components/MovieCard'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'

const GENRES = [
  { id: 0,     label: 'All',         icon: '🌟' },
  { id: 10759, label: 'Action',      icon: '💥' },
  { id: 35,    label: 'Comedy',      icon: '😂' },
  { id: 80,    label: 'Crime',       icon: '🔫' },
  { id: 99,    label: 'Documentary', icon: '🎥' },
  { id: 18,    label: 'Drama',       icon: '🎭' },
  { id: 10751, label: 'Family',      icon: '👨‍👩‍👧' },
  { id: 10765, label: 'Sci-Fi',      icon: '🚀' },
  { id: 9648,  label: 'Mystery',     icon: '🔍' },
  { id: 10749, label: 'Romance',     icon: '💕' },
  { id: 10768, label: 'War',         icon: '⚔️' },
]

const SORT = [
  { value: 'popularity.desc',     label: 'Most Popular' },
  { value: 'vote_average.desc',   label: 'Top Rated'    },
  { value: 'first_air_date.desc', label: 'Newest First' },
  { value: 'vote_count.desc',     label: 'Most Voted'   },
]

export default function TVShows() {
  const navigate = useNavigate()

  const [popular,    setPopular]    = useState<Movie[]>([])
  const [trending,   setTrending]   = useState<Movie[]>([])
  const [topRated,   setTopRated]   = useState<Movie[]>([])
  const [heroLoad,   setHeroLoad]   = useState(true)
  const [heroIdx,    setHeroIdx]    = useState(0)

  const [shows,    setShows]    = useState<Movie[]>([])
  const [page,     setPage]     = useState(1)
  const [hasMore,  setHasMore]  = useState(true)
  const [busy,     setBusy]     = useState(false)
  const [gridLoad, setGridLoad] = useState(true)

  const [genre,   setGenre]   = useState(0)
  const [sort,    setSort]    = useState('popularity.desc')
  const [search,  setSearch]  = useState('')
  const [searchQ, setSearchQ] = useState('')

  const debRef    = useRef<ReturnType<typeof setTimeout>>()
  const heroTimer = useRef<ReturnType<typeof setInterval>>()

  useEffect(() => {
    setHeroLoad(true)
    Promise.all([
      api.get('/movies/tv/popular'),
      api.get('/movies/tv/trending'),
      api.get('/movies/discover', { params: { type:'tv', sort_by:'vote_average.desc', 'vote_count.gte':500, page:1 } }),
    ]).then(([pop, trend, top]) => {
      setPopular( pop.data.results   || [])
      setTrending(trend.data.results || [])
      setTopRated(top.data.results   || [])
    }).finally(() => setHeroLoad(false))
  }, [])

  useEffect(() => {
    if (!trending.length) return
    heroTimer.current = setInterval(() => setHeroIdx(i => (i+1) % Math.min(trending.length,5)), 5500)
    return () => clearInterval(heroTimer.current)
  }, [trending.length])

  const fetchShows = useCallback(async (pg: number, reset: boolean) => {
    if (pg === 1) setGridLoad(true); else setBusy(true)
    try {
      let data: any
      if (searchQ.trim()) {
        const res = await api.get('/movies/search', { params: { query: searchQ.trim(), type:'tv', page:pg } })
        data = res.data
      } else {
        const params: any = { type:'tv', sort_by:sort, page:pg, 'vote_count.gte':50 }
        if (genre) params.with_genres = genre
        const res = await api.get('/movies/discover', { params })
        data = res.data
      }
      const results: Movie[] = data.results || []
      reset ? setShows(results) : setShows(p => [...p, ...results])
      setPage(pg)
      setHasMore(pg < Math.min(data.total_pages||1, 50))
    } catch (e) { console.error(e) }
    finally { setGridLoad(false); setBusy(false) }
  }, [genre, sort, searchQ])

  useEffect(() => { setPage(1); setHasMore(true); fetchShows(1, true) }, [genre, sort, searchQ])

  useEffect(() => {
    clearTimeout(debRef.current)
    debRef.current = setTimeout(() => setSearchQ(search), 450)
    return () => clearTimeout(debRef.current)
  }, [search])

  const loadMore = useCallback(() => { if (!busy && hasMore) fetchShows(page+1, false) }, [busy, hasMore, page, fetchShows])
  const sentinel = useInfiniteScroll(loadMore, hasMore && !busy && !gridLoad)

  const hero = trending[heroIdx]

  return (
    <div className="min-h-screen">

      {/* Hero */}
      {heroLoad ? (
        <div className="skeleton" style={{ height:'clamp(240px,42vw,440px)' }} />
      ) : hero ? (
        <div className="relative overflow-hidden" style={{ height:'clamp(240px,42vw,440px)' }}>
          <img src={`https://image.tmdb.org/t/p/w1280${hero.backdrop_path}`} alt=""
            className="absolute inset-0 w-full h-full object-cover object-top" />
          <div className="absolute inset-0 bg-hero-gradient" />
          <div className="absolute inset-0" style={{ background:'linear-gradient(to top,#07080c 0%,transparent 45%)' }} />
          <div className="absolute bottom-8 sm:bottom-12 left-4 sm:left-8 right-4 max-w-xl">
            <span className="badge-brand text-[11px] mb-3 inline-flex">📺 Trending Show</span>
            <h1 className="font-bold text-shadow mb-2 leading-tight"
              style={{ fontFamily:'Syne, sans-serif', fontSize:'clamp(1.4rem,4vw,2.8rem)' }}>
              {hero.name}
            </h1>
            <div className="flex items-center gap-3 mb-4 text-sm text-slate-400">
              {(hero.vote_average||0) >= 7 && <span className="badge-gold">★ {hero.vote_average?.toFixed(1)}</span>}
              <span>{hero.first_air_date?.slice(0,4)}</span>
            </div>
            <p className="text-slate-300 text-sm line-clamp-2 mb-5 hidden sm:block max-w-md">{hero.overview}</p>
            <div className="flex gap-2.5">
              <button onClick={() => navigate(`/player/tv/${hero.id}?season=1&episode=1`)} className="btn-primary px-5 py-2.5 text-sm">▶ Watch S1E1</button>
              <button onClick={() => navigate(`/tv/${hero.id}`)} className="btn-secondary px-5 py-2.5 text-sm">Details</button>
            </div>
          </div>
          <div className="absolute bottom-4 right-4 flex gap-1.5">
            {trending.slice(0,5).map((_,i) => (
              <button key={i} onClick={() => { setHeroIdx(i); clearInterval(heroTimer.current!) }}
                className={`rounded-full transition-all ${i===heroIdx?'w-5 h-1.5 bg-brand':'w-1.5 h-1.5 bg-white/30'}`} />
            ))}
          </div>
        </div>
      ) : null}

      {/* Carousels */}
      <Carousel title="🔥 Trending Now"  movies={trending} loading={heroLoad} />
      <Carousel title="📺 Popular Shows" movies={popular}  loading={heroLoad} />
      <Carousel title="⭐ Top Rated"     movies={topRated} loading={heroLoad} />

      {/* Browse */}
      <section className="px-3 sm:px-6 pb-12 mt-2">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
          <div>
            <h2 className="section-title">Browse TV Shows</h2>
            {!gridLoad && <p className="text-xs text-slate-600 mt-0.5">{shows.length}+ shows</p>}
          </div>
          <div className="sm:ml-auto flex items-center gap-2.5 bg-dark-surface border border-dark-border rounded-xl px-4 py-2.5 w-full sm:max-w-xs focus-within:border-brand/40 transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-500 flex-shrink-0"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search shows…"
              className="bg-transparent outline-none text-sm text-white placeholder-slate-500 flex-1" />
            {search && <button onClick={() => setSearch('')} className="text-slate-500 hover:text-white text-xs">✕</button>}
          </div>
        </div>

        {!searchQ && (
          <>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-3 mb-3 -mx-3 px-3 sm:-mx-6 sm:px-6">
              {GENRES.map(g => (
                <button key={g.id} onClick={() => setGenre(g.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold flex-shrink-0 border transition-all whitespace-nowrap ${
                    genre===g.id ? 'bg-brand text-dark border-brand scale-105' : 'bg-dark-card border-dark-border text-slate-400 hover:border-brand/40 hover:text-white'
                  }`}>
                  <span>{g.icon}</span>{g.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 mb-5">
              <span className="text-xs text-slate-600">Sort:</span>
              <select value={sort} onChange={e => setSort(e.target.value)}
                className="bg-dark-card border border-dark-border rounded-xl px-3 py-1.5 text-xs text-slate-300 outline-none cursor-pointer hover:border-brand/40 transition-colors">
                {SORT.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </>
        )}

        {searchQ && (
          <div className="flex items-center gap-3 mb-5">
            <p className="text-sm text-slate-400">Results for <span className="text-white font-semibold">"{searchQ}"</span></p>
            <button onClick={() => { setSearch(''); setSearchQ('') }} className="text-xs text-brand hover:underline">Clear</button>
          </div>
        )}

        {gridLoad ? (
          <div className="movie-card-grid">
            {Array(18).fill(0).map((_,i) => <div key={i} className="skeleton rounded-xl" style={{ aspectRatio:'2/3' }} />)}
          </div>
        ) : shows.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-slate-500 gap-3">
            <span className="text-5xl">📺</span>
            <p>No shows found{searchQ ? ` for "${searchQ}"` : ''}</p>
            <button onClick={() => { setGenre(0); setSort('popularity.desc'); setSearch('') }} className="text-brand text-sm hover:underline">Reset</button>
          </div>
        ) : (
          <>
            <div className="movie-card-grid">
              {shows.map(s => <MovieCard key={s.id} movie={s} />)}
            </div>
            <div ref={sentinel} className="h-4 mt-4" />
            {busy && <div className="flex justify-center py-8"><div className="w-7 h-7 border-2 border-dark-border border-t-brand rounded-full animate-spin" /></div>}
            {!hasMore && shows.length > 0 && <p className="text-center text-xs text-slate-700 py-8">— End of list —</p>}
          </>
        )}
      </section>
    </div>
  )
}
