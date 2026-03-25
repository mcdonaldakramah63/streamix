// frontend/src/components/Navbar.tsx — FULL REPLACEMENT
import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../context/authStore'
import api from '../services/api'

interface Suggestion {
  id: number
  title?: string; name?: string
  poster_path: string | null
  media_type: 'movie' | 'tv' | 'person'
  release_date?: string; first_air_date?: string
  vote_average?: number
}

const IMG = 'https://image.tmdb.org/t/p/w92'

const NAV_LINKS = [
  { to: '/',          label: 'Movies',   icon: '🎬' },
  { to: '/tv',        label: 'TV Shows', icon: '📺' },
  { to: '/anime',     label: 'Anime',    icon: '🎌' },
  { to: '/watchlist', label: 'Watchlist',icon: '🔖' },
]

export default function Navbar() {
  const { user, logout } = useAuthStore()
  const navigate  = useNavigate()
  const location  = useLocation()

  const [scrolled,    setScrolled]    = useState(false)
  const [query,       setQuery]       = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [showSug,     setShowSug]     = useState(false)
  const [sugLoading,  setSugLoading]  = useState(false)
  const [userMenu,    setUserMenu]    = useState(false)
  const [drawer,      setDrawer]      = useState(false)
  const [searchOpen,  setSearchOpen]  = useState(false)

  const searchRef = useRef<HTMLDivElement>(null)
  const debRef    = useRef<ReturnType<typeof setTimeout>>()

  // Close everything on route change
  useEffect(() => {
    setDrawer(false); setSearchOpen(false); setUserMenu(false); setShowSug(false); setQuery('')
  }, [location.pathname])

  // Lock body scroll when drawer open
  useEffect(() => {
    document.body.style.overflow = drawer ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [drawer])

  // Scroll detection
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 30)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  // Close suggestions on outside click
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSug(false)
      }
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  // Debounced search
  useEffect(() => {
    clearTimeout(debRef.current)
    if (!query.trim() || query.length < 2) { setSuggestions([]); setShowSug(false); return }
    setSugLoading(true)
    debRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get('/movies/search', {
          params: { query: query.trim(), type: 'multi', page: 1 }
        })
        const results = (data.results || [])
          .filter((r: Suggestion) => r.media_type !== 'person' && (r.title || r.name))
          .slice(0, 6)
        setSuggestions(results)
        setShowSug(results.length > 0)
      } catch { setSuggestions([]) }
      finally { setSugLoading(false) }
    }, 280)
  }, [query])

  const goTo = (item: Suggestion) => {
    navigate(item.media_type === 'tv' ? `/tv/${item.id}` : `/movie/${item.id}`)
    setQuery(''); setShowSug(false)
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query.trim())}`)
      setQuery(''); setShowSug(false); setSearchOpen(false)
    }
  }

  const isActive = (to: string) => to === '/'
    ? location.pathname === '/'
    : location.pathname.startsWith(to)

  const SuggestionDropdown = ({ mobile = false }: { mobile?: boolean }) => (
    showSug && suggestions.length > 0 ? (
      <div className={`${mobile ? 'mt-2 mx-0' : 'absolute top-full left-0 right-0 mt-2'} glass rounded-2xl overflow-hidden z-50 animate-slide-down shadow-deep`}>
        {suggestions.map((item, i) => (
          <button key={item.id} onMouseDown={() => goTo(item)}
            className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-dark-hover transition-colors ${i < suggestions.length - 1 ? 'border-b border-dark-border' : ''}`}>
            <div className="w-8 h-12 rounded-lg overflow-hidden bg-dark-card flex-shrink-0">
              {item.poster_path
                ? <img src={IMG + item.poster_path} alt="" className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-lg">🎬</div>
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{item.title || item.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  item.media_type === 'tv'
                    ? 'bg-blue-500/20 text-blue-300'
                    : 'bg-brand/20 text-brand'
                }`}>{item.media_type === 'tv' ? 'TV' : 'Movie'}</span>
                {(item.release_date || item.first_air_date) && (
                  <span className="text-[10px] text-slate-500">{(item.release_date || item.first_air_date)!.slice(0,4)}</span>
                )}
                {item.vote_average ? <span className="text-[10px] text-gold">★ {item.vote_average.toFixed(1)}</span> : null}
              </div>
            </div>
          </button>
        ))}
        <button onMouseDown={() => { navigate(`/search?q=${encodeURIComponent(query)}`); setShowSug(false); setQuery(''); setSearchOpen(false) }}
          className="w-full px-4 py-3 text-xs text-brand hover:bg-dark-hover text-center font-semibold border-t border-dark-border transition-colors">
          See all results for "{query}" →
        </button>
      </div>
    ) : null
  )

  return (
    <>
      {/* ── Navbar ──────────────────────────────────────────────────────── */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled ? 'glass shadow-deep' : 'bg-gradient-to-b from-[rgba(7,8,12,0.9)] to-transparent'
      }`}>
        <div className="h-16 px-4 sm:px-6 flex items-center gap-4 max-w-[1800px] mx-auto">

          {/* Logo */}
          <Link to="/" className="flex-shrink-0 flex items-center gap-2">
            <span className="text-brand font-bold text-xl tracking-tight"
              style={{ fontFamily: 'Syne, sans-serif', letterSpacing: '-0.02em' }}>
              STREAMIX
            </span>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-1 ml-2">
            {NAV_LINKS.map(({ to, label }) => (
              <Link key={to} to={to}
                className={`px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive(to)
                    ? 'text-white bg-dark-hover'
                    : 'text-slate-400 hover:text-white hover:bg-dark-hover/50'
                }`}>
                {label}
              </Link>
            ))}
          </div>

          {/* Desktop search */}
          <div ref={searchRef} className="hidden md:block relative flex-1 max-w-md ml-auto">
            <form onSubmit={handleSearch}>
              <div className={`flex items-center gap-3 bg-dark-surface border rounded-xl px-4 py-2.5 transition-all duration-200 ${
                showSug || document.activeElement?.closest('form') ? 'border-brand/40 shadow-brand-sm' : 'border-dark-border'
              }`}>
                {sugLoading
                  ? <div className="w-3.5 h-3.5 border border-slate-500 border-t-brand rounded-full animate-spin flex-shrink-0" />
                  : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-500 flex-shrink-0">
                      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                    </svg>
                }
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onFocus={() => suggestions.length && setShowSug(true)}
                  placeholder="Search movies, shows, anime…"
                  className="bg-transparent outline-none text-sm text-white placeholder-slate-500 w-full"
                />
                {query && (
                  <button type="button" onClick={() => { setQuery(''); setSuggestions([]); setShowSug(false) }}
                    className="text-slate-500 hover:text-white text-xs flex-shrink-0">✕</button>
                )}
              </div>
            </form>
            <SuggestionDropdown />
          </div>

          {/* Desktop user area */}
          <div className="hidden md:flex items-center gap-2 flex-shrink-0">
            {user ? (
              <div className="relative">
                <button onClick={() => setUserMenu(!userMenu)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-dark-hover transition-colors">
                  <div className="w-7 h-7 rounded-full bg-brand/20 flex items-center justify-center text-brand font-bold text-sm flex-shrink-0">
                    {user.username[0].toUpperCase()}
                  </div>
                  <span className="text-slate-300 text-sm font-medium">{user.username}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`text-slate-500 transition-transform ${userMenu ? 'rotate-180' : ''}`}>
                    <path d="m6 9 6 6 6-6"/>
                  </svg>
                </button>
                {userMenu && (
                  <div className="absolute right-0 mt-2 w-48 glass rounded-2xl overflow-hidden shadow-deep animate-slide-down z-50">
                    <Link to="/profile"   className="flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:bg-dark-hover hover:text-white transition-colors">
                      <span>👤</span> Profile
                    </Link>
                    <Link to="/watchlist" className="flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:bg-dark-hover hover:text-white transition-colors">
                      <span>🔖</span> Watchlist
                    </Link>
                    {user.isAdmin && (
                      <Link to="/admin" className="flex items-center gap-3 px-4 py-3 text-sm text-brand hover:bg-dark-hover transition-colors">
                        <span>👑</span> Admin Panel
                      </Link>
                    )}
                    <div className="border-t border-dark-border" />
                    <button onClick={() => { logout(); navigate('/') }}
                      className="flex items-center gap-3 w-full px-4 py-3 text-sm text-red-400 hover:bg-dark-hover transition-colors">
                      <span>🚪</span> Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link to="/login"    className="btn-ghost text-sm px-4 py-2">Sign In</Link>
                <Link to="/register" className="btn-primary text-sm px-4 py-2.5">Sign Up</Link>
              </div>
            )}
          </div>

          {/* Mobile controls */}
          <div className="flex items-center gap-1 md:hidden ml-auto">
            <button onClick={() => { setSearchOpen(s => !s); setDrawer(false) }}
              className="btn-icon w-9 h-9 text-slate-300">
              {searchOpen
                ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
                : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              }
            </button>
            <button onClick={() => { setDrawer(d => !d); setSearchOpen(false) }}
              className="btn-icon w-9 h-9 text-slate-300">
              {drawer
                ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
                : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
              }
            </button>
          </div>
        </div>

        {/* Mobile search bar */}
        {searchOpen && (
          <div className="md:hidden border-t border-dark-border px-4 pb-3 pt-3 glass animate-slide-down">
            <form onSubmit={handleSearch}>
              <div className="flex items-center gap-3 bg-dark-card border border-dark-border rounded-xl px-4 py-3">
                {sugLoading
                  ? <div className="w-4 h-4 border border-slate-500 border-t-brand rounded-full animate-spin" />
                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-500"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                }
                <input
                  autoFocus
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search movies, shows, anime…"
                  className="bg-transparent outline-none text-base text-white placeholder-slate-500 flex-1"
                  style={{ fontSize: '16px' }}
                />
                {query && <button type="button" onClick={() => { setQuery(''); setSuggestions([]) }} className="text-slate-400 hover:text-white">✕</button>}
              </div>
            </form>
            <SuggestionDropdown mobile />
          </div>
        )}
      </nav>

      {/* ── Drawer backdrop ──────────────────────────────────────────────── */}
      <div
        className={`md:hidden fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm transition-opacity duration-300 ${drawer ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setDrawer(false)}
      />

      {/* ── Drawer panel ─────────────────────────────────────────────────── */}
      <div className={`md:hidden fixed top-0 right-0 h-full w-72 max-w-[85vw] glass z-[70] transform transition-transform duration-300 ${drawer ? 'translate-x-0' : 'translate-x-full'} flex flex-col border-l border-dark-border`}>

        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 h-16 border-b border-dark-border flex-shrink-0">
          <span className="text-brand font-bold text-lg" style={{ fontFamily: 'Syne, sans-serif' }}>STREAMIX</span>
          <button onClick={() => setDrawer(false)} className="btn-icon w-8 h-8">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">

          {/* User section */}
          {user ? (
            <div className="px-4 py-4 mx-3 mb-2 rounded-2xl bg-dark-card border border-dark-border">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-brand/20 flex items-center justify-center text-brand font-bold text-xl flex-shrink-0">
                  {user.username[0].toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{user.username}</p>
                  <p className="text-xs text-slate-500">{user.email}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="px-4 mb-2 flex gap-2">
              <Link to="/login"    onClick={() => setDrawer(false)} className="btn-ghost text-sm flex-1 text-center py-2.5">Sign In</Link>
              <Link to="/register" onClick={() => setDrawer(false)} className="btn-primary text-sm flex-1 text-center py-2.5">Sign Up</Link>
            </div>
          )}

          {/* Nav links */}
          <div className="px-3 py-1">
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest px-3 mb-2">Browse</p>
            {NAV_LINKS.map(({ to, label, icon }) => (
              <Link key={to} to={to} onClick={() => setDrawer(false)}
                className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all mb-0.5 ${
                  isActive(to)
                    ? 'bg-brand/10 text-brand border border-brand/20'
                    : 'text-slate-300 hover:bg-dark-hover hover:text-white'
                }`}>
                <span className="text-lg w-6 text-center">{icon}</span>
                {label}
              </Link>
            ))}
          </div>

          {/* Account links */}
          {user && (
            <div className="px-3 py-1 border-t border-dark-border mt-2 pt-3">
              <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest px-3 mb-2">Account</p>
              <Link to="/profile" onClick={() => setDrawer(false)}
                className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm text-slate-300 hover:bg-dark-hover hover:text-white transition-all mb-0.5">
                <span className="w-6 text-center">👤</span> Profile
              </Link>
              {user.isAdmin && (
                <Link to="/admin" onClick={() => setDrawer(false)}
                  className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm text-brand hover:bg-dark-hover transition-all mb-0.5">
                  <span className="w-6 text-center">👑</span> Admin Panel
                </Link>
              )}
              <button onClick={() => { logout(); navigate('/'); setDrawer(false) }}
                className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-sm text-red-400 hover:bg-dark-hover transition-all">
                <span className="w-6 text-center">🚪</span> Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
