import { useEffect, useState } from 'react'
import { Movie } from '../types'
import { fetchTrending, fetchPopular, fetchTopRated, fetchUpcoming, fetchTVShows } from '../services/api'
import HeroBanner from '../components/HeroBanner'
import Carousel from '../components/Carousel'
import MovieCard from '../components/MovieCard'
import { useAuthStore } from '../context/authStore'

export default function Home() {
  const { user } = useAuthStore()
  const [trending,    setTrending]    = useState<Movie[]>([])
  const [popular,     setPopular]     = useState<Movie[]>([])
  const [topRated,    setTopRated]    = useState<Movie[]>([])
  const [upcoming,    setUpcoming]    = useState<Movie[]>([])
  const [tvShows,     setTVShows]     = useState<Movie[]>([])
  const [loading,     setLoading]     = useState(true)
  const [popPage,     setPopPage]     = useState(1)
  const [topPage,     setTopPage]     = useState(1)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    Promise.all([
      fetchTrending(),
      fetchPopular(1),
      fetchTopRated(1),
      fetchUpcoming(),
      fetchTVShows(1),
    ]).then(([t, p, top, up, tv]) => {
      setTrending(t.data.results   || [])
      setPopular(p.data.results    || [])
      setTopRated(top.data.results || [])
      setUpcoming(up.data.results  || [])
      setTVShows(tv.data.results   || [])
    }).finally(() => setLoading(false))
  }, [])

  const loadMorePopular = async () => {
    setLoadingMore(true)
    const next = popPage + 1
    const { data } = await fetchPopular(next)
    setPopular(prev => [...prev, ...(data.results || [])])
    setPopPage(next)
    setLoadingMore(false)
  }

  const loadMoreTopRated = async () => {
    setLoadingMore(true)
    const next = topPage + 1
    const { data } = await fetchTopRated(next)
    setTopRated(prev => [...prev, ...(data.results || [])])
    setTopPage(next)
    setLoadingMore(false)
  }

  const continueWatchingMovies: Movie[] = ((user as any)?.continueWatching ?? []).map((c: any): Movie => ({
    id: c.movieId, title: c.title, poster_path: c.poster,
    overview: '', backdrop_path: null, vote_average: 0, release_date: '',
  }))

  return (
    <div className="pt-14">
      <HeroBanner movie={trending[0] ?? null} loading={loading} />

      {continueWatchingMovies.length > 0 && (
        <Carousel title="▶ Continue Watching" movies={continueWatchingMovies} />
      )}

      <Carousel title="🔥 Trending This Week" movies={trending} loading={loading} />
      <Carousel title="🗓 Coming Soon"         movies={upcoming} loading={loading} />
      <Carousel title="📺 Popular TV Shows"    movies={tvShows.map(s => ({ ...s, media_type: 'tv' as const }))} loading={loading} />

      <section className="py-3 px-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-100">⭐ Popular Movies</h2>
          <span className="text-xs text-slate-500">{popular.length} movies</span>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3 mb-4">
          {loading
            ? Array(20).fill(0).map((_, i) => <div key={i} className="aspect-[2/3] rounded-lg bg-dark-card animate-pulse" />)
            : popular.map(m => <MovieCard key={m.id} movie={m} />)
          }
        </div>
        {!loading && (
          <div className="text-center">
            <button onClick={loadMorePopular} disabled={loadingMore} className="btn-ghost px-8 py-2.5 text-sm disabled:opacity-50">
              {loadingMore ? 'Loading...' : 'Load More Popular'}
            </button>
          </div>
        )}
      </section>

      <section className="py-3 px-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-100">🏆 Top Rated</h2>
          <span className="text-xs text-slate-500">{topRated.length} movies</span>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3 mb-4">
          {loading
            ? Array(20).fill(0).map((_, i) => <div key={i} className="aspect-[2/3] rounded-lg bg-dark-card animate-pulse" />)
            : topRated.map(m => <MovieCard key={m.id} movie={m} />)
          }
        </div>
        {!loading && (
          <div className="text-center pb-4">
            <button onClick={loadMoreTopRated} disabled={loadingMore} className="btn-ghost px-8 py-2.5 text-sm disabled:opacity-50">
              {loadingMore ? 'Loading...' : 'Load More Top Rated'}
            </button>
          </div>
        )}
      </section>
    </div>
  )
}