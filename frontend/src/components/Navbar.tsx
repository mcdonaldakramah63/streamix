import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../context/authStore'
import axios from 'axios'

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
  const navigate = useNavigate()
  const location = useLocation()

  const [scrolled,     setScrolled]     = useState(false)
  const [query,        setQuery]        = useState('')
  const [suggestions,  setSuggestions]  = useState<Suggestion[]>([])
  const [showSug,      setShowSug]      = useState(false)
  const [sugLoading,   setSugLoading]   = useState(false)
  const [activeSug,    setActiveSug]    = useState(-1)
  const [menuOpen,     setMenuOpen]     = useState(false)

  const searchRef  = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLInputElement>(null)
  const debounceRef= useRef<ReturnType<typeof setTimeout>>()

  // Scroll shadow
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', fn)
    return () => window.removeEventListener('scroll', fn)
  }, [])

  // Close menu on route change
  useEffect(() => { setMenuOpen(false) }, [location.pathname])

  // Close suggestions on outside click
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSug(false)
        setActiveSug(-1)
      }
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  // Debounced search suggestions
  useEffect(() => {
    clearTimeout(debounceRef.current)
    if (!query.trim() || query.length < 2) {
      setSuggestions([])
      setShowSug(false)
      return
    }
    setSugLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await axios.get(`/api/movies/search`, {
          params: { query: query.trim(), type: 'multi', page: 1 }
        })
        const results = (data.results || [])
          .filter((r: Suggestion) => r.media_type !== 'person' && (r.title || r.name))
          .slice(0, 8)
        setSuggestions(results)
        setShowSug(true)
      } catch {
        setSuggestions([])
      } finally {
        setSugLoading(false)
      }
    }, 280)
  }, [query])

  const goTo = (item: Suggestion) => {
    const path = item.media_type === 'tv' ? `/tv/${item.id}` : `/movie/${item.id}`
    navigate(path)
    setQuery('')
    setShowSug(false)
    setSuggestions([])
    setActiveSug(-1)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (activeSug >= 0 && suggestions[activeSug]) {
      goTo(suggestions[activeSug])
    } else if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query.trim())}`)
      setQuery('')
      setShowSug(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSug || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveSug(i => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveSug(i => Math.max(i - 1, -1))
    } else if (e.key === 'Escape') {
      setShowSug(false)
      setActiveSug(-1)
    }
  }

  const year = (d?: string) => d?.slice(0, 4) ?? ''

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-dark/98 shadow-lg' : 'bg-gradient-to-b from-dark/90 to-transparent'}`}>
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-4">
        <Link to="/" className="text-brand font-black text-xl tracking-tight flex-shrink-0">STREAMIX</Link>

        {/* Nav links */}
        <div className="hidden md:flex gap-5 flex-1">
          {[['/', 'Movies'], ['/tv', 'TV Shows'], ['/anime', 'Anime'], ['/watchlist', 'Watchlist']].map(([to, label]) => (
            <Link key={to} to={to}
              className={`text-sm transition-colors ${location.pathname === to ? 'text-white font-semibold' : 'text-slate-400 hover:text-white'}`}>
              {label}
            </Link>
          ))}
        </div>

        {/* Search with suggestions */}
        <div ref={searchRef} className="relative flex-1 max-w-sm">
          <form onSubmit={handleSubmit}>
            <div className="flex items-center gap-2 bg-dark-surface border border-dark-border rounded-full px-3 py-1.5 focus-within:border-brand/60 transition-colors">
              {sugLoading
                ? <div className="w-3 h-3 border border-slate-500 border-t-brand rounded-full animate-spin flex-shrink-0" />
                : <span className="text-slate-500 text-xs flex-shrink-0">⌕</span>
              }
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => suggestions.length > 0 && setShowSug(true)}
                placeholder="Search movies, shows, anime..."
                className="bg-transparent outline-none text-sm text-white placeholder-slate-500 w-full"
              />
              {query && (
                <button type="button" onClick={() => { setQuery(''); setSuggestions([]); setShowSug(false); inputRef.current?.focus() }}
                  className="text-slate-500 hover:text-white text-xs flex-shrink-0 transition-colors">✕</button>
              )}
            </div>
          </form>

          {/* Suggestions dropdown */}
          {showSug && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-dark-surface border border-dark-border rounded-xl shadow-2xl overflow-hidden z-50">
              {suggestions.map((item, i) => {
                const title  = item.title || item.name || ''
                const date   = item.release_date || item.first_air_date || ''
                const isTV   = item.media_type === 'tv'
                const active = i === activeSug
                return (
                  <button key={item.id} onMouseDown={() => goTo(item)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${active ? 'bg-brand/10' : 'hover:bg-dark-card'} ${i < suggestions.length - 1 ? 'border-b border-dark-border/50' : ''}`}>
                    {/* Poster thumbnail */}
                    {item.poster_path ? (
                      <img src={IMG + item.poster_path} alt="" className="w-8 h-12 object-cover rounded flex-shrink-0 bg-dark-card" />
                    ) : (
                      <div className="w-8 h-12 rounded bg-dark-card flex-shrink-0 flex items-center justify-center text-slate-600 text-xs">?</div>
                    )}
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-100 truncate">{title}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${isTV ? 'bg-blue-500/15 text-blue-400' : 'bg-brand/15 text-brand'}`}>
                          {isTV ? 'TV' : 'Movie'}
                        </span>
                        {date && <span className="text-xs text-slate-500">{year(date)}</span>}
                        {item.vote_average ? <span className="text-xs text-yellow-400">★ {item.vote_average.toFixed(1)}</span> : null}
                      </div>
                    </div>
                    <span className="text-slate-600 text-xs flex-shrink-0">→</span>
                  </button>
                )
              })}
              {/* View all results */}
              <button onMouseDown={() => { navigate(`/search?q=${encodeURIComponent(query)}`); setShowSug(false); setQuery('') }}
                className="w-full px-3 py-2.5 text-xs text-brand hover:bg-dark-card transition-colors text-center font-semibold border-t border-dark-border">
                View all results for "{query}" →
              </button>
            </div>
          )}

          {/* No results state */}
          {showSug && !sugLoading && query.length >= 2 && suggestions.length === 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-dark-surface border border-dark-border rounded-xl shadow-2xl p-4 text-center z-50">
              <p className="text-sm text-slate-500">No results for "{query}"</p>
            </div>
          )}
        </div>

        {/* Auth */}
        <div className="flex items-center gap-2">
          {user ? (
            <div className="relative">
              <button onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-2 bg-dark-card border border-dark-border rounded-full px-3 py-1.5 text-sm hover:border-brand transition-colors">
                <div className="w-6 h-6 rounded-full bg-brand/20 flex items-center justify-center text-brand font-bold text-xs">
                  {user.username[0].toUpperCase()}
                </div>
                <span className="hidden sm:inline text-slate-300 text-xs">{user.username}</span>
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-44 bg-dark-surface border border-dark-border rounded-xl shadow-xl overflow-hidden z-50">
                  <Link to="/profile"   className="block px-4 py-2.5 text-sm text-slate-300 hover:bg-dark-card hover:text-white">Profile</Link>
                  <Link to="/watchlist" className="block px-4 py-2.5 text-sm text-slate-300 hover:bg-dark-card hover:text-white">My Watchlist</Link>
                  <Link to="/anime"     className="block px-4 py-2.5 text-sm text-slate-300 hover:bg-dark-card hover:text-white">Anime</Link>
                  {user.isAdmin && <Link to="/admin" className="block px-4 py-2.5 text-sm text-brand hover:bg-dark-card">Admin Panel</Link>}
                  <div className="border-t border-dark-border" />
                  <button onClick={() => { logout(); navigate('/') }} className="block w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-dark-card">Sign Out</button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex gap-2">
              <Link to="/login"    className="btn-ghost text-xs px-3 py-1.5">Sign In</Link>
              <Link to="/register" className="btn-primary text-xs px-3 py-1.5">Sign Up</Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
