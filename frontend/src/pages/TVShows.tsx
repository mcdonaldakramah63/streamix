import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Movie } from '../types'
import { fetchTVShows, fetchTrendingTV } from '../services/api'
import { backdrop, rating, year } from '../services/tmdb'
import Carousel   from '../components/Carousel'
import MovieCard  from '../components/MovieCard'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'

export default function TVShows() {
  const navigate = useNavigate()
  const [trending, setTrending] = useState<Movie[]>([])
  const [shows,    setShows]    = useState<Movie[]>([])
  const [hero,     setHero]     = useState<Movie | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [page,     setPage]     = useState(1)
  const [hasMore,  setHasMore]  = useState(true)
  const [busy,     setBusy]     = useState(false)

  useEffect(() => {
    Promise.all([fetchTrendingTV(), fetchTVShows(1)])
      .then(([t, p]) => {
        const tList = t.data.results || []
        const pList = p.data.results || []
        setTrending(tList)
        setHero(tList[0] ?? null)
        setShows(pList)
        setHasMore(1 < (p.data.total_pages || 1))
      })
      .finally(() => setLoading(false))
  }, [])

  const loadMore = useCallback(async () => {
    if (busy || !hasMore) return
    setBusy(true)
    const next = page + 1
    try {
      const { data } = await fetchTVShows(next)
      setShows(prev => [...prev, ...(data.results || [])])
      setPage(next)
      setHasMore(next < (data.total_pages || 1))
    } finally { setBusy(false) }
  }, [page, busy, hasMore])

  const sentinel = useInfiniteScroll(loadMore, hasMore && !busy)

  return (
    <div className="pt-14">
      {/* Hero */}
      {loading ? (
        <div className="w-full h-[300px] sm:h-[420px] bg-dark-surface animate-pulse" />
      ) : hero ? (
        <div className="relative h-[300px] sm:h-[420px] overflow-hidden">
          <img src={backdrop(hero.backdrop_path)} alt="" className="w-full h-full object-cover object-top" />
          <div className="absolute inset-0 bg-dark/50" />
          <div className="absolute inset-0 bg-gradient-to-t from-dark via-dark/20 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-dark/80 to-transparent" />
          <div className="absolute bottom-6 sm:bottom-14 left-4 sm:left-6 right-4 sm:right-auto max-w-lg">
            <span className="inline-block bg-brand text-dark text-xs font-black px-2.5 py-1 rounded-full uppercase tracking-widest mb-2 sm:mb-3">📺 Trending</span>
            <h1 className="text-2xl sm:text-4xl font-black leading-tight mb-2 line-clamp-2">{hero.name || hero.title}</h1>
            <div className="flex gap-2 items-center text-slate-400 mb-3 flex-wrap">
              <span className="bg-brand/15 border border-brand/30 text-brand px-2 py-0.5 rounded-full text-xs font-bold">★ {rating(hero.vote_average)}</span>
              <span className="text-xs sm:text-sm">{year(hero.first_air_date)}</span>
            </div>
            <div className="flex gap-2 sm:gap-3">
              <button onClick={() => navigate(`/player/tv/${hero.id}?season=1&episode=1`)} className="btn-primary text-xs sm:text-sm px-4 py-2 sm:py-2.5">▶ Play S1E1</button>
              <button onClick={() => navigate(`/tv/${hero.id}`)} className="btn-secondary text-xs sm:text-sm px-4 py-2 sm:py-2.5">More Info</button>
            </div>
          </div>
        </div>
      ) : null}

      <Carousel title="🔥 Trending TV Shows" movies={trending.map(s => ({ ...s, media_type: 'tv' as const }))} loading={loading} />

      {/* All shows — infinite scroll */}
      <section className="py-3 px-3 sm:px-4 pb-10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm sm:text-base font-bold text-slate-100">📺 All Popular Shows</h2>
          {!loading && <span className="text-xs text-slate-500">{shows.length} loaded</span>}
        </div>
        {loading ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-3">
            {Array(20).fill(0).map((_, i) => <div key={i} className="aspect-[2/3] rounded-lg bg-dark-card animate-pulse" />)}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2 sm:gap-3">
              {shows.map(s => <MovieCard key={s.id} movie={{ ...s, media_type: 'tv' }} />)}
            </div>
            <div ref={sentinel} className="h-4" />
            {busy && (
              <div className="flex justify-center py-6">
                <div className="w-7 h-7 border-2 border-dark-border border-t-brand rounded-full animate-spin" />
              </div>
            )}
            {!hasMore && shows.length > 0 && (
              <p className="text-center text-xs text-slate-600 py-4">✓ All shows loaded</p>
            )}
          </>
        )}
      </section>
    </div>
  )
}
