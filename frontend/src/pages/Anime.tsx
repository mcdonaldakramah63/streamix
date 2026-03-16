import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Movie } from '../types'
import {
  fetchTrendingAnime, fetchPopularAnime, fetchTopRatedAnime,
  fetchAnimeMovies, fetchAnimeByGenre, searchAnime
} from '../services/animeApi'
import { backdrop, poster, rating, year } from '../services/tmdb'
import MovieCard from '../components/MovieCard'
import Carousel from '../components/Carousel'

const GENRES = [
  { id: 'all',     label: '🌟 All Anime' },
  { id: 'action',  label: '⚔️ Action'   },
  { id: 'romance', label: '💕 Romance'  },
  { id: 'isekai',  label: '🌀 Isekai'   },
  { id: 'shonen',  label: '🔥 Shonen'   },
  { id: 'seinen',  label: '🗡 Seinen'   },
  { id: 'mecha',   label: '🤖 Mecha'    },
  { id: 'horror',  label: '👻 Horror'   },
]

export default function Anime() {
  const navigate = useNavigate()

  const [trending,    setTrending]    = useState<Movie[]>([])
  const [popular,     setPopular]     = useState<Movie[]>([])
  const [topRated,    setTopRated]    = useState<Movie[]>([])
  const [movies,      setMovies]      = useState<Movie[]>([])
  const [hero,        setHero]        = useState<Movie | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  const [activeGenre, setActiveGenre] = useState('all')
  const [genreItems,  setGenreItems]  = useState<Movie[]>([])
  const [genrePage,   setGenrePage]   = useState(1)
  const [genreLoading,setGenreLoading]= useState(false)
  const [hasMore,     setHasMore]     = useState(true)

  const [searchQ,     setSearchQ]     = useState('')
  const [searchRes,   setSearchRes]   = useState<Movie[]>([])
  const [searching,   setSearching]   = useState(false)
  const [popPage,     setPopPage]     = useState(1)

  const debRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    Promise.all([
      fetchTrendingAnime(),
      fetchPopularAnime(1),
      fetchTopRatedAnime(1),
      fetchAnimeMovies(1),
    ]).then(([t, p, top, m]) => {
      const tList = t.data.results || []
      setTrending(tList)
      setHero(tList[0] || null)
      setPopular(p.data.results || [])
      setTopRated(top.data.results || [])
      setMovies(m.data.results || [])
      setGenreItems(p.data.results || [])
      setHasMore((p.data.total_pages || 1) > 1)
    }).finally(() => setLoading(false))
  }, [])

  // Genre filter
  useEffect(() => {
    if (loading) return
    setGenrePage(1)
    setHasMore(true)
    setGenreLoading(true)
    const fn = activeGenre === 'all' ? fetchPopularAnime(1) : fetchAnimeByGenre(activeGenre, 1)
    fn.then(({ data }) => {
      setGenreItems(data.results || [])
      setHasMore((data.total_pages || 1) > 1)
      setGenrePage(1)
    }).finally(() => setGenreLoading(false))
  }, [activeGenre])

  // Search
  useEffect(() => {
    clearTimeout(debRef.current)
    if (!searchQ.trim()) { setSearchRes([]); return }
    setSearching(true)
    debRef.current = setTimeout(() => {
      searchAnime(searchQ).then(({ data }) => {
        setSearchRes(data.results || [])
      }).finally(() => setSearching(false))
    }, 350)
  }, [searchQ])

  const loadMore = async () => {
    setLoadingMore(true)
    const next = genrePage + 1
    const fn = activeGenre === 'all' ? fetchPopularAnime(next) : fetchAnimeByGenre(activeGenre, next)
    const { data } = await fn
    setGenreItems(prev => [...prev, ...(data.results || [])])
    setGenrePage(next)
    setHasMore(next < (data.total_pages || 1))
    setLoadingMore(false)
  }

  const displayed = searchQ.trim() ? searchRes : genreItems

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

          {/* Anime badge */}
          <div className="absolute top-24 left-6">
            <span className="inline-flex items-center gap-1.5 bg-brand text-dark text-xs font-black px-3 py-1.5 rounded-full uppercase tracking-widest">
              🎌 Anime
            </span>
          </div>

          <div className="absolute bottom-12 left-6 max-w-lg">
            <h1 className="text-4xl font-black leading-tight mb-2 tracking-tight">{hero.name || hero.title}</h1>
            <div className="flex items-center gap-3 text-sm text-slate-400 mb-3 flex-wrap">
              <span className="bg-brand/15 border border-brand/30 text-brand px-2 py-0.5 rounded-full text-xs font-bold">★ {rating(hero.vote_average)}</span>
              <span>{year(hero.first_air_date)}</span>
              <span className="text-xs bg-dark-card border border-dark-border px-2 py-0.5 rounded-full">Japanese</span>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed mb-5 line-clamp-2">{hero.overview}</p>
            <div className="flex gap-3">
              <button onClick={() => navigate(`/player/tv/${hero.id}?season=1&episode=1`)} className="btn-primary">▶ Watch Now</button>
              <button onClick={() => navigate(`/tv/${hero.id}`)} className="btn-secondary">Details</button>
            </div>
          </div>
        </div>
      )}

      {/* Trending Carousel */}
      <Carousel
        title="🔥 Trending Anime"
        movies={trending.map(s => ({ ...s, media_type: 'tv' as const }))}
        loading={loading}
      />

      {/* Top Rated Carousel */}
      <Carousel
        title="⭐ Top Rated Anime"
        movies={topRated.map(s => ({ ...s, media_type: 'tv' as const }))}
        loading={loading}
      />

      {/* Anime Movies Carousel */}
      {movies.length > 0 && (
        <Carousel
          title="🎬 Anime Movies"
          movies={movies.map(m => ({ ...m, media_type: 'movie' as const }))}
          loading={loading}
        />
      )}

      {/* Genre + Search + Grid */}
      <section className="px-4 py-6">

        {/* Search bar */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <h2 className="text-base font-bold text-slate-100 flex-shrink-0">Browse Anime</h2>
          <div className="flex items-center gap-2 bg-dark-surface border border-dark-border rounded-full px-3 py-1.5 flex-1 max-w-xs">
            {searching
              ? <div className="w-3 h-3 border border-slate-500 border-t-brand rounded-full animate-spin flex-shrink-0" />
              : <span className="text-slate-500 text-xs">⌕</span>
            }
            <input
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="Search anime titles..."
              className="bg-transparent outline-none text-sm text-white placeholder-slate-500 w-full"
            />
            {searchQ && (
              <button onClick={() => setSearchQ('')} className="text-slate-500 hover:text-white text-xs">✕</button>
            )}
          </div>
        </div>

        {/* Genre pills */}
        {!searchQ && (
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-3 mb-5">
            {GENRES.map(g => (
              <button key={g.id} onClick={() => setActiveGenre(g.id)}
                className={`px-4 py-2 rounded-full text-xs font-bold flex-shrink-0 transition-all whitespace-nowrap ${
                  activeGenre === g.id
                    ? 'bg-brand text-dark scale-105'
                    : 'bg-dark-card border border-dark-border text-slate-400 hover:border-brand/50 hover:text-white'
                }`}>
                {g.label}
              </button>
            ))}
          </div>
        )}

        {/* Grid */}
        {genreLoading || searching ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
            {Array(21).fill(0).map((_, i) => (
              <div key={i} className="aspect-[2/3] rounded-lg bg-dark-card animate-pulse" />
            ))}
          </div>
        ) : displayed.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <div className="text-4xl mb-3">🎌</div>
            <p>{searchQ ? `No anime found for "${searchQ}"` : 'No anime found for this genre'}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3 mb-6">
              {displayed.map(item => (
                <MovieCard key={item.id} movie={{ ...item, media_type: 'tv' }} />
              ))}
            </div>
            {!searchQ && hasMore && (
              <div className="text-center pb-4">
                <button onClick={loadMore} disabled={loadingMore}
                  className="btn-ghost px-10 py-2.5 text-sm disabled:opacity-50">
                  {loadingMore ? 'Loading...' : 'Load More Anime'}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
