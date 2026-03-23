// frontend/src/components/SimilarRow.tsx — NEW FILE
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { Movie } from '../types'

interface Props {
  tmdbId: number
  type:   'movie' | 'tv'
}

const IMG = 'https://image.tmdb.org/t/p/w300'

function Card({ movie, type }: { movie: Movie; type: 'movie' | 'tv' }) {
  const navigate  = useNavigate()
  const title     = movie.title || movie.name || ''
  const imgPath   = movie.poster_path
  const yr        = (movie.release_date || movie.first_air_date || '').slice(0, 4)
  const rt        = movie.vote_average?.toFixed(1)

  return (
    <button
      onClick={() => navigate(type === 'tv' ? `/tv/${movie.id}` : `/movie/${movie.id}`)}
      className="flex-shrink-0 w-28 sm:w-36 group text-left">
      <div className="aspect-[2/3] rounded-xl overflow-hidden bg-dark-card mb-2 ring-2 ring-transparent group-hover:ring-brand transition-all">
        {imgPath ? (
          <img src={IMG + imgPath} alt={title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl bg-dark-surface">🎬</div>
        )}
      </div>
      <p className="text-xs font-semibold text-slate-200 truncate group-hover:text-brand transition-colors">{title}</p>
      <div className="flex items-center gap-1.5 mt-0.5">
        {rt && rt !== '0.0' && <span className="text-yellow-400 text-xs">★ {rt}</span>}
        {yr && <span className="text-slate-500 text-xs">{yr}</span>}
      </div>
    </button>
  )
}

export default function SimilarRow({ tmdbId, type }: Props) {
  const [similar,  setSimilar]  = useState<Movie[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    setLoading(true)
    const endpoint = type === 'tv'
      ? `/movies/tv/${tmdbId}/recommendations`
      : `/movies/${tmdbId}/recommendations`

    api.get(endpoint)
      .then(r => setSimilar((r.data.results || []).slice(0, 20)))
      .catch(() => setSimilar([]))
      .finally(() => setLoading(false))
  }, [tmdbId, type])

  if (loading) {
    return (
      <div>
        <div className="h-5 w-36 bg-dark-card animate-pulse rounded mb-3" />
        <div className="flex gap-2 sm:gap-3 overflow-x-auto scrollbar-hide pb-2">
          {Array(6).fill(0).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-28 sm:w-36 aspect-[2/3] rounded-xl bg-dark-card animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (!similar.length) return null

  return (
    <div>
      <h3 className="text-base font-black mb-3">More Like This</h3>
      <div className="flex gap-2 sm:gap-3 overflow-x-auto scrollbar-hide pb-2 -mx-3 px-3 sm:mx-0 sm:px-0">
        {similar.map(m => <Card key={m.id} movie={m} type={type} />)}
      </div>
    </div>
  )
}
