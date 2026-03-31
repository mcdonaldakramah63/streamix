// frontend/src/pages/KidsHome.tsx — NEW FILE
// Safe kids homepage with bright theme, filtered content, parental controls
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { useProfileStore } from '../stores/profileStore'
import { useAuthStore }    from '../context/authStore'

interface Movie { id: number; title?: string; name?: string; poster_path: string|null; vote_average: number }

const IMG = (p: string|null) => p ? `https://image.tmdb.org/t/p/w300${p}` : ''

// Kids-safe genres
const KIDS_GENRES = [
  { id: 16,    label: '🎨 Cartoons',    color: 'bg-yellow-400 text-yellow-900' },
  { id: 10751, label: '👨‍👩‍👧 Family',      color: 'bg-green-400 text-green-900' },
  { id: 12,    label: '🌍 Adventure',   color: 'bg-blue-400 text-blue-900' },
  { id: 35,    label: '😂 Comedy',      color: 'bg-pink-400 text-pink-900' },
  { id: 14,    label: '🧙 Fantasy',     color: 'bg-purple-400 text-purple-900' },
  { id: 10762, label: '🧒 Kids',        color: 'bg-orange-400 text-orange-900' },
]

function KidsCard({ movie }: { movie: Movie }) {
  const navigate  = useNavigate()
  const [imgErr, setImgErr] = useState(false)
  const title = movie.title || movie.name || ''
  const type  = movie.name && !movie.title ? 'tv' : 'movie'

  return (
    <button
      onClick={() => navigate(type==='tv' ? `/player/tv/${movie.id}?season=1&episode=1` : `/player/movie/${movie.id}`)}
      className="group flex flex-col items-center gap-2 active:scale-95 transition-transform">
      <div className="relative w-20 sm:w-28 rounded-2xl overflow-hidden shadow-xl" style={{ aspectRatio:'2/3' }}>
        <img
          src={!imgErr && movie.poster_path ? IMG(movie.poster_path) : ''}
          alt={title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          onError={() => setImgErr(true)}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-2">
          <span className="text-white text-xs font-bold">▶ Watch</span>
        </div>
      </div>
      <p className="text-xs font-semibold text-slate-200 text-center line-clamp-1 w-20 sm:w-28">{title}</p>
    </button>
  )
}

export default function KidsHome() {
  const navigate    = useNavigate()
  const { user }    = useAuthStore()
  const { activeProfile, setActive, profiles } = useProfileStore()

  const [movies,   setMovies]   = useState<Movie[]>([])
  const [genre,    setGenre]    = useState(16)
  const [loading,  setLoading]  = useState(true)
  const [showPin,  setShowPin]  = useState(false)
  const [pin,      setPin]      = useState('')
  const [pinError, setPinError] = useState('')

  const PARENT_PIN = '1234' // In production, store hashed in user profile

  useEffect(() => {
    setLoading(true)
    api.get('/movies/discover', {
      params: { type:'movie', with_genres:`${genre},10751`, sort_by:'popularity.desc', 'vote_count.gte':50, page:1 }
    }).then(r => setMovies((r.data.results||[]).slice(0,20)))
      .catch(()=>setMovies([]))
      .finally(()=>setLoading(false))
  }, [genre])

  const exitKids = () => {
    setShowPin(true)
    setPin('')
    setPinError('')
  }

  const checkPin = () => {
    if (pin === PARENT_PIN) {
      const adultProfile = profiles.find(p => !p.isKids)
      if (adultProfile) setActive(adultProfile)
      setShowPin(false)
    } else {
      setPinError('Wrong PIN')
      setPin('')
    }
  }

  const greetings = ['Hey there!', 'Welcome back!', 'Ready to watch?', 'What\'s on today?']
  const greeting  = greetings[Math.floor(Date.now() / 3600000) % greetings.length]

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)' }}>

      {/* Header */}
      <div className="px-4 pt-20 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white" style={{ fontFamily:'Syne, sans-serif' }}>
            {greeting} 👋
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {activeProfile?.avatar} {activeProfile?.name}'s space
          </p>
        </div>
        <button onClick={exitKids}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-dark-card border border-dark-border text-slate-400 hover:text-white text-xs font-semibold">
          🔒 Exit Kids
        </button>
      </div>

      {/* Big friendly banner */}
      <div className="mx-4 mb-6 rounded-3xl overflow-hidden relative"
        style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', minHeight: 140 }}>
        <div className="p-5">
          <p className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-1">🌟 Featured Today</p>
          <h2 className="text-white font-black text-xl" style={{ fontFamily:'Syne, sans-serif' }}>
            Discover Amazing Stories
          </h2>
          <p className="text-white/60 text-sm mt-1 mb-4">Fun, safe, and magical adventures await!</p>
          <button onClick={() => navigate('/player/movie/10674')}
            className="bg-white text-purple-700 font-bold px-5 py-2 rounded-xl text-sm active:scale-95">
            ▶ Start Watching
          </button>
        </div>
        <div className="absolute right-4 top-4 text-5xl opacity-30">🌈</div>
        <div className="absolute right-16 bottom-4 text-3xl opacity-20">⭐</div>
      </div>

      {/* Genre pills */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide px-4 pb-3 mb-4">
        {KIDS_GENRES.map(g => (
          <button key={g.id} onClick={() => setGenre(g.id)}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-bold transition-all active:scale-95 ${
              genre===g.id ? g.color + ' scale-105 shadow-lg' : 'bg-dark-card text-slate-300 border border-dark-border'
            }`}>
            {g.label}
          </button>
        ))}
      </div>

      {/* Movies grid */}
      <div className="px-4 pb-8">
        {loading ? (
          <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
            {Array(8).fill(0).map((_,i) => (
              <div key={i} className="w-20 sm:w-28 flex-shrink-0 skeleton rounded-2xl" style={{ aspectRatio:'2/3' }} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3">
            {movies.map(m => <KidsCard key={m.id} movie={m} />)}
          </div>
        )}
      </div>

      {/* PIN dialog */}
      {showPin && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="glass rounded-3xl p-6 w-full max-w-xs shadow-deep animate-scale-in text-center">
            <div className="text-4xl mb-3">🔒</div>
            <h2 className="text-lg font-bold text-white mb-1" style={{ fontFamily:'Syne, sans-serif' }}>Parent Area</h2>
            <p className="text-slate-500 text-sm mb-5">Enter your PIN to exit Kids Mode</p>

            <div className="flex gap-2 justify-center mb-4">
              {Array(4).fill(0).map((_,i) => (
                <div key={i}
                  className={`w-10 h-12 rounded-xl flex items-center justify-center text-xl font-bold border-2 transition-all ${
                    pin.length > i ? 'border-brand bg-brand/15 text-brand' : 'border-dark-border bg-dark-surface text-transparent'
                  }`}>
                  {pin[i] ? '●' : '○'}
                </div>
              ))}
            </div>

            {pinError && <p className="text-red-400 text-xs mb-3">{pinError}</p>}

            {/* Numpad */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k,i) => (
                <button key={i}
                  onClick={() => {
                    if (!k) return
                    if (k==='⌫') setPin(p => p.slice(0,-1))
                    else if (pin.length < 4) {
                      const next = pin + k
                      setPin(next)
                      if (next.length===4) setTimeout(() => {
                        if (next===PARENT_PIN) {
                          const adultProfile = profiles.find(p => !p.isKids)
                          if (adultProfile) setActive(adultProfile)
                          setShowPin(false)
                        } else {
                          setPinError('Wrong PIN')
                          setPin('')
                        }
                      }, 100)
                    }
                  }}
                  className={`h-12 rounded-xl text-white font-bold text-lg active:scale-90 transition-transform ${
                    k ? 'bg-dark-card border border-dark-border hover:border-brand/40' : 'opacity-0 pointer-events-none'
                  }`}>
                  {k}
                </button>
              ))}
            </div>

            <button onClick={() => setShowPin(false)}
              className="text-slate-500 hover:text-slate-300 text-sm">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
