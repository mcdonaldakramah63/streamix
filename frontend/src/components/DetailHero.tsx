// Shared hero for movie / TV detail pages (Stitch "Movie Details & Cast")
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from './Icon'
import api from '../services/api'
import { useProfileStore } from '../stores/profileStore'
import ShareButton from './ShareButton'
import StarRating from './StarRating'
import { useAuthStore } from '../context/authStore'
import { useWatchlistStore } from '../stores/watchlistStore'

interface Props {
  id:          number
  type:        'movie' | 'tv'
  title:       string
  tagline?:    string
  backdrop:    string | null
  poster:      string | null
  year:        string
  meta:        string[]           // e.g. ["2h 14m"] or ["3 Seasons", "24 Episodes"]
  rating:      number
  genres:      string[]
  status?:     string
  playLabel:   string
  onPlay:      () => void
  trailerKey?: string
  onTrailer:   (key: string) => void
  ratingData:  { avgRating: number; totalRatings: number; myRating: number }
  /** Full release / first-air date — unreleased titles get "Remind me" */
  releaseDate?: string
}

const IMG = (p: string | null, s: string) => (p ? `https://image.tmdb.org/t/p/${s}${p}` : '')

export default function DetailHero(props: Props) {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  // Library files an admin linked to this title
  const [onStreamix, setOnStreamix] = useState(0)
  // Age rating badge (PG-13, TV-MA…)
  const [cert, setCert] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    api.get(`/movies/rating/${props.type}/${props.id}`).then(r => { if (live) setCert(r.data.rating) }).catch(() => {})
    return () => { live = false }
  }, [props.type, props.id])

  // "Not for me" (hides it from rows and recommendations for this profile)
  const key = `${props.type}:${props.id}`
  const hiddenNow = useProfileStore(s => !!s.activeProfile?.hiddenTitles?.includes(key))
  const setHidden = useProfileStore(s => s.setHidden)
  const hasProfile = useProfileStore(s => !!s.activeProfile)

  // "Remind me" for titles that aren't out yet
  const upcoming = !!props.releaseDate && props.releaseDate > new Date().toISOString().slice(0, 10)
  const [remind, setRemind] = useState(false)
  useEffect(() => {
    if (!upcoming || !user) return
    api.get('/inbox/reminders').then(r => setRemind(r.data.some((x: any) => x.type === props.type && x.tmdbId === props.id))).catch(() => {})
  }, [upcoming, user, props.type, props.id])
  const toggleRemind = async () => {
    if (!user) { navigate('/login'); return }
    const next = !remind
    setRemind(next)
    try { await api.put('/inbox/reminders', { type: props.type, tmdbId: props.id, on: next }) } catch { setRemind(!next) }
  }
  useEffect(() => {
    let live = true
    api.get(`/library/for/${props.type}/${props.id}`).then(r => { if (live) setOnStreamix(r.data.length) }).catch(() => {})
    return () => { live = false }
  }, [props.type, props.id])
  const inWL = useWatchlistStore(s => s.items.some(i => i.movieId === props.id))
  const toggle = useWatchlistStore(s => s.toggle)

  const toggleWL = () => {
    if (!user) { navigate('/login'); return }
    toggle({
      movieId: props.id, title: props.title, poster: props.poster || '', backdrop: props.backdrop || '',
      rating: props.rating, year: props.year, type: props.type,
    })
  }

  return (
    <>
      <div className="relative w-full overflow-hidden bg-dark-void" style={{ height: 'clamp(300px, 48vw, 600px)' }}>
        {props.backdrop && <img src={IMG(props.backdrop, 'original')} alt="" className="absolute inset-0 w-full h-full object-cover object-top scale-105" />}
        <div className="absolute inset-0 bg-gradient-to-t from-dark via-dark/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-dark/80 via-transparent to-dark/40" />

        <button onClick={() => navigate(-1)} aria-label="Go back"
          className="absolute top-20 left-4 sm:left-6 lg:left-12 btn-icon !bg-dark-void/60">
          <Icon name="arrow_back" size={22} />
        </button>

        {props.trailerKey && (
          <button onClick={() => props.onTrailer(props.trailerKey!)} aria-label="Play trailer"
            className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-dark-high/80 backdrop-blur-md flex items-center justify-center text-brand shadow-brand hover:scale-110 transition-transform">
            <Icon name="play_arrow" size={36} fill />
          </button>
        )}
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-12 -mt-24 sm:-mt-32 relative z-10">
        <div className="flex gap-4 sm:gap-8 items-end">
          <div className="w-28 sm:w-44 flex-shrink-0 aspect-[2/3] rounded-2xl overflow-hidden shadow-[0_12px_28px_rgba(0,0,0,0.85)] bg-dark-card">
            {props.poster && <img src={IMG(props.poster, 'w342')} alt={props.title} className="w-full h-full object-cover" />}
          </div>
          <div className="flex flex-col min-w-0 pb-1">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap text-sm text-ink-muted">
              {props.year && <span>{props.year}</span>}
              {cert && <span className="px-1.5 py-px rounded border border-white/40 text-white/90 text-[11px] font-bold tracking-wide" title="Age rating">{cert}</span>}
              {props.meta.filter(Boolean).map(m => (<span key={m} className="flex items-center gap-2"><span className="text-ink-faint">•</span>{m}</span>))}
              {props.status && <span className="tech-pill text-cyan">{props.status}</span>}
            </div>
            <h1 className="font-extrabold tracking-tight text-white leading-[1.05]" style={{ fontSize: 'clamp(1.6rem, 4vw, 3rem)' }}>
              {props.title}
            </h1>
            {props.tagline && <p className="text-brand-soft/90 text-sm italic mt-1.5 hidden sm:block">“{props.tagline}”</p>}
            <div className="flex items-center gap-2 mt-2.5">
              {props.rating > 0 && (
                <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-dark-border text-gold text-label-sm">
                  <Icon name="star" size={14} fill />{props.rating.toFixed(1)}
                </span>
              )}
              <span className="tech-pill">{props.type === 'tv' ? 'Series' : 'Movie'}</span>
              {onStreamix > 0 && (
                <span className="tech-pill !bg-gold/15 !border-gold/30 text-gold flex items-center gap-1" title="Plays from the Streamix library">
                  <Icon name="verified" size={13} />
                  {props.type === 'tv' ? `${onStreamix} episode${onStreamix > 1 ? 's' : ''} on Streamix` : 'On Streamix'}
                </span>
              )}
            </div>
          </div>
        </div>

        {props.genres.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-4">
            {props.genres.map(g => (
              <span key={g} className="flex-shrink-0 px-3 py-1 rounded-full bg-dark-border text-ink text-xs font-semibold">{g}</span>
            ))}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2.5 sm:items-center">
          <button onClick={props.onPlay} className="btn-primary h-12 px-8 uppercase tracking-wider text-[13px] w-full sm:w-auto">
            <Icon name="play_arrow" size={24} fill /> {props.playLabel}
          </button>
          <div className="grid grid-cols-3 sm:flex gap-2">
            <button onClick={toggleWL} aria-pressed={inWL}
              className={`h-11 px-2 sm:px-4 rounded-full flex items-center justify-center gap-1 sm:gap-1.5 text-[13px] sm:text-sm font-semibold whitespace-nowrap transition-all active:scale-95 ${
                inWL ? 'bg-brand/15 text-brand-soft ring-1 ring-brand/50' : 'bg-dark-border text-ink hover:bg-dark-high'
              }`}>
              <Icon name={inWL ? 'check' : 'add'} size={20} /> My List
            </button>
            {props.trailerKey && (
              <button onClick={() => props.onTrailer(props.trailerKey!)}
                className="h-11 px-2 sm:px-4 rounded-full flex items-center justify-center gap-1 sm:gap-1.5 text-[13px] sm:text-sm font-semibold whitespace-nowrap bg-dark-border text-ink hover:bg-dark-high active:scale-95">
                <Icon name="movie" size={20} /> Trailer
              </button>
            )}
            <ShareButton title={props.title} />
            {upcoming && (
              <button onClick={toggleRemind} aria-pressed={remind}
                className={`h-11 px-2 sm:px-4 rounded-full flex items-center justify-center gap-1 sm:gap-1.5 text-[13px] sm:text-sm font-semibold whitespace-nowrap transition-all active:scale-95 ${remind ? 'bg-gold/15 text-gold ring-1 ring-gold/40' : 'bg-dark-border text-ink hover:bg-dark-high'}`}>
                <Icon name={remind ? 'notifications_active' : 'notifications'} size={20} fill={remind} /> {remind ? 'Reminder set' : 'Remind me'}
              </button>
            )}
            {hasProfile && (
              <button onClick={() => setHidden(key, !hiddenNow).catch(() => {})} aria-pressed={hiddenNow}
                title={hiddenNow ? 'Show this title in rows again' : "Hide this title from rows and recommendations"}
                className={`h-11 px-2 sm:px-4 rounded-full flex items-center justify-center gap-1 sm:gap-1.5 text-[13px] sm:text-sm font-semibold whitespace-nowrap transition-all active:scale-95 ${hiddenNow ? 'bg-white/10 text-white' : 'bg-dark-border text-ink hover:bg-dark-high'}`}>
                <Icon name="thumb_down" size={19} fill={hiddenNow} /> {hiddenNow ? 'Hidden' : 'Not for me'}
              </button>
            )}
          </div>
        </div>

        <div className="mt-5">
          <StarRating tmdbId={props.id} type={props.type} initialRating={props.ratingData.myRating}
            avgRating={props.ratingData.avgRating} totalRatings={props.ratingData.totalRatings} />
        </div>
      </div>
    </>
  )
}
