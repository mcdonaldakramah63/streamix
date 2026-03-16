import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Movie } from '../types'
import { fetchTVShows, fetchTrendingTV } from '../services/api'
import { backdrop, rating, year } from '../services/tmdb'
import Carousel from '../components/Carousel'
import MovieCard from '../components/MovieCard'

export default function TVShows() {
  const navigate  = useNavigate()
  const [trending,    setTrending]    = useState<Movie[]>([])
  const [popular,     setPopular]     = useState<Movie[]>([])
  const [hero,        setHero]        = useState<Movie | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [page,        setPage]        = useState(1)
  const [hasMore,     setHasMore]     = useState(true)

  useEffect(() => {
    Promise.all([fetchTrendingTV(), fetchTVShows(1)])
      .then(([t, p]) => {
        const trendList = t.data.results || []
        const popList   = p.data.results || []
        setTrending(trendList)
        setPopular(popList)
        setHero(trendList[0] || null)
        setHasMore(p.data.total_pages > 1)
      })
      .finally(() => setLoading(false))
  }, [])

  const loadMore = async () => {
    setLoadingMore(true)
    const next = page + 1
    const { data } = await fetchTVShows(next)
    setPopular(prev => [...prev, ...(data.results || [])])
    setPage(next)
    setHasMore(next < data.total_pages)
    setLoadingMore(false)
  }

  return (
    <div className="pt-14">
      {/* Hero */}
      {loading ? (
        <div className="w-full h-[420px] bg-dark-surface animate-pulse" />
      ) : hero && (
        <div className="relative h-[420px] overflow-hidden">
          <img src={backdrop(hero.backdrop_path)} alt="" className="w-full h-full object-cover object-top" />
          <div className="absolute inset-0 bg-dark/50" />
          <div className="absolute inset-0 bg-gradient-to-t from-dark via-dark/20 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-dark/80 to-transparent" />
          <div className="absolute bottom-14 left-6 max-w-lg">
            <span className="inline-block bg-brand text-dark text-xs font-black px-3 py-1 rounded-full uppercase tracking-widest mb-3">📺 Trending</span>
            <h1 className="text-4xl font-black leading-tight mb-2">{hero.name || hero.title}</h1>
            <div className="flex items-center gap-3 text-sm text-slate-400 mb-3 flex-wrap">
              <span className="bg-brand/15 border border-brand/30 text-brand px-2 py-0.5 rounded-full text-xs font-bold">★ {rating(hero.vote_average)}</span>
              <span>{year(hero.first_air_date)}</span>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed mb-5 line-clamp-2">{hero.overview}</p>
            <div className="flex gap-3">
              <button onClick={() => navigate(`/player/tv/${hero.id}?season=1&episode=1`)} className="btn-primary">▶ Play S1E1</button>
              <button onClick={() => navigate(`/tv/${hero.id}`)} className="btn-secondary">More Info</button>
            </div>
          </div>
        </div>
      )}

      {/* Trending carousel */}
      <Carousel
        title="🔥 Trending TV Shows"
        movies={trending.map(s => ({ ...s, media_type: 'tv' as const }))}
        loading={loading}
      />

      {/* Popular grid with load more */}
      <section className="py-3 px-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-100">📺 All Popular Shows</h2>
          <span className="text-xs text-slate-500">{popular.length} shows</span>
        </div>

        {loading ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
            {Array(20).fill(0).map((_, i) => (
              <div key={i} className="aspect-[2/3] rounded-lg bg-dark-card animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3 mb-6">
              {popular.map(show => (
                <MovieCard key={show.id} movie={{ ...show, media_type: 'tv' }} />
              ))}
            </div>
            {hasMore && (
              <div className="text-center pb-6">
                <button onClick={loadMore} disabled={loadingMore}
                  className="btn-ghost px-10 py-2.5 text-sm disabled:opacity-50">
                  {loadingMore ? 'Loading...' : `Load More Shows`}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
