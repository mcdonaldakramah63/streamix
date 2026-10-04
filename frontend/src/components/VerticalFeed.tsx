// frontend/src/components/VerticalFeed.tsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { useWatchlistStore } from '../stores/watchlistStore'
import { useAuthStore } from '../context/authStore'
import { useProfileStore } from '../stores/profileStore'

interface FeedItem {
  id:           number
  title?:       string
  name?:        string
  overview:     string
  backdrop_path:string | null
  poster_path:  string | null
  vote_average: number
  release_date?: string
  first_air_date?: string
  genre_ids:    number[]
  trailerKey?:  string
  media_type:   'movie' | 'tv'
  /** Personalised feed (/profiles/:id/feed): what kind of story, and its headline */
  storyKind?:   string
  headline?:    string
  detail?:      string
}

const STORY_BADGE: Record<string, string> = {
  new_episode: 'New episode', premiere: 'Premiere', library: 'On Streamix', coming_soon: 'Coming soon', pick: 'Top pick for you',
  community: 'Viewers here', fresh_hit: 'New & loved', trending: 'Trending',
}

const IMG = (p: string | null, s = 'w1280') => p ? `https://image.tmdb.org/t/p/${s}${p}` : ''

const GENRES: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  18: 'Drama', 14: 'Fantasy', 27: 'Horror', 10749: 'Romance', 878: 'Sci-Fi', 53: 'Thriller',
}

function FeedCard({
  item, isActive, onNext, onPrev, index, total
}: {
  item: FeedItem
  isActive: boolean
  onNext: () => void
  onPrev: () => void
  index: number
  total: number
}) {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { items: wl, add, remove } = useWatchlistStore()
  const [muted, setMuted] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [wlLoading, setWlLoad] = useState(false)
  const [liked, setLiked] = useState(false)

  const inWL = wl.some(w => w.movieId === item.id)
  const title = item.title || item.name || ''
  const yr = (item.release_date || item.first_air_date || '').slice(0, 4)
  const genres = item.genre_ids.slice(0, 2).map(id => GENRES[id]).filter(Boolean)

  useEffect(() => {
    if (isActive && item.trailerKey) {
      const t = setTimeout(() => setPlaying(true), 600)
      return () => clearTimeout(t)
    } else {
      setPlaying(false)
    }
  }, [isActive, item.trailerKey])

  const toggleWL = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!user || wlLoading) return
    setWlLoad(true)
    try {
      inWL ? await remove(item.id) : await add({ type: item.media_type,
        movieId: item.id, title,
        poster: item.poster_path || '', backdrop: item.backdrop_path || '',
        rating: item.vote_average, year: yr,
      })
    } finally { setWlLoad(false) }
  }

  // Touch swipe
  const touchY = useRef(0)
  const touchDY = useRef(0)

  const onTouchStart = (e: React.TouchEvent) => {
    touchY.current = e.touches[0].clientY
    touchDY.current = 0
  }

  const onTouchMove = (e: React.TouchEvent) => {
    touchDY.current = e.touches[0].clientY - touchY.current
  }

  const onTouchEnd = () => {
    if (Math.abs(touchDY.current) < 40) return
    if (touchDY.current < -60) onNext()
    else if (touchDY.current > 60) onPrev()
    touchDY.current = 0
  }

  return (
    <div
      className="relative w-full h-full flex-shrink-0 overflow-hidden bg-[#0f131c] snap-start"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Background */}
      {playing && item.trailerKey ? (
        <iframe
          src={`https://www.youtube.com/embed/${item.trailerKey}?autoplay=1&mute=${muted ? 1 : 0}&controls=0&loop=1&playlist=${item.trailerKey}&modestbranding=1&rel=0&showinfo=0&playsinline=1`}
          className="absolute inset-0 w-full h-full border-0 scale-[1.35]"
          allow="autoplay; compute-pressure"
          title={title}
        />
      ) : (
        <img
          src={IMG(item.backdrop_path)}
          alt={title}
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      {/* Gradients */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0f131c] via-[#0f131c]/30 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0f131c]/60 to-transparent" />

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between z-20">
        <div className="flex gap-1">
          {Array.from({ length: Math.min(total, 8) }).map((_, i) => (
            <div key={i} className={`h-0.5 rounded-full transition-all ${i === index % 8 ? 'w-6 bg-white' : 'w-1.5 bg-white/30'}`} />
          ))}
        </div>

        {playing && item.trailerKey && (
          <button
            onClick={() => setMuted(m => !m)}
            className="w-9 h-9 rounded-full glass border border-white/20 flex items-center justify-center text-white active:scale-95"
          >
            {muted ? '🔇' : '🔊'}
          </button>
        )}
      </div>

      {/* Right Action Bar */}
      <div className="absolute right-3 bottom-32 sm:bottom-40 flex flex-col gap-4 items-center z-20">
        <button onClick={() => navigate(item.media_type === 'tv' ? `/tv/${item.id}` : `/movie/${item.id}`)}>
          <img src={IMG(item.poster_path, 'w92')} alt="" className="w-11 h-16 rounded-lg object-cover border-2 border-white/20 shadow-deep" />
        </button>

        <button onClick={e => { e.stopPropagation(); setLiked(l => !l) }} className="flex flex-col items-center gap-1 active:scale-95">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${liked ? 'bg-red-500' : 'bg-black/50 border border-white/20'}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill={liked ? 'white' : 'none'} stroke="white" strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
          </div>
          <span className="text-[10px] text-white/70">{liked ? 'Liked' : 'Like'}</span>
        </button>

        <button onClick={toggleWL} className="flex flex-col items-center gap-1 active:scale-95">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${inWL ? 'bg-brand' : 'bg-black/50 border border-white/20'}`}>
            {wlLoading ? (
              <div className="w-4 h-4 border border-white border-t-transparent rounded-full animate-spin" />
            ) : inWL ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
            )}
          </div>
          <span className="text-[10px] text-white/70">{inWL ? 'Saved' : 'Save'}</span>
        </button>

        <button
          onClick={e => {
            e.stopPropagation()
            navigator.share?.({ title, url: window.location.origin + (item.media_type === 'tv' ? `/tv/` : `/movie/`) + item.id }).catch(() => {})
          }}
          className="flex flex-col items-center gap-1 active:scale-95"
        >
          <div className="w-10 h-10 rounded-full bg-black/50 border border-white/20 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
          </div>
          <span className="text-[10px] text-white/70">Share</span>
        </button>
      </div>

      {/* Bottom Content */}
      <div className="absolute bottom-0 left-0 right-0 p-4 pb-6 z-20 pr-20">
        <div className="flex gap-1.5 mb-2 flex-wrap">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${item.media_type === 'tv' ? 'bg-blue-500/30 text-blue-300' : 'bg-brand/20 text-brand'}`}>
            {item.media_type === 'tv' ? '📺 Show' : '🎬 Movie'}
          </span>
          {genres.map(g => (
            <span key={g} className="text-[10px] text-ink-muted border border-dark-border px-2 py-0.5 rounded-full">{g}</span>
          ))}
          {yr && <span className="text-[10px] text-ink-faint">{yr}</span>}
        </div>
        {item.storyKind && (
          <p className="text-[11px] font-bold uppercase tracking-wide text-gold mb-1">{STORY_BADGE[item.storyKind] || 'For you'}{item.detail ? ` · ${item.detail}` : ''}</p>
        )}
        {item.headline && item.headline !== title && <p className="text-sm font-semibold text-white/90 mb-1 line-clamp-2">{item.headline}</p>}

        <h2 className="font-bold text-white text-lg sm:text-xl leading-tight mb-1" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          {title}
        </h2>

        {item.vote_average > 0 && (
          <div className="flex items-center gap-1 mb-2">
            <span className="text-gold text-sm">★</span>
            <span className="text-white text-sm font-semibold">{item.vote_average.toFixed(1)}</span>
            <span className="text-ink-faint text-xs">/10</span>
          </div>
        )}

        <p
          className={`text-ink text-xs leading-relaxed cursor-pointer ${showInfo ? '' : 'line-clamp-2'}`}
          onClick={() => setShowInfo(s => !s)}
        >
          {item.overview || 'Tap to see details.'}
          {!showInfo && item.overview?.length > 80 && <span className="text-brand"> more</span>}
        </p>

        <div className="flex gap-2 mt-3">
          <button
            onClick={() => navigate(item.media_type === 'tv' ? `/player/tv/${item.id}?season=1&episode=1` : `/player/movie/${item.id}`)}
            className="btn-primary px-5 py-2 text-sm flex items-center gap-1.5 active:scale-95"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
            Watch Now
          </button>
          <button
            onClick={() => navigate(item.media_type === 'tv' ? `/tv/${item.id}` : `/movie/${item.id}`)}
            className="btn-secondary px-4 py-2 text-sm active:scale-95"
          >
            Info
          </button>
        </div>
      </div>

      {/* Hints */}
      <button onClick={onPrev} disabled={index === 0} className="absolute top-16 left-1/2 -translate-x-1/2 text-white/20 text-xs py-1 disabled:opacity-0">↑ swipe up</button>
      <button onClick={onNext} className="absolute bottom-1 left-1/2 -translate-x-1/2 text-white/20 text-xs py-1">↓</button>
    </div>
  )
}

export default function VerticalFeed({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<FeedItem[]>([])
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Fetch mixed content
  const fetchItems = useCallback(async (pg: number, append = false, isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else if (pg === 1) setLoading(true)
    else setLoadingMore(true)

    try {
      // Signed in with a profile: the ranked news feed (new episodes, releases, library, picks…)
      const profile = useProfileStore.getState().activeProfile
      if (profile) {
        const { data } = await api.get(`/profiles/${profile._id}/feed`, { params: { page: pg, ...(isRefresh ? { fresh: 1 } : {}) } })
        const stories: FeedItem[] = (data.items || []).filter((s: any) => s.item.backdrop_path || s.item.poster_path).map((s: any) => ({
          ...s.item, genre_ids: s.item.genre_ids || [], overview: s.item.overview || '', media_type: s.item.media_type === 'tv' ? 'tv' : 'movie',
          trailerKey: s.trailerKey || undefined, storyKind: s.kind, headline: s.headline, detail: s.detail,
        }))
        if (stories.length || pg > 1) {
          if (append) setItems(prev => { const seen = new Set(prev.map(i => `${i.media_type}:${i.id}`)); return [...prev, ...stories.filter(i => !seen.has(`${i.media_type}:${i.id}`))] })
          else { setItems(stories); setIndex(0) }
          setPage(pg)
          setHasMore(!!data.hasMore)
          return
        }
      }
      const [trending, popular, topRated, upcoming] = await Promise.all([
        api.get('/movies/trending', { params: { page: pg } }),
        api.get('/movies/popular', { params: { page: pg } }),
        api.get('/movies/top-rated', { params: { page: pg } }),
        api.get('/movies/upcoming', { params: { page: pg } }),
      ])

      let newItems: any[] = [
        ...(trending.data.results || []),
        ...(popular.data.results || []),
        ...(topRated.data.results || []),
        ...(upcoming.data.results || []),
      ]

      newItems = Array.from(new Map(newItems.map(item => [item.id, item])).values())
        .filter(item => item.backdrop_path)
        .sort(() => Math.random() - 0.5)
        .map(item => ({ ...item, media_type: item.name && !item.title ? 'tv' : 'movie', genre_ids: item.genre_ids || [] }))
      const enriched = newItems

      if (append) {
        setItems(prev => {
          const seen = new Set(prev.map(i => i.id))
          return [...prev, ...enriched.filter(i => !seen.has(i.id))]
        })
      } else {
        setItems(enriched)
        setIndex(0) // Reset to first item on refresh
      }

      setPage(pg)
      setHasMore(pg < 12)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
      setLoadingMore(false)
      setRefreshing(false)
    }
  }, [])

  // Initial load
  useEffect(() => {
    fetchItems(1)
  }, [fetchItems])

  // Refresh Feed
  const handleRefresh = () => {
    trailerTried.current.clear()
    setIndex(0)
    fetchItems(1, false, true)
  }

  // Fetch trailers lazily for the active card and its neighbours
  const trailerTried = useRef(new Set<number>())
  useEffect(() => {
    items.slice(Math.max(0, index - 1), index + 3).forEach(item => {
      if (trailerTried.current.has(item.id)) return
      trailerTried.current.add(item.id)
      const endpoint = item.media_type === 'tv' ? `/movies/tv/${item.id}/videos` : `/movies/${item.id}/videos`
      api.get(endpoint).then(({ data }) => {
        const t = (data.results || []).find((v: any) => v.type === 'Trailer' && v.site === 'YouTube')
        if (t) setItems(prev => prev.map(i => (i.id === item.id ? { ...i, trailerKey: t.key } : i)))
      }).catch(() => {})
    })
  }, [index, items])

  // Infinite scroll
  const handleScroll = useCallback(() => {
    if (!scrollRef.current || loadingMore || !hasMore || refreshing) return

    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    if (scrollTop + clientHeight > scrollHeight - 400) {
      fetchItems(page + 1, true)
    }
  }, [loadingMore, hasMore, page, refreshing, fetchItems])

  // Scroll to active card
  useEffect(() => {
    if (scrollRef.current) {
      const child = scrollRef.current.children[index] as HTMLElement
      child?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [index])

  // Keyboard
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowDown') setIndex(i => Math.min(i + 1, items.length - 1))
      if (e.key === 'ArrowUp') setIndex(i => Math.max(i - 1, 0))
    }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onClose, items.length])

  const onWheel = (e: React.WheelEvent) => {
    if (e.deltaY > 30) setIndex(i => Math.min(i + 1, items.length - 1))
    else if (e.deltaY < -30) setIndex(i => Math.max(i - 1, 0))
  }

  if (loading && items.length === 0) {
    return (
      <div className="fixed inset-0 z-[200] bg-[#0f131c] flex flex-col items-center justify-center gap-4">
        <div className="w-10 h-10 border-2 border-dark-border border-t-brand rounded-full animate-spin" />
        <p className="text-ink-faint text-sm">Curating your feed...</p>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[200] bg-[#0f131c] flex flex-col overflow-hidden">
      {/* Header with Refresh Button */}
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4 pt-safe" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-xl hover:bg-white/10 transition-colors active:scale-95 disabled:opacity-70"
        >
          {refreshing ? (
            <>⟳ Refreshing...</>
          ) : (
            <>⟳ Refresh Feed</>
          )}
        </button>

        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full glass border border-white/20 flex items-center justify-center text-white"
        >
          ✕
        </button>
      </div>

      {/* Main Feed */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto snap-y snap-mandatory scrollbar-hide"
        onScroll={handleScroll}
        onWheel={onWheel}
        style={{ scrollSnapType: 'y mandatory', WebkitOverflowScrolling: 'touch' }}
      >
        {items.map((item, i) => (
          <div key={item.id} className="h-full w-full flex-shrink-0 snap-start">
            <FeedCard
              item={item}
              isActive={i === index}
              index={i}
              total={items.length}
              onNext={() => setIndex(j => Math.min(j + 1, items.length - 1))}
              onPrev={() => setIndex(j => Math.max(j - 1, 0))}
            />
          </div>
        ))}

        {loadingMore && (
          <div className="h-32 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-dark-border border-t-brand rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Index dots */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-1 z-30">
        {items.slice(0, 12).map((_, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            className={`rounded-full transition-all ${i === index ? 'w-1.5 h-5 bg-brand' : 'w-1.5 h-1.5 bg-white/20'}`}
          />
        ))}
      </div>
    </div>
  )
}