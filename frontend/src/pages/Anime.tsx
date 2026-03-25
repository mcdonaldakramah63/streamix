// frontend/src/pages/Anime.tsx — FULL REPLACEMENT
import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Movie } from '../types'
import api from '../services/api'
import MovieCard from '../components/MovieCard'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'

const BD  = (p: string|null) => p ? `https://image.tmdb.org/t/p/w1280${p}` : ''
const PS  = (p: string|null) => p ? `https://image.tmdb.org/t/p/w300${p}` : ''

const ANIME_GENRES = [
  { id: 0,     label: 'All',     icon: '🌟' },
  { id: 10759, label: 'Action',  icon: '⚔️' },
  { id: 35,    label: 'Comedy',  icon: '😂' },
  { id: 10765, label: 'Sci-Fi',  icon: '🚀' },
  { id: 9648,  label: 'Mystery', icon: '🔍' },
  { id: 10749, label: 'Romance', icon: '💕' },
  { id: 18,    label: 'Drama',   icon: '🎭' },
  { id: 10751, label: 'Family',  icon: '👨‍👩‍👧' },
  { id: 10762, label: 'Kids',    icon: '🧒' },
]

const SORT = [
  { value: 'popularity.desc',     label: 'Most Popular'  },
  { value: 'vote_average.desc',   label: 'Top Rated'     },
  { value: 'first_air_date.desc', label: 'Newest First'  },
  { value: 'vote_count.desc',     label: 'Most Voted'    },
]

function SectionRow({ title, anime, loading }: { title: string; anime: Movie[]; loading: boolean }) {
  const navigate = useNavigate()
  if (loading) {
    return (
      <div className="mb-6 sm:mb-8">
        <div className="h-5 w-40 skeleton rounded mx-3 sm:mx-6 mb-3" />
        <div className="flex gap-2 sm:gap-3 overflow-x-auto scrollbar-hide px-3 sm:px-6">
          {Array(7).fill(0).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-28 sm:w-36 skeleton rounded-xl" style={{ aspectRatio:'2/3' }} />
          ))}
        </div>
      </div>
    )
  }
  if (!anime.length) return null
  return (
    <div className="mb-6 sm:mb-8">
      <h3 className="section-title px-3 sm:px-6 mb-3">{title}</h3>
      <div className="flex gap-2 sm:gap-3 overflow-x-auto scrollbar-hide px-3 sm:px-6 pb-1">
        {anime.map(a => (
          <div key={a.id} className="flex-shrink-0 w-28 sm:w-36 cursor-pointer group" style={{ aspectRatio:'2/3' }}
            onClick={() => navigate(`/tv/${a.id}`)}>
            <div className="relative w-full h-full rounded-xl overflow-hidden bg-dark-card">
              <img src={PS(a.poster_path)} alt={a.name||''} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#07080c]/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              {(a.vote_average||0) >= 8 && (
                <div className="absolute top-1.5 left-1.5 badge-gold text-[10px] px-1.5 py-0.5">★ {a.vote_average?.toFixed(1)}</div>
              )}
              <div className="absolute bottom-0 left-0 right-0 p-2 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
                <p className="text-white text-[11px] font-semibold line-clamp-2 mb-1.5">{a.name}</p>
                <button onClick={e => { e.stopPropagation(); navigate(`/player/tv/${a.id}?season=1&episode=1`) }}
                  className="w-full bg-brand text-dark text-[10px] font-bold py-1.5 rounded-lg">▶ Watch</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Anime() {
  const navigate = useNavigate()

  const [popular,     setPopular]     = useState<Movie[]>([])
  const [topRated,    setTopRated]    = useState<Movie[]>([])
  const [airing,      setAiring]      = useState<Movie[]>([])
  const [heroLoad,    setHeroLoad]    = useState(true)
  const [heroIdx,     setHeroIdx]     = useState(0)
  const [heroVisible, setHeroVisible] = useState(true)

  const [anime,    setAnime]    = useState<Movie[]>([])
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
    const now  = new Date()
    const ago  = new Date(now.getTime() - 90*24*60*60*1000)
    const fmt  = (d: Date) => d.toISOString().slice(0,10)
    Promise.all([
      api.get('/movies/discover', { params: { type:'tv', with_genres:'16', with_original_language:'ja', sort_by:'popularity.desc', page:1, 'vote_count.gte':100 } }),
      api.get('/movies/discover', { params: { type:'tv', with_genres:'16', with_original_language:'ja', sort_by:'vote_average.desc', page:1, 'vote_count.gte':500 } }),
      api.get('/movies/discover', { params: { type:'tv', with_genres:'16', with_original_language:'ja', sort_by:'popularity.desc', page:1, 'air_date.gte':fmt(ago), 'air_date.lte':fmt(now) } }),
    ]).then(([pop, top, air]) => {
      setPopular( pop.data.results || [])
      setTopRated(top.data.results || [])
      setAiring(  air.data.results || [])
    }).finally(() => setHeroLoad(false))
  }, [])

  useEffect(() => {
    if (!popular.length) return
    heroTimer.current = setInterval(() => {
      setHeroVisible(false)
      setTimeout(() => { setHeroIdx(i => (i + 1) % Math.min(popular.length, 6)); setHeroVisible(true) }, 300)
    }, 5500)
    return () => clearInterval(heroTimer.current)
  }, [popular.length])

  const fetchAnime = useCallback(async (pg: number, reset: boolean) => {
    if (pg === 1) setGridLoad(true); else setBusy(true)
    try {
      let data: any
      if (searchQ.trim()) {
        const res = await api.get('/movies/search', { params: { query: searchQ.trim(), type:'tv', page:pg } })
        const results = (res.data.results||[]).filter((r:any) => r.original_language==='ja' || r.genre_ids?.includes(16))
        data = { results, total_pages: res.data.total_pages }
      } else {
        const params: any = { type:'tv', with_genres: genre ? `16,${genre}` : '16', with_original_language:'ja', sort_by:sort, page:pg, 'vote_count.gte':10 }
        const res = await api.get('/movies/discover', { params })
        data = res.data
      }
      const results: Movie[] = data.results || []
      reset ? setAnime(results) : setAnime(p => [...p, ...results])
      setPage(pg)
      setHasMore(pg < Math.min(data.total_pages||1, 50))
    } catch (e) { console.error(e) }
    finally { setGridLoad(false); setBusy(false) }
  }, [genre, sort, searchQ])

  useEffect(() => { setPage(1); setHasMore(true); fetchAnime(1, true) }, [genre, sort, searchQ])

  useEffect(() => {
    clearTimeout(debRef.current)
    debRef.current = setTimeout(() => setSearchQ(search), 450)
    return () => clearTimeout(debRef.current)
  }, [search])

  const loadMore = useCallback(() => { if (!busy && hasMore) fetchAnime(page+1, false) }, [busy, hasMore, page, fetchAnime])
  const sentinel = useInfiniteScroll(loadMore, hasMore && !busy && !gridLoad)

  const hero = popular[heroIdx]

  return (
    <div className="min-h-screen">

      {/* ── Hero ── */}
      {heroLoad ? (
        <div className="skeleton" style={{ height:'clamp(260px,48vw,480px)' }} />
      ) : hero ? (
        <div className="relative overflow-hidden" style={{ height:'clamp(260px,48vw,480px)' }}>
          <img src={BD(hero.backdrop_path)} alt=""
            className={`absolute inset-0 w-full h-full object-cover object-top transition-opacity duration-500 ${heroVisible?'opacity-100':'opacity-0'}`} />
          <div className="absolute inset-0 bg-hero-gradient" />
          <div className="absolute inset-0" style={{ background:'linear-gradient(to top,#07080c 0%,transparent 50%)' }} />

          <div className={`absolute bottom-8 sm:bottom-14 left-4 sm:left-8 right-4 max-w-xl transition-all duration-500 ${heroVisible?'opacity-100 translate-y-0':'opacity-0 translate-y-2'}`}>
            <span className="inline-flex items-center gap-1.5 bg-rose-500/20 border border-rose-500/30 text-rose-400 text-[11px] font-bold px-3 py-1 rounded-full mb-3">
              🎌 Featured Anime
            </span>
            <h1 className="font-bold text-shadow mb-2 leading-tight"
              style={{ fontFamily:'Syne, sans-serif', fontSize:'clamp(1.4rem,4vw,2.8rem)' }}>
              {hero.name}
            </h1>
            <div className="flex items-center gap-3 mb-4 text-sm text-slate-400">
              {(hero.vote_average||0) >= 7 && <span className="badge-gold">★ {hero.vote_average?.toFixed(1)}</span>}
              <span>{hero.first_air_date?.slice(0,4)}</span>
            </div>
            <p className="text-slate-300 text-sm leading-relaxed line-clamp-2 mb-5 hidden sm:block max-w-md">{hero.overview}</p>
            <div className="flex gap-2.5">
              <button onClick={() => navigate(`/player/tv/${hero.id}?season=1&episode=1`)} className="btn-primary px-5 py-2.5 text-sm">▶ Watch Now</button>
              <button onClick={() => navigate(`/tv/${hero.id}`)} className="btn-secondary px-5 py-2.5 text-sm">Details</button>
            </div>
          </div>

          <div className="absolute bottom-4 right-4 flex gap-1.5">
            {popular.slice(0,6).map((_,i) => (
              <button key={i} onClick={() => { clearInterval(heroTimer.current!); setHeroIdx(i) }}
                className={`rounded-full transition-all ${i===heroIdx?'w-5 h-1.5 bg-rose-400':'w-1.5 h-1.5 bg-white/30'}`} />
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Carousels ── */}
      <SectionRow title="🔥 Most Popular"       anime={popular}  loading={heroLoad} />
      <SectionRow title="📺 Airing This Season" anime={airing}   loading={heroLoad} />
      <SectionRow title="⭐ Top Rated"          anime={topRated} loading={heroLoad} />

      {/* ── Browse ── */}
      <section className="px-3 sm:px-6 pb-12 mt-2">

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
          <div>
            <h2 className="section-title">🎌 Browse Anime</h2>
            {!gridLoad && <p className="text-xs text-slate-600 mt-0.5">{anime.length}+ titles</p>}
          </div>
          <div className="sm:ml-auto flex items-center gap-2.5 bg-dark-surface border border-dark-border rounded-xl px-4 py-2.5 w-full sm:max-w-xs focus-within:border-brand/40 transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-500 flex-shrink-0">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search anime…"
              className="bg-transparent outline-none text-sm text-white placeholder-slate-500 flex-1" />
            {search && <button onClick={() => setSearch('')} className="text-slate-500 hover:text-white text-xs">✕</button>}
          </div>
        </div>

        {!searchQ && (
          <>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-3 mb-3 -mx-3 px-3 sm:-mx-6 sm:px-6">
              {ANIME_GENRES.map(g => (
                <button key={g.id} onClick={() => setGenre(g.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold flex-shrink-0 border transition-all whitespace-nowrap ${
                    genre===g.id ? 'bg-brand text-dark border-brand shadow-brand-sm scale-105' : 'bg-dark-card border-dark-border text-slate-400 hover:border-brand/40 hover:text-white'
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
        ) : anime.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-slate-500 gap-3">
            <span className="text-5xl">🎌</span>
            <p>No anime found{searchQ ? ` for "${searchQ}"` : ''}</p>
            <button onClick={() => { setGenre(0); setSort('popularity.desc'); setSearch('') }} className="text-brand text-sm hover:underline">Reset</button>
          </div>
        ) : (
          <>
            <div className="movie-card-grid">
              {anime.map(a => <MovieCard key={a.id} movie={a} />)}
            </div>
            <div ref={sentinel} className="h-4 mt-4" />
            {busy && <div className="flex justify-center py-8"><div className="w-7 h-7 border-2 border-dark-border border-t-brand rounded-full animate-spin" /></div>}
            {!hasMore && anime.length > 0 && <p className="text-center text-xs text-slate-700 py-8">— End of list —</p>}
          </>
        )}
      </section>
    </div>
  )
}
