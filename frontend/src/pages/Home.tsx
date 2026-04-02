// frontend/src/pages/Home.tsx
import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import Carousel from '../components/Carousel'
import MovieCard from '../components/MovieCard'
import ContinueWatchingRow from '../components/ContinueWatchingRow'
import RecommendationsRow from '../components/RecommendationsRow'
import AnimatedPosterCard from '../components/AnimatedPosterCard'
import VerticalFeed from '../components/VerticalFeed'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'
import { useAuthStore } from '../context/authStore'
import { useProfileStore } from '../stores/profileStore'
import Kids from './Kids';

const BD = (p: string | null) => (p ? `https://image.tmdb.org/t/p/w1280${p}` : '')

interface Movie {
  id: number
  title?: string
  name?: string
  overview?: string
  backdrop_path: string | null
  poster_path?: string | null
  vote_average: number
  release_date?: string
}


export default function Home() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { activeProfile } = useProfileStore()

  const [trending, setTrending] = useState<Movie[]>([])
  const [topRated, setTopRated] = useState<Movie[]>([])
  const [upcoming, setUpcoming] = useState<Movie[]>([])
  const [nowPlaying, setNowPlaying] = useState<Movie[]>([])
  const [popular, setPopular] = useState<Movie[]>([])
  const [heroLoad, setHeroLoad] = useState(true)
  const [gridLoad, setGridLoad] = useState(true)
  const [heroIdx, setHeroIdx] = useState(0)
  const [heroIn, setHeroIn] = useState(true)
  const [popPage, setPopPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [busy, setBusy] = useState(false)
  const [showFeed, setShowFeed] = useState(false)

  const timer = useRef<ReturnType<typeof setInterval>>()

  

  // Kids redirect
  useEffect(() => {
    if (activeProfile?.isKids) {
      navigate('/kids', { replace: true })
    }
  }, [activeProfile?.isKids, navigate])

  // Initial data fetch
  useEffect(() => {
    setHeroLoad(true)
    Promise.all([
      api.get('/movies/trending'),
      api.get('/movies/top-rated'),
      api.get('/movies/upcoming'),
      api.get('/movies/now-playing'),
    ])
      .then(([t, r, u, n]) => {
        setTrending(t.data.results || [])
        setTopRated(r.data.results || [])
        setUpcoming(u.data.results || [])
        setNowPlaying(n.data.results || [])
      })
      .catch(console.error)
      .finally(() => setHeroLoad(false))
  }, [])

  // Hero auto-rotate
  useEffect(() => {
    if (!trending.length) return
    timer.current = setInterval(() => {
      setHeroIn(false)
      setTimeout(() => {
        setHeroIdx((i) => (i + 1) % Math.min(trending.length, 6))
        setHeroIn(true)
      }, 300)
    }, 6000)
    return () => clearInterval(timer.current)
  }, [trending.length])

  // Popular grid with infinite scroll
  const fetchPopular = useCallback(async (pg: number) => {
    pg === 1 ? setGridLoad(true) : setBusy(true)
    try {
      const { data } = await api.get('/movies/popular', { params: { page: pg } })
      const results = data.results || []
      pg === 1 ? setPopular(results) : setPopular((prev) => [...prev, ...results])
      setPopPage(pg)
      setHasMore(pg < Math.min(data.total_pages || 1, 15))
    } catch (e) {
      console.error(e)
    } finally {
      setGridLoad(false)
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    fetchPopular(1)
  }, [fetchPopular])

  const loadMore = useCallback(() => {
    if (!busy && hasMore) fetchPopular(popPage + 1)
  }, [busy, hasMore, popPage, fetchPopular])

  const sentinel = useInfiniteScroll(loadMore, hasMore && !busy && !gridLoad)

  const changeHero = (idx: number) => {
    clearInterval(timer.current)
    setHeroIn(false)
    setTimeout(() => {
      setHeroIdx(idx)
      setHeroIn(true)
    }, 200)
  }

  const hero = trending[heroIdx]

  if (showFeed) return <VerticalFeed onClose={() => setShowFeed(false)} />

  return (
    <div className="min-h-screen">

      {/* ── Hero banner ── */}
      {heroLoad ? (
        <div className="skeleton" style={{ height: 'clamp(280px,55vw,560px)' }} />
      ) : hero ? (
        <div className="relative overflow-hidden select-none" style={{ height: 'clamp(280px,55vw,560px)' }}>
          <img
            key={hero.id}
            src={BD(hero.backdrop_path)}
            alt={hero.title || ''}
            className={`absolute inset-0 w-full h-full object-cover object-top transition-opacity duration-500 ${heroIn ? 'opacity-100' : 'opacity-0'}`}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#07080c]/90 via-[#07080c]/40 to-transparent" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top,#07080c 0%,transparent 45%)' }} />

          {/* Content */}
          <div
            className={`absolute bottom-10 sm:bottom-16 left-4 sm:left-8 right-4 max-w-2xl transition-all duration-500 ${heroIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
          >
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-wider"
                style={{ background: 'rgba(20,184,166,0.2)', border: '1px solid rgba(20,184,166,0.4)', color: '#14b8a6' }}>
                🔥 Trending #{heroIdx + 1}
              </span>
              {hero.vote_average >= 7.5 && (
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                  style={{ background: 'rgba(245,158,11,0.2)', border: '1px solid rgba(245,158,11,0.4)', color: '#f59e0b' }}>
                  ★ {hero.vote_average.toFixed(1)}
                </span>
              )}
            </div>

            <h1 className="font-black leading-none mb-3 text-white"
              style={{ fontFamily: 'Syne, sans-serif', fontSize: 'clamp(1.6rem,5vw,3.5rem)', textShadow: '0 2px 20px rgba(0,0,0,0.8)' }}>
              {hero.title || hero.name}
            </h1>
            <p className="text-slate-300 text-sm leading-relaxed mb-5 line-clamp-2 hidden sm:block max-w-lg">
              {hero.overview}
            </p>

            <div className="flex gap-2.5 flex-wrap">
              <button
                onClick={() => navigate(`/player/movie/${hero.id}`)}
                className="btn-primary px-5 sm:px-7 py-2.5 sm:py-3 text-sm sm:text-base flex items-center gap-2"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                Play Now
              </button>
              <button onClick={() => navigate(`/movie/${hero.id}`)} className="btn-secondary px-5 sm:px-7 py-2.5 sm:py-3 text-sm sm:text-base">
                More Info
              </button>
              <button
                onClick={() => setShowFeed(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-medium transition-all active:scale-95"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.79 1.54V6.77a4.85 4.85 0 01-1.02-.08z"/>
                </svg>
                For You
              </button>
            </div>
          </div>

          {/* Dots */}
          <div className="absolute bottom-4 right-4 sm:right-8 flex gap-1.5 z-10">
            {trending.slice(0, 6).map((_, i) => (
              <button key={i} onClick={() => changeHero(i)}
                className={`rounded-full transition-all duration-300 ${i === heroIdx ? 'w-6 h-1.5 bg-brand' : 'w-1.5 h-1.5 bg-white/30 hover:bg-white/60'}`} />
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Rows ── */}
      <div className="mt-6 sm:mt-8"><ContinueWatchingRow /></div>
      {user && <RecommendationsRow />}

      {/* ── Trending Picks ── */}
      {!heroLoad && trending.length > 0 && (
        <section className="px-3 sm:px-6 mb-6 sm:mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title">✨ Trending Picks</h2>
            <span className="text-xs text-slate-600">Hover for preview</span>
          </div>
          <div
            className="flex gap-3 sm:gap-4 overflow-x-auto scrollbar-hide pb-2 -mx-3 px-3 sm:-mx-6 sm:px-6"
            style={{ touchAction: 'pan-y' }}
          >
            {trending.slice(0, 10).map((m) => (
              <AnimatedPosterCard key={m.id} movie={m} type="movie" size="md" showTrailer />
            ))}
          </div>
        </section>
      )}

      {/* ── For You Feed Button ── */}
      <div className="mx-3 sm:mx-6 mb-6">
        <button
          onClick={() => setShowFeed(true)}
          className="w-full rounded-2xl p-4 flex items-center gap-4 transition-all active:scale-[0.99]"
          style={{
            background: 'linear-gradient(135deg,rgba(20,184,166,0.08),rgba(20,184,166,0.03))',
            border: '1px solid rgba(20,184,166,0.2)',
          }}
        >
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(20,184,166,0.15)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="#14b8a6">
              <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.79 1.54V6.77a4.85 4.85 0 01-1.02-.08z"/>
            </svg>
          </div>
          <div className="flex-1 text-left">
            <p className="text-white font-semibold text-sm">For You Feed</p>
            <p className="text-slate-500 text-xs">Swipeable trailers · Discover something new</p>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" strokeWidth="2" className="flex-shrink-0">
            <path d="m9 18 6-6-6-6"/>
          </svg>
        </button>
      </div>

      {/* ── Standard carousels ── */}
      <Carousel title="🎬 Now Playing" movies={nowPlaying} loading={heroLoad} />
      <Carousel title="⭐ Top Rated"   movies={topRated}   loading={heroLoad} seeAll="/movies" />
      <Carousel title="🗓 Coming Soon" movies={upcoming}   loading={heroLoad} />

      {/* ── Popular grid ── */}
      <section className="px-3 sm:px-6 pb-12 mt-2">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title">🌟 Popular Movies</h2>
          {!gridLoad && <span className="text-xs text-slate-600">{popular.length} movies</span>}
        </div>

        {gridLoad ? (
          <div className="movie-card-grid">
            {Array.from({ length: 18 }).map((_, i) => (
              <div key={i} className="skeleton rounded-xl" style={{ aspectRatio: '2/3' }} />
            ))}
          </div>
        ) : (
          <>
            <div className="movie-card-grid">
              {popular.map(m => <MovieCard key={m.id} movie={m as any} />)}
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