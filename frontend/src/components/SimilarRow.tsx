// frontend/src/components/SimilarRow.tsx — FULL REPLACEMENT
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { Movie } from '../types'

interface Props {
  tmdbId: number
  type:   'movie' | 'tv'
}

const IMG = 'https://image.tmdb.org/t/p/w300'

function SimilarCard({ movie, type }: { movie: Movie; type: 'movie'|'tv' }) {
  const navigate = useNavigate()
  const [imgErr, setImgErr] = useState(false)
  const title = movie.title || movie.name || ''
  const yr    = (movie.release_date || movie.first_air_date || '').slice(0,4)
  const rt    = movie.vote_average || 0

  return (
    <button
      onClick={() => navigate(type === 'tv' ? `/tv/${movie.id}` : `/movie/${movie.id}`)}
      className="flex-shrink-0 w-28 sm:w-36 text-left group"
      style={{ aspectRatio: '2/3' }}>

      <div className="relative w-full h-full rounded-xl overflow-hidden bg-dark-card">
        {!imgErr && movie.poster_path ? (
          <img src={IMG + movie.poster_path} alt={title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onError={() => setImgErr(true)} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl bg-dark-surface">🎬</div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-[#07080c]/95 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {rt >= 7.5 && (
          <div className="absolute top-1.5 left-1.5 badge-gold text-[10px] px-1.5 py-0.5">★ {rt.toFixed(1)}</div>
        )}

        <div className="absolute bottom-0 left-0 right-0 p-2 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
          <p className="text-white text-[11px] font-semibold line-clamp-2 mb-1">{title}</p>
          {yr && <p className="text-slate-500 text-[10px]">{yr}</p>}
        </div>
      </div>
    </button>
  )
}

export default function SimilarRow({ tmdbId, type }: Props) {
  const [similar, setSimilar] = useState<Movie[]>([])
  const [loading, setLoading] = useState(true)

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
        <div className="h-5 w-36 skeleton rounded mb-4" />
        <div className="flex gap-2 sm:gap-3 overflow-x-auto scrollbar-hide pb-2">
          {Array(7).fill(0).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-28 sm:w-36 skeleton rounded-xl" style={{ aspectRatio:'2/3' }} />
          ))}
        </div>
      </div>
    )
  }

  if (!similar.length) return null

  return (
    <div>
      <h3 className="section-title mb-4">More Like This</h3>
      <div className="flex gap-2 sm:gap-3 overflow-x-auto scrollbar-hide pb-2 -mx-3 px-3 sm:-mx-6 sm:px-6">
        {similar.map(m => <SimilarCard key={m.id} movie={m} type={type} />)}
      </div>
    </div>
  )
}
