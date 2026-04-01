// frontend/src/components/Navbar.tsx — FULL REPLACEMENT
import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore }    from '../context/authStore'
import { useProfileStore } from '../stores/profileStore'
import api from '../services/api'

const IMG = (p: string) => `https://image.tmdb.org/t/p/w92${p}`

const NAV_LINKS = [
  { to: '/',          label: 'Home'      },
  { to: '/movies',    label: 'Movies'    },
  { to: '/tv',        label: 'TV Shows'  },
  { to: '/anime',     label: 'Anime'     },
  { to: '/watchlist', label: 'Watchlist' },
  { to: '/downloads', label: 'Downloads' },
]

interface SearchResult {
  id:          number
  title?:      string
  name?:       string
  media_type:  string
  poster_path: string | null
  release_date?:    string
  first_air_date?:  string
  vote_average?: number
}

export default function Navbar() {
  const navigate   = useNavigate()
  const location   = useLocation()
  const { user, logout }              = useAuthStore()
  const { activeProfile, profiles, setActive } = useProfileStore()

  const [scrolled,   setScrolled]   = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userOpen,   setUserOpen]   = useState(false)
  const [query,      setQuery]      = useState('')
  const [results,    setResults]    = useState<SearchResult[]>([])
  const [searching,  setSearching]  = useState(false)
  const [showDrop,   setShowDrop]   = useState(false)
  const [listening,  setListening]  = useState(false)

  const searchRef    = useRef<HTMLDivElement>(null)
  const userRef      = useRef<HTMLDivElement>(null)
  const debounceRef  = useRef<ReturnType<typeof setTimeout>>()
  const recognRef    = useRef<any>(null)

  // ── Scroll shadow ─────────────────────────────────────────────────────────
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  // ── Close on route change ─────────────────────────────────────────────────
  useEffect(() => {
    setMobileOpen(false)
    setUserOpen(false)
    setShowDrop(false)
    setQuery('')
    setResults([])
  }, [location.pathname])

  // ── Lock scroll when mobile menu open ─────────────────────────────────────
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  // ── Click outside to close dropdowns ──────────────────────────────────────
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDrop(false)
      }
      if (userRef.current && !userRef.current.contains(e.target as Node)) {
        setUserOpen(false)
      }
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  // ── Debounced search ──────────────────────────────────────────────────────
  useEffect(() => {
    clearTimeout(debounceRef.current)
    const q = query.trim()
    if (q.length < 2) { setResults([]); setShowDrop(false); return }

    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get('/movies/search', {
          params: { query: q, type: 'multi', page: 1 },
        })
        const filtered = (data.results || [])
          .filter((r: SearchResult) => r.media_type !== 'person' && (r.title || r.name))
          .slice(0, 6)
        setResults(filtered)
        setShowDrop(filtered.length > 0)
      } catch { /* silent */ } finally { setSearching(false) }
    }, 280)
  }, [query])

  // ── Voice search ──────────────────────────────────────────────────────────
  const startVoice = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    if (recognRef.current) { recognRef.current.stop(); recognRef.current = null; setListening(false); return }
    const r = new SR()
    recognRef.current = r
    r.lang = 'en-US'
    r.interimResults = false
    r.onstart  = () => setListening(true)
    r.onend    = () => { setListening(false); recognRef.current = null }
    r.onresult = (e: any) => {
      const text = e.results[0]?.[0]?.transcript || ''
      if (text) { setQuery(text) }
    }
    r.start()
  }, [])

  // ── Helpers ───────────────────────────────────────────────────────────────
  const isActive = (to: string) =>
    to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)

  const goResult = (r: SearchResult) => {
    navigate(r.media_type === 'tv' ? `/tv/${r.id}` : `/movie/${r.id}`)
    setQuery(''); setResults([]); setShowDrop(false)
  }

  const goSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query.trim())}`)
      setQuery(''); setResults([]); setShowDrop(false); setMobileOpen(false)
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/')
    setUserOpen(false)
    setMobileOpen(false)
  }

  // ── Search dropdown ───────────────────────────────────────────────────────
  const SearchDropdown = () => showDrop && results.length > 0 ? (
    <div className="absolute top-full left-0 right-0 mt-1.5 rounded-2xl overflow-hidden z-50 shadow-deep"
      style={{ background:'rgba(7,8,12,0.98)', border:'1px solid rgba(255,255,255,0.08)' }}>
      {results.map((r, i) => (
        <button key={r.id} onClick={() => goResult(r)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-dark-hover transition-colors ${i < results.length - 1 ? 'border-b border-dark-border/50' : ''}`}>
          <div className="w-8 h-11 rounded-lg overflow-hidden bg-dark-card flex-shrink-0">
            {r.poster_path
              ? <img src={IMG(r.poster_path)} alt="" className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-base">{r.media_type === 'tv' ? '📺' : '🎬'}</div>}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{r.title || r.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${r.media_type === 'tv' ? 'bg-blue-500/20 text-blue-300' : 'bg-brand/20 text-brand'}`}>
                {r.media_type === 'tv' ? 'TV' : 'Movie'}
              </span>
              {(r.release_date || r.first_air_date) && (
                <span className="text-[10px] text-slate-500">{(r.release_date || r.first_air_date)?.slice(0,4)}</span>
              )}
              {(r.vote_average || 0) > 0 && (
                <span className="text-[10px] text-gold">★ {r.vote_average?.toFixed(1)}</span>
              )}
            </div>
          </div>
        </button>
      ))}
      <button onClick={goSearch}
        className="w-full py-2.5 text-center text-xs text-brand font-semibold hover:bg-dark-hover border-t border-dark-border transition-colors">
        See all results for "{query}" →
      </button>
    </div>
  ) : null

  return (
    <>
      {/* ── Main nav ── */}
      <nav
        role="navigation"
        aria-label="Main navigation"
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled ? 'shadow-deep' : ''
        }`}
        style={{
          background: scrolled
            ? 'rgba(7,8,12,0.97)'
            : 'linear-gradient(to bottom,rgba(7,8,12,0.92),transparent)',
          backdropFilter: scrolled ? 'blur(16px)' : 'none',
        }}
      >
        <div className="h-16 flex items-center gap-3 px-4 sm:px-6 max-w-[1800px] mx-auto">

          {/* Logo */}
          <Link to="/" aria-label="Streamix Home"
            className="flex-shrink-0 text-brand font-black text-xl tracking-tight mr-2"
            style={{ fontFamily:'Syne, sans-serif', letterSpacing:'-0.02em' }}>
            STREAMIX
          </Link>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-0.5">
            {NAV_LINKS.map(link => (
              <Link key={link.to} to={link.to}
                className={`px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150 ${
                  isActive(link.to)
                    ? 'text-white bg-white/10'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}>
                {link.label}
              </Link>
            ))}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Desktop search */}
          <div ref={searchRef} className="hidden md:block relative w-64 lg:w-80">
            <form onSubmit={goSearch}>
              <div className={`flex items-center gap-2 rounded-xl px-3 py-2 transition-all duration-200 ${
                showDrop || query ? 'ring-1 ring-brand/50' : ''
              }`} style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.08)' }}>
                {searching
                  ? <div className="w-3.5 h-3.5 border border-slate-500 border-t-brand rounded-full animate-spin flex-shrink-0" />
                  : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-500 flex-shrink-0">
                      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                    </svg>
                  )}
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onFocus={() => results.length && setShowDrop(true)}
                  placeholder="Search movies, shows…"
                  aria-label="Search"
                  className="bg-transparent outline-none text-sm text-white placeholder-slate-500 w-full min-w-0"
                />
                {query && (
                  <button type="button" onClick={() => { setQuery(''); setResults([]); setShowDrop(false) }}
                    className="text-slate-500 hover:text-white flex-shrink-0 text-xs">✕</button>
                )}
                {/* Voice search */}
                {(window as any).SpeechRecognition || (window as any).webkitSpeechRecognition ? (
                  <button type="button" onClick={startVoice}
                    className={`flex-shrink-0 transition-colors ${listening ? 'text-red-400' : 'text-slate-500 hover:text-white'}`}
                    aria-label="Voice search">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/>
                    </svg>
                  </button>
                ) : null}
              </div>
            </form>
            <SearchDropdown />
          </div>

          {/* Desktop auth */}
          <div className="hidden md:flex items-center gap-2 flex-shrink-0">
            {user ? (
              <div ref={userRef} className="relative">
                <button onClick={() => setUserOpen(u => !u)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/5 transition-colors"
                  aria-expanded={userOpen} aria-haspopup="true">
                  <div className="w-7 h-7 rounded-full bg-brand/20 flex items-center justify-center text-brand font-bold text-sm flex-shrink-0">
                    {(activeProfile?.avatar || user.username?.[0] || 'U').slice(0,2)}
                  </div>
                  <span className="text-sm font-medium text-slate-300 max-w-[100px] truncate">
                    {activeProfile?.name || user.username}
                  </span>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                    className={`text-slate-500 transition-transform ${userOpen ? 'rotate-180' : ''}`}>
                    <path d="m6 9 6 6 6-6"/>
                  </svg>
                </button>

                {userOpen && (
                  <div className="absolute right-0 top-full mt-2 w-52 rounded-2xl overflow-hidden shadow-deep z-50"
                    style={{ background:'rgba(7,8,12,0.98)', border:'1px solid rgba(255,255,255,0.08)' }}>

                    {/* Profile switcher */}
                    {profiles.length > 1 && (
                      <div className="px-3 py-2 border-b border-dark-border">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">Profiles</p>
                        {profiles.map(p => (
                          <button key={p._id} onClick={() => { setActive(p); setUserOpen(false) }}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                              activeProfile?._id === p._id ? 'text-brand bg-brand/10' : 'text-slate-300 hover:bg-dark-hover'
                            }`}>
                            <span>{p.avatar || '🎬'}</span>
                            <span className="truncate">{p.name}</span>
                            {activeProfile?._id === p._id && <span className="ml-auto">✓</span>}
                          </button>
                        ))}
                      </div>
                    )}

                    <Link to="/profile" className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-300 hover:bg-dark-hover hover:text-white transition-colors">
                      <span>👤</span> Profile
                    </Link>
                    <Link to="/watchlist" className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-300 hover:bg-dark-hover hover:text-white transition-colors">
                      <span>🔖</span> Watchlist
                    </Link>
                    <Link to="/downloads" className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-300 hover:bg-dark-hover hover:text-white transition-colors">
                      <span>📥</span> Downloads
                    </Link>
                    {user.isAdmin && (
                      <Link to="/admin" className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-brand hover:bg-dark-hover transition-colors">
                        <span>👑</span> Admin Panel
                      </Link>
                    )}
                    <div className="border-t border-dark-border" />
                    <button onClick={handleLogout}
                      className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-red-400 hover:bg-dark-hover transition-colors text-left">
                      <span>🚪</span> Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link to="/login"
                  className="px-4 py-2 rounded-xl text-sm font-medium text-slate-300 hover:text-white hover:bg-white/5 transition-colors">
                  Sign In
                </Link>
                <Link to="/register"
                  className="btn-primary px-4 py-2 text-sm">
                  Sign Up
                </Link>
              </div>
            )}
          </div>

          {/* Mobile: search icon + hamburger */}
          <div className="flex items-center gap-1 md:hidden">
            <button onClick={() => { setMobileOpen(false); navigate('/search') }}
              className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              aria-label="Search">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
            </button>
            <button onClick={() => setMobileOpen(m => !m)}
              className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}>
              {mobileOpen ? (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6 6 18M6 6l12 12"/>
                </svg>
              ) : (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
                </svg>
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* ── Mobile menu backdrop ── */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)} aria-hidden="true" />
      )}

      {/* ── Mobile drawer ── */}
      <div className={`md:hidden fixed top-0 right-0 bottom-0 w-72 max-w-[85vw] z-50 flex flex-col transition-transform duration-300 ${mobileOpen ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ background:'rgba(7,8,12,0.99)', backdropFilter:'blur(20px)', borderLeft:'1px solid rgba(255,255,255,0.08)' }}
        role="dialog" aria-label="Navigation menu" aria-modal="true">

        {/* Drawer header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-dark-border flex-shrink-0">
          <span className="text-brand font-black text-lg" style={{ fontFamily:'Syne, sans-serif' }}>STREAMIX</span>
          <button onClick={() => setMobileOpen(false)} aria-label="Close menu"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Drawer content */}
        <div className="flex-1 overflow-y-auto py-2">
          {/* User info */}
          {user ? (
            <div className="mx-3 mb-3 p-3 rounded-2xl" style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-brand/20 flex items-center justify-center text-brand font-bold text-xl flex-shrink-0">
                  {(activeProfile?.avatar || user.username?.[0] || 'U').slice(0,2)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{activeProfile?.name || user.username}</p>
                  <p className="text-xs text-slate-500 truncate">{user.email}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="mx-3 mb-3 flex gap-2">
              <Link to="/login" onClick={() => setMobileOpen(false)}
                className="flex-1 text-center py-2.5 rounded-xl text-sm font-medium text-slate-300 border border-dark-border hover:border-slate-600 transition-colors">
                Sign In
              </Link>
              <Link to="/register" onClick={() => setMobileOpen(false)}
                className="flex-1 text-center py-2.5 rounded-xl text-sm font-bold btn-primary">
                Sign Up
              </Link>
            </div>
          )}

          {/* Nav links */}
          <div className="px-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 px-2 mb-2">Browse</p>
            {NAV_LINKS.map(link => (
              <Link key={link.to} to={link.to} onClick={() => setMobileOpen(false)}
                className={`flex items-center px-3 py-3 rounded-xl text-sm font-medium transition-all mb-0.5 ${
                  isActive(link.to)
                    ? 'bg-brand/10 text-brand border border-brand/20'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}>
                {link.label}
              </Link>
            ))}
          </div>

          {/* Account links */}
          {user && (
            <div className="px-3 mt-3 border-t border-dark-border pt-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 px-2 mb-2">Account</p>
              <Link to="/profile" onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors mb-0.5">
                <span>👤</span> Profile
              </Link>
              {user.isAdmin && (
                <Link to="/admin" onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm text-brand hover:bg-white/5 transition-colors mb-0.5">
                  <span>👑</span> Admin Panel
                </Link>
              )}
              <button onClick={handleLogout}
                className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-sm text-red-400 hover:bg-white/5 transition-colors text-left">
                <span>🚪</span> Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
