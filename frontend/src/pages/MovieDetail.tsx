// frontend/src/pages/MovieDetail.tsx
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'
import DetailHero   from '../components/DetailHero'
import TrailerModal from '../components/TrailerModal'
import CastSection  from '../components/CastSection'
import SimilarRow   from '../components/SimilarRow'
import LiveVoting   from '../components/LiveVoting'
import { track } from '../utils/track'
import Icon         from '../components/Icon'
import { useContinueWatching } from '../stores/continueWatchingStore'

const DUR = (m?: number) => (m ? `${Math.floor(m / 60)}h ${m % 60}m` : '')
const money = (n?: number) => (n ? `$${(n / 1e6).toFixed(0)}M` : '—')

interface Video { key: string; type: string; site: string; official: boolean; name?: string }

export default function MovieDetail() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const resume   = useContinueWatching(s => s.items.find(i => i.movieId === Number(id)))

  const [movie,      setMovie]      = useState<any>(null)
  const [ratingData, setRatingData] = useState({ avgRating: 0, totalRatings: 0, myRating: 0 })
  const [loading,    setLoading]    = useState(true)
  const [trailerKey, setTrailerKey] = useState<string | null>(null)
  // Interest signals for recommendations
  useEffect(() => { if (id) track('detail', 'movie', Number(id)) }, [id])
  useEffect(() => { if (trailerKey && id) track('trailer', 'movie', Number(id)) }, [trailerKey, id])
  const [readMore,   setReadMore]   = useState(false)

  useEffect(() => {
    window.scrollTo(0, 0)
    setLoading(true)
    Promise.all([
      api.get(`/movies/${id}`),
      api.get(`/ratings/${id}`, { params: { type: 'movie' } }).catch(() => ({ data: { avgRating: 0, totalRatings: 0, myRating: 0 } })),
    ]).then(([m, r]) => { setMovie(m.data); setRatingData(r.data) })
      .catch(() => setMovie(null))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return (
    <div className="min-h-screen">
      <div className="skeleton rounded-none" style={{ height: 'clamp(300px,48vw,600px)' }} />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-12 py-8 space-y-4">
        <div className="h-9 skeleton w-2/3" /><div className="h-4 skeleton w-1/2" /><div className="h-24 skeleton" />
      </div>
    </div>
  )

  if (!movie) return (
    <div className="pt-32 min-h-screen flex flex-col items-center gap-3 text-ink-muted">
      <Icon name="movie_off" size={48} />Movie not found
      <button onClick={() => navigate('/')} className="btn-secondary mt-2">Back home</button>
    </div>
  )

  const videos: Video[] = movie.videos?.results || []
  const trailer = videos.find(v => v.type === 'Trailer' && v.site === 'YouTube' && v.official)
               || videos.find(v => v.type === 'Trailer' && v.site === 'YouTube')
  const extras  = videos.filter(v => v.site === 'YouTube' && v.key !== trailer?.key).slice(0, 6)
  const genres  = (movie.genres || []).map((g: any) => g.name)
  const studios = (movie.production_companies || []).slice(0, 2).map((c: any) => c.name).join(', ')
  const resumeLabel = resume && resume.progress > 1 && resume.progress < 98 ? `Resume · ${resume.progress}%` : 'Watch Movie'

  return (
    <div className="min-h-screen pb-16">
      {trailerKey && <TrailerModal videoKey={trailerKey} title={movie.title} onClose={() => setTrailerKey(null)} />}

      <DetailHero
        id={Number(id)} type="movie" title={movie.title} tagline={movie.tagline}
        backdrop={movie.backdrop_path} poster={movie.poster_path}
        year={(movie.release_date || '').slice(0, 4)} releaseDate={movie.release_date || ''} meta={[DUR(movie.runtime)]}
        rating={movie.vote_average || 0} genres={genres}
        playLabel={resumeLabel} onPlay={() => navigate(`/player/movie/${id}`)}
        trailerKey={trailer?.key} onTrailer={setTrailerKey} ratingData={ratingData}
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-12 mt-8 space-y-10">
        <div className="grid lg:grid-cols-3 gap-6">
          <section className="card p-5 sm:p-6 lg:col-span-2">
            <h2 className="text-label-sm uppercase text-ink-faint mb-3">Storyline</h2>
            <p className={`text-ink text-sm sm:text-base leading-relaxed ${readMore ? '' : 'line-clamp-4'}`}>
              {movie.overview || 'No overview available.'}
            </p>
            {movie.overview?.length > 240 && (
              <button onClick={() => setReadMore(r => !r)} className="text-brand-soft text-xs font-bold mt-2 hover:underline">
                {readMore ? 'Show less' : 'Read more'}
              </button>
            )}
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-5 pt-5 border-t border-white/[0.06]">
              {[
                ['Status',   movie.status],
                ['Language', movie.original_language?.toUpperCase()],
                ['Budget',   money(movie.budget)],
                ['Revenue',  money(movie.revenue)],
                ['Studio',   studios || '—'],
                ['Released', movie.release_date || '—'],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-label-sm uppercase text-ink-faint mb-0.5">{label}</dt>
                  <dd className="text-sm text-ink">{value || '—'}</dd>
                </div>
              ))}
            </dl>
          </section>
          <LiveVoting tmdbId={Number(id)} type="movie" />
        </div>

        <CastSection cast={movie.credits?.cast || []} loading={false} />
        <SimilarRow tmdbId={Number(id)} type="movie" />

        {extras.length > 0 && (
          <section>
            <h2 className="section-title mb-4">Trailers & Extras</h2>
            <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
              {extras.map(v => (
                <button key={v.key} onClick={() => setTrailerKey(v.key)} className="flex-shrink-0 w-56 sm:w-72 text-left group">
                  <div className="relative rounded-2xl overflow-hidden aspect-video bg-dark-card">
                    <img src={`https://img.youtube.com/vi/${v.key}/mqdefault.jpg`} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    <span className="absolute inset-0 m-auto w-11 h-11 rounded-full bg-dark-void/70 backdrop-blur-md flex items-center justify-center text-white group-hover:bg-brand transition-colors">
                      <Icon name="play_arrow" size={24} fill />
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-ink mt-2 truncate">{v.name || v.type}</p>
                  <p className="text-tech-pill uppercase text-ink-faint">{v.type}</p>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
