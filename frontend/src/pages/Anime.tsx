// frontend/src/pages/Anime.tsx — FULL REPLACEMENT
import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Movie } from '../types'
import api from '../services/api'
import { poster, rating, year, backdrop } from '../services/tmdb'
import MovieCard from '../components/MovieCard'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'

// Anime-specific TMDB genres (animation + origin JP)
const ANIME_GENRES = [
  { id: 0,    label: 'All',           icon: '🌟' },
  { id: 10759, label: 'Action',       icon: '⚔️' },
  { id: 10765, label: 'Sci-Fi',       icon: '🚀' },
  { id: 35,   label: 'Comedy',        icon: '😂' },
  { id: 10751, label: 'Family',       icon: '👨‍👩‍👧' },
  { id: 9648,  label: 'Mystery',      icon: '🔍' },
  { id: 10749, label: 'Romance',      icon: '💕' },
  { id: 10762, label: 'Kids',         icon: '🧒' },
  { id: 18,   label: 'Drama',         icon: '🎭' },
  { id: 10763, label: 'News',         icon: '📰' },
]

const SORT_OPTIONS = [
  { value: 'popularity.desc',    label: '🔥 Most Popular'   },
  { value: 'vote_average.desc',  label: '⭐ Top Rated'       },
  { value: 'first_air_date.desc',label: '🆕 Newest First'   },
  { value: 'first_air_date.asc', label: '📅 Oldest First'   },
  { value: 'vote_count.desc',    label: '🗳️ Most Voted'      },
]

// Curated anime spotlights for the hero section
const FEATURED_IDS = [
  31911,  // Demon Slayer
  85937,  // Jujutsu Kaisen
  37854,  // One Piece
  46298,  // Naruto Shippuden
  13916,  // Death Note
  72636,  // Attack on Titan
  65930,  // My Hero Academia
  69476,  // Sword Art Online
]

function SkeletonCard() {
  return <div className="aspect-[2/3] rounded-xl bg-dark-card animate-pulse" />
}

function AnimeCard({ anime }: { anime: Movie }) {
  const navigate = useNavigate()
  return (
    <div
      onClick={() => navigate(`/tv/${anime.id}`)}
      className="group cursor-pointer relative rounded-xl overflow-hidden bg-dark-card border border-dark-border hover:border-brand/50 transition-all hover:scale-[1.03] hover:shadow-xl hover:shadow-brand/10">
      <div className="aspect-[2/3] overflow-hidden">
        <img
          src={`https://image.tmdb.org/t/p/w300${anime.poster_path}`}
          alt={anime.name || anime.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="absolute bottom-0 left-0 right-0 p-2 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
        <p className="text-white text-xs font-bold truncate">{anime.name || anime.title}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {anime.vote_average > 0 && (
            <span className="text-yellow-400 text-xs">★ {anime.vote_average?.toFixed(1)}</span>
          )}
          <span className="text-slate-400 text-xs">{year(anime.first_air_date || anime.release_date)}</span>
        </div>
      </div>
      {anime.vote_average >= 8 && (
        <div className="absolute top-2 left-2 bg-brand/90 text-dark text-xs font-black px-1.5 py-0.5 rounded-full">
          ★ {anime.vote_average?.toFixed(1)}
        </div>
      )}
    </div>
  )
}

function Section({ title, anime, loading }: { title: string; anime: Movie[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="px-3 sm:px-6 mb-6">
        <div className="h-6 w-40 bg-dark-card animate-pulse rounded mb-3" />
        <div className="flex gap-2 overflow-x-hidden">
          {Array(7).fill(0).map((_, i) => (
            <div key={i} className="w-28 sm:w-36 flex-shrink-0 aspect-[2/3] rounded-xl bg-dark-card animate-pulse" />
          ))}
        </div>
      </div>
    )
  }
  if (!anime.length) return null
  return (
    <div className="mb-6">
      <h3 className="text-base sm:text-lg font-black px-3 sm:px-6 mb-3">{title}</h3>
      <div className="flex gap-2 sm:gap-3 overflow-x-auto scrollbar-hide px-3 sm:px-6 pb-2">
        {anime.map(a => (
          <div key={a.id} className="flex-shrink-0 w-28 sm:w-36">
            <AnimeCard anime={a} />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Anime() {
  const navigate  = useNavigate()

  // Featured / carousels
  const [featured,    setFeatured]    = useState<Movie[]>([])
  const [popular,     setPopular]     = useState<Movie[]>([])
  const [topRated,    setTopRated]    = useState<Movie[]>([])
  const [currentSeason, setCurrentSeason] = useState<Movie[]>([])
  const [heroLoad,    setHeroLoad]    = useState(true)

  // Browse grid
  const [anime,     setAnime]     = useState<Movie[]>([])
  const [page,      setPage]      = useState(1)
  const [hasMore,   setHasMore]   = useState(true)
  const [busy,      setBusy]      = useState(false)
  const [gridLoad,  setGridLoad]  = useState(true)

  // Filters
  const [genre,     setGenre]     = useState(0)
  const [sort,      setSort]      = useState('popularity.desc')
  const [search,    setSearch]    = useState('')
  const [searchQ,   setSearchQ]   = useState('')
  const [heroIdx,   setHeroIdx]   = useState(0)

  const debRef    = useRef<ReturnType<typeof setTimeout>>()
  const heroTimer = useRef<ReturnType<typeof setInterval>>()

  // Load carousels
  useEffect(() => {
    setHeroLoad(true)
    Promise.all([
      // Popular anime — Japanese animation TV
      api.get('/movies/discover', { params: {
        type: 'tv', with_genres: '16', with_original_language: 'ja',
        sort_by: 'popularity.desc', page: 1, 'vote_count.gte': 100
      }}),
      // Top rated
      api.get('/movies/discover', { params: {
        type: 'tv', with_genres: '16', with_original_language: 'ja',
        sort_by: 'vote_average.desc', page: 1, 'vote_count.gte': 500
      }}),
      // Currently airing
      api.get('/movies/discover', { params: {
        type: 'tv', with_genres: '16', with_original_language: 'ja',
        sort_by: 'popularity.desc', page: 1,
        'air_date.gte': new Date(Date.now() - 90*24*60*60*1000).toISOString().slice(0,10),
        'air_date.lte': new Date().toISOString().slice(0,10),
      }}),
    ]).then(([pop, top, curr]) => {
      const popList  = pop.data.results  || []
      const topList  = top.data.results  || []
      const currList = curr.data.results || []
      setPopular(popList)
      setTopRated(topList)
      setCurrentSeason(currList)
      // Featured = top popular for hero
      setFeatured(popList.slice(0, 8))
    }).catch(console.error).finally(() => setHeroLoad(false))
  }, [])

  // Auto-rotate hero
  useEffect(() => {
    heroTimer.current = setInterval(() => {
      setHeroIdx(i => (i + 1) % Math.max(featured.length, 1))
    }, 5000)
    return () => clearInterval(heroTimer.current)
  }, [featured.length])

  // Fetch browse grid
  const fetchAnime = useCallback(async (pg: number, reset: boolean) => {
    if (pg === 1) setGridLoad(true); else setBusy(true)
    try {
      let data: any
      if (searchQ.trim()) {
        const res = await api.get('/movies/search', {
          params: { query: searchQ.trim(), page: pg, type: 'tv' }
        })
        // Filter to anime only
        const results = (res.data.results || []).filter(
          (r: any) => r.origin_country?.includes('JP') || r.original_language === 'ja'
        )
        data = { results, total_pages: res.data.total_pages }
      } else {
        const params: any = {
          type: 'tv',
          with_genres: genre ? `16,${genre}` : '16',
          with_original_language: 'ja',
          sort_by: sort,
          page: pg,
          'vote_count.gte': 20,
        }
        const res = await api.get('/movies/discover', { params })
        data = res.data
      }
      const results: Movie[] = data.results || []
      reset ? setAnime(results) : setAnime(p => [...p, ...results])
      setPage(pg)
      setHasMore(pg < Math.min(data.total_pages || 1, 50))
    } catch (e) { console.error(e) }
    finally { setGridLoad(false); setBusy(false) }
  }, [genre, sort, searchQ])

  useEffect(() => { setPage(1); setHasMore(true); fetchAnime(1, true) }, [genre, sort, searchQ])

  // Debounce search
  useEffect(() => {
    clearTimeout(debRef.current)
    debRef.current = setTimeout(() => setSearchQ(search), 500)
    return () => clearTimeout(debRef.current)
  }, [search])

  const loadMore = useCallback(() => { if (!busy && hasMore) fetchAnime(page + 1, false) }, [busy, hasMore, page, fetchAnime])
  const sentinel = useInfiniteScroll(loadMore, hasMore && !busy && !gridLoad)

  const hero = featured[heroIdx]

  return (
    <div className="pt-14 min-h-screen">

      {/* ── Hero ── */}
      {heroLoad || !hero ? (
        <div className="h-[300px] sm:h-[460px] bg-dark-surface animate-pulse" />
      ) : (
        <div className="relative h-[300px] sm:h-[460px] overflow-hidden">
          <img
            key={hero.id}
            src={backdrop(hero.backdrop_path, 'w1280')}
            alt={hero.name}
            className="w-full h-full object-cover object-top transition-opacity duration-1000"
          />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, rgba(6,9,15,0.97) 0%, rgba(6,9,15,0.55) 55%, rgba(6,9,15,0.1) 100%)' }} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(6,9,15,1) 0%, transparent 55%)' }} />

          <div className="absolute bottom-6 sm:bottom-12 left-4 sm:left-8 right-4 max-w-xl">
            <span className="inline-flex items-center gap-1.5 bg-rose-500/20 border border-rose-500/40 text-rose-400 text-xs font-bold px-3 py-1 rounded-full mb-3">
              🎌 Featured Anime
            </span>
            <h1 className="text-2xl sm:text-5xl font-black leading-tight mb-2">{hero.name}</h1>
            <div className="flex gap-2 items-center mb-3 flex-wrap">
              {hero.vote_average > 0 && <span className="text-yellow-400 font-bold text-sm">★ {rating(hero.vote_average)}</span>}
              <span className="text-slate-400 text-sm">{year(hero.first_air_date)}</span>
            </div>
            <p className="text-slate-300 text-sm leading-relaxed line-clamp-2 mb-5 hidden sm:block max-w-md">{hero.overview}</p>
            <div className="flex gap-2 items-center">
              <button onClick={() => navigate(`/player/tv/${hero.id}?season=1&episode=1`)} className="btn-primary px-5 py-2.5 text-sm">
                ▶ Watch Now
              </button>
              <button onClick={() => navigate(`/tv/${hero.id}`)} className="btn-secondary px-5 py-2.5 text-sm">
                Details
              </button>
            </div>
          </div>

          {/* Hero dots */}
          <div className="absolute bottom-4 right-4 sm:right-8 flex gap-1.5">
            {featured.map((_, i) => (
              <button key={i} onClick={() => { setHeroIdx(i); clearInterval(heroTimer.current!) }}
                className={`h-1.5 rounded-full transition-all ${i === heroIdx ? 'w-6 bg-brand' : 'w-1.5 bg-white/30 hover:bg-white/60'}`} />
            ))}
          </div>
        </div>
      )}

      {/* ── Carousels ── */}
      <Section title="🔥 Most Popular"        anime={popular}       loading={heroLoad} />
      <Section title="📺 Airing This Season"  anime={currentSeason} loading={heroLoad} />
      <Section title="⭐ Top Rated All Time"  anime={topRated}      loading={heroLoad} />

      {/* ── Browse ── */}
      <section className="px-3 sm:px-6 py-6">

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-white">🎌 Browse Anime</h2>
            {!gridLoad && <p className="text-xs text-slate-500 mt-0.5">{anime.length.toLocaleString()} titles</p>}
          </div>

          {/* Search */}
          <div className="flex items-center gap-2 bg-dark-surface border border-dark-border rounded-xl px-4 py-2.5 flex-1 sm:max-w-sm focus-within:border-brand/50 transition-colors">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-500 flex-shrink-0">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search anime..."
              className="bg-transparent outline-none text-sm text-white placeholder-slate-500 flex-1" />
            {search && <button onClick={() => setSearch('')} className="text-slate-500 hover:text-white">✕</button>}
          </div>
        </div>

        {/* Genre pills — only in discover mode */}
        {!searchQ && (
          <>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-3 mb-3 -mx-3 px-3 sm:-mx-6 sm:px-6">
              {ANIME_GENRES.map(g => (
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
                className="bg-dark-card border border-dark-border rounded-lg px-3 py-1.5 text-xs text-slate-300 outline-none cursor-pointer hover:border-brand transition-colors">
                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </>
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
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2 sm:gap-3">
            {Array(18).fill(0).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : anime.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
            <span className="text-5xl">🎌</span>
            <p className="text-base">No anime found{searchQ ? ` for "${searchQ}"` : ''}</p>
            <button onClick={() => { setGenre(0); setSort('popularity.desc'); setSearch('') }}
              className="text-brand text-sm hover:underline">Reset filters</button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2 sm:gap-3">
              {anime.map(a => <AnimeCard key={a.id} anime={a} />)}
            </div>
            <div ref={sentinel} className="h-4 mt-4" />
            {busy && (
              <div className="flex justify-center py-6">
                <div className="w-7 h-7 border-2 border-dark-border border-t-brand rounded-full animate-spin" />
              </div>
            )}
            {!hasMore && anime.length > 0 && (
              <p className="text-center text-xs text-slate-600 py-8">✓ You've seen everything</p>
            )}
          </>
        )}
      </section>
    </div>
  )
}
