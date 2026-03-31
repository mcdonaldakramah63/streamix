// frontend/src/components/AnimatedPosterCard.tsx — NEW FILE
// Immersive poster card with depth, shimmer, and hover glow
import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

interface Props {
  movie: any
  type?: 'movie' | 'tv'
  size?: 'sm' | 'md' | 'lg'
  showTrailer?: boolean
}

const IMG = (p: string|null, s='w300') => p ? `https://image.tmdb.org/t/p/${s}${p}` : ''
const FALLBACK = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQ1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQ1MCIgZmlsbD0iIzEzMTYxZiIvPjwvc3ZnPg=='

export default function AnimatedPosterCard({ movie, type = 'movie', size = 'md', showTrailer = false }: Props) {
  const navigate  = useNavigate()
  const cardRef   = useRef<HTMLDivElement>(null)

  const [imgErr,     setImgErr]     = useState(false)
  const [isHovered,  setIsHovered]  = useState(false)
  const [tiltX,      setTiltX]      = useState(0)
  const [tiltY,      setTiltY]      = useState(0)
  const [glowX,      setGlowX]      = useState(50)
  const [glowY,      setGlowY]      = useState(50)
  const [trailerKey, setTrailerKey] = useState<string|null>(null)
  const [showVideo,  setShowVideo]  = useState(false)

  const title   = movie.title || movie.name || ''
  const yr      = (movie.release_date || movie.first_air_date || '').slice(0,4)
  const rt      = movie.vote_average || 0
  const isTV    = !!movie.name && !movie.title
  const mType   = isTV ? 'tv' : type

  // 3D tilt on mouse move
  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current
    if (!card) return
    const rect = card.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top)  / rect.height
    setTiltX((y - 0.5) * -12)  // tilt up/down
    setTiltY((x - 0.5) * 12)   // tilt left/right
    setGlowX(x * 100)
    setGlowY(y * 100)
  }, [])

  const onMouseEnter = useCallback(async () => {
    setIsHovered(true)
    // Fetch trailer key if needed
    if (showTrailer && !trailerKey) {
      try {
        const endpoint = mType==='tv' ? `/movies/tv/${movie.id}/videos` : `/movies/${movie.id}/videos`
        const { default: api } = await import('../services/api')
        const { data } = await api.get(endpoint)
        const t = (data.results||[]).find((v: any) => v.type==='Trailer' && v.site==='YouTube')
        if (t) {
          setTrailerKey(t.key)
          setTimeout(() => setShowVideo(true), 800)
        }
      } catch { /* no trailer */ }
    }
  }, [showTrailer, trailerKey, movie.id, mType])

  const onMouseLeave = useCallback(() => {
    setIsHovered(false)
    setTiltX(0)
    setTiltY(0)
    setShowVideo(false)
  }, [])

  const sizeClass = {
    sm: 'w-24',
    md: 'w-32 sm:w-40',
    lg: 'w-40 sm:w-52',
  }[size]

  return (
    <div
      ref={cardRef}
      className={`${sizeClass} cursor-pointer flex-shrink-0 group select-none`}
      style={{ aspectRatio: '2/3' }}
      onMouseMove={onMouseMove}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={() => navigate(mType==='tv' ? `/tv/${movie.id}` : `/movie/${movie.id}`)}>

      <div
        className="relative w-full h-full rounded-xl overflow-hidden transition-all duration-300"
        style={{
          transform: isHovered
            ? `perspective(600px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale(1.05) translateZ(20px)`
            : 'perspective(600px) rotateX(0) rotateY(0) scale(1)',
          boxShadow: isHovered
            ? `0 20px 60px rgba(0,0,0,0.7), 0 0 30px rgba(20,184,166,0.15)`
            : '0 4px 20px rgba(0,0,0,0.4)',
          willChange: 'transform',
        }}>

        {/* Poster image */}
        <img
          src={!imgErr && movie.poster_path ? IMG(movie.poster_path) : FALLBACK}
          alt={title}
          className={`absolute inset-0 w-full h-full object-cover transition-all duration-500 ${showVideo ? 'opacity-0' : 'opacity-100'}`}
          loading="lazy"
          draggable={false}
          onError={() => setImgErr(true)}
        />

        {/* Muted trailer overlay */}
        {showVideo && trailerKey && (
          <iframe
            src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&mute=1&controls=0&loop=1&playlist=${trailerKey}&modestbranding=1&rel=0`}
            className="absolute inset-0 w-full h-full border-0 scale-110"
            allow="autoplay"
            title={`${title} preview`}
          />
        )}

        {/* Dynamic light glow effect */}
        {isHovered && (
          <div
            className="absolute inset-0 pointer-events-none rounded-xl opacity-40 transition-opacity duration-200"
            style={{
              background: `radial-gradient(circle at ${glowX}% ${glowY}%, rgba(255,255,255,0.15) 0%, transparent 60%)`,
            }}
          />
        )}

        {/* Shimmer line */}
        {isHovered && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.08) 50%, transparent 60%)`,
              backgroundSize: '200% 100%',
              animation: 'shimmerSlide 1.5s infinite',
            }}
          />
        )}

        {/* Gradient overlay */}
        <div className={`absolute inset-0 bg-gradient-to-t from-[#07080c] via-transparent to-transparent transition-opacity duration-300 ${isHovered ? 'opacity-100' : 'opacity-50'}`} />

        {/* Top badges */}
        {rt >= 8 && (
          <div className="absolute top-2 left-2 badge-gold text-[10px] px-1.5 py-0.5 z-10">
            ★ {rt.toFixed(1)}
          </div>
        )}

        {/* Preview badge */}
        {showVideo && (
          <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/70 rounded-full px-2 py-0.5 z-10">
            <div className="flex gap-0.5 items-end h-3">
              {[1,2,3].map(i => (
                <div key={i} className="w-0.5 bg-brand rounded-full animate-bounce"
                  style={{ height:`${6+i*3}px`, animationDelay:`${i*0.1}s` }} />
              ))}
            </div>
          </div>
        )}

        {/* Bottom info — slides on hover */}
        <div className={`absolute bottom-0 left-0 right-0 p-2 z-10 transition-all duration-300 ${isHovered ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'}`}>
          <p className="text-white text-xs font-semibold line-clamp-2 mb-1.5 text-shadow">{title}</p>
          {yr && <p className="text-slate-400 text-[10px] mb-2">{yr}</p>}
          <button
            onClick={e => {
              e.stopPropagation()
              navigate(mType==='tv' ? `/player/tv/${movie.id}?season=1&episode=1` : `/player/movie/${movie.id}`)
            }}
            className="w-full bg-brand text-dark text-[11px] font-bold py-1.5 rounded-lg hover:bg-brand-light transition-colors active:scale-95">
            ▶ Play
          </button>
        </div>
      </div>

      <style>{`
        @keyframes shimmerSlide {
          0%   { background-position: -200% 0 }
          100% { background-position: 200% 0 }
        }
      `}</style>
    </div>
  )
}
