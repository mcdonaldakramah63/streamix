// frontend/src/pages/Home.tsx — FULL REPLACEMENT
import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Movie } from '../types'
import api from '../services/api'
import { backdrop, rating, year } from '../services/tmdb'
import Carousel             from '../components/Carousel'
import MovieCard            from '../components/MovieCard'
import ContinueWatchingRow  from '../components/ContinueWatchingRow'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'

function SkeletonHero() {
  return <div className="w-full h-[340px] sm:h-[500px] bg-dark-surface animate-pulse" />
}

export default function Home() {
  const navigate = useNavigate()

  const [trending,   setTrending]   = useState<Movie[]>([])
  const [topRated,   setTopRated]   = useState<Movie[]>([])
  const [upcoming,   setUpcoming]   = useState<Movie[]>([])
  const [nowPlaying, setNowPlaying] = useState<Movie[]>([])
  const [heroLoad,   setHeroLoad]   = useState(true)
  const [heroIdx,    setHeroIdx]    = useState(0)

  const [popular,    setPopular]    = useState<Movie[]>([])
  const [popPage,    setPopPage]    = useState(1)
  const [hasMore,    setHasMore]    = useState(true)
  const [busy,       setBusy]       = useState(false)
  const [gridLoad,   setGridLoad]   = useState(true)

  const heroTimer = useRef<ReturnType<typeof setInterval>>()

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

  // Auto-rotate hero
  useEffect(() => {
    if (!trending.length) return
    heroTimer.current = setInterval(() => setHeroIdx(i => (i + 1) % Math.min(trending.length, 5)), 6000)
    return () => clearInterval(heroTimer.current)
  }, [trending.length])

  // Popular grid with infinite scroll
  const fetchPopular = useCallback(async (pg: number, reset: boolean) => {
    if (pg === 1) setGridLoad(true); else setBusy(true)
    try {
      const { data } = await api.get('/movies/popular', { params: { page: pg } })
      const results  = data.results || []
      reset ? setPopular(results) : setPopular(p => [...p, ...results])
      setPopPage(pg)
      setHasMore(pg < Math.min(data.total_pages || 1, 20))
    } catch (e) { console.error(e) }
    finally { setGridLoad(false); setBusy(false) }
  }, [])

  useEffect(() => { fetchPopular(1, true) }, [])

  const loadMore = useCallback(() => { if (!busy && hasMore) fetchPopular(popPage + 1, false) }, [busy, hasMore, popPage, fetchPopular])
  const sentinel = useInfiniteScroll(loadMore, hasMore && !busy && !gridLoad)

  const hero = trending[heroIdx]

  return (
    <div className="pt-14 min-h-screen">

      {/* ── Hero Banner ── */}
      {heroLoad ? <SkeletonHero /> : hero ? (
        <div className="relative h-[340px] sm:h-[500px] overflow-hidden">
          <img key={hero.id} src={backdrop(hero.backdrop_path, 'w1280')} alt={hero.title}
            className="w-full h-full object-cover object-top" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, rgba(6,9,15,0.97) 0%, rgba(6,9,15,0.55) 55%, rgba(6,9,15,0.1) 100%)' }} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(6,9,15,1) 0%, transparent 55%)' }} />

          <div className="absolute bottom-6 sm:bottom-14 left-4 sm:left-8 right-4 max-w-xl">
            <span className="inline-flex items-center gap-1.5 bg-brand/20 border border-brand/40 text-brand text-xs font-bold px-3 py-1 rounded-full mb-3">
              🔥 Trending #{heroIdx + 1}
            </span>
            <h1 className="text-2xl sm:text-5xl font-black leading-tight mb-2 drop-shadow-lg">{hero.title}</h1>
            <div className="flex gap-2 items-center mb-3 flex-wrap">
              <span className="bg-brand/15 border border-brand/30 text-brand px-2 py-0.5 rounded-full text-xs font-bold">★ {rating(hero.vote_average)}</span>
              <span className="text-slate-400 text-xs sm:text-sm">{year(hero.release_date)}</span>
            </div>
            <p className="text-slate-300 text-xs sm:text-sm leading-relaxed line-clamp-2 mb-4 hidden sm:block max-w-md">{hero.overview}</p>
            <div className="flex gap-2">
              <button onClick={() => navigate(`/player/movie/${hero.id}`)} className="btn-primary px-4 sm:px-6 py-2 sm:py-2.5 text-sm">▶ Play</button>
              <button onClick={() => navigate(`/movie/${hero.id}`)} className="btn-secondary px-4 sm:px-6 py-2 sm:py-2.5 text-sm">More Info</button>
            </div>
          </div>

          {/* Hero dots */}
          <div className="absolute bottom-4 right-4 sm:right-8 flex gap-1.5">
            {trending.slice(0, 5).map((_, i) => (
              <button key={i} onClick={() => { setHeroIdx(i); clearInterval(heroTimer.current!) }}
                className={`h-1.5 rounded-full transition-all ${i === heroIdx ? 'w-6 bg-brand' : 'w-1.5 bg-white/30 hover:bg-white/60'}`} />
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Continue Watching ── */}
      <div className="mt-4">
        <ContinueWatchingRow />
      </div>

      {/* ── Carousels ── */}
      <Carousel title="🔥 Trending This Week" movies={trending}   loading={heroLoad} />
      <Carousel title="🎬 Now Playing"        movies={nowPlaying} loading={heroLoad} />
      <Carousel title="⭐ Top Rated"          movies={topRated}   loading={heroLoad} />
      <Carousel title="🗓 Coming Soon"        movies={upcoming}   loading={heroLoad} />

      {/* ── Popular Grid ── */}
      <section className="px-3 sm:px-4 pb-8">
        <h2 className="text-base sm:text-lg font-black mb-4">🌟 Popular Movies</h2>
        {gridLoad ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2 sm:gap-3">
            {Array(18).fill(0).map((_, i) => <div key={i} className="aspect-[2/3] rounded-xl bg-dark-card animate-pulse" />)}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2 sm:gap-3">
              {popular.map(m => <MovieCard key={m.id} movie={m} />)}
            </div>
            <div ref={sentinel} className="h-4 mt-4" />
            {busy && (
              <div className="flex justify-center py-6">
                <div className="w-7 h-7 border-2 border-dark-border border-t-brand rounded-full animate-spin" />
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
