// frontend/src/components/Navbar.tsx — FULL REPLACEMENT
import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../context/authStore'
import api from '../services/api'   // ← use the configured axios instance, not bare axios

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
  const inputRef  = useRef<HTMLInputElement>(null)
  const debRef    = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    setDrawer(false); setSearchOpen(false); setUserMenu(false); setShowSug(false)
  }, [location.pathname])

  useEffect(() => {
    document.body.style.overflow = drawer ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [drawer])

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', fn)
    return () => window.removeEventListener('scroll', fn)
  }, [])

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowSug(false)
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  // ── Search autocomplete ──────────────────────────────────────────────────
  useEffect(() => {
    clearTimeout(debRef.current)
    if (!query.trim() || query.length < 2) {
      setSuggestions([])
      setShowSug(false)
      return
    }
    setSugLoading(true)
    debRef.current = setTimeout(async () => {
      try {
        // Use the configured `api` instance — it has the correct baseURL
        const { data } = await api.get('/movies/search', {
          params: { query: query.trim(), type: 'multi', page: 1 },
        })
        const results = (data.results || [])
          .filter((r: Suggestion) => r.media_type !== 'person' && (r.title || r.name))
          .slice(0, 6)
        setSuggestions(results)
        setShowSug(results.length > 0)
      } catch (err) {
        console.warn('[Search]', err)
        setSuggestions([])
      } finally {
        setSugLoading(false)
      }
    }, 300)
  }, [query])

  const goTo = (item: Suggestion) => {
    navigate(item.media_type === 'tv' ? `/tv/${item.id}` : `/movie/${item.id}`)
    setQuery(''); setShowSug(false); setSuggestions([])
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query.trim())}`)
      setQuery(''); setShowSug(false); setSearchOpen(false)
    }
  }

  const navLinks = [
    { to: '/',          label: 'Movies',    icon: '🎬' },
    { to: '/tv',        label: 'TV Shows',  icon: '📺' },
    { to: '/anime',     label: 'Anime',     icon: '🎌' },
    { to: '/watchlist', label: 'Watchlist', icon: '📌' },
  ]

  const SuggestionList = ({ mobile = false }: { mobile?: boolean }) =>
    showSug && suggestions.length > 0 ? (
      <div className={`${mobile ? 'mt-2' : 'absolute top-full left-0 right-0 mt-2'} bg-dark-surface border border-dark-border rounded-xl shadow-2xl overflow-hidden z-[60]`}>
        {suggestions.map((item, i) => (
          <button key={item.id} onMouseDown={() => goTo(item)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-dark-card active:bg-dark-card transition-colors ${
              i < suggestions.length - 1 ? 'border-b border-dark-border/50' : ''
            }`}>
            {item.poster_path
              ? <img src={IMG + item.poster_path} alt="" className="w-8 h-12 object-cover rounded flex-shrink-0 bg-dark-card" />
              : <div className="w-8 h-12 rounded bg-dark-card flex-shrink-0" />
            }
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white truncate">{item.title || item.name}</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                  item.media_type === 'tv' ? 'bg-blue-500/15 text-blue-400' : 'bg-brand/15 text-brand'
                }`}>
                  {item.media_type === 'tv' ? 'TV' : 'Movie'}
                </span>
                {(item.release_date || item.first_air_date) && (
                  <span className="text-xs text-slate-500">
                    {(item.release_date || item.first_air_date)!.slice(0, 4)}
                  </span>
                )}
                {item.vote_average
                  ? <span className="text-xs text-yellow-400">★ {item.vote_average.toFixed(1)}</span>
                  : null
                }
              </div>
            </div>
          </button>
        ))}
        <button
          onMouseDown={() => {
            navigate(`/search?q=${encodeURIComponent(query)}`)
            setShowSug(false); setQuery(''); setSearchOpen(false)
          }}
          className="w-full px-3 py-2.5 text-xs text-brand hover:bg-dark-card text-center font-semibold border-t border-dark-border">
          See all results for "{query}" →
        </button>
      </div>
    ) : null

  return (
    <>
      {/* ── Navbar bar ─────────────────────────────────────────────────── */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-dark/98 shadow-lg' : 'bg-gradient-to-b from-dark/95 to-transparent'
      }`}>
        <div className="h-14 px-4 flex items-center gap-2">
          <Link to="/" className="text-brand font-black text-xl tracking-tight flex-shrink-0">STREAMIX</Link>

          {/* Desktop links */}
          <div className="hidden md:flex gap-5 flex-1 ml-2">
            {navLinks.map(({ to, label }) => (
              <Link key={to} to={to} className={`text-sm transition-colors ${
                location.pathname === to ? 'text-white font-semibold' : 'text-slate-400 hover:text-white'
              }`}>{label}</Link>
            ))}
          </div>

          {/* Desktop search */}
          <div ref={searchRef} className="hidden md:block relative flex-1 max-w-sm">
            <form onSubmit={handleSearch}>
              <div className="flex items-center gap-2 bg-dark-surface border border-dark-border rounded-full px-3 py-1.5 focus-within:border-brand/60 transition-colors">
                {sugLoading
                  ? <div className="w-3 h-3 border border-slate-500 border-t-brand rounded-full animate-spin flex-shrink-0" />
                  : <span className="text-slate-500 text-xs flex-shrink-0">⌕</span>
                }
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onFocus={() => suggestions.length > 0 && setShowSug(true)}
                  placeholder="Search movies, shows, anime..."
                  className="bg-transparent outline-none text-sm text-white placeholder-slate-500 w-full"
                />
                {query && (
                  <button type="button" onClick={() => { setQuery(''); setSuggestions([]); setShowSug(false) }}
                    className="text-slate-500 hover:text-white text-xs">✕</button>
                )}
              </div>
            </form>
            <SuggestionList />
          </div>

          <div className="flex items-center gap-1 ml-auto">
            {/* Mobile search */}
            <button onClick={() => setSearchOpen(s => !s)}
              className="md:hidden w-10 h-10 flex items-center justify-center text-slate-300 hover:text-white active:bg-dark-card rounded-xl">
              {searchOpen
                ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
                : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              }
            </button>

            {/* Desktop user */}
            {user ? (
              <div className="relative hidden md:block">
                <button onClick={() => setUserMenu(!userMenu)}
                  className="flex items-center gap-2 bg-dark-card border border-dark-border rounded-full px-3 py-1.5 hover:border-brand transition-colors">
                  <div className="w-6 h-6 rounded-full bg-brand/20 flex items-center justify-center text-brand font-bold text-xs">
                    {user.username[0].toUpperCase()}
                  </div>
                  <span className="text-slate-300 text-xs">{user.username}</span>
                </button>
                {userMenu && (
                  <div className="absolute right-0 mt-2 w-44 bg-dark-surface border border-dark-border rounded-xl shadow-xl overflow-hidden z-50">
                    <Link to="/profile"   className="block px-4 py-2.5 text-sm text-slate-300 hover:bg-dark-card">Profile</Link>
                    <Link to="/watchlist" className="block px-4 py-2.5 text-sm text-slate-300 hover:bg-dark-card">Watchlist</Link>
                    {user.isAdmin && <Link to="/admin" className="block px-4 py-2.5 text-sm text-brand hover:bg-dark-card">Admin</Link>}
                    <div className="border-t border-dark-border" />
                    <button onClick={() => { logout(); navigate('/') }}
                      className="block w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-dark-card">Sign Out</button>
                  </div>
                )}
              </div>
            ) : (
              <div className="hidden md:flex gap-2">
                <Link to="/login"    className="btn-ghost text-xs px-3 py-1.5">Sign In</Link>
                <Link to="/register" className="btn-primary text-xs px-3 py-1.5">Sign Up</Link>
              </div>
            )}

            {/* Mobile hamburger */}
            <button onClick={() => { setDrawer(d => !d); setSearchOpen(false) }}
              className="md:hidden w-10 h-10 flex items-center justify-center text-slate-300 hover:text-white active:bg-dark-card rounded-xl">
              {drawer
                ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
                : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
              }
            </button>
          </div>
        </div>

        {/* Mobile search bar */}
        {searchOpen && (
          <div className="md:hidden bg-dark/98 border-b border-dark-border px-4 pb-3">
            <form onSubmit={handleSearch}>
              <div className="flex items-center gap-3 bg-dark-surface border border-dark-border rounded-xl px-4 py-3">
                {sugLoading
                  ? <div className="w-4 h-4 border border-slate-500 border-t-brand rounded-full animate-spin flex-shrink-0" />
                  : <span className="text-slate-400 text-base">⌕</span>
                }
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  autoFocus
                  placeholder="Search movies, shows, anime..."
                  className="bg-transparent outline-none text-base text-white placeholder-slate-500 flex-1"
                />
                {query && (
                  <button type="button" onClick={() => { setQuery(''); setSuggestions([]) }}
                    className="text-slate-400 hover:text-white text-base">✕</button>
                )}
              </div>
            </form>
            <div ref={searchRef}><SuggestionList mobile /></div>
          </div>
        )}
      </nav>

      {/* ── Drawer backdrop ─────────────────────────────────────────────── */}
      <div
        className={`md:hidden fixed inset-0 z-[60] bg-black/70 transition-opacity duration-300 ${
          drawer ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setDrawer(false)}
      />

      {/* ── Drawer panel ────────────────────────────────────────────────── */}
      <div className={`md:hidden fixed top-0 right-0 h-full w-72 max-w-[82vw] bg-[#0d1117] z-[70] transform transition-transform duration-300 ease-in-out ${
        drawer ? 'translate-x-0' : 'translate-x-full'
      } flex flex-col`}>
        <div className="flex items-center justify-between px-5 h-14 border-b border-dark-border flex-shrink-0">
          <span className="text-brand font-black text-lg tracking-tight">Menu</span>
          <button onClick={() => setDrawer(false)}
            className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-white active:bg-dark-card rounded-xl">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {user ? (
            <div className="px-5 py-4 border-b border-dark-border bg-dark-card/40">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-brand/20 flex items-center justify-center text-brand font-black text-xl flex-shrink-0">
                  {user.username[0].toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-bold text-white">{user.username}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{user.isAdmin ? '👑 Admin' : 'Member'}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="px-5 py-4 border-b border-dark-border flex gap-3">
              <Link to="/login"    onClick={() => setDrawer(false)} className="btn-ghost text-sm flex-1 text-center py-2.5">Sign In</Link>
              <Link to="/register" onClick={() => setDrawer(false)} className="btn-primary text-sm flex-1 text-center py-2.5">Sign Up</Link>
            </div>
          )}

          <div className="py-2">
            <p className="px-5 pt-2 pb-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">Browse</p>
            {navLinks.map(({ to, label, icon }) => (
              <Link key={to} to={to} onClick={() => setDrawer(false)}
                className={`flex items-center gap-4 px-5 py-3.5 text-[15px] transition-colors active:bg-dark-card/80 ${
                  location.pathname === to
                    ? 'text-brand font-semibold bg-brand/5 border-r-2 border-brand'
                    : 'text-slate-200 hover:bg-dark-card/60'
                }`}>
                <span className="text-xl w-7 text-center flex-shrink-0">{icon}</span>
                {label}
              </Link>
            ))}
          </div>

          {user && (
            <div className="py-2 border-t border-dark-border">
              <p className="px-5 pt-2 pb-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">Account</p>
              <Link to="/profile" onClick={() => setDrawer(false)}
                className="flex items-center gap-4 px-5 py-3.5 text-[15px] text-slate-200 hover:bg-dark-card/60 active:bg-dark-card/80 transition-colors">
                <span className="text-xl w-7 text-center flex-shrink-0">👤</span> Profile
              </Link>
              {user.isAdmin && (
                <Link to="/admin" onClick={() => setDrawer(false)}
                  className="flex items-center gap-4 px-5 py-3.5 text-[15px] text-brand hover:bg-dark-card/60 active:bg-dark-card/80 transition-colors">
                  <span className="text-xl w-7 text-center flex-shrink-0">👑</span> Admin Panel
                </Link>
              )}
              <button onClick={() => { logout(); navigate('/'); setDrawer(false) }}
                className="flex items-center gap-4 px-5 py-3.5 text-[15px] text-red-400 hover:bg-dark-card/60 active:bg-dark-card/80 transition-colors w-full text-left">
                <span className="text-xl w-7 text-center flex-shrink-0">🚪</span> Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
