// frontend/src/pages/Home.tsx — "Home & Discover" (Stitch design)
import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import Carousel, { RailHeader } from '../components/Carousel'
import MovieCard, { CardMovie } from '../components/MovieCard'
import ContinueWatchingRow from '../components/ContinueWatchingRow'
import RecommendationsRow from '../components/RecommendationsRow'
import LibraryRow from '../components/LibraryRow'
import CollectionRows from '../components/CollectionRows'
import UpcomingRow from '../components/UpcomingRow'
import { useTop10 } from '../stores/top10Store'
import VerticalFeed from '../components/VerticalFeed'
import Icon from '../components/Icon'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'
import { useAuthStore } from '../context/authStore'
import { track } from '../utils/track'
import { useProfileStore } from '../stores/profileStore'
import { useWatchlistStore } from '../stores/watchlistStore'

const BD = (p?: string | null) => (p ? `https://image.tmdb.org/t/p/original${p}` : '')

interface Movie extends CardMovie {
  backdrop_path: string | null
  vote_average:  number
  genre_ids?:    number[]
}

const GENRES = [
  { id: 28, label: 'Action' }, { id: 878, label: 'Sci-Fi' }, { id: 53, label: 'Thriller' },
  { id: 35, label: 'Comedy' }, { id: 27, label: 'Horror' }, { id: 16, label: 'Animation' },
  { id: 18, label: 'Drama' },  { id: 10749, label: 'Romance' }, { id: 99, label: 'Documentary' },
]

export default function Home() {
  const navigate = useNavigate()
  const topTv = useTop10(s => s.tv)
  const [shuffling, setShuffling] = useState(false)
  // "Play something": the server picks one thing to start right now — resume, next/new episode, a top pick,
  // something new on Streamix — weighing the time you probably have, your habits at this hour and what you
  // usually accept. Pressing again skips what it just offered.
  const shuffleSkip = useRef<string[]>([])
  const [shuffleNote, setShuffleNote] = useState('')
  const playSomething = async () => {
    setShuffling(true)
    try {
      const profile = useProfileStore.getState().activeProfile
      if (profile) {
        const now = new Date()
        const { data } = await api.post(`/profiles/${profile._id}/play-something`, { hour: now.getHours(), dow: now.getDay(), skip: shuffleSkip.current.slice(-20) })
        const p = data.pick
        shuffleSkip.current.push(`${p.type}:${p.id}`)
        setShuffleNote(`${p.title} — ${p.reason}`)
        track('play', p.type, p.id, { source: 'shuffle' })
        navigate(p.type === 'tv' ? `/player/tv/${p.id}?season=${p.season || 1}&episode=${p.episode || 1}` : `/player/movie/${p.id}`)
        return
      }
      // Not signed in: a random title among widely loved ones
      const type = Math.random() < 0.65 ? 'movie' : 'tv'
      const { data } = await api.get('/movies/discover', { params: { type, sort_by: 'vote_average.desc', 'vote_count.gte': 1500, page: 1 + Math.floor(Math.random() * 10) } })
      const pick = data.results[Math.floor(Math.random() * data.results.length)]
      if (pick) navigate(type === 'tv' ? `/player/tv/${pick.id}?season=1&episode=1` : `/player/movie/${pick.id}`)
    } catch { setShuffleNote('Couldn\'t pick something right now — try again') } finally { setShuffling(false) }
  }
  const user = useAuthStore(s => s.user)
  const { isIn, toggle } = useWatchlistStore()

  const [trending,   setTrending]   = useState<Movie[]>([])
  const [topRated,   setTopRated]   = useState<Movie[]>([])
  const [upcoming,   setUpcoming]   = useState<Movie[]>([])
  const [nowPlaying, setNowPlaying] = useState<Movie[]>([])
  const [popular,    setPopular]    = useState<Movie[]>([])
  const [heroLoad,   setHeroLoad]   = useState(true)
  const [gridLoad,   setGridLoad]   = useState(true)
  const [heroIdx,    setHeroIdx]    = useState(0)
  // Hero: what's hot right now (popularity + momentum + this server), re-ranked for the profile
  const [hotHero,    setHotHero]    = useState<(Movie & { media_type?: 'movie' | 'tv'; reason?: string })[]>([])
  const heroProfileId = useProfileStore(s => s.activeProfile?._id)
  useEffect(() => {
    const url = heroProfileId ? `/profiles/${heroProfileId}/new-hot` : '/movies/new-hot'
    api.get(url).then(r => setHotHero((r.data.everyone || []).filter((m: Movie) => m.backdrop_path).slice(0, 6))).catch(() => setHotHero([]))
  }, [heroProfileId])
  const heroList = hotHero.length ? hotHero : trending
  const [heroIn,     setHeroIn]     = useState(true)
  const [popPage,    setPopPage]    = useState(1)
  const [hasMore,    setHasMore]    = useState(true)
  const [busy,       setBusy]       = useState(false)
  const [showFeed,   setShowFeed]   = useState(false)
  const [error,      setError]      = useState(false)

  const timer = useRef<ReturnType<typeof setInterval>>()

  useEffect(() => {
    setHeroLoad(true)
    Promise.all([
      api.get('/movies/trending'),
      api.get('/movies/top-rated'),
      api.get('/movies/upcoming'),
      api.get('/movies/now-playing'),
    ])
      .then(([t, r, u, n]) => {
        setTrending((t.data.results || []).filter((m: Movie) => m.backdrop_path))
        setTopRated(r.data.results || [])
        setUpcoming(u.data.results || [])
        setNowPlaying(n.data.results || [])
      })
      .catch(() => setError(true))
      .finally(() => setHeroLoad(false))
  }, [])

  // Hero auto-rotate
  useEffect(() => {
    if (!heroList.length) return
    timer.current = setInterval(() => {
      setHeroIn(false)
      setTimeout(() => { setHeroIdx(i => (i + 1) % Math.min(heroList.length, 6)); setHeroIn(true) }, 300)
    }, 7000)
    return () => clearInterval(timer.current)
  }, [heroList.length])

  const fetchPopular = useCallback(async (pg: number) => {
    pg === 1 ? setGridLoad(true) : setBusy(true)
    try {
      const { data } = await api.get('/movies/popular', { params: { page: pg } })
      const results: Movie[] = data.results || []
      setPopular(prev => {
        if (pg === 1) return results
        const seen = new Set(prev.map(m => m.id))
        return [...prev, ...results.filter(m => !seen.has(m.id))]
      })
      setPopPage(pg)
      setHasMore(pg < Math.min(data.total_pages || 1, 15))
    } catch (e) {
      console.error(e)
      setHasMore(false)
    } finally {
      setGridLoad(false); setBusy(false)
    }
  }, [])

  useEffect(() => { fetchPopular(1) }, [fetchPopular])

  const loadMore = useCallback(() => { if (!busy && hasMore) fetchPopular(popPage + 1) }, [busy, hasMore, popPage, fetchPopular])
  const sentinel = useInfiniteScroll(loadMore, hasMore && !busy && !gridLoad)

  const changeHero = (idx: number) => {
    clearInterval(timer.current)
    setHeroIn(false)
    setTimeout(() => { setHeroIdx(idx); setHeroIn(true) }, 200)
  }

  const hero = heroList[heroIdx] as (Movie & { media_type?: 'movie' | 'tv'; reason?: string; first_air_date?: string }) | undefined
  const heroType: 'movie' | 'tv' = hero?.media_type === 'tv' ? 'tv' : 'movie'
  const heroSaved = hero ? isIn(hero.id) : false

  if (showFeed) return <VerticalFeed onClose={() => setShowFeed(false)} />

  return (
    <div className="min-h-screen">
      {/* ── Hero spotlight ── */}
      {heroLoad ? (
        <div className="skeleton rounded-none" style={{ height: 'clamp(460px, 62vw, 720px)' }} />
      ) : hero ? (
        <section className="relative overflow-hidden bg-dark-void select-none" style={{ height: 'clamp(460px, 62vw, 720px)' }}>
          <img key={hero.id} src={BD(hero.backdrop_path)} alt=""
            className={`absolute inset-0 w-full h-full object-cover object-top transition-opacity duration-700 ${heroIn ? 'opacity-100' : 'opacity-0'}`} />
          <div className="absolute inset-0 bg-gradient-to-t from-dark via-dark/50 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-dark-void/90 via-dark-void/30 to-transparent" />

          <div className="absolute top-20 left-4 sm:left-6 lg:left-12 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-dark-void/70 backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-brand animate-pulse shadow-[0_0_8px_#e50914]" />
            <span className="text-tech-pill uppercase text-ink tracking-widest">{hero.reason || `Trending #${heroIdx + 1} this week`}</span>
          </div>

          <div className={`absolute bottom-10 sm:bottom-16 left-4 sm:left-6 lg:left-12 right-4 max-w-2xl flex flex-col gap-3 transition-all duration-500 ${heroIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
            <div className="flex flex-wrap items-center gap-2">
              {hero.vote_average > 0 && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gold/20 text-gold text-label-sm">
                  <Icon name="star" size={13} fill />{hero.vote_average.toFixed(1)}
                </span>
              )}
              {(hero.release_date || hero.first_air_date) && <span className="tech-pill">{(hero.release_date || hero.first_air_date || '').slice(0, 4)}</span>}
              {(hero.genre_ids || []).slice(0, 2).map(g => {
                const name = GENRES.find(x => x.id === g)?.label
                return name ? <span key={g} className="tech-pill text-ink-muted">{name}</span> : null
              })}
              <span className="tech-pill text-cyan">HD</span>
            </div>

            <h1 className="font-extrabold text-white leading-[1.05] tracking-tight text-shadow"
              style={{ fontSize: 'clamp(2rem, 5.5vw, 3.75rem)' }}>
              {hero.title || hero.name}
            </h1>
            <p className="text-ink-muted text-sm sm:text-base leading-relaxed line-clamp-2 sm:line-clamp-3 max-w-xl">{hero.overview}</p>

            <div className="flex items-center gap-2.5 pt-1">
              <button onClick={() => navigate(heroType === 'tv' ? `/player/tv/${hero.id}?season=1&episode=1` : `/player/movie/${hero.id}`)} className="btn-primary h-12 px-7 text-[15px]">
                <Icon name="play_arrow" size={24} fill /> Watch Now
              </button>
              <button onClick={() => navigate(`/${heroType}/${hero.id}`)} className="btn-secondary h-12 px-5">
                <Icon name="info" size={20} /> <span className="hidden sm:inline">More Info</span>
              </button>
              <button
                onClick={() => user
                  ? toggle({ movieId: hero.id, title: hero.title || hero.name || '', poster: hero.poster_path || '', backdrop: hero.backdrop_path || '', rating: hero.vote_average, year: (hero.release_date || hero.first_air_date || '').slice(0, 4), type: heroType })
                  : navigate('/login')}
                aria-label={heroSaved ? 'Remove from My List' : 'Add to My List'}
                className={`btn-icon w-12 h-12 ${heroSaved ? '!bg-brand !text-white !border-brand shadow-brand-sm' : ''}`}>
                <Icon name={heroSaved ? 'check' : 'add'} size={22} />
              </button>
            </div>
          </div>

          <div className="absolute bottom-5 right-4 sm:right-6 lg:right-12 flex gap-1.5 z-10">
            {heroList.slice(0, 6).map((_, i) => (
              <button key={i} onClick={() => changeHero(i)} aria-label={`Show trending #${i + 1}`}
                className={`rounded-full transition-all duration-300 h-1.5 ${i === heroIdx ? 'w-7 bg-brand shadow-[0_0_8px_#e50914]' : 'w-1.5 bg-white/30 hover:bg-white/60'}`} />
            ))}
          </div>
        </section>
      ) : (
        <div className="pt-24 px-4 sm:px-6 lg:px-12">
          {error && (
            <div className="card p-6 flex items-center gap-3 text-ink-muted">
              <Icon name="cloud_off" size={24} className="text-brand" />
              Couldn't reach the Streamix server. Is the backend running on port 5000?
            </div>
          )}
        </div>
      )}

      {/* ── Genre chip rail ── */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide px-4 sm:px-6 lg:px-12 py-5">
        <button className="flex-shrink-0 px-4 py-1.5 rounded-full text-[13px] font-semibold bg-brand text-white shadow-brand-sm">All</button>
        {GENRES.map(g => (
          <button key={g.id} onClick={() => navigate(`/movies?genre=${g.id}`)}
            className="flex-shrink-0 px-4 py-1.5 rounded-full text-[13px] font-semibold bg-dark-card text-ink-muted hover:text-white hover:bg-dark-border transition-colors">
            {g.label}
          </button>
        ))}
      </div>

      {/* Netflix-style shuffle: start a random well-rated title right away */}
      <div className="px-4 sm:px-6 lg:px-12 -mt-2 mb-6 flex gap-2 overflow-x-auto scrollbar-hide">
        <button onClick={playSomething} disabled={shuffling} className="btn-secondary px-4 py-2 text-xs disabled:opacity-60 flex-shrink-0">
          <Icon name={shuffling ? 'progress_activity' : 'shuffle'} size={18} className={shuffling ? 'animate-spin' : ''} />Play something
        </button>
        <button onClick={() => navigate('/new')} className="btn-secondary px-4 py-2 text-xs flex-shrink-0"><Icon name="local_fire_department" size={18} />New & Hot</button>
        <button onClick={() => navigate('/ask')} className="btn-secondary px-4 py-2 text-xs flex-shrink-0"><Icon name="auto_awesome" size={18} />Ask Streamix</button>
      </div>
      {shuffleNote && <p role="status" className="px-4 sm:px-6 lg:px-12 -mt-4 mb-5 text-xs text-ink-muted truncate">{shuffleNote}</p>}
      <ContinueWatchingRow />
      {user && <UpcomingRow />}
      {user && <RecommendationsRow />}
      <LibraryRow />
      <CollectionRows />

      <Carousel title="Top 10 Trending Today" icon="local_fire_department" movies={trending.slice(0, 10)} loading={heroLoad} ranked />
      <Carousel title="Top 10 Shows Today" icon="live_tv" movies={topTv} loading={!topTv.length} ranked accent="cyan" />

      {/* ── For You feed ── */}
      <div className="px-4 sm:px-6 lg:px-12 mb-10">
        <button onClick={() => setShowFeed(true)}
          className="w-full rounded-2xl p-4 sm:p-5 flex items-center gap-4 text-left glass hover:shadow-focus transition-all active:scale-[0.99]">
          <span className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 bg-brand/15 text-brand">
            <Icon name="smart_display" size={26} fill />
          </span>
          <span className="flex-1">
            <span className="block text-white font-bold">For You feed</span>
            <span className="block text-ink-muted text-sm">Swipe through trailers and discover something new</span>
          </span>
          <Icon name="chevron_right" size={24} className="text-brand" />
        </button>
      </div>

      <Carousel title="Now Playing"  movies={nowPlaying} loading={heroLoad} />
      <Carousel title="Top Rated"    movies={topRated}   loading={heroLoad} seeAll="/movies" accent="gold" />
      <Carousel title="Coming Soon"  movies={upcoming}   loading={heroLoad} accent="cyan" />

      {/* ── Popular grid ── */}
      <section className="pb-12">
        <RailHeader title="Popular on Streamix" accent="gold" right={!gridLoad && (
          <span className="text-label-sm uppercase text-ink-faint">{popular.length} titles</span>
        )} />
        <div className="px-4 sm:px-6 lg:px-12">
          {gridLoad ? (
            <div className="movie-card-grid">
              {Array.from({ length: 12 }).map((_, i) => <div key={i} className="skeleton" style={{ aspectRatio: '2/3.6' }} />)}
            </div>
          ) : (
            <>
              <div className="movie-card-grid">
                {popular.map(m => <MovieCard key={m.id} movie={m} type="movie" />)}
              </div>
              <div ref={sentinel} className="h-4 mt-4" />
              {busy && <div className="flex justify-center py-8"><div className="w-7 h-7 border-2 border-white/10 border-t-brand rounded-full animate-spin" /></div>}
              {!hasMore && popular.length > 0 && <p className="text-center text-xs text-ink-faint py-8">You've reached the end</p>}
            </>
          )}
        </div>
      </section>
    </div>
  )
}
