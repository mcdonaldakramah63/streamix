// frontend/src/components/HoverTrailerCard.tsx — NEW FILE
// Movie card that fetches + autoplays a muted YouTube trailer on hover
import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'

interface Props {
  movie: any
  type?: 'movie' | 'tv'
}

const IMG  = 'https://image.tmdb.org/t/p/w300'
const FALLBACK = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQ1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQ1MCIgZmlsbD0iIzEzMTYxZiIvPjwvc3ZnPg=='

export default function HoverTrailerCard({ movie, type = 'movie' }: Props) {
  const navigate    = useNavigate()
  const [hovered,   setHovered]   = useState(false)
  const [trailerKey,setTrailerKey]= useState<string | null>(null)
  const [showVideo, setShowVideo] = useState(false)
  const [fetched,   setFetched]   = useState(false)
  const [imgErr,    setImgErr]    = useState(false)

  const hoverTimer = useRef<ReturnType<typeof setTimeout>>()
  const videoTimer = useRef<ReturnType<typeof setTimeout>>()

  const title = movie.title || movie.name || ''
  const yr    = (movie.release_date || movie.first_air_date || '').slice(0,4)
  const rt    = movie.vote_average || 0
  const mediaType = movie.name && !movie.title ? 'tv' : type

  // Fetch trailer key lazily on first hover
  const fetchTrailer = useCallback(async () => {
    if (fetched) return
    setFetched(true)
    try {
      const endpoint = mediaType === 'tv'
        ? `/movies/tv/${movie.id}/videos`
        : `/movies/${movie.id}/videos`
      const { data } = await api.get(endpoint)
      const trailer = (data.results || []).find((v: any) => v.type === 'Trailer' && v.site === 'YouTube' && v.official)
                   || (data.results || []).find((v: any) => v.type === 'Trailer' && v.site === 'YouTube')
      if (trailer) setTrailerKey(trailer.key)
    } catch { /* no trailer */ }
  }, [movie.id, mediaType, fetched])

  const handleMouseEnter = () => {
    setHovered(true)
    fetchTrailer()
    // Delay showing video by 800ms so fast hovers don't trigger
    hoverTimer.current = setTimeout(() => {
      if (trailerKey) {
        setShowVideo(true)
      } else {
        // Wait for trailer fetch to complete
        videoTimer.current = setTimeout(() => {
          if (trailerKey) setShowVideo(true)
        }, 800)
      }
    }, 800)
  }

  const handleMouseLeave = () => {
    setHovered(false)
    setShowVideo(false)
    clearTimeout(hoverTimer.current)
    clearTimeout(videoTimer.current)
  }

  // Show video once trailer key arrives during hover
  useEffect(() => {
    if (hovered && trailerKey && !showVideo) {
      videoTimer.current = setTimeout(() => setShowVideo(true), 200)
    }
    return () => clearTimeout(videoTimer.current)
  }, [trailerKey, hovered])

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={() => navigate(mediaType === 'tv' ? `/tv/${movie.id}` : `/movie/${movie.id}`)}
      className="group relative cursor-pointer rounded-xl overflow-hidden bg-dark-card"
      style={{ aspectRatio: '2/3' }}>

      {/* Poster */}
      <img
        src={!imgErr && movie.poster_path ? IMG + movie.poster_path : FALLBACK}
        alt={title}
        className={`absolute inset-0 w-full h-full object-cover transition-all duration-500 ${showVideo ? 'opacity-0' : 'opacity-100 group-hover:scale-105'}`}
        loading="lazy"
        onError={() => setImgErr(true)}
      />

      {/* Muted YouTube trailer */}
      {showVideo && trailerKey && (
        <iframe
          src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&mute=1&controls=0&loop=1&playlist=${trailerKey}&modestbranding=1&rel=0&showinfo=0`}
          className="absolute inset-0 w-full h-full border-0 scale-125"
          allow="autoplay"
          title={`${title} preview`}
        />
      )}

      {/* Always-present gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#07080c] via-transparent to-transparent opacity-60 group-hover:opacity-90 transition-opacity duration-300" />

      {/* Rating badge */}
      {rt >= 8 && (
        <div className="absolute top-2 left-2 badge-gold text-[10px] px-1.5 py-0.5 z-10">★ {rt.toFixed(1)}</div>
      )}

      {/* Trailer playing indicator */}
      {showVideo && (
        <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/70 rounded-full px-2 py-0.5 z-10">
          <div className="flex gap-0.5 items-end h-3">
            {[1,2,3].map(i => (
              <div key={i} className="w-0.5 bg-brand rounded-full animate-bounce"
                style={{ height:`${6+i*3}px`, animationDelay:`${i*0.1}s` }} />
            ))}
          </div>
          <span className="text-[9px] text-brand font-bold">PREVIEW</span>
        </div>
      )}

      {/* Bottom info */}
      <div className="absolute bottom-0 left-0 right-0 p-2.5 z-10 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
        <p className="text-white text-xs font-semibold line-clamp-2 mb-1.5">{title}</p>
        <div className="flex items-center gap-1.5 mb-2">
          {rt > 0 && rt < 8 && <span className="text-gold text-[10px]">★ {rt.toFixed(1)}</span>}
          {yr && <span className="text-slate-500 text-[10px]">{yr}</span>}
        </div>
        <button
          onClick={e => { e.stopPropagation(); navigate(mediaType === 'tv' ? `/player/tv/${movie.id}?season=1&episode=1` : `/player/movie/${movie.id}`) }}
          className="w-full bg-brand text-dark text-[11px] font-bold py-1.5 rounded-lg hover:bg-brand-light transition-colors active:scale-95">
          ▶ Play
        </button>
      </div>
    </div>
  )
}
