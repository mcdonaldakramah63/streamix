// frontend/src/pages/PersonPage.tsx — NEW FILE
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'
import MovieCard from '../components/MovieCard'

interface Person {
  id:           number
  name:         string
  biography:    string
  birthday:     string
  deathday:     string | null
  place_of_birth: string
  profile_path: string | null
  known_for_department: string
}

const IMG = 'https://image.tmdb.org/t/p/w342'

export default function PersonPage() {
  const { id }  = useParams()
  const navigate = useNavigate()
  const [person,  setPerson]  = useState<Person | null>(null)
  const [credits, setCredits] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showFull,setShowFull]= useState(false)

  useEffect(() => {
    window.scrollTo(0,0)
    setLoading(true)
    Promise.all([
      api.get(`/movies/person/${id}`),
      api.get(`/movies/person/${id}/credits`),
    ]).then(([p, c]) => {
      setPerson(p.data)
      const all = [
        ...(c.data.cast  || []).map((x: any) => ({ ...x, media_type: x.first_air_date ? 'tv' : 'movie' })),
        ...(c.data.crew  || []).filter((x: any) => x.job === 'Director').map((x: any) => ({ ...x, media_type: x.first_air_date ? 'tv' : 'movie' })),
      ]
      // Dedupe and sort by popularity
      const seen = new Set<number>()
      const deduped = all.filter(x => { if (seen.has(x.id)) return false; seen.add(x.id); return true })
      setCredits(deduped.sort((a, b) => (b.popularity || 0) - (a.popularity || 0)).slice(0, 40))
    }).catch(console.error).finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="pt-14 min-h-screen px-4">
        <div className="max-w-5xl mx-auto py-8">
          <div className="flex gap-6 mb-8">
            <div className="w-32 h-48 rounded-2xl bg-dark-card animate-pulse flex-shrink-0" />
            <div className="flex-1 space-y-3">
              <div className="h-8 bg-dark-card animate-pulse rounded w-1/2" />
              <div className="h-4 bg-dark-card animate-pulse rounded w-1/3" />
              <div className="h-20 bg-dark-card animate-pulse rounded" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!person) return (
    <div className="pt-14 min-h-screen flex items-center justify-center text-slate-500">Person not found</div>
  )

  const bio = person.biography || 'No biography available.'
  const age = person.birthday
    ? Math.floor((new Date().getTime() - new Date(person.birthday).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null

  return (
    <div className="pt-14 min-h-screen">
      <div className="max-w-5xl mx-auto px-3 sm:px-6 py-6 sm:py-10">

        <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-brand text-sm mb-6 flex items-center gap-1">
          ← Back
        </button>

        {/* Person header */}
        <div className="flex gap-4 sm:gap-8 mb-8">
          {/* Photo */}
          <div className="flex-shrink-0">
            {person.profile_path ? (
              <img src={IMG + person.profile_path} alt={person.name}
                className="w-28 sm:w-44 rounded-2xl shadow-xl object-cover" />
            ) : (
              <div className="w-28 sm:w-44 aspect-[2/3] rounded-2xl bg-dark-card flex items-center justify-center text-5xl">👤</div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-4xl font-black mb-1">{person.name}</h1>
            <p className="text-brand text-sm font-semibold mb-3">{person.known_for_department}</p>

            <div className="flex flex-wrap gap-3 text-xs text-slate-400 mb-4">
              {person.birthday && (
                <span>🎂 {new Date(person.birthday).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}{age ? ` (${age})` : ''}</span>
              )}
              {person.place_of_birth && <span>📍 {person.place_of_birth}</span>}
              {person.deathday && <span>✝ {person.deathday}</span>}
            </div>

            {/* Bio */}
            <div className="text-sm text-slate-400 leading-relaxed">
              <p className={showFull ? '' : 'line-clamp-4'}>
                {bio}
              </p>
              {bio.length > 300 && (
                <button onClick={() => setShowFull(s => !s)}
                  className="text-brand text-xs mt-1 hover:underline">
                  {showFull ? 'Show less' : 'Read more'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Filmography */}
        {credits.length > 0 && (
          <div>
            <h2 className="text-lg font-black mb-4">Known For ({credits.length})</h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2 sm:gap-3">
              {credits.map(c => <MovieCard key={c.id} movie={c} showType />)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
