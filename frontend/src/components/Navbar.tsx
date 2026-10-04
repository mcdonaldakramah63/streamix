// frontend/src/components/Navbar.tsx — glass top bar + floating mobile tab bar (Stitch design)
import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../context/authStore'
import { useProfileStore, Profile } from '../stores/profileStore'
import { useDownloadStore } from '../stores/downloadStore'
import { logout } from '../services/session'
import api from '../services/api'
import NotificationBell from './NotificationBell'
import Icon from './Icon'
import Avatar from './avatar/ProfileAvatar'
import Logo from './Logo'
import VoiceSearch from './VoiceSearch'

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
  { to: '/',          label: 'Home'     },
  { to: '/movies',    label: 'Movies'   },
  { to: '/tv',        label: 'TV Shows' },
  { to: '/anime',     label: 'Anime'    },
  { to: '/new',       label: 'New & Hot'},
  { to: '/watchlist', label: 'My List'  },
  { to: '/downloads', label: 'Downloads'},
]

const TABS = [
  { to: '/',          label: 'Home',      icon: 'movie' },
  { to: '/search',    label: 'Explore',   icon: 'explore' },
  { to: '/downloads', label: 'Downloads', icon: 'download_for_offline' },
  { to: '/watchlist', label: 'My List',   icon: 'bookmark' },
  { to: '/profile',   label: 'Profile',   icon: 'person' },
]

function ProfileAvatar({ p, size = 'w-8 h-8 text-base' }: { p: Profile | null; size?: string }) {
  const dims = size.split(' ').filter(c => c.startsWith('w-') || c.startsWith('h-')).join(' ')
  const text = size.split(' ').find(c => c.startsWith('text-')) || 'text-base'
  return <Avatar p={p} className={`${dims} rounded-full`} emojiSize={text} ring />
}

export default function Navbar() {
  const user = useAuthStore(s => s.user)
  const { activeProfile, profiles, setActive } = useProfileStore()
  const downloading = useDownloadStore(s => s.downloads.some(d => d.status === 'downloading'))
  const navigate  = useNavigate()
  const location  = useLocation()

  const [scrolled,    setScrolled]    = useState(false)
  const [query,       setQuery]       = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [showSug,     setShowSug]     = useState(false)
  const [sugLoading,  setSugLoading]  = useState(false)
  const [menu,        setMenu]        = useState(false)
  const [searchOpen,  setSearchOpen]  = useState(false)

  const searchRef = useRef<HTMLDivElement>(null)
  const menuRef   = useRef<HTMLDivElement>(null)
  const debRef    = useRef<ReturnType<typeof setTimeout>>()

  const isKids = !!activeProfile?.isKids

  useEffect(() => {
    setSearchOpen(false); setMenu(false); setShowSug(false); setQuery('')
  }, [location.pathname])

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 24)
    fn()
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowSug(false)
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false)
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  // Debounced search suggestions
  useEffect(() => {
    clearTimeout(debRef.current)
    if (query.trim().length < 2) { setSuggestions([]); setShowSug(false); setSugLoading(false); return }
    setSugLoading(true)
    debRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get('/movies/search', { params: { query: query.trim(), type: 'multi', page: 1 } })
        const results = (data.results || [])
          .filter((r: Suggestion) => r.media_type !== 'person' && (r.title || r.name))
          .slice(0, 6)
        setSuggestions(results)
        setShowSug(results.length > 0)
      } catch { setSuggestions([]) }
      finally { setSugLoading(false) }
    }, 280)
    return () => clearTimeout(debRef.current)
  }, [query])

  // Pages that render their own chrome
  const hidden = location.pathname === '/kids' || location.pathname.startsWith('/player/') || location.pathname.startsWith('/watch/')
  if (hidden) return null

  const goTo = (item: Suggestion) => {
    navigate(item.media_type === 'tv' ? `/tv/${item.id}` : `/movie/${item.id}`)
    setQuery(''); setShowSug(false)
  }

  const submitSearch = (text = query) => {
    if (!text.trim()) return
    navigate(`/search?q=${encodeURIComponent(text.trim())}`)
    setQuery(''); setShowSug(false); setSearchOpen(false)
  }

  const isActive = (to: string) => (to === '/' ? location.pathname === '/' : location.pathname.startsWith(to))

  const switchProfile = async (p: Profile) => {
    setMenu(false)
    const ok = await setActive(p)
    if (ok) navigate(p.isKids ? '/kids' : '/')
  }

  const renderSuggestions = () =>
    showSug && suggestions.length > 0 ? (
      <div className="absolute top-full left-0 right-0 mt-2 glass rounded-2xl overflow-hidden z-50 shadow-deep animate-slide-down">
        {suggestions.map(item => (
          <button key={`${item.media_type}-${item.id}`} onMouseDown={() => goTo(item)}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/[0.06] transition-colors">
            <div className="w-8 h-12 rounded-md overflow-hidden bg-dark-card flex-shrink-0">
              {item.poster_path
                ? <img src={IMG + item.poster_path} alt="" className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-ink-faint"><Icon name="movie" size={16} /></div>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{item.title || item.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-tech-pill uppercase px-1.5 py-0.5 rounded-full ${item.media_type === 'tv' ? 'bg-cyan/15 text-cyan' : 'bg-brand/20 text-brand-soft'}`}>
                  {item.media_type === 'tv' ? 'TV' : 'Movie'}
                </span>
                {(item.release_date || item.first_air_date) && (
                  <span className="text-[11px] text-ink-faint">{(item.release_date || item.first_air_date)!.slice(0, 4)}</span>
                )}
                {item.vote_average ? <span className="text-[11px] text-gold font-bold">★ {item.vote_average.toFixed(1)}</span> : null}
              </div>
            </div>
          </button>
        ))}
        <button onMouseDown={() => submitSearch()}
          className="w-full px-4 py-3 text-xs text-brand-soft hover:bg-white/[0.06] text-center font-bold border-t border-white/[0.06]">
          See all results for “{query}” →
        </button>
      </div>
    ) : null

  const renderSearchBox = (autoFocus = false) => (
    <form onSubmit={e => { e.preventDefault(); submitSearch() }}>
      <div className="flex items-center gap-2.5 h-11 rounded-xl px-3.5 transition-all focus-within:shadow-[0_0_0_3px_rgba(229,9,20,0.15)]"
        style={{ background: 'rgba(20,26,38,0.6)', border: '1px solid rgba(255,255,255,0.08)' }}>
        {sugLoading
          ? <div className="w-4 h-4 border-2 border-white/10 border-t-brand rounded-full animate-spin flex-shrink-0" />
          : <Icon name="search" size={20} className="text-ink-faint flex-shrink-0" />}
        <input
          autoFocus={autoFocus}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => suggestions.length && setShowSug(true)}
          placeholder="Search movies, shows, anime…"
          className="bg-transparent outline-none text-white placeholder-slate-500 w-full"
          style={{ fontSize: 15 }}
        />
        {query && (
          <button type="button" aria-label="Clear" onClick={() => { setQuery(''); setSuggestions([]); setShowSug(false) }}
            className="text-ink-faint hover:text-white"><Icon name="close" size={18} /></button>
        )}
        <VoiceSearch onResult={(text) => { setQuery(text); submitSearch(text) }} />
      </div>
    </form>
  )

  return (
    <>
      {/* ── Top bar ── */}
      <header className={`fixed top-0 inset-x-0 z-50 transition-all duration-500 ${
        scrolled ? 'bg-dark-void/85 backdrop-blur-xl shadow-[0_4px_24px_rgba(0,0,0,0.6)]' : 'bg-gradient-to-b from-dark-void/90 to-transparent'
      }`}>
        <div className="h-16 px-3 sm:px-6 lg:px-12 flex items-center gap-2 sm:gap-4 max-w-[1800px] mx-auto">
          <Link to={isKids ? '/kids' : '/'} className="flex-shrink-0" aria-label="Streamix home"><Logo /></Link>

          {!isKids && (
            <nav className="hidden xl:flex items-center gap-1 ml-4">
              {NAV_LINKS.map(({ to, label }) => (
                <Link key={to} to={to}
                  className={`relative px-3 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${
                    isActive(to) ? 'text-white' : 'text-ink-muted hover:text-white'
                  }`}>
                  {label}
                  {isActive(to) && <span className="absolute left-1/2 -translate-x-1/2 -bottom-0.5 w-1.5 h-1.5 rounded-full bg-brand shadow-[0_0_8px_#e50914]" />}
                </Link>
              ))}
            </nav>
          )}

          {!isKids && (
            <div ref={searchRef} className="hidden md:block relative flex-1 max-w-md ml-auto">
              {renderSearchBox()}
              {renderSuggestions()}
            </div>
          )}

          <div className={`flex items-center gap-1.5 ${isKids ? 'ml-auto' : 'md:ml-0 ml-auto'}`}>
            {!isKids && (
              <button onClick={() => setSearchOpen(s => !s)} aria-label="Search"
                className="md:hidden w-11 h-11 flex items-center justify-center rounded-full text-ink-muted hover:text-white">
                <Icon name={searchOpen ? 'close' : 'search'} size={22} />
              </button>
            )}

            {user && !isKids && <NotificationBell />}
            {user ? (
              <div ref={menuRef} className="relative">
                <button onClick={() => setMenu(m => !m)} aria-label="Account menu" aria-expanded={menu}
                  className="flex items-center gap-2 pl-1.5 pr-2 py-1.5 rounded-full hover:bg-white/[0.06] transition-colors">
                  <ProfileAvatar p={activeProfile} />
                  <span className="hidden sm:block text-sm font-semibold text-ink max-w-[100px] truncate">
                    {activeProfile?.name || user.username}
                  </span>
                  <Icon name="expand_more" size={18} className={`text-ink-faint transition-transform ${menu ? 'rotate-180' : ''}`} />
                </button>

                {menu && (
                  <div className="absolute right-0 mt-2 w-64 glass rounded-2xl overflow-hidden shadow-deep z-50 animate-slide-down">
                    <div className="px-4 py-3 border-b border-white/[0.06]">
                      <p className="text-sm font-bold text-white">{user.username}</p>
                      <p className="text-xs text-ink-faint truncate">{user.email}</p>
                    </div>

                    {profiles.length > 0 && (
                      <div className="py-1.5 border-b border-white/[0.06]">
                        <p className="text-label-sm uppercase text-ink-faint px-4 pt-1 pb-1.5">Switch profile</p>
                        {profiles.map(p => (
                          <button key={p._id} onClick={() => switchProfile(p)}
                            className={`w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-white/[0.06] ${activeProfile?._id === p._id ? 'bg-brand/10' : ''}`}>
                            <ProfileAvatar p={p} size="w-7 h-7 text-sm" />
                            <span className="flex-1 text-sm font-semibold text-ink truncate">{p.name}</span>
                            {p.isKids && <span className="text-tech-pill uppercase text-gold">Kids</span>}
                            {p.hasPin && <Icon name="lock" size={14} className="text-ink-faint" />}
                            {activeProfile?._id === p._id && <span className="w-1.5 h-1.5 rounded-full bg-brand shadow-[0_0_6px_#e50914]" />}
                          </button>
                        ))}
                      </div>
                    )}

                    {!isKids && (
                      <div className="py-1.5">
                        <Link to="/profile" className="flex items-center gap-3 px-4 py-2.5 text-sm text-ink hover:bg-white/[0.06]">
                          <Icon name="manage_accounts" size={18} className="text-ink-faint" /> Account & profiles
                        </Link>
                        <Link to="/watchlist" className="flex items-center gap-3 px-4 py-2.5 text-sm text-ink hover:bg-white/[0.06]">
                          <Icon name="bookmark" size={18} className="text-ink-faint" /> My List
                        </Link>
                        <Link to="/new" className="flex items-center gap-3 px-4 py-2.5 text-sm text-ink hover:bg-white/[0.06]">
                          <Icon name="local_fire_department" size={18} className="text-ink-faint" /> New & Hot
                        </Link>
                        <Link to="/activity" className="flex items-center gap-3 px-4 py-2.5 text-sm text-ink hover:bg-white/[0.06]">
                          <Icon name="history" size={18} className="text-ink-faint" /> Viewing activity
                        </Link>
                        {user.isAdmin && (
                          <Link to="/admin" className="flex items-center gap-3 px-4 py-2.5 text-sm text-gold hover:bg-white/[0.06]">
                            <Icon name="admin_panel_settings" size={18} /> Admin
                          </Link>
                        )}
                      </div>
                    )}
                    <button onClick={async () => { setMenu(false); await logout(); navigate('/') }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-brand-soft hover:bg-white/[0.06] border-t border-white/[0.06]">
                      <Icon name="logout" size={18} /> Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link to="/login" className="btn-ghost px-3 sm:px-4 py-2 whitespace-nowrap">Sign in</Link>
                <Link to="/register" className="btn-primary px-4 py-2 hidden sm:inline-flex whitespace-nowrap">Sign up</Link>
              </div>
            )}
          </div>
        </div>

        {/* Mobile search */}
        {searchOpen && !isKids && (
          <div ref={searchRef} className="md:hidden relative px-4 pb-3 animate-slide-down">
            {renderSearchBox(true)}
            <div className="relative">{renderSuggestions()}</div>
          </div>
        )}
      </header>

      {/* ── Floating mobile tab bar ── */}
      {!isKids && (
        <nav className="md:hidden fixed bottom-3 inset-x-3 z-50 pb-safe">
          <div className="flex justify-around items-center h-16 px-2 rounded-full shadow-[0_-8px_30px_rgba(0,0,0,0.6)]"
            style={{ background: 'rgba(13,17,26,0.85)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.1)' }}>
            {TABS.map(t => {
              const active = isActive(t.to)
              return (
                <Link key={t.to} to={t.to} aria-current={active ? 'page' : undefined}
                  className={`relative flex flex-col items-center justify-center gap-0.5 min-w-[56px] h-12 transition-colors ${active ? 'text-brand' : 'text-ink-faint hover:text-ink'}`}>
                  <span className="relative">
                    <Icon name={t.icon} size={22} fill={active} />
                    {t.to === '/downloads' && downloading && (
                      <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-cyan shadow-[0_0_6px_#4cd7f6] animate-pulse" />
                    )}
                  </span>
                  <span className="text-[10px] font-bold tracking-wide">{t.label}</span>
                  {active && <span className="absolute -bottom-1 w-1.5 h-1.5 rounded-full bg-brand shadow-[0_0_8px_#e50914]" />}
                </Link>
              )
            })}
          </div>
        </nav>
      )}
    </>
  )
}
