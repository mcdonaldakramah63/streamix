// frontend/src/components/Navbar.tsx — FULL REPLACEMENT
// KEY FIX: returns null on /kids so the Kids page owns its own navbar entirely
import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../context/authStore'
import { useProfileStore } from '../stores/profileStore'
import api from '../services/api'

interface Suggestion {
  id: number
  title?: string
  name?: string
  poster_path: string | null
  media_type: 'movie' | 'tv' | 'person'
  release_date?: string
  first_air_date?: string
  vote_average?: number
}

const IMG = 'https://image.tmdb.org/t/p/w92'

const NAV_LINKS = [
  { to: '/',          label: 'Home',      icon: '🏠' },
  { to: '/movies',    label: 'Movies',    icon: '🎬' },
  { to: '/tv',        label: 'TV Shows',  icon: '📺' },
  { to: '/anime',     label: 'Anime',     icon: '🎌' },
  { to: '/watchlist', label: 'Watchlist', icon: '🔖' },
  { to: '/downloads', label: 'Downloads', icon: '⬇️' },
]

export default function Navbar() {
  const { user, logout }              = useAuthStore()
  const { activeProfile, profiles, setActive } = useProfileStore()
  const navigate  = useNavigate()
  const location  = useLocation()

  // ── KIDS MODE: hide this navbar entirely so Kids page runs its own ──
  if (location.pathname === '/kids') return null

  const [scrolled,    setScrolled]    = useState(false)
  const [query,       setQuery]       = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [showSug,     setShowSug]     = useState(false)
  const [sugLoading,  setSugLoading]  = useState(false)
  const [userMenu,    setUserMenu]    = useState(false)
  const [profileMenu, setProfileMenu] = useState(false)
  const [drawer,      setDrawer]      = useState(false)
  const [searchOpen,  setSearchOpen]  = useState(false)

  const searchRef = useRef<HTMLDivElement>(null)
  const debRef    = useRef<ReturnType<typeof setTimeout>>()

  // Close everything on route change
  useEffect(() => {
    setDrawer(false); setSearchOpen(false); setUserMenu(false)
    setShowSug(false); setQuery(''); setProfileMenu(false)
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

  // Close dropdowns on outside click
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSug(false)
      }
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  // Debounced search suggestions
  useEffect(() => {
    clearTimeout(debRef.current)
    if (!query.trim() || query.length < 2) { setSuggestions([]); setShowSug(false); return }
    setSugLoading(true)
    debRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get('/movies/search', {
          params: { query: query.trim(), type: 'multi', page: 1 },
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

  const isActive = (to: string) =>
    to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)

  // Kids profiles — clicking their avatar navigates to /kids
  const handleProfileClick = (p: typeof profiles[0]) => {
    setActive(p)
    setProfileMenu(false)
    if (p.isKids) navigate('/kids')
  }

  const SuggestionDropdown = ({ mobile = false }: { mobile?: boolean }) =>
    showSug && suggestions.length > 0 ? (
      <div className={`${mobile ? 'mt-2' : 'absolute top-full left-0 right-0 mt-2'} glass rounded-2xl overflow-hidden z-50 shadow-deep`}
        style={{ animation: 'slideDown 0.15s ease both' }}>
        {suggestions.map((item, i) => (
          <button key={item.id} onMouseDown={() => goTo(item)}
            className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-dark-hover transition-colors ${i < suggestions.length - 1 ? 'border-b border-dark-border' : ''}`}>
            <div className="w-8 h-12 rounded-lg overflow-hidden bg-dark-card flex-shrink-0">
              {item.poster_path
                ? <img src={IMG + item.poster_path} alt="" className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center">🎬</div>
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{item.title || item.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  item.media_type === 'tv' ? 'bg-blue-500/20 text-blue-300' : 'bg-brand/20 text-brand'
                }`}>{item.media_type === 'tv' ? 'TV' : 'Movie'}</span>
                {(item.release_date || item.first_air_date) && (
                  <span className="text-[10px] text-slate-500">
                    {(item.release_date || item.first_air_date)!.slice(0, 4)}
                  </span>
                )}
                {item.vote_average ? <span className="text-[10px] text-yellow-400">★ {item.vote_average.toFixed(1)}</span> : null}
              </div>
            </div>
          </button>
        ))}
        <button
          onMouseDown={() => { navigate(`/search?q=${encodeURIComponent(query)}`); setShowSug(false); setQuery(''); setSearchOpen(false) }}
          className="w-full px-4 py-3 text-xs text-brand hover:bg-dark-hover text-center font-semibold border-t border-dark-border transition-colors"
        >
          See all results for "{query}" →
        </button>
      </div>
    ) : null

  return (
    <>
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled ? 'glass shadow-deep' : 'bg-gradient-to-b from-[rgba(7,8,12,0.95)] to-transparent'
      }`}>
        <div className="h-16 px-4 sm:px-6 flex items-center gap-4 max-w-[1800px] mx-auto">

          {/* Logo */}
          <Link to="/" className="flex-shrink-0">
            <span className="text-brand font-bold text-xl" style={{ fontFamily: 'Syne, sans-serif' }}>
              STREAMIX
            </span>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-0.5 ml-2">
            {NAV_LINKS.map(({ to, label }) => (
              <Link key={to} to={to}
                className={`px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive(to)
                    ? 'text-white bg-white/10'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}>
                {label}
              </Link>
            ))}
          </div>

          {/* Desktop search */}
          <div ref={searchRef} className="hidden md:block relative flex-1 max-w-md ml-auto">
            <form onSubmit={handleSearch}>
              <div
                className="flex items-center gap-3 bg-dark-surface border border-dark-border rounded-xl px-4 py-2.5 transition-all duration-200"
                onFocusCapture={e => (e.currentTarget.style.borderColor = 'rgba(20,184,166,0.45)')}
                onBlurCapture={e => (e.currentTarget.style.borderColor = '')}
              >
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

          {/* Desktop right side — profiles + user */}
          <div className="hidden md:flex items-center gap-2 flex-shrink-0">
            {user ? (
              <>
                {/* Profile switcher */}
                {profiles.length > 0 && (
                  <div className="relative">
                    <button
                      onClick={() => { setProfileMenu(p => !p); setUserMenu(false) }}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-dark-hover transition-colors"
                    >
                      <div
                        className="w-7 h-7 rounded-xl flex items-center justify-center text-base flex-shrink-0"
                        style={{ background: (activeProfile?.color || '#14b8a6') + '25' }}
                      >
                        {activeProfile?.avatar || '🎬'}
                      </div>
                      <span className="text-slate-300 text-sm font-medium max-w-[80px] truncate">
                        {activeProfile?.name || 'Profile'}
                      </span>
                      {activeProfile?.isKids && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-purple-500 text-white">KIDS</span>
                      )}
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                        className={`text-slate-500 transition-transform ${profileMenu ? 'rotate-180' : ''}`}>
                        <path d="m6 9 6 6 6-6"/>
                      </svg>
                    </button>

                    {profileMenu && (
                      <div className="absolute right-0 mt-2 w-52 glass rounded-2xl overflow-hidden shadow-deep z-50"
                        style={{ animation: 'slideDown 0.15s ease both' }}>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-600 px-4 pt-3 pb-1">Switch Profile</p>
                        {profiles.map(p => (
                          <button key={p._id} onClick={() => handleProfileClick(p)}
                            className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-dark-hover transition-colors ${activeProfile?._id === p._id ? 'bg-brand/10' : ''}`}>
                            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                              style={{ background: (p.color || '#14b8a6') + '22' }}>
                              {p.avatar || '🎬'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-white truncate">{p.name}</p>
                              {p.isKids && <p className="text-[10px] text-purple-400 font-bold">Kids Profile</p>}
                            </div>
                            {activeProfile?._id === p._id && (
                              <div className="w-1.5 h-1.5 rounded-full bg-brand flex-shrink-0" />
                            )}
                          </button>
                        ))}
                        <div className="border-t border-dark-border">
                          <Link to="/profile" onClick={() => setProfileMenu(false)}
                            className="flex items-center gap-2 px-4 py-3 text-xs text-slate-400 hover:text-white hover:bg-dark-hover transition-colors">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
                            </svg>
                            Manage Profiles
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* User menu */}
                <div className="relative">
                  <button onClick={() => { setUserMenu(!userMenu); setProfileMenu(false) }}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-dark-hover transition-colors">
                    <div className="w-7 h-7 rounded-full bg-brand/20 flex items-center justify-center text-brand font-bold text-sm">
                      {user.username[0].toUpperCase()}
                    </div>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                      className={`text-slate-500 transition-transform ${userMenu ? 'rotate-180' : ''}`}>
                      <path d="m6 9 6 6 6-6"/>
                    </svg>
                  </button>

                  {userMenu && (
                    <div className="absolute right-0 mt-2 w-48 glass rounded-2xl overflow-hidden shadow-deep z-50"
                      style={{ animation: 'slideDown 0.15s ease both' }}>
                      <div className="px-4 py-3 border-b border-dark-border">
                        <p className="text-sm font-semibold text-white">{user.username}</p>
                        <p className="text-xs text-slate-500 truncate">{user.email}</p>
                      </div>
                      <Link to="/profile" className="flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:bg-dark-hover hover:text-white transition-colors">
                        <span>👤</span> Profile
                      </Link>
                      <Link to="/watchlist" className="flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:bg-dark-hover hover:text-white transition-colors">
                        <span>🔖</span> Watchlist
                      </Link>
                      {(user as any).isAdmin && (
                        <Link to="/admin" className="flex items-center gap-3 px-4 py-3 text-sm text-brand hover:bg-dark-hover transition-colors">
                          <span>👑</span> Admin
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
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Link to="/login"    className="text-sm text-slate-400 hover:text-white px-4 py-2 rounded-xl hover:bg-dark-hover transition-all">Sign In</Link>
                <Link to="/register" className="text-sm font-semibold px-4 py-2 rounded-xl bg-brand text-dark hover:opacity-90 transition-all">Sign Up</Link>
              </div>
            )}
          </div>

          {/* Mobile controls */}
          <div className="flex items-center gap-1 md:hidden ml-auto">
            <button onClick={() => { setSearchOpen(s => !s); setDrawer(false) }}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-300 hover:bg-dark-hover transition-colors">
              {searchOpen
                ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
                : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              }
            </button>
            <button onClick={() => { setDrawer(d => !d); setSearchOpen(false) }}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-300 hover:bg-dark-hover transition-colors">
              {drawer
                ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
                : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
              }
            </button>
          </div>
        </div>

        {/* Mobile search */}
        {searchOpen && (
          <div className="md:hidden border-t border-dark-border px-4 pb-3 pt-3 glass">
            <form onSubmit={handleSearch}>
              <div className="flex items-center gap-3 bg-dark-card border border-dark-border rounded-xl px-4 py-3">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-500">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
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

      {/* Mobile drawer backdrop */}
      <div
        className={`md:hidden fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm transition-opacity duration-300 ${drawer ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setDrawer(false)}
      />

      {/* Mobile drawer */}
      <div className={`md:hidden fixed top-0 right-0 h-full w-72 max-w-[85vw] glass z-[70] transform transition-transform duration-300 ${drawer ? 'translate-x-0' : 'translate-x-full'} flex flex-col border-l border-dark-border`}>
        <div className="flex items-center justify-between px-5 h-16 border-b border-dark-border flex-shrink-0">
          <span className="text-brand font-bold text-lg" style={{ fontFamily: 'Syne, sans-serif' }}>STREAMIX</span>
          <button onClick={() => setDrawer(false)} className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-dark-hover transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {/* Profile section */}
          {user && activeProfile && (
            <div className="px-4 py-4 mx-3 mb-2 rounded-2xl bg-dark-card border border-dark-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-2xl"
                  style={{ background: (activeProfile.color || '#14b8a6') + '22' }}>
                  {activeProfile.avatar || '🎬'}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{activeProfile.name}</p>
                  {activeProfile.isKids && <p className="text-[10px] text-purple-400 font-bold">Kids Profile</p>}
                </div>
              </div>
              {profiles.length > 1 && (
                <div className="flex gap-2 mt-3 flex-wrap">
                  {profiles.filter(p => p._id !== activeProfile._id).map(p => (
                    <button key={p._id}
                      onClick={() => { handleProfileClick(p); setDrawer(false) }}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white transition-all"
                      style={{ background: (p.color || '#14b8a6') + '15', border: `1px solid ${p.color || '#14b8a6'}30` }}>
                      <span>{p.avatar || '🎬'}</span>
                      <span>{p.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {!user && (
            <div className="px-4 mb-2 flex gap-2">
              <Link to="/login" onClick={() => setDrawer(false)} className="text-sm flex-1 text-center py-2.5 rounded-xl border border-dark-border text-slate-300 hover:text-white hover:border-slate-500 transition-all">Sign In</Link>
              <Link to="/register" onClick={() => setDrawer(false)} className="text-sm flex-1 text-center py-2.5 rounded-xl bg-brand text-dark font-semibold hover:opacity-90 transition-all">Sign Up</Link>
            </div>
          )}

          {/* Nav links */}
          <div className="px-3 py-1">
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest px-3 mb-2">Browse</p>
            {NAV_LINKS.map(({ to, label, icon }) => (
              <Link key={to} to={to} onClick={() => setDrawer(false)}
                className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all mb-0.5 ${
                  isActive(to) ? 'bg-brand/10 text-brand border border-brand/20' : 'text-slate-300 hover:bg-dark-hover hover:text-white'
                }`}>
                <span className="text-lg w-6 text-center">{icon}</span>
                {label}
              </Link>
            ))}
          </div>

          {user && (
            <div className="px-3 py-1 border-t border-dark-border mt-2 pt-3">
              <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest px-3 mb-2">Account</p>
              <Link to="/profile" onClick={() => setDrawer(false)}
                className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm text-slate-300 hover:bg-dark-hover hover:text-white transition-all mb-0.5">
                <span className="w-6 text-center">👤</span> Profile
              </Link>
              {(user as any).isAdmin && (
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

      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  )
}
