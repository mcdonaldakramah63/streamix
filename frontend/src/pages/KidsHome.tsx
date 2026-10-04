// frontend/src/pages/KidsHome.tsx — FULL REPLACEMENT
// Design: Warm cinematic kids aesthetic — rich gradients, large posters, joyful
// Exit returns to the profile picker; adult profiles are guarded by their own server-checked PINs
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { useProfileStore } from '../stores/profileStore'
import ProfileAvatar from '../components/avatar/ProfileAvatar'
import { useKidsStore } from '../stores/kidsStore'

// ── Types ────────────────────────────────────────────────────────────────────
interface KidsMovie {
  id:          number
  title?:      string
  name?:       string
  poster_path: string | null
  media_type?: 'movie' | 'tv'
}

// ── Constants ────────────────────────────────────────────────────────────────
const IMG = (p: string | null, s = 'w342') =>
  p ? `https://image.tmdb.org/t/p/${s}${p}` : ''

/** Sections come from /movies/kids-browse — the server applies the age-rating filter */
interface Section { id: string; label: string; emoji: string; bg: string }
const SECTIONS: Section[] = [
  { id: 'shows',           label: 'Kids Shows',   emoji: '⭐', bg: '#FFD93D' },
  { id: 'cartoons',        label: 'Cartoons',     emoji: '🎨', bg: '#FF6B6B' },
  { id: 'anime',           label: 'Anime',        emoji: '🍥', bg: '#FF8FB1' },
  { id: 'anime-movies',    label: 'Anime Movies', emoji: '🌸', bg: '#C3A6FF' },
  { id: 'animated-movies', label: 'Animated Movies', emoji: '🎬', bg: '#45B7D1' },
  { id: 'family',          label: 'Family',       emoji: '🏠', bg: '#4ECDC4' },
  { id: 'family-shows',    label: 'Family Shows', emoji: '📺', bg: '#7FD8BE' },
  { id: 'adventure',       label: 'Adventure',    emoji: '🗺️', bg: '#5DADE2' },
  { id: 'comedy',          label: 'Comedy',       emoji: '😂', bg: '#96CEB4' },
  { id: 'fantasy',         label: 'Fantasy',      emoji: '✨', bg: '#DDA0DD' },
]
const ALL: Section = { id: 'all', label: 'All', emoji: '🌈', bg: '#FFD93D' }
const HOME_ROWS = ['shows', 'anime', 'cartoons', 'animated-movies', 'anime-movies', 'family']

const browse = (section: string, page = 1) =>
  api.get('/movies/kids-browse', { params: { section, page } }).then(r => r.data as { results: KidsMovie[]; total_pages: number })

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

// ── Horizontal row on the "All" view ─────────────────────────────────────────
/** Hides titles a parent blocked */
function useAllowed() {
  useKidsStore(s => s.status) // re-render when the lists change
  const allowed = useKidsStore.getState().titleAllowed
  return (list: KidsMovie[]) => list.filter(m => allowed(m.media_type === 'tv' ? 'tv' : 'movie', m.id))
}

function KidsRow({ section, onSeeAll, onLoaded }: { section: Section; onSeeAll: () => void; onLoaded?: (items: KidsMovie[]) => void }) {
  const [raw, setItems] = useState<KidsMovie[] | null>(null)
  const filter = useAllowed()
  const items = raw && filter(raw)
  useEffect(() => {
    let live = true
    browse(section.id).then(d => { if (live) { setItems(d.results); onLoaded?.(d.results) } }).catch(() => live && setItems([]))
    return () => { live = false }
  }, [section.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (items && !items.length) return null
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1 h-5 rounded-full" style={{ background: section.bg }} />
        <h2 className="text-white font-bold text-base tracking-tight" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          {section.emoji} {section.label}
        </h2>
        <button onClick={onSeeAll} className="ml-auto text-xs font-bold px-3 py-1.5 rounded-xl active:scale-95"
          style={{ color: section.bg, background: 'rgba(255,255,255,0.04)' }}>
          See all ›
        </button>
      </div>
      <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1" style={{ scrollbarWidth: 'none' }}>
        {(items || Array.from({ length: 8 }, () => null)).map((m, i) => (
          <div key={m ? `${m.media_type}-${m.id}` : i} className="flex-shrink-0 w-28 sm:w-36">
            {m ? <KidsMovieCard movie={m} />
              : <div className="rounded-[18px] animate-pulse" style={{ aspectRatio: '2/3', background: 'rgba(255,255,255,0.06)' }} />}
          </div>
        ))}
      </div>
    </section>
  )
}

// ── Main KidsHome ─────────────────────────────────────────────────────────────
export default function KidsHome() {
  const navigate = useNavigate()
  const { activeProfile, setActive } = useProfileStore()

  const [section,  setSection]  = useState<Section>(ALL)
  const [grid,     setGrid]     = useState<KidsMovie[]>([])
  const [page,     setPage]     = useState(1)
  const [pages,    setPages]    = useState(1)
  const [loading,  setLoading]  = useState(false)
  const [featured, setFeatured] = useState<KidsMovie | null>(null)
  const [query,    setQuery]    = useState('')
  const [results,  setResults]  = useState<KidsMovie[] | null>(null)
  const [searching, setSearching] = useState(false)
  const searchSeq = useRef(0)

  const profileName   = activeProfile?.name   || 'Viewer'
  const profileAvatar = activeProfile?.avatar  || '⭐'
  const profileColor  = activeProfile?.color   || '#FFD93D'
  const accent = section.bg
  const filter = useAllowed()
  const kids = useKidsStore(s => s.status)
  const [picked, setPicked] = useState<KidsMovie[] | null>(null)

  // "Only allowed titles" mode: show just the parent's picks
  useEffect(() => {
    if (!kids?.allowedOnly) { setPicked(null); return }
    Promise.all(kids.allowedTitles.slice(0, 60).map(key => {
      const [type, id] = key.split(':')
      return api.get(type === 'tv' ? `/movies/tv/${id}` : `/movies/${id}`)
        .then(r => ({ ...r.data, media_type: type } as KidsMovie)).catch(() => null)
    })).then(list => setPicked(list.filter(Boolean) as KidsMovie[]))
  }, [kids?.allowedOnly, kids?.allowedTitles?.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  // One category: a grid that loads more pages on demand
  useEffect(() => {
    if (section.id === 'all') return
    setGrid([]); setPage(1); setLoading(true)
    browse(section.id, 1)
      .then(d => { setGrid(d.results); setPages(d.total_pages) })
      .catch(() => setGrid([]))
      .finally(() => setLoading(false))
  }, [section.id])

  const loadMore = () => {
    const next = page + 1
    setLoading(true)
    browse(section.id, next)
      .then(d => {
        setGrid(g => [...g, ...d.results.filter(m => !g.some(x => x.id === m.id && x.media_type === m.media_type))])
        setPage(next)
      })
      .finally(() => setLoading(false))
  }

  // Search (kid-safe on the server)
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResults(null); setSearching(false); return }
    const n = ++searchSeq.current
    setSearching(true)
    const t = setTimeout(() => {
      api.get('/movies/kids-search', { params: { query: q } })
        .then(r => { if (n === searchSeq.current) setResults(r.data.results || []) })
        .catch(() => { if (n === searchSeq.current) setResults([]) })
        .finally(() => { if (n === searchSeq.current) setSearching(false) })
    }, 400)
    return () => clearTimeout(t)
  }, [query])

  const onFirstRow = useCallback((items: KidsMovie[]) => {
    setFeatured(f => f || items[Math.floor(Math.random() * Math.min(4, items.length))] || null)
  }, [])

  const playFeatured = () => {
    if (!featured) return
    navigate(featured.media_type === 'tv' ? `/player/tv/${featured.id}?season=1&episode=1` : `/player/movie/${featured.id}`)
  }

  // Leaving kids mode returns to "Who's watching?" — adult profiles are protected by their own PINs
  const exitKids = async () => {
    await setActive(null)
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
          <span className="text-xl font-black tracking-tight text-white" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            STREAMIX
          </span>
          <span className="text-[10px] font-black tracking-widest px-2 py-1 rounded-full"
            style={{ background: '#FFD93D', color: '#0a0c14' }}>
            KIDS
          </span>
        </div>

        {/* Profile + exit */}
        <div className="flex items-center gap-3">
          {kids?.minutesLeft != null && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full" title="Screen time left today"
              style={{ background: kids.minutesLeft <= 10 ? '#FF6B6B33' : 'rgba(255,255,255,0.06)', color: kids.minutesLeft <= 10 ? '#FF6B6B' : 'rgba(255,255,255,0.7)' }}>
              ⏱ {kids.minutesLeft} min left
            </span>
          )}
          <div className="flex items-center gap-2">
            <ProfileAvatar p={activeProfile || { avatar: profileAvatar, color: profileColor }} className="w-8 h-8 rounded-xl" emojiSize="text-base" />
            <span className="text-sm font-semibold text-white/80 hidden sm:block">{profileName}</span>
          </div>

          <button
            onClick={exitKids}
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
            <span>Switch profile</span>
          </button>
        </div>
      </header>

      {/* ── Search ── */}
      <div className={`px-4 sm:px-6 pt-5 ${kids?.allowedOnly ? 'hidden' : ''}`}>
        <div className="relative max-w-2xl">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
          </svg>
          <input value={query} onChange={e => setQuery(e.target.value)} type="text" enterKeyHint="search" autoComplete="off"
            placeholder="Search cartoons, anime, movies…" aria-label="Search shows and movies"
            className="w-full h-14 pl-12 pr-12 rounded-2xl text-base font-semibold text-white placeholder-white/35 outline-none transition-all focus:ring-2"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1.5px solid rgba(255,255,255,0.08)', ['--tw-ring-color' as any]: accent }} />
          {query && (
            <button onClick={() => setQuery('')} aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center text-white/60 hover:text-white"
              style={{ background: 'rgba(255,255,255,0.08)' }}>✕</button>
          )}
        </div>
      </div>

      {picked ? (
        <div className="px-4 sm:px-6 py-6 pb-16">
          <h2 className="text-white font-bold text-base mb-4" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>⭐ Picked for you by your grown-ups</h2>
          {picked.length ? (
            <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3">
              {picked.map(m => <KidsMovieCard key={`${m.media_type}-${m.id}`} movie={m} />)}
            </div>
          ) : <p className="text-white/40 text-sm">Nothing picked yet — ask a grown-up to add some shows!</p>}
        </div>
      ) : results !== null || searching ? (
        /* ── Search results ── */
        <div className="px-4 sm:px-6 py-6 pb-16">
          <p className="text-white/60 text-sm font-semibold mb-4">
            {searching ? 'Looking…' : results!.length ? `Found ${results!.length} for “${query.trim()}”` : `Nothing found for “${query.trim()}” — try another name`}
          </p>
          {searching ? <Skeleton /> : (
            <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3">
              {filter(results!).map(m => <KidsMovieCard key={`${m.media_type}-${m.id}`} movie={m} />)}
            </div>
          )}
        </div>
      ) : (<>

      {/* ── Featured Banner ── */}
      {featured && section.id === 'all' && (
        <div className="relative mx-4 sm:mx-6 mt-5 overflow-hidden" style={{ borderRadius: 24 }}>
          <div className="absolute inset-0">
            {featured.poster_path && (
              <img src={IMG(featured.poster_path, 'w780')} alt="" className="w-full h-full object-cover"
                style={{ filter: 'blur(2px) brightness(0.45)', transform: 'scale(1.08)' }} />
            )}
            <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${accent}33 0%, rgba(10,12,20,0.85) 100%)` }} />
          </div>
          <div className="relative flex items-center gap-5 p-5 sm:p-7" style={{ minHeight: 160 }}>
            {featured.poster_path && (
              <img src={IMG(featured.poster_path)} alt="" className="flex-shrink-0 shadow-2xl"
                style={{ width: 90, aspectRatio: '2/3', borderRadius: 14, objectFit: 'cover' }} />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold uppercase tracking-widest mb-2 opacity-70" style={{ color: accent }}>⭐ Featured Pick</p>
              <h2 className="text-white font-black text-xl sm:text-2xl mb-3 leading-tight" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                {featured.title || featured.name}
              </h2>
              <button onClick={playFeatured}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 hover:scale-105"
                style={{ background: accent, color: '#0a0c14' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,3 20,12 6,21"/></svg>
                Watch Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Category Pills ── */}
      <div className="flex gap-2.5 overflow-x-auto scrollbar-hide px-4 sm:px-6 py-5" style={{ scrollbarWidth: 'none' }}>
        {[ALL, ...SECTIONS].map(g => {
          const active = g.id === section.id
          return (
            <button key={g.id} onClick={() => { setSection(g); window.scrollTo({ top: 0, behavior: 'smooth' }) }} aria-pressed={active}
              className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold transition-all duration-200 active:scale-95"
              style={{
                background: active ? g.bg : 'rgba(255,255,255,0.05)',
                color:      active ? '#0a0c14' : 'rgba(255,255,255,0.6)',
                border:     active ? `1.5px solid ${g.bg}` : '1.5px solid rgba(255,255,255,0.07)',
                boxShadow:  active ? `0 0 20px ${g.bg}44` : 'none',
              }}>
              <span>{g.emoji}</span><span>{g.label}</span>
            </button>
          )
        })}
      </div>

      {/* ── Content ── */}
      <div className="px-4 sm:px-6 pb-16 space-y-8">
        {section.id === 'all' ? (
          HOME_ROWS.map((id, i) => {
            const sec = SECTIONS.find(s => s.id === id)!
            return <KidsRow key={id} section={sec} onSeeAll={() => setSection(sec)} onLoaded={i === 0 ? onFirstRow : undefined} />
          })
        ) : (
          <section>
            {grid.length === 0 && loading ? <Skeleton /> : grid.length > 0 ? (
              <>
                <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3">
                  {filter(grid).map(m => <KidsMovieCard key={`${m.media_type}-${m.id}`} movie={m} />)}
                </div>
                {page < pages && (
                  <div className="flex justify-center mt-6">
                    <button onClick={loadMore} disabled={loading}
                      className="px-6 py-3 rounded-2xl text-sm font-bold transition-all active:scale-95 disabled:opacity-60"
                      style={{ background: accent, color: '#0a0c14' }}>
                      {loading ? 'Loading…' : 'Show more'}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="py-12 text-center">
                <p className="text-4xl mb-3">🔍</p>
                <p className="text-white/30 text-sm">Nothing here yet — try another category</p>
              </div>
            )}
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
            Only titles rated for kids (up to PG / TV-PG) are shown here
          </p>
        </div>
      </div>
      </>)}

    </div>
  )
}
