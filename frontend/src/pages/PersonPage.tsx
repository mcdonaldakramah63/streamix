// frontend/src/pages/PersonPage.tsx — FULL REPLACEMENT
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'
import MovieCard from '../components/MovieCard'

interface Person {
  id:                   number
  name:                 string
  biography:            string
  birthday:             string | null
  deathday:             string | null
  place_of_birth:       string | null
  profile_path:         string | null
  known_for_department: string
  also_known_as:        string[]
}

const PS = (p: string|null) => p ? `https://image.tmdb.org/t/p/w342${p}` : ''

export default function PersonPage() {
  const { id }   = useParams()
  const navigate = useNavigate()

  const [person,   setPerson]   = useState<Person | null>(null)
  const [credits,  setCredits]  = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [showFull, setShowFull] = useState(false)
  const [tab,      setTab]      = useState<'all'|'movie'|'tv'>('all')

  useEffect(() => {
    window.scrollTo(0, 0)
    setLoading(true)
    Promise.all([
      api.get(`/movies/person/${id}`),
      api.get(`/movies/person/${id}/credits`),
    ]).then(([p, c]) => {
      setPerson(p.data)
      // Combine cast + directing credits, dedupe, sort by popularity
      const typeOf = (x: any) => x.media_type === 'tv' || x.media_type === 'movie' ? x.media_type : (x.first_air_date ? 'tv' : 'movie')
      const cast = (c.data.cast  || []).map((x: any) => ({ ...x, _role: 'cast', media_type: typeOf(x) }))
      const dir  = (c.data.crew  || []).filter((x: any) => x.job === 'Director').map((x: any) => ({ ...x, _role: 'director', media_type: typeOf(x) }))
      const all  = [...cast, ...dir]
      // Movie and TV ids can collide, so dedupe on type + id
      const seen = new Set<string>()
      const deduped = all.filter(x => { const k = `${x.media_type}-${x.id}`; if (seen.has(k)) return false; seen.add(k); return true })
      setCredits(deduped.sort((a, b) => (b.popularity||0) - (a.popularity||0)).slice(0, 48))
    }).catch(console.error).finally(() => setLoading(false))
  }, [id])

  if (loading) return (
    <div className="pt-16 min-h-screen">
      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="flex gap-6 mb-10">
          <div className="w-32 sm:w-44 flex-shrink-0 skeleton rounded-2xl" style={{ aspectRatio:'2/3' }} />
          <div className="flex-1 space-y-4 pt-2">
            <div className="h-9 skeleton rounded w-2/3" />
            <div className="h-4 skeleton rounded w-1/3" />
            <div className="h-32 skeleton rounded" />
          </div>
        </div>
      </div>
    </div>
  )

  if (!person) return (
    <div className="pt-16 min-h-screen flex items-center justify-center text-ink-faint">Person not found</div>
  )

  const age = person.birthday && !person.deathday
    ? Math.floor((Date.now() - new Date(person.birthday).getTime()) / (365.25*24*60*60*1000))
    : null

  const filteredCredits = tab === 'all'
    ? credits
    : credits.filter(c => c.media_type === tab)

  const movieCount = credits.filter(c => c.media_type === 'movie').length
  const tvCount    = credits.filter(c => c.media_type === 'tv').length

  return (
    <div className="pt-16 min-h-screen">
      <div className="max-w-5xl mx-auto px-3 sm:px-6 py-8">

        {/* Back */}
        <button onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-ink-faint hover:text-white transition-colors text-sm mb-7 group">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            className="group-hover:-translate-x-0.5 transition-transform">
            <path d="m15 18-6-6 6-6"/>
          </svg>
          Back
        </button>

        {/* Person header */}
        <div className="flex gap-5 sm:gap-8 mb-10">

          {/* Photo */}
          <div className="flex-shrink-0">
            {person.profile_path ? (
              <img src={PS(person.profile_path)} alt={person.name}
                className="w-28 sm:w-44 rounded-2xl shadow-deep ring-1 ring-white/10 object-cover" />
            ) : (
              <div className="w-28 sm:w-44 rounded-2xl bg-dark-card border border-dark-border flex items-center justify-center text-5xl"
                style={{ aspectRatio:'2/3' }}>👤</div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="text-brand text-xs font-bold uppercase tracking-widest mb-2">{person.known_for_department}</p>
            <h1 className="font-bold text-white mb-3 leading-tight"
              style={{ fontFamily:'Plus Jakarta Sans, sans-serif', fontSize:'clamp(1.4rem,4vw,2.5rem)' }}>
              {person.name}
            </h1>

            {/* Meta pills */}
            <div className="flex flex-wrap gap-2 mb-5">
              {person.birthday && (
                <div className="glass rounded-xl px-3 py-1.5 text-xs text-ink">
                  🎂 {new Date(person.birthday).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })}
                  {age && <span className="text-ink-faint ml-1">({age})</span>}
                </div>
              )}
              {person.place_of_birth && (
                <div className="glass rounded-xl px-3 py-1.5 text-xs text-ink">
                  📍 {person.place_of_birth}
                </div>
              )}
              {person.deathday && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-1.5 text-xs text-red-400">
                  ✝ {person.deathday}
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="flex gap-3 mb-5">
              {[
                { label: 'Movies', value: movieCount, icon: '🎬' },
                { label: 'TV',     value: tvCount,    icon: '📺' },
              ].map(s => (
                <div key={s.label} className="card px-4 py-2.5 text-center min-w-[80px]">
                  <div className="text-xl font-bold text-white" style={{ fontFamily:'Plus Jakarta Sans, sans-serif' }}>{s.value}</div>
                  <div className="text-[10px] text-ink-faint flex items-center gap-1 justify-center mt-0.5">
                    <span>{s.icon}</span>{s.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Biography */}
            {person.biography ? (
              <div>
                <p className={`text-ink-muted text-sm leading-relaxed ${showFull ? '' : 'line-clamp-4'}`}>
                  {person.biography}
                </p>
                {person.biography.length > 300 && (
                  <button onClick={() => setShowFull(s => !s)}
                    className="text-brand text-xs mt-2 hover:underline font-medium">
                    {showFull ? 'Show less ↑' : 'Read more ↓'}
                  </button>
                )}
              </div>
            ) : (
              <p className="text-ink-faint text-sm italic">No biography available.</p>
            )}
          </div>
        </div>

        {/* Filmography */}
        {credits.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-title">Known For</h2>

              {/* Type filter tabs */}
              <div className="flex gap-1 bg-dark-surface border border-dark-border rounded-xl p-1">
                {[
                  { key: 'all',   label: `All (${credits.length})` },
                  { key: 'movie', label: `Movies (${movieCount})` },
                  { key: 'tv',    label: `TV (${tvCount})` },
                ].map(t => (
                  <button key={t.key} onClick={() => setTab(t.key as any)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                      tab === t.key ? 'bg-brand text-white' : 'text-ink-muted hover:text-white'
                    }`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="movie-card-grid">
              {filteredCredits.map(c => (
                <MovieCard key={`${c.media_type}-${c.id}`} movie={c} showType={tab === 'all'} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
