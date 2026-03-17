// frontend/src/pages/Home.tsx — FULL REPLACEMENT
import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Movie } from '../types'
import {
  fetchTrending, fetchPopular, fetchTopRated,
  fetchUpcoming, fetchTVShows,
} from '../services/api'
import HeroBanner from '../components/HeroBanner'
import Carousel   from '../components/Carousel'
import MovieCard  from '../components/MovieCard'
import { useInfiniteScroll }                    from '../hooks/useInfiniteScroll'
import { useContinueWatching, WatchProgress }   from '../stores/continueWatchingStore'
import { useAuthStore }                         from '../context/authStore'

// ── Helpers ─────────────────────────────────────────────────────────────
function timeAgo(ts: number) {
  const d = Math.floor((Date.now() - ts) / 86_400_000)
  const h = Math.floor((Date.now() - ts) / 3_600_000)
  const m = Math.floor((Date.now() - ts) / 60_000)
  if (d >= 1) return `${d}d ago`
  if (h >= 1) return `${h}h ago`
  if (m >= 1) return `${m}m ago`
  return 'Just now'
}

// ── Continue Watching card ───────────────────────────────────────────────
function ContinueCard({ item }: { item: WatchProgress }) {
  const navigate = useNavigate()
  const { remove } = useContinueWatching()

  // Resume URL — for TV this goes to exact season+episode
  const resumeUrl = item.type === 'tv'
    ? `/player/tv/${item.movieId}?season=${item.season || 1}&episode=${item.episode || 1}`
    : `/player/movie/${item.movieId}`

  const infoUrl = item.type === 'tv'
    ? `/tv/${item.movieId}`
    : `/movie/${item.movieId}`

  const thumb = item.backdrop
    ? `https://image.tmdb.org/t/p/w300${item.backdrop}`
    : item.poster
      ? `https://image.tmdb.org/t/p/w185${item.poster}`
      : null

  return (
    <div className="flex-shrink-0 w-40 sm:w-48 group relative">
      {/* Thumbnail + play */}
      <div
        className="relative rounded-xl overflow-hidden bg-dark-card cursor-pointer select-none active:scale-95 transition-transform"
        onClick={() => navigate(resumeUrl)}>

        {thumb
          ? <img src={thumb} alt={item.title} className="w-full aspect-video object-cover" />
          : <div className="w-full aspect-video bg-dark-surface flex items-center justify-center text-2xl">📽</div>
        }

        {/* Overlay */}
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-brand/90 flex items-center justify-center shadow-xl group-hover:scale-110 group-active:scale-95 transition-transform">
            <span className="text-dark font-black text-lg ml-0.5">▶</span>
          </div>
        </div>

        {/* TV episode badge */}
        {item.type === 'tv' && item.season && item.episode && (
          <div className="absolute bottom-6 left-2 bg-black/80 text-white text-xs font-bold px-2 py-0.5 rounded-md">
            S{item.season} E{item.episode}
          </div>
        )}

        {/* Progress bar */}
        <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/50">
          <div
            className="h-full bg-brand rounded-r"
            style={{ width: `${Math.max(item.progress, 2)}%` }}
          />
        </div>

        {/* Remove button */}
        <button
          onClick={e => { e.stopPropagation(); remove(item.movieId) }}
          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 text-xs text-slate-300 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 hover:text-white z-10">
          ✕
        </button>
      </div>

      {/* Info */}
      <div className="mt-1.5 px-0.5">
        <p className="text-xs font-semibold text-slate-200 truncate">{item.title}</p>
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-xs text-slate-500 truncate">
            {item.type === 'tv' && item.episodeName ? item.episodeName : timeAgo(item.watchedAt)}
          </span>
          {item.progress > 0 && (
            <span className="text-xs text-brand font-medium ml-1 flex-shrink-0">{item.progress}%</span>
          )}
        </div>
        {/* Action buttons */}
        <div className="flex gap-1.5 mt-1.5">
          <button
            onClick={() => navigate(resumeUrl)}
            className="flex-1 text-xs font-bold bg-brand text-dark rounded-lg py-1.5 hover:bg-brand-dark active:scale-95 transition-all">
            Resume
          </button>
          <button
            onClick={() => navigate(infoUrl)}
            className="px-2.5 text-xs font-semibold bg-dark-card border border-dark-border text-slate-400 rounded-lg py-1.5 hover:text-white active:scale-95 transition-all">
            Info
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Skeleton + Spinner ───────────────────────────────────────────────────
function Skeleton({ n = 20 }: { n?: number }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2 sm:gap-3">
      {Array(n).fill(0).map((_, i) => <div key={i} className="aspect-[2/3] rounded-lg bg-dark-card animate-pulse" />)}
    </div>
  )
}
function Spinner() {
  return (
    <div className="flex justify-center py-8">
      <div className="w-7 h-7 border-2 border-dark-border border-t-brand rounded-full animate-spin" />
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────
export default function Home() {
  const { user } = useAuthStore()
  const { items: cw, fetch: fetchCW } = useContinueWatching()

  const [trending, setTrending] = useState<Movie[]>([])
  const [popular,  setPopular]  = useState<Movie[]>([])
  const [topRated, setTopRated] = useState<Movie[]>([])
  const [upcoming, setUpcoming] = useState<Movie[]>([])
  const [tvShows,  setTVShows]  = useState<Movie[]>([])
  const [loading,  setLoading]  = useState(true)

  const [popPage, setPopPage] = useState(1)
  const [popMore, setPopMore] = useState(true)
  const [popBusy, setPopBusy] = useState(false)
  const [topPage, setTopPage] = useState(1)
  const [topMore, setTopMore] = useState(true)
  const [topBusy, setTopBusy] = useState(false)

  // Fetch continue watching when user logs in
  useEffect(() => { if (user) fetchCW() }, [user])

  // Initial data
  useEffect(() => {
    Promise.all([fetchTrending(), fetchPopular(1), fetchTopRated(1), fetchUpcoming(), fetchTVShows(1)])
      .then(([t, p, top, up, tv]) => {
        setTrending(t.data.results   || [])
        setPopular(p.data.results    || [])
        setTopRated(top.data.results || [])
        setUpcoming(up.data.results  || [])
        setTVShows(tv.data.results   || [])
        setPopMore(1 < (p.data.total_pages   || 1))
        setTopMore(1 < (top.data.total_pages || 1))
      })
      .finally(() => setLoading(false))
  }, [])

  const loadPopular = useCallback(async () => {
    if (popBusy || !popMore) return
    setPopBusy(true)
    const next = popPage + 1
    try {
      const { data } = await fetchPopular(next)
      setPopular(p => [...p, ...(data.results || [])])
      setPopPage(next); setPopMore(next < (data.total_pages || 1))
    } finally { setPopBusy(false) }
  }, [popPage, popBusy, popMore])

  const loadTop = useCallback(async () => {
    if (topBusy || !topMore) return
    setTopBusy(true)
    const next = topPage + 1
    try {
      const { data } = await fetchTopRated(next)
      setTopRated(p => [...p, ...(data.results || [])])
      setTopPage(next); setTopMore(next < (data.total_pages || 1))
    } finally { setTopBusy(false) }
  }, [topPage, topBusy, topMore])

  const popRef = useInfiniteScroll(loadPopular, popMore && !popBusy)
  const topRef = useInfiniteScroll(loadTop,     topMore && !topBusy)

  return (
    <div className="pt-14">
      <HeroBanner movie={trending[0] ?? null} loading={loading} />

      {/* Continue Watching */}
      {cw.length > 0 && (
        <section className="py-4 px-3 sm:px-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm sm:text-base font-bold text-slate-100">▶ Continue Watching</h2>
            <span className="text-xs text-slate-500">{cw.length} title{cw.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-3">
            {cw.map(item => <ContinueCard key={item.movieId} item={item} />)}
          </div>
        </section>
      )}

      <Carousel title="🔥 Trending This Week" movies={trending}  loading={loading} />
      <Carousel title="🗓 Coming Soon"         movies={upcoming}  loading={loading} />
      <Carousel title="📺 Popular TV Shows"    movies={tvShows.map(s => ({ ...s, media_type: 'tv' as const }))} loading={loading} />

      {/* Popular — infinite scroll */}
      <section className="py-3 px-3 sm:px-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm sm:text-base font-bold text-slate-100">⭐ Popular Movies</h2>
          {!loading && <span className="text-xs text-slate-500">{popular.length} loaded</span>}
        </div>
        {loading ? <Skeleton /> : (
          <>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2 sm:gap-3">
              {popular.map(m => <MovieCard key={`p${m.id}`} movie={m} />)}
            </div>
            <div ref={popRef} className="h-4" />
            {popBusy && <Spinner />}
            {!popMore && popular.length > 0 && <p className="text-center text-xs text-slate-600 py-4">✓ All popular movies loaded</p>}
          </>
        )}
      </section>

      {/* Top Rated — infinite scroll */}
      <section className="py-3 px-3 sm:px-4 pb-10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm sm:text-base font-bold text-slate-100">🏆 Top Rated</h2>
          {!loading && <span className="text-xs text-slate-500">{topRated.length} loaded</span>}
        </div>
        {loading ? <Skeleton /> : (
          <>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2 sm:gap-3">
              {topRated.map(m => <MovieCard key={`t${m.id}`} movie={m} />)}
            </div>
            <div ref={topRef} className="h-4" />
            {topBusy && <Spinner />}
            {!topMore && topRated.length > 0 && <p className="text-center text-xs text-slate-600 py-4">✓ All top rated loaded</p>}
          </>
        )}
      </section>
    </div>
  )
}
