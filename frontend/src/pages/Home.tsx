// frontend/src/pages/Home.tsx — FULL REPLACEMENT
import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Movie } from '../types'
import api from '../services/api'
import Carousel            from '../components/Carousel'
import MovieCard           from '../components/MovieCard'
import ContinueWatchingRow from '../components/ContinueWatchingRow'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'

const IMG_BACKDROP = (p: string | null) =>
  p ? `https://image.tmdb.org/t/p/w1280${p}` : ''

function HeroSkeleton() {
  return <div className="w-full skeleton" style={{ height: 'clamp(280px, 55vw, 560px)' }} />
}

export default function Home() {
  const navigate = useNavigate()

  const [trending,    setTrending]    = useState<Movie[]>([])
  const [topRated,    setTopRated]    = useState<Movie[]>([])
  const [upcoming,    setUpcoming]    = useState<Movie[]>([])
  const [nowPlaying,  setNowPlaying]  = useState<Movie[]>([])
  const [heroLoad,    setHeroLoad]    = useState(true)
  const [heroIdx,     setHeroIdx]     = useState(0)
  const [heroVisible, setHeroVisible] = useState(true)

  const [popular,   setPopular]   = useState<Movie[]>([])
  const [popPage,   setPopPage]   = useState(1)
  const [hasMore,   setHasMore]   = useState(true)
  const [busy,      setBusy]      = useState(false)
  const [gridLoad,  setGridLoad]  = useState(true)

  const heroTimer    = useRef<ReturnType<typeof setInterval>>()
  const heroRef      = useRef<HTMLDivElement>(null)

  // Load hero data
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

  // Auto-rotate hero every 6s
  useEffect(() => {
    if (!trending.length) return
    heroTimer.current = setInterval(() => {
      setHeroVisible(false)
      setTimeout(() => { setHeroIdx(i => (i + 1) % Math.min(trending.length, 6)); setHeroVisible(true) }, 300)
    }, 6000)
    return () => clearInterval(heroTimer.current)
  }, [trending.length])

  // Fetch popular grid
  const fetchPopular = useCallback(async (pg: number, reset: boolean) => {
    if (pg === 1) setGridLoad(true); else setBusy(true)
    try {
      const { data } = await api.get('/movies/popular', { params: { page: pg } })
      const results  = data.results || []
      reset ? setPopular(results) : setPopular(p => [...p, ...results])
      setPopPage(pg)
      setHasMore(pg < Math.min(data.total_pages || 1, 15))
    } catch (e) { console.error(e) }
    finally { setGridLoad(false); setBusy(false) }
  }, [])

  useEffect(() => { fetchPopular(1, true) }, [])

  const loadMore = useCallback(() => { if (!busy && hasMore) fetchPopular(popPage + 1, false) }, [busy, hasMore, popPage, fetchPopular])
  const sentinel = useInfiniteScroll(loadMore, hasMore && !busy && !gridLoad)

  const changeHero = (idx: number) => {
    clearInterval(heroTimer.current)
    setHeroVisible(false)
    setTimeout(() => { setHeroIdx(idx); setHeroVisible(true) }, 200)
  }

  const hero = trending[heroIdx]

  return (
    <div className="min-h-screen">

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      {heroLoad ? <HeroSkeleton /> : hero ? (
        <div
          ref={heroRef}
          className="relative overflow-hidden"
          style={{ height: 'clamp(280px, 55vw, 560px)' }}>

          {/* Backdrop */}
          <img
            key={hero.id}
            src={IMG_BACKDROP(hero.backdrop_path)}
            alt=""
            className={`absolute inset-0 w-full h-full object-cover object-top transition-opacity duration-500 ${heroVisible ? 'opacity-100' : 'opacity-0'}`}
          />

          {/* Cinematic overlays */}
          <div className="absolute inset-0 bg-hero-gradient" />
          <div className="absolute inset-0 bg-hero-bottom" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, #07080c 0%, transparent 35%)' }} />

          {/* Noise texture overlay for depth */}
          <div className="absolute inset-0 opacity-[0.03]"
            style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\'/%3E%3C/svg%3E")', backgroundRepeat: 'repeat' }} />

          {/* Content */}
          <div className={`absolute bottom-10 sm:bottom-16 left-4 sm:left-8 right-4 max-w-2xl transition-all duration-500 ${heroVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>

            {/* Badge */}
            <div className="flex items-center gap-2 mb-3">
              <span className="badge-brand text-[11px] px-3 py-1 font-bold uppercase tracking-wider">
                🔥 Trending #{heroIdx + 1}
              </span>
              {hero.vote_average >= 7.5 && (
                <span className="badge-gold text-[11px] px-2.5 py-1">
                  ★ {hero.vote_average.toFixed(1)}
                </span>
              )}
            </div>

            {/* Title */}
            <h1 className="text-shadow font-bold leading-none mb-3"
              style={{
                fontFamily: 'Syne, sans-serif',
                fontSize: 'clamp(1.6rem, 5vw, 3.5rem)',
              }}>
              {hero.title}
            </h1>

            {/* Meta */}
            <div className="flex items-center gap-3 mb-3 text-slate-400 text-sm flex-wrap">
              <span>{(hero.release_date || '').slice(0,4)}</span>
              {(hero.genre_ids || []).slice(0,2).map(id => (
                <span key={id} className="hidden sm:inline border border-dark-border px-2 py-0.5 rounded-full text-xs">
                  {['Action','Adventure','Sci-Fi','Drama','Comedy','Horror','Romance','Thriller'][id % 8]}
                </span>
              ))}
            </div>

            {/* Overview */}
            <p className="text-shadow-sm text-slate-300 text-sm leading-relaxed mb-5 line-clamp-2 hidden sm:block max-w-lg">
              {hero.overview}
            </p>

            {/* CTA */}
            <div className="flex gap-2.5">
              <button onClick={() => navigate(`/player/movie/${hero.id}`)}
                className="btn-primary px-5 sm:px-7 py-2.5 sm:py-3 text-sm sm:text-base font-semibold shadow-brand">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                Play Now
              </button>
              <button onClick={() => navigate(`/movie/${hero.id}`)}
                className="btn-secondary px-5 sm:px-7 py-2.5 sm:py-3 text-sm sm:text-base">
                More Info
              </button>
            </div>
          </div>

          {/* Hero dots */}
          <div className="absolute bottom-4 right-4 sm:right-8 flex gap-1.5 z-10">
            {trending.slice(0,6).map((_, i) => (
              <button key={i} onClick={() => changeHero(i)}
                className={`rounded-full transition-all duration-300 ${i === heroIdx ? 'w-6 h-1.5 bg-brand' : 'w-1.5 h-1.5 bg-white/30 hover:bg-white/60'}`} />
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Continue Watching ──────────────────────────────────────────── */}
      <div className="mt-6 sm:mt-8">
        <ContinueWatchingRow />
      </div>

      {/* ── Carousels ─────────────────────────────────────────────────── */}
      <Carousel title="🔥 Trending This Week" movies={trending}   loading={heroLoad} seeAll="/movies" />
      <Carousel title="🎬 Now Playing"        movies={nowPlaying} loading={heroLoad} />
      <Carousel title="⭐ Top Rated"          movies={topRated}   loading={heroLoad} seeAll="/movies" />
      <Carousel title="🗓 Coming Soon"        movies={upcoming}   loading={heroLoad} />

      {/* ── Popular Grid ──────────────────────────────────────────────── */}
      <section className="px-3 sm:px-6 pb-12 mt-2">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title">🌟 Popular Movies</h2>
          {!gridLoad && <span className="text-xs text-slate-600">{popular.length} movies</span>}
        </div>

        {gridLoad ? (
          <div className="movie-card-grid">
            {Array(18).fill(0).map((_, i) => (
              <div key={i} className="skeleton rounded-xl" style={{ aspectRatio: '2/3' }} />
            ))}
          </div>
        ) : (
          <>
            <div className="movie-card-grid">
              {popular.map(m => <MovieCard key={m.id} movie={m} />)}
            </div>
            <div ref={sentinel} className="h-4 mt-4" />
            {busy && (
              <div className="flex justify-center py-8">
                <div className="w-7 h-7 border-2 border-dark-border border-t-brand rounded-full animate-spin" />
              </div>
            )}
            {!hasMore && popular.length > 0 && (
              <p className="text-center text-xs text-slate-700 py-8">— End of list —</p>
            )}
          </>
        )}
      </section>
    </div>
  )
}
