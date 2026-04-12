// frontend/src/pages/KidsHome.tsx — FULL REPLACEMENT
// Design: Warm cinematic kids aesthetic — rich gradients, large posters, joyful
// PIN Fix: Uses ref-accumulator pattern — no stale closures, always correct value
import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { useProfileStore } from '../stores/profileStore'

// ── Types ────────────────────────────────────────────────────────────────────
interface KidsMovie {
  id:          number
  title?:      string
  name?:       string
  poster_path: string | null
  media_type?: 'movie' | 'tv'
}

// ── Constants ────────────────────────────────────────────────────────────────
const PARENT_PIN = '1234'
const IMG = (p: string | null, s = 'w342') =>
  p ? `https://image.tmdb.org/t/p/${s}${p}` : ''

const GENRES = [
  { id: 16,    label: 'Cartoons',  emoji: '🎨', bg: '#FF6B6B', light: '#FFE5E5' },
  { id: 10751, label: 'Family',    emoji: '🏠', bg: '#4ECDC4', light: '#E0F9F8' },
  { id: 12,    label: 'Adventure', emoji: '🗺️', bg: '#45B7D1', light: '#E0F3F8' },
  { id: 35,    label: 'Comedy',    emoji: '😂', bg: '#96CEB4', light: '#E6F5EE' },
  { id: 14,    label: 'Fantasy',   emoji: '✨', bg: '#DDA0DD', light: '#F5EAF5' },
  { id: 10762, label: 'Kids',      emoji: '⭐', bg: '#FFD93D', light: '#FFF8DC' },
]

// ── PIN Modal ─────────────────────────────────────────────────────────────────
function PinModal({
  onSuccess,
  onCancel,
}: {
  onSuccess: () => void
  onCancel: () => void
}) {
  // THE FIX: acc is the single source of truth for the PIN string.
  // It is a ref — always up-to-date, never stale, no closure issues.
  const acc = useRef('')
  const [display, setDisplay]   = useState('')  // purely for rendering dots
  const [error,   setError]     = useState('')
  const [shaking, setShaking]   = useState(false)
  const [success, setSuccess]   = useState(false)
  const [locked,  setLocked]    = useState(false) // prevent double-submit

  const wrong = () => {
    acc.current = ''
    setDisplay('')
    setShaking(true)
    setError('Incorrect PIN. Try again.')
    setTimeout(() => setShaking(false), 600)
  }

  const pressKey = (key: string) => {
    if (locked) return

    if (key === '⌫') {
      if (acc.current.length === 0) return
      acc.current = acc.current.slice(0, -1)
      setDisplay(acc.current)
      setError('')
      return
    }

    if (acc.current.length >= 4) return
    acc.current += key
    setDisplay(acc.current)

    // Check on 4th digit
    if (acc.current.length === 4) {
      const entered = acc.current          // capture NOW — always correct
      setLocked(true)

      setTimeout(() => {
        if (entered === PARENT_PIN) {
          setSuccess(true)
          setTimeout(() => {
            acc.current = ''
            setDisplay('')
            setLocked(false)
            onSuccess()
          }, 400)
        } else {
          setLocked(false)
          wrong()
        }
      }, 180)                              // brief pause so 4th dot shows
    }
  }

  // Physical keyboard
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onCancel(); return }
      if (e.key === 'Backspace') { pressKey('⌫'); return }
      if (/^\d$/.test(e.key)) pressKey(e.key)
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, []) // pressKey reads from acc.current — always fresh, no deps needed

  const NUMPAD = [
    ['1','2','3'],
    ['4','5','6'],
    ['7','8','9'],
    ['',  '0','⌫'],
  ]

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[300]"
        style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(16px)' }}
        onClick={onCancel}
      />

      {/* Modal card */}
      <div className="fixed inset-0 z-[301] flex items-center justify-center p-4 pointer-events-none">
        <div
          className={`pointer-events-auto w-full max-w-[340px] rounded-[32px] overflow-hidden ${shaking ? 'animate-shake' : ''}`}
          style={{
            background: 'linear-gradient(145deg, #161820 0%, #0f1117 100%)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 40px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
          }}
        >
          {/* Header */}
          <div className="px-8 pt-8 pb-6 text-center">
            {/* Lock icon */}
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <rect x="5" y="11" width="14" height="10" rx="2" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5"/>
                <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="12" cy="16" r="1.5" fill="rgba(255,255,255,0.9)"/>
              </svg>
            </div>

            <h2 className="text-white font-bold text-xl mb-1.5 tracking-tight"
              style={{ fontFamily: 'Syne, sans-serif' }}>
              Parent Controls
            </h2>
            <p className="text-slate-500 text-sm">Enter your 4-digit PIN to continue</p>
          </div>

          {/* PIN dots */}
          <div className="flex justify-center gap-4 px-8 mb-3">
            {Array.from({ length: 4 }).map((_, i) => {
              const filled   = i < display.length
              const isActive = i === display.length - 1 && !success

              return (
                <div
                  key={i}
                  className="transition-all duration-200"
                  style={{
                    width:        52,
                    height:       52,
                    borderRadius: 14,
                    display:      'flex',
                    alignItems:   'center',
                    justifyContent: 'center',
                    background: filled
                      ? success
                        ? 'rgba(34,197,94,0.15)'
                        : 'rgba(20,184,166,0.12)'
                      : 'rgba(255,255,255,0.04)',
                    border: filled
                      ? success
                        ? '1.5px solid rgba(34,197,94,0.5)'
                        : '1.5px solid rgba(20,184,166,0.4)'
                      : '1.5px solid rgba(255,255,255,0.08)',
                    transform: isActive ? 'scale(1.06)' : 'scale(1)',
                    boxShadow: filled
                      ? success
                        ? '0 0 16px rgba(34,197,94,0.2)'
                        : '0 0 16px rgba(20,184,166,0.15)'
                      : 'none',
                  }}
                >
                  <div
                    className="rounded-full transition-all duration-200"
                    style={{
                      width:      filled ? 12 : 8,
                      height:     filled ? 12 : 8,
                      background: filled
                        ? success ? 'rgba(34,197,94,0.9)' : '#14b8a6'
                        : 'rgba(255,255,255,0.12)',
                    }}
                  />
                </div>
              )
            })}
          </div>

          {/* Error message — always takes space to avoid layout shift */}
          <div className="text-center px-8 mb-4 h-6 flex items-center justify-center">
            {error && (
              <p className="text-red-400 text-sm font-medium flex items-center gap-1.5">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-7v2h2v-2h-2zm0-8v6h2V7h-2z"/>
                </svg>
                {error}
              </p>
            )}
          </div>

          {/* Numpad */}
          <div className="px-6 pb-6 grid grid-cols-3 gap-3">
            {NUMPAD.flat().map((key, i) => {
              if (!key) return <div key={i} />

              const isBackspace = key === '⌫'

              return (
                <button
                  key={i}
                  onClick={() => pressKey(key)}
                  disabled={locked}
                  className="flex items-center justify-center transition-all duration-100 select-none active:scale-95"
                  style={{
                    height:       64,
                    borderRadius: 16,
                    background:   isBackspace
                      ? 'rgba(239,68,68,0.08)'
                      : 'rgba(255,255,255,0.05)',
                    border:       isBackspace
                      ? '1px solid rgba(239,68,68,0.2)'
                      : '1px solid rgba(255,255,255,0.07)',
                    fontSize:     isBackspace ? 14 : 22,
                    fontWeight:   700,
                    color:        isBackspace ? 'rgba(239,68,68,0.8)' : 'rgba(255,255,255,0.9)',
                    fontFamily:   'Syne, sans-serif',
                    touchAction:  'manipulation',
                    cursor:       'pointer',
                  }}
                  onMouseEnter={e => {
                    if (!isBackspace) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.09)'
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.background = isBackspace
                      ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.05)'
                  }}
                >
                  {isBackspace ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/>
                      <line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/>
                    </svg>
                  ) : key}
                </button>
              )
            })}
          </div>

          {/* Cancel */}
          <div className="px-6 pb-7">
            <button
              onClick={onCancel}
              className="w-full py-3 text-sm text-slate-500 hover:text-slate-300 transition-colors font-medium tracking-wide"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%,100% { transform: translateX(0) }
          10%      { transform: translateX(-12px) }
          25%      { transform: translateX(10px) }
          40%      { transform: translateX(-8px) }
          55%      { transform: translateX(6px) }
          70%      { transform: translateX(-4px) }
          85%      { transform: translateX(2px) }
        }
        .animate-shake { animation: shake 0.55s cubic-bezier(.36,.07,.19,.97) both }
      `}</style>
    </>
  )
}

// ── Movie Card ────────────────────────────────────────────────────────────────
function KidsMovieCard({ movie }: { movie: KidsMovie }) {
  const navigate = useNavigate()
  const [imgError, setImgError] = useState(false)
  const title  = movie.title || movie.name || ''
  const isTV   = movie.media_type === 'tv' || (!movie.title && !!movie.name)

  const handlePlay = () =>
    isTV
      ? navigate(`/player/tv/${movie.id}?season=1&episode=1`)
      : navigate(`/player/movie/${movie.id}`)

  return (
    <button
      onClick={handlePlay}
      className="group relative flex flex-col gap-2 text-left active:scale-95 transition-transform duration-150"
    >
      {/* Poster */}
      <div
        className="relative w-full overflow-hidden"
        style={{ aspectRatio: '2/3', borderRadius: 18 }}
      >
        {!imgError && movie.poster_path ? (
          <img
            src={IMG(movie.poster_path)}
            alt={title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl"
            style={{ background: 'rgba(255,255,255,0.05)' }}>
            {isTV ? '📺' : '🎬'}
          </div>
        )}

        {/* Gradient overlay on hover */}
        <div
          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          style={{ background: 'rgba(0,0,0,0.45)', borderRadius: 18 }}
        >
          <div
            className="w-12 h-12 flex items-center justify-center rounded-full"
            style={{ background: 'rgba(255,255,255,0.95)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#0a0a1a">
              <polygon points="6,3 20,12 6,21"/>
            </svg>
          </div>
        </div>
      </div>

      {/* Title */}
      <p className="text-xs sm:text-sm font-semibold text-white/90 line-clamp-2 leading-tight px-0.5">
        {title}
      </p>
    </button>
  )
}

// ── Main KidsHome ─────────────────────────────────────────────────────────────
export default function KidsHome() {
  const navigate = useNavigate()
  const { activeProfile, profiles, setActive } = useProfileStore()

  const [movies,   setMovies]   = useState<KidsMovie[]>([])
  const [tvShows,  setTVShows]  = useState<KidsMovie[]>([])
  const [genre,    setGenre]    = useState(GENRES[0])
  const [loading,  setLoading]  = useState(true)
  const [showPin,  setShowPin]  = useState(false)
  const [featured, setFeatured] = useState<KidsMovie | null>(null)

  const profileName   = activeProfile?.name   || 'Viewer'
  const profileAvatar = activeProfile?.avatar  || '⭐'
  const profileColor  = activeProfile?.color   || '#FFD93D'

  useEffect(() => {
    setLoading(true)
    setMovies([])
    setTVShows([])

    const base = {
      with_genres:      `${genre.id},10751`,
      sort_by:          'popularity.desc',
      'vote_count.gte': 30,
      page:             1,
    }

    Promise.all([
      api.get('/movies/discover', { params: { ...base, type: 'movie' } }),
      api.get('/movies/discover', { params: { ...base, type: 'tv'    } }),
    ])
      .then(([m, t]) => {
        const ms = (m.data.results || []).slice(0, 20).map((x: any) => ({ ...x, media_type: 'movie' }))
        const ts = (t.data.results || []).slice(0, 12).map((x: any) => ({ ...x, media_type: 'tv'   }))
        setMovies(ms)
        setTVShows(ts)
        if (ms.length > 0) setFeatured(ms[Math.floor(Math.random() * Math.min(3, ms.length))])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [genre.id])

  const handleExitSuccess = () => {
    setShowPin(false)
    const adult = profiles.find(p => !p.isKids)
    if (adult) setActive(adult)
    navigate('/', { replace: true })
  }

  const Skeleton = () => (
    <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="rounded-[18px] animate-pulse" style={{ aspectRatio: '2/3', background: 'rgba(255,255,255,0.06)' }} />
      ))}
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: '#0a0c14' }}>

      {/* ── Top Navigation ── */}
      <header
        className="sticky top-0 z-40 flex items-center justify-between px-4 sm:px-6 py-3.5"
        style={{
          background:    'rgba(10,12,20,0.85)',
          backdropFilter:'blur(20px)',
          borderBottom:  '1px solid rgba(255,255,255,0.05)',
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <span className="text-xl font-black tracking-tight text-white" style={{ fontFamily: 'Syne, sans-serif' }}>
            STREAMIX
          </span>
          <span className="text-[10px] font-black tracking-widest px-2 py-1 rounded-full"
            style={{ background: '#FFD93D', color: '#0a0c14' }}>
            KIDS
          </span>
        </div>

        {/* Profile + exit */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center text-base font-bold flex-shrink-0"
              style={{ background: profileColor + '22', border: `1.5px solid ${profileColor}44` }}
            >
              {profileAvatar}
            </div>
            <span className="text-sm font-semibold text-white/80 hidden sm:block">{profileName}</span>
          </div>

          <button
            onClick={() => setShowPin(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border:     '1px solid rgba(255,255,255,0.08)',
              color:      'rgba(255,255,255,0.5)',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="5" y="11" width="14" height="10" rx="2"/>
              <path d="M8 11V7a4 4 0 0 1 8 0v4" strokeLinecap="round"/>
            </svg>
            <span>Exit Kids</span>
          </button>
        </div>
      </header>

      {/* ── Featured Banner ── */}
      {featured && !loading && (
        <div className="relative mx-4 sm:mx-6 mt-5 overflow-hidden" style={{ borderRadius: 24 }}>
          {/* Background image */}
          <div className="absolute inset-0">
            {featured.poster_path && (
              <img
                src={IMG(featured.poster_path, 'w780')}
                alt=""
                className="w-full h-full object-cover"
                style={{ filter: 'blur(2px) brightness(0.45)', transform: 'scale(1.08)' }}
              />
            )}
            <div className="absolute inset-0" style={{
              background: `linear-gradient(135deg, ${genre.bg}33 0%, rgba(10,12,20,0.85) 100%)`
            }} />
          </div>

          {/* Content */}
          <div className="relative flex items-center gap-5 p-5 sm:p-7" style={{ minHeight: 160 }}>
            {/* Poster */}
            {featured.poster_path && (
              <img
                src={IMG(featured.poster_path)}
                alt=""
                className="flex-shrink-0 shadow-2xl"
                style={{ width: 90, aspectRatio: '2/3', borderRadius: 14, objectFit: 'cover' }}
              />
            )}
            {/* Text */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold uppercase tracking-widest mb-2 opacity-70" style={{ color: genre.bg }}>
                {genre.emoji} Featured Pick
              </p>
              <h2
                className="text-white font-black text-xl sm:text-2xl mb-3 leading-tight"
                style={{ fontFamily: 'Syne, sans-serif' }}
              >
                {featured.title || featured.name}
              </h2>
              <button
                onClick={() => navigate(`/player/movie/${featured.id}`)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 hover:scale-105"
                style={{ background: genre.bg, color: '#0a0c14' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="6,3 20,12 6,21"/>
                </svg>
                Watch Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Genre Pills ── */}
      <div className="flex gap-2.5 overflow-x-auto scrollbar-hide px-4 sm:px-6 py-5"
        style={{ scrollbarWidth: 'none' }}>
        {GENRES.map(g => {
          const active = g.id === genre.id
          return (
            <button
              key={g.id}
              onClick={() => setGenre(g)}
              className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold transition-all duration-200 active:scale-95"
              style={{
                background: active ? g.bg : 'rgba(255,255,255,0.05)',
                color:      active ? '#0a0c14' : 'rgba(255,255,255,0.55)',
                border:     active ? `1.5px solid ${g.bg}` : '1.5px solid rgba(255,255,255,0.07)',
                boxShadow:  active ? `0 0 20px ${g.bg}44` : 'none',
                transform:  active ? 'scale(1.04)' : 'scale(1)',
              }}
            >
              <span>{g.emoji}</span>
              <span>{g.label}</span>
            </button>
          )
        })}
      </div>

      {/* ── Content sections ── */}
      <div className="px-4 sm:px-6 pb-16 space-y-8">

        {/* Movies */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-5 rounded-full" style={{ background: genre.bg }} />
            <h2 className="text-white font-bold text-base tracking-tight" style={{ fontFamily: 'Syne, sans-serif' }}>
              Movies
            </h2>
            {!loading && <span className="text-xs text-white/25 ml-1">({movies.length})</span>}
          </div>

          {loading ? <Skeleton /> : movies.length > 0 ? (
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3">
              {movies.map(m => <KidsMovieCard key={m.id} movie={m} />)}
            </div>
          ) : (
            <div className="py-12 text-center">
              <p className="text-4xl mb-3">🔍</p>
              <p className="text-white/30 text-sm">Nothing here yet — try another category</p>
            </div>
          )}
        </section>

        {/* TV Shows */}
        {!loading && tvShows.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-5 rounded-full" style={{ background: genre.bg }} />
              <h2 className="text-white font-bold text-base tracking-tight" style={{ fontFamily: 'Syne, sans-serif' }}>
                Shows
              </h2>
              <span className="text-xs text-white/25 ml-1">({tvShows.length})</span>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3">
              {tvShows.map(t => <KidsMovieCard key={t.id} movie={t} />)}
            </div>
          </section>
        )}

        {/* Safety notice */}
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-2xl"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <p className="text-xs text-white/25">
            Safe, curated content — all titles reviewed for young viewers
          </p>
        </div>
      </div>

      {/* ── PIN Modal ── */}
      {showPin && (
        <PinModal
          onSuccess={handleExitSuccess}
          onCancel={() => setShowPin(false)}
        />
      )}
    </div>
  )
}
