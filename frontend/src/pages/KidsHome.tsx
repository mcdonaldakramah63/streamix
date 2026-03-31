// frontend/src/pages/KidsHome.tsx — FULL REPLACEMENT
// Kids-safe page. Accessed via /kids route OR automatic redirect when activeProfile.isKids
import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { useProfileStore } from '../stores/profileStore'

// ── Types ────────────────────────────────────────────────────────────────────
interface KidsMovie {
  id:           number
  title?:       string
  name?:        string
  poster_path:  string | null
  vote_average: number
  media_type?:  'movie' | 'tv'
}

// ── Constants ────────────────────────────────────────────────────────────────
const IMG    = (p: string | null, s = 'w342') => p ? `https://image.tmdb.org/t/p/${s}${p}` : ''
const PARENT_PIN = '1234' // TODO: store hashed in user profile for production

const KIDS_GENRES = [
  { id: 16,    label: 'Cartoons',   emoji: '🎨', bg: 'bg-yellow-500', text: 'text-yellow-900' },
  { id: 10751, label: 'Family',     emoji: '👨‍👩‍👧', bg: 'bg-green-500',  text: 'text-green-900' },
  { id: 12,    label: 'Adventure',  emoji: '🌍', bg: 'bg-blue-500',   text: 'text-blue-900'  },
  { id: 35,    label: 'Comedy',     emoji: '😂', bg: 'bg-pink-500',   text: 'text-pink-900'  },
  { id: 14,    label: 'Fantasy',    emoji: '🧙', bg: 'bg-purple-500', text: 'text-purple-900'},
]

const GREETINGS = [
  'Hey there! 👋',
  'Welcome back! 🌟',
  'Ready to watch? 🍿',
  "What's on today? 🎬",
]

// ── KidsCard ─────────────────────────────────────────────────────────────────
function KidsCard({ movie }: { movie: KidsMovie }) {
  const navigate = useNavigate()
  const [err, setErr] = useState(false)
  const title  = movie.title || movie.name || ''
  const isTV   = !movie.title && !!movie.name
  const mType  = movie.media_type === 'tv' || isTV ? 'tv' : 'movie'

  const handlePlay = () => {
    if (mType === 'tv') navigate(`/player/tv/${movie.id}?season=1&episode=1`)
    else                navigate(`/player/movie/${movie.id}`)
  }

  return (
    <button
      onClick={handlePlay}
      className="group flex flex-col items-center gap-2 active:scale-95 transition-transform duration-150"
    >
      <div
        className="relative rounded-2xl overflow-hidden shadow-lg border-2 border-transparent group-hover:border-white/30 transition-all duration-200"
        style={{ width: '100%', aspectRatio: '2/3' }}
      >
        {err || !movie.poster_path ? (
          <div className="w-full h-full bg-dark-card flex items-center justify-center text-4xl">
            {mType === 'tv' ? '📺' : '🎬'}
          </div>
        ) : (
          <img
            src={IMG(movie.poster_path)}
            alt={title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
            onError={() => setErr(true)}
          />
        )}

        {/* Play overlay */}
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#1a1a2e">
              <polygon points="5,3 19,12 5,21" />
            </svg>
          </div>
        </div>
      </div>
      <p className="text-xs font-semibold text-slate-200 text-center line-clamp-2 w-full px-1 leading-tight">
        {title}
      </p>
    </button>
  )
}

// ── PIN Dialog ────────────────────────────────────────────────────────────────
function PinDialog({
  onSuccess,
  onCancel,
}: {
  onSuccess: () => void
  onCancel:  () => void
}) {
  const [pin,   setPin]   = useState('')
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)

  const handleKey = useCallback((key: string) => {
    if (key === '⌫') {
      setPin(p => p.slice(0, -1))
      setError('')
      return
    }
    if (pin.length >= 4) return

    const next = pin + key
    setPin(next)

    if (next.length === 4) {
      setTimeout(() => {
        if (next === PARENT_PIN) {
          onSuccess()
        } else {
          setShake(true)
          setError('Wrong PIN — try again')
          setPin('')
          setTimeout(() => setShake(false), 500)
        }
      }, 100)
    }
  }, [pin, onSuccess])

  // Physical keyboard support
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Backspace') handleKey('⌫')
      if (/^\d$/.test(e.key)) handleKey(e.key)
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [handleKey, onCancel])

  const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className={`rounded-3xl p-6 w-full max-w-xs shadow-deep text-center transition-transform ${shake ? 'animate-shake' : ''}`}
        style={{ background: 'rgba(14,16,24,0.98)', border: '1px solid rgba(255,255,255,0.08)' }}>

        <div className="text-4xl mb-3">🔒</div>
        <h2 className="text-lg font-bold text-white mb-1" style={{ fontFamily: 'Syne, sans-serif' }}>
          Parent Area
        </h2>
        <p className="text-slate-500 text-sm mb-5">Enter your 4-digit PIN to exit Kids Mode</p>

        {/* PIN dots */}
        <div className="flex gap-3 justify-center mb-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={`w-12 h-14 rounded-xl flex items-center justify-center text-2xl font-bold border-2 transition-all duration-150 ${
                i < pin.length
                  ? 'border-brand bg-brand/15 text-brand scale-105'
                  : 'border-dark-border bg-dark-surface text-slate-700'
              }`}
            >
              {i < pin.length ? '●' : '○'}
            </div>
          ))}
        </div>

        {error && (
          <p className="text-red-400 text-xs mb-3 font-medium">{error}</p>
        )}

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {KEYS.map((key, i) => (
            <button
              key={i}
              onClick={() => key && handleKey(key)}
              disabled={!key}
              className={`h-12 rounded-xl text-white font-bold text-lg transition-all duration-100 active:scale-90 ${
                key
                  ? 'bg-dark-card border border-dark-border hover:border-brand/50 hover:bg-dark-hover'
                  : 'opacity-0 pointer-events-none'
              }`}
            >
              {key}
            </button>
          ))}
        </div>

        <button onClick={onCancel} className="text-slate-600 hover:text-slate-400 text-sm transition-colors">
          Cancel
        </button>
      </div>

      <style>{`
        @keyframes shake {
          0%,100% { transform: translateX(0) }
          20%      { transform: translateX(-8px) }
          40%      { transform: translateX(8px) }
          60%      { transform: translateX(-6px) }
          80%      { transform: translateX(6px) }
        }
        .animate-shake { animation: shake 0.4s ease-in-out }
      `}</style>
    </div>
  )
}

// ── Main KidsHome ─────────────────────────────────────────────────────────────
export default function KidsHome() {
  const navigate = useNavigate()
  const { activeProfile, profiles, setActive } = useProfileStore()

  const [movies,   setMovies]   = useState<KidsMovie[]>([])
  const [tvShows,  setTVShows]  = useState<KidsMovie[]>([])
  const [genre,    setGenre]    = useState(16)
  const [loading,  setLoading]  = useState(true)
  const [showPin,  setShowPin]  = useState(false)

  const greeting = GREETINGS[Math.floor(Date.now() / 3_600_000) % GREETINGS.length]

  // Fetch kids-safe content
  useEffect(() => {
    setLoading(true)

    const params = {
      with_genres:     `${genre},10751`,
      sort_by:         'popularity.desc',
      'vote_count.gte': 30,
      page:            1,
    }

    Promise.all([
      api.get('/movies/discover', { params: { ...params, type: 'movie' } }),
      api.get('/movies/discover', { params: { ...params, type: 'tv'    } }),
    ])
      .then(([m, t]) => {
        setMovies( (m.data.results || []).slice(0, 18).map((i: KidsMovie) => ({ ...i, media_type: 'movie' as const })))
        setTVShows((t.data.results || []).slice(0, 12).map((i: KidsMovie) => ({ ...i, media_type: 'tv'    as const })))
      })
      .catch(() => { setMovies([]); setTVShows([]) })
      .finally(() => setLoading(false))
  }, [genre])

  const handleExitSuccess = () => {
    setShowPin(false)
    // Switch to first non-kids profile
    const adult = profiles.find(p => !p.isKids)
    if (adult) {
      setActive(adult)
      navigate('/')
    } else {
      navigate('/')
    }
  }

  // If no kids profile is active, still show kids content (accessed via direct URL)
  const profileName  = activeProfile?.name  || 'Guest'
  const profileAvatar = activeProfile?.avatar || '🎬'

  return (
    <div
      className="min-h-screen pb-16"
      style={{ background: 'linear-gradient(160deg, #0f0a2e 0%, #1a0a3e 40%, #0a1a3e 100%)' }}
    >
      {/* ── Top bar ── */}
      <div className="sticky top-0 z-40 px-4 py-3 flex items-center justify-between"
        style={{ background: 'rgba(15,10,46,0.92)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>

        {/* Logo */}
        <span className="text-white font-black text-lg tracking-tight flex items-center gap-2"
          style={{ fontFamily: 'Syne, sans-serif' }}>
          🌟 <span className="text-purple-300">Streamix</span>
          <span className="text-[10px] font-bold bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded-full ml-1">KIDS</span>
        </span>

        <button
          onClick={() => setShowPin(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-colors"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          🔒 Exit Kids
        </button>
      </div>

      {/* ── Welcome banner ── */}
      <div className="px-4 pt-5 pb-4">
        <div
          className="rounded-3xl p-5 relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)' }}
        >
          {/* Decorative blobs */}
          <div className="absolute -top-4 -right-4 w-24 h-24 rounded-full bg-white/5" />
          <div className="absolute -bottom-6 -left-6 w-32 h-32 rounded-full bg-white/5" />

          <div className="relative">
            <p className="text-white/70 text-xs font-bold uppercase tracking-wider mb-0.5">
              {profileAvatar} {profileName}'s space
            </p>
            <h1 className="text-white font-black text-xl mb-1" style={{ fontFamily: 'Syne, sans-serif' }}>
              {greeting}
            </h1>
            <p className="text-white/60 text-sm mb-4">Pick something fun to watch!</p>
            <button
              onClick={() => movies[0] && navigate(`/player/movie/${movies[0].id}`)}
              className="bg-white text-purple-700 font-bold px-5 py-2 rounded-xl text-sm active:scale-95 transition-transform"
            >
              ▶ Watch Now
            </button>
          </div>
        </div>
      </div>

      {/* ── Genre pills ── */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide px-4 pb-3">
        {KIDS_GENRES.map(g => (
          <button
            key={g.id}
            onClick={() => setGenre(g.id)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold transition-all duration-200 active:scale-95 ${
              genre === g.id
                ? `${g.bg} ${g.text} scale-105 shadow-lg`
                : 'text-slate-300 border border-dark-border'
            }`}
            style={genre !== g.id ? { background: 'rgba(255,255,255,0.04)' } : {}}
          >
            <span>{g.emoji}</span>
            {g.label}
          </button>
        ))}
      </div>

      {/* ── Movies section ── */}
      <section className="px-4 mb-6">
        <h2 className="text-white font-bold text-base mb-3 flex items-center gap-2"
          style={{ fontFamily: 'Syne, sans-serif' }}>
          🎬 Movies
        </h2>

        {loading ? (
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="rounded-2xl animate-pulse bg-dark-card" style={{ aspectRatio: '2/3' }} />
            ))}
          </div>
        ) : movies.length > 0 ? (
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3">
            {movies.map(m => <KidsCard key={m.id} movie={m} />)}
          </div>
        ) : (
          <p className="text-slate-600 text-sm py-8 text-center">No movies found — try another category!</p>
        )}
      </section>

      {/* ── TV Shows section ── */}
      {!loading && tvShows.length > 0 && (
        <section className="px-4 mb-6">
          <h2 className="text-white font-bold text-base mb-3 flex items-center gap-2"
            style={{ fontFamily: 'Syne, sans-serif' }}>
            📺 Shows
          </h2>
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3">
            {tvShows.map(t => <KidsCard key={t.id} movie={t} />)}
          </div>
        </section>
      )}

      {/* ── Safety badge ── */}
      <div className="mx-4 mt-2">
        <div className="flex items-center justify-center gap-2 py-3 rounded-2xl text-xs text-slate-600"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          Safe, curated content for young viewers
        </div>
      </div>

      {/* ── PIN dialog ── */}
      {showPin && (
        <PinDialog
          onSuccess={handleExitSuccess}
          onCancel={() => setShowPin(false)}
        />
      )}
    </div>
  )
}
