// frontend/src/components/SimilarRow.tsx — "More like this"
// With a profile it's ranked for that viewer (closest titles first, then their taste); otherwise TMDB's list.
import { useEffect, useState } from 'react'
import api from '../services/api'
import { useProfileStore } from '../stores/profileStore'
import MovieCard, { CardMovie, mediaTypeOf } from './MovieCard'

export default function SimilarRow({ tmdbId, type }: { tmdbId: number; type: 'movie' | 'tv' }) {
  const profileId = useProfileStore(s => s.activeProfile?._id)
  const [items,   setItems]   = useState<CardMovie[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let live = true
    setLoading(true)
    const generic = () => api.get(type === 'tv' ? `/movies/tv/${tmdbId}/recommendations` : `/movies/${tmdbId}/recommendations`)
      .then(r => (r.data.results || []).slice(0, 20) as CardMovie[])
    const request = profileId
      ? api.get(`/profiles/${profileId}/more-like/${type}/${tmdbId}`).then(r => r.data as CardMovie[]).catch(generic)
      : generic()
    request
      .then(list => { if (live) setItems(list) })
      .catch(() => { if (live) setItems([]) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [tmdbId, type, profileId])

  if (!loading && !items.length) return null

  return (
    <section>
      <h2 className="section-title mb-4">More Like This</h2>
      <div className="flex gap-3 sm:gap-4 overflow-x-auto scrollbar-hide pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="flex-shrink-0 w-36 sm:w-44 skeleton" style={{ aspectRatio: '2/3.6' }} />)
          : items.map(m => (
            <div key={`${mediaTypeOf(m, type)}-${m.id}`} className="flex-shrink-0 w-36 sm:w-44">
              <MovieCard movie={m} type={m.media_type === 'tv' || m.media_type === 'movie' ? (m.media_type as 'movie' | 'tv') : type} />
            </div>
          ))}
      </div>
    </section>
  )
}
