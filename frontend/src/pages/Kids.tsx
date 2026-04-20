// frontend/src/pages/Kids.tsx — FULL REPLACEMENT
// FIXES: exit button now works, uses profileStore (no kidsStore), navbar hidden via Navbar.tsx
import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { useProfileStore } from '../stores/profileStore'
import PinModal from '../components/PinModal'

interface Movie {
  id: number
  title?: string
  name?: string
  poster_path: string | null
  backdrop_path: string | null
  vote_average?: number
  overview?: string
  genre_ids?: number[]
}

const BD = (p: string | null) => p ? `https://image.tmdb.org/t/p/w1280${p}` : ''
const PS = (p: string | null) => p ? `https://image.tmdb.org/t/p/w300${p}` : ''

// PIN stored by your existing kids mode setup
const KIDS_PIN_KEY = 'streamix_kids_pin'

function KidCard({ movie }: { movie: Movie }) {
  const navigate = useNavigate()
  const title = movie.title || movie.name || ''
  const isTV  = !!movie.name && !movie.title
  const type  = isTV ? 'tv' : 'movie'

  return (
    <div
      onClick={() => navigate(`/${type}/${movie.id}`)}
      className="group cursor-pointer relative rounded-2xl overflow-hidden select-none"
      style={{ aspectRatio: '2/3' }}
    >
      {movie.poster_path ? (
        <img src={PS(movie.poster_path)} alt={title}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-5xl bg-dark-card">🎬</div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      <div className="absolute bottom-0 left-0 right-0 p-2 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
        <p className="text-white text-[11px] font-bold line-clamp-2 mb-1.5">{title}</p>
        <button
          onClick={e => { e.stopPropagation(); navigate(`/player/${type}/${movie.id}${isTV ? '?season=1&episode=1' : ''}`) }}
          className="w-full text-[10px] font-black py-1.5 rounded-xl text-white"
          style={{ background: 'linear-gradient(135deg, #9333ea, #ec4899)' }}
        >
          ▶ Watch Now
        </button>
      </div>
    </div>
  )
}

function KidRow({ title, icon, movies, loading }: {
  title: string; icon: string; movies: Movie[]; loading: boolean
}) {
  if (loading) return (
    <div className="mb-8">
      <div className="flex items-center gap-2 px-4 sm:px-6 mb-3">
        <span>{icon}</span>
        <div className="h-5 w-36 rounded-lg animate-pulse" style={{ background: 'rgba(255,255,255,0.07)' }} />
      </div>
      <div className="flex gap-3 overflow-x-auto scrollbar-hide px-4 sm:px-6">
        {Array(7).fill(0).map((_,i) => (
          <div key={i} className="flex-shrink-0 w-28 sm:w-32 rounded-2xl animate-pulse"
            style={{ aspectRatio:'2/3', background:'rgba(255,255,255,0.06)' }} />
        ))}
      </div>
    </div>
  )
  if (!movies.length) return null
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 px-4 sm:px-6 mb-3">
        <span className="text-xl">{icon}</span>
        <h3 className="text-white font-black text-base sm:text-lg" style={{ fontFamily:'Syne, sans-serif' }}>
          {title}
        </h3>
      </div>
      <div className="flex gap-3 overflow-x-auto scrollbar-hide px-4 sm:px-6 pb-1">
        {movies.map(m => (
          <div key={m.id} className="flex-shrink-0 w-28 sm:w-32">
            <KidCard movie={m} />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Kids() {
  const navigate = useNavigate()
  const { setActive, profiles, activeProfile } = useProfileStore()

  const [showExitPin, setShowExitPin] = useState(false)
  const [loading,    setLoading]     = useState(true)
  const [featured,   setFeatured]    = useState<Movie[]>([])
  const [family,     setFamily]      = useState<Movie[]>([])
  const [cartoons,   setCartoons]    = useState<Movie[]>([])
  const [comedy,     setComedy]      = useState<Movie[]>([])
  const [adventure,  setAdventure]   = useState<Movie[]>([])
  const [heroIdx,    setHeroIdx]     = useState(0)
  const heroTimer = useRef<ReturnType<typeof setInterval>>()

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.get('/movies/discover', { params: { with_genres: 10751, sort_by: 'popularity.desc', 'vote_count.gte': 50 } }),
      api.get('/movies/discover', { params: { with_genres: 16,    sort_by: 'popularity.desc', 'vote_count.gte': 50 } }),
      api.get('/movies/discover', { params: { with_genres: '35,10751', sort_by: 'popularity.desc' } }),
      api.get('/movies/discover', { params: { with_genres: '12,10751', sort_by: 'popularity.desc' } }),
    ]).then(([fam, anim, com, adv]) => {
      const famList = fam.data.results || []
      setFamily(famList)
      setCartoons(anim.data.results || [])
      setComedy(com.data.results   || [])
      setAdventure(adv.data.results || [])
      setFeatured(famList.filter((m: Movie) => m.backdrop_path).slice(0, 6))
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!featured.length) return
    heroTimer.current = setInterval(() => setHeroIdx(i => (i + 1) % featured.length), 5000)
    return () => clearInterval(heroTimer.current)
  }, [featured.length])

  const hero = featured[heroIdx]

  // Read PIN from localStorage (set by your kids mode PIN system)
  const kidsPin = localStorage.getItem(KIDS_PIN_KEY) || ''

  const handleExit = () => {
    if (kidsPin) {
      setShowExitPin(true)
    } else {
      doExit()
    }
  }

  const doExit = () => {
    setShowExitPin(false)
    // Switch to first non-kids profile if available
    const nonKidsProfile = profiles.find(p => !p.isKids)
    if (nonKidsProfile) {
      setActive(nonKidsProfile)
    }
    navigate('/')
  }

  return (
    // z-[60] puts this above the main navbar (z-50) so our kids navbar wins
    <div className="min-h-screen relative z-[60]" style={{ background: 'linear-gradient(180deg, #0d0820 0%, #07080c 50%)' }}>

      {/* Exit PIN modal */}
      {showExitPin && (
        <PinModal
          title="Exit Kids Mode"
          subtitle="Enter your PIN to leave kids mode"
          storedPin={kidsPin}
          onSuccess={doExit}
          onCancel={() => setShowExitPin(false)}
        />
      )}

      {/* Kids navbar — z-[70] so it stays above the page content */}
      <div
        className="fixed top-0 left-0 right-0 z-[70] h-16 flex items-center justify-between px-4 sm:px-6"
        style={{ background: 'linear-gradient(to bottom, rgba(13,8,32,0.98) 0%, transparent 100%)' }}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xl"
            style={{ background: 'linear-gradient(135deg, rgba(147,51,234,0.3), rgba(236,72,153,0.3))', border: '1px solid rgba(147,51,234,0.3)' }}>
            🌟
          </div>
          <span className="text-base font-black"
            style={{
              fontFamily: 'Syne, sans-serif',
              background: 'linear-gradient(135deg, #c084fc, #f472b6)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
            KIDS
          </span>
        </div>

        <button
          onClick={handleExit}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-slate-300 hover:text-white transition-all"
          style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Exit Kids Mode
        </button>
      </div>

      {/* Hero */}
      {loading ? (
        <div className="animate-pulse" style={{ height: 'clamp(280px, 50vw, 460px)', background: 'rgba(147,51,234,0.08)' }} />
      ) : hero ? (
        <div className="relative overflow-hidden" style={{ height: 'clamp(280px, 50vw, 460px)' }}>
          <img key={hero.id} src={BD(hero.backdrop_path)} alt={hero.title || hero.name || ''}
            className="absolute inset-0 w-full h-full object-cover object-top" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, rgba(13,8,32,0.95) 0%, rgba(13,8,32,0.55) 55%, rgba(13,8,32,0.1) 100%)' }} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(7,8,12,1) 0%, transparent 45%)' }} />

          {/* Sparkles */}
          {['top-10 left-[62%] text-yellow-300', 'top-20 right-[18%] text-pink-300', 'top-8 right-[38%] text-purple-300'].map((cls, i) => (
            <div key={i} className={`absolute ${cls} text-xl pointer-events-none`}
              style={{ animation: `kidFloat ${2.5 + i*0.4}s ease-in-out infinite`, animationDelay: `${i*0.6}s` }}>✦</div>
          ))}

          <div className="absolute bottom-8 sm:bottom-14 left-4 sm:left-8 right-4 max-w-lg pt-16">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold mb-3"
              style={{ background: 'rgba(147,51,234,0.25)', border: '1px solid rgba(147,51,234,0.4)', color: '#e879f9' }}>
              ✨ Featured
            </div>
            <h1 className="text-2xl sm:text-4xl font-black leading-tight mb-3 text-white"
              style={{ fontFamily: 'Syne, sans-serif', textShadow: '0 2px 20px rgba(0,0,0,0.6)' }}>
              {hero.title || hero.name}
            </h1>
            <div className="flex gap-2.5">
              <button
                onClick={() => {
                  const isTV = !!hero.name && !hero.title
                  navigate(`/player/${isTV ? 'tv' : 'movie'}/${hero.id}${isTV ? '?season=1&episode=1' : ''}`)
                }}
                className="px-5 py-2.5 rounded-2xl text-sm font-black text-white transition-all hover:opacity-90 active:scale-95"
                style={{ background: 'linear-gradient(135deg, #9333ea, #ec4899)' }}
              >
                ▶ Watch Now
              </button>
              <button
                onClick={() => { const isTV = !!hero.name && !hero.title; navigate(`/${isTV?'tv':'movie'}/${hero.id}`) }}
                className="px-4 py-2.5 rounded-2xl text-sm font-semibold text-white hover:bg-white/10 transition-all"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}
              >
                More Info
              </button>
            </div>
          </div>

          <div className="absolute bottom-4 right-4 flex gap-1.5">
            {featured.map((_, i) => (
              <button key={i}
                onClick={() => { setHeroIdx(i); clearInterval(heroTimer.current!) }}
                className="rounded-full transition-all duration-300"
                style={{ width: i === heroIdx ? 20 : 6, height: 6, background: i === heroIdx ? '#c084fc' : 'rgba(255,255,255,0.25)' }}
              />
            ))}
          </div>
        </div>
      ) : null}

      {/* Genre badges */}
      <div className="px-4 sm:px-6 py-5 flex gap-2 overflow-x-auto scrollbar-hide">
        {[
          { label: '🏆 Family',    bg: 'rgba(251,191,36,0.15)',  b: 'rgba(251,191,36,0.3)',  c: '#fbbf24' },
          { label: '🎨 Cartoons',  bg: 'rgba(236,72,153,0.15)',  b: 'rgba(236,72,153,0.3)',  c: '#f472b6' },
          { label: '😂 Comedy',    bg: 'rgba(249,115,22,0.15)',  b: 'rgba(249,115,22,0.3)',  c: '#fb923c' },
          { label: '🌍 Adventure', bg: 'rgba(16,185,129,0.15)',  b: 'rgba(16,185,129,0.3)',  c: '#34d399' },
          { label: '🧙 Fantasy',   bg: 'rgba(147,51,234,0.15)', b: 'rgba(147,51,234,0.3)',  c: '#c084fc' },
        ].map(g => (
          <span key={g.label} className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap"
            style={{ background: g.bg, border: `1px solid ${g.b}`, color: g.c }}>
            {g.label}
          </span>
        ))}
      </div>

      {/* Content rows */}
      <KidRow title="Family Favorites"     icon="🏆" movies={family}    loading={loading} />
      <KidRow title="Cartoons & Animation" icon="🎨" movies={cartoons}  loading={loading} />
      <KidRow title="Laugh Out Loud"       icon="😂" movies={comedy}    loading={loading} />
      <KidRow title="Epic Adventures"      icon="🌍" movies={adventure} loading={loading} />

      <div className="h-10" />

      <style>{`
        @keyframes kidFloat {
          0%,100% { transform: translateY(0) rotate(0deg); }
          50%      { transform: translateY(-10px) rotate(8deg); }
        }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  )
}
