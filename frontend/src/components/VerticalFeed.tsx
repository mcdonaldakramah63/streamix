// frontend/src/components/VerticalFeed.tsx — NEW FILE
// TikTok-style vertical swipeable trailer/clip feed
import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { useWatchlistStore } from '../stores/watchlistStore'
import { useAuthStore }      from '../context/authStore'

interface FeedItem {
  id:           number
  title:        string
  name?:        string
  overview:     string
  backdrop_path:string | null
  poster_path:  string | null
  vote_average: number
  release_date?: string
  first_air_date?:string
  genre_ids:    number[]
  trailerKey?:  string
  media_type:   'movie' | 'tv'
}

const IMG    = (p: string|null, s='w1280') => p ? `https://image.tmdb.org/t/p/${s}${p}` : ''
const GENRES: Record<number,string> = {
  28:'Action',12:'Adventure',16:'Animation',35:'Comedy',80:'Crime',
  18:'Drama',14:'Fantasy',27:'Horror',10749:'Romance',878:'Sci-Fi',53:'Thriller',
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
  const navigate  = useNavigate()
  const { user }  = useAuthStore()
  const { items: wl, add, remove } = useWatchlistStore()
  const [muted,    setMuted]    = useState(true)
  const [playing,  setPlaying]  = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [wlLoading,setWlLoad]  = useState(false)
  const [liked,    setLiked]   = useState(false)

  const inWL = wl.some(w => w.movieId === item.id)
  const title = item.title || item.name || ''
  const yr    = (item.release_date || item.first_air_date || '').slice(0,4)
  const genres= item.genre_ids.slice(0,2).map(id => GENRES[id]).filter(Boolean)

  // Auto-play trailer when card becomes active
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
      inWL ? await remove(item.id) : await add({
        movieId: item.id, title,
        poster: item.poster_path || '', backdrop: item.backdrop_path || '',
        rating: item.vote_average, year: yr,
      })
    } finally { setWlLoad(false) }
  }

  // Touch swipe handling
  const touchY   = useRef(0)
  const touchDY  = useRef(0)

  const onTouchStart = (e: React.TouchEvent) => {
    touchY.current = e.touches[0].clientY
  }
  const onTouchMove = (e: React.TouchEvent) => {
    touchDY.current = e.touches[0].clientY - touchY.current
  }
  const onTouchEnd = () => {
    if (touchDY.current < -60) onNext()
    else if (touchDY.current > 60) onPrev()
    touchDY.current = 0
  }

  return (
    <div
      className="relative w-full h-full flex-shrink-0 overflow-hidden bg-[#07080c]"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}>

      {/* Background — video or image */}
      {playing && item.trailerKey ? (
        <iframe
          src={`https://www.youtube.com/embed/${item.trailerKey}?autoplay=1&mute=${muted?1:0}&controls=0&loop=1&playlist=${item.trailerKey}&modestbranding=1&rel=0&showinfo=0&playsinline=1`}
          className="absolute inset-0 w-full h-full border-0 scale-[1.35]"
          allow="autoplay"
          title={title}
        />
      ) : (
        <img
          src={IMG(item.backdrop_path)}
          alt={title}
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#07080c] via-[#07080c]/30 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#07080c]/60 to-transparent" />

      {/* Top bar — progress + mute */}
      <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between z-20">
        {/* Progress dots */}
        <div className="flex gap-1">
          {Array.from({length: Math.min(total,8)}).map((_,i) => (
            <div key={i} className={`h-0.5 rounded-full transition-all ${i===index%8 ? 'w-6 bg-white' : 'w-1.5 bg-white/30'}`} />
          ))}
        </div>
        {/* Mute button */}
        {playing && item.trailerKey && (
          <button
            onClick={() => setMuted(m => !m)}
            className="w-9 h-9 rounded-full glass border border-white/20 flex items-center justify-center text-white active:scale-95">
            {muted ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"/>
              </svg>
            )}
          </button>
        )}
      </div>

      {/* Right action bar */}
      <div className="absolute right-3 bottom-32 sm:bottom-40 flex flex-col gap-4 items-center z-20">
        {/* Poster thumbnail */}
        <button onClick={() => navigate(item.media_type==='tv' ? `/tv/${item.id}` : `/movie/${item.id}`)}>
          <img
            src={IMG(item.poster_path,'w92')}
            alt=""
            className="w-11 h-16 rounded-lg object-cover border-2 border-white/20 shadow-deep"
          />
        </button>

        {/* Like */}
        <button
          onClick={e => { e.stopPropagation(); setLiked(l => !l) }}
          className="flex flex-col items-center gap-1 active:scale-95">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${liked ? 'bg-red-500' : 'bg-black/50 border border-white/20'}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill={liked ? 'white' : 'none'} stroke="white" strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
          </div>
          <span className="text-[10px] text-white/70">{liked ? 'Liked' : 'Like'}</span>
        </button>

        {/* Watchlist */}
        <button onClick={toggleWL} className="flex flex-col items-center gap-1 active:scale-95">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${inWL ? 'bg-brand' : 'bg-black/50 border border-white/20'}`}>
            {wlLoading
              ? <div className="w-4 h-4 border border-white border-t-transparent rounded-full animate-spin" />
              : inWL
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
            }
          </div>
          <span className="text-[10px] text-white/70">{inWL ? 'Saved' : 'Save'}</span>
        </button>

        {/* Share */}
        <button
          onClick={e => {
            e.stopPropagation()
            navigator.share?.({title, url: window.location.origin + (item.media_type==='tv'?`/tv/`:`/movie/`) + item.id})
              .catch(()=>{})
          }}
          className="flex flex-col items-center gap-1 active:scale-95">
          <div className="w-10 h-10 rounded-full bg-black/50 border border-white/20 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
          </div>
          <span className="text-[10px] text-white/70">Share</span>
        </button>
      </div>

      {/* Bottom content */}
      <div className="absolute bottom-0 left-0 right-0 p-4 pb-6 z-20 pr-20">
        {/* Genre + year */}
        <div className="flex gap-1.5 mb-2 flex-wrap">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${item.media_type==='tv' ? 'bg-blue-500/30 text-blue-300' : 'bg-brand/20 text-brand'}`}>
            {item.media_type==='tv' ? '📺 Show' : '🎬 Movie'}
          </span>
          {genres.map(g => (
            <span key={g} className="text-[10px] text-slate-400 border border-dark-border px-2 py-0.5 rounded-full">{g}</span>
          ))}
          {yr && <span className="text-[10px] text-slate-500">{yr}</span>}
        </div>

        {/* Title */}
        <h2 className="font-bold text-white text-lg sm:text-xl leading-tight mb-1 text-shadow"
          style={{ fontFamily:'Syne, sans-serif' }}>
          {title}
        </h2>

        {/* Rating */}
        {item.vote_average > 0 && (
          <div className="flex items-center gap-1 mb-2">
            <span className="text-gold text-sm">★</span>
            <span className="text-white text-sm font-semibold">{item.vote_average.toFixed(1)}</span>
            <span className="text-slate-500 text-xs">/10</span>
          </div>
        )}

        {/* Overview — expandable */}
        <p
          className={`text-slate-300 text-xs leading-relaxed cursor-pointer ${showInfo ? '' : 'line-clamp-2'}`}
          onClick={() => setShowInfo(s => !s)}>
          {item.overview || 'Tap to see details.'}
          {!showInfo && item.overview?.length > 80 && <span className="text-brand"> more</span>}
        </p>

        {/* CTA buttons */}
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => navigate(item.media_type==='tv' ? `/player/tv/${item.id}?season=1&episode=1` : `/player/movie/${item.id}`)}
            className="btn-primary px-5 py-2 text-sm flex items-center gap-1.5 active:scale-95">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
            Watch Now
          </button>
          <button
            onClick={() => navigate(item.media_type==='tv' ? `/tv/${item.id}` : `/movie/${item.id}`)}
            className="btn-secondary px-4 py-2 text-sm active:scale-95">
            Info
          </button>
        </div>
      </div>

      {/* Scroll hints */}
      <button onClick={onPrev} disabled={index===0}
        className="absolute top-16 left-1/2 -translate-x-1/2 text-white/20 text-xs py-1 disabled:opacity-0">
        ↑ swipe up
      </button>
      <button onClick={onNext}
        className="absolute bottom-1 left-1/2 -translate-x-1/2 text-white/20 text-xs py-1">
        ↓
      </button>
    </div>
  )
}

export default function VerticalFeed({ onClose }: { onClose: () => void }) {
  const [items,    setItems]    = useState<FeedItem[]>([])
  const [index,    setIndex]    = useState(0)
  const [loading,  setLoading]  = useState(true)
  const [loadingMore, setLoadMore] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Fetch trending + trailers
  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.get('/movies/trending'),
      api.get('/movies/tv/trending'),
    ]).then(async ([movies, tv]) => {
      const combined = [
        ...(movies.data.results||[]).slice(0,10).map((m: any) => ({...m, media_type:'movie' as const})),
        ...(tv.data.results||[]).slice(0,8).map((t: any) => ({...t, media_type:'tv' as const})),
      ].sort(() => Math.random() - 0.5)

      // Fetch trailer keys for first 6
      const enriched = await Promise.all(
        combined.slice(0,12).map(async (item) => {
          try {
            const endpoint = item.media_type==='tv'
              ? `/movies/tv/${item.id}/videos`
              : `/movies/${item.id}/videos`
            const { data } = await api.get(endpoint)
            const trailer = (data.results||[]).find((v: any) => v.type==='Trailer' && v.site==='YouTube')
            return { ...item, trailerKey: trailer?.key }
          } catch { return item }
        })
      )
      setItems(enriched)
    }).finally(() => setLoading(false))
  }, [])

  // Keyboard navigation
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowDown') setIndex(i => Math.min(i+1, items.length-1))
      if (e.key === 'ArrowUp')   setIndex(i => Math.max(i-1, 0))
    }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onClose, items.length])

  // Smooth scroll to current card
  useEffect(() => {
    const el = containerRef.current?.children[index] as HTMLElement
    el?.scrollIntoView({ behavior:'smooth', block:'nearest' })
  }, [index])

  // Wheel scroll
  const wheelTimer = useRef<ReturnType<typeof setTimeout>>()
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    clearTimeout(wheelTimer.current)
    wheelTimer.current = setTimeout(() => {
      if (e.deltaY > 0) setIndex(i => Math.min(i+1, items.length-1))
      else setIndex(i => Math.max(i-1, 0))
    }, 50)
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-[200] bg-[#07080c] flex flex-col items-center justify-center gap-4">
        <div className="w-10 h-10 border-2 border-dark-border border-t-brand rounded-full animate-spin" />
        <p className="text-slate-500 text-sm">Loading feed…</p>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[200] bg-[#07080c] flex flex-col">

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4 pt-safe"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div />
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full glass border border-white/20 flex items-center justify-center text-white mt-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      {/* Feed container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative"
        onWheel={onWheel}>
        <div
          className="flex flex-col transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
          style={{ transform: `translateY(-${index * 100}%)`, height:`${items.length * 100}%` }}>
          {items.map((item, i) => (
            <div key={item.id} style={{ height:`${100/items.length}%` }}>
              <FeedCard
                item={item}
                isActive={i === index}
                index={i}
                total={items.length}
                onNext={() => setIndex(j => Math.min(j+1, items.length-1))}
                onPrev={() => setIndex(j => Math.max(j-1, 0))}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Index indicator */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-1 z-30">
        {items.slice(0,12).map((_,i) => (
          <button key={i} onClick={() => setIndex(i)}
            className={`rounded-full transition-all ${i===index ? 'w-1.5 h-5 bg-brand' : 'w-1.5 h-1.5 bg-white/20'}`} />
        ))}
      </div>
    </div>
  )
}
