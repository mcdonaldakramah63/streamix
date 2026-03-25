// frontend/src/pages/MovieDetail.tsx — FULL REPLACEMENT
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'
import TrailerModal from '../components/TrailerModal'
import CastSection  from '../components/CastSection'
import SimilarRow   from '../components/SimilarRow'
import StarRating   from '../components/StarRating'
import ShareButton  from '../components/ShareButton'
import { useWatchlistStore } from '../stores/watchlistStore'
import { useAuthStore }      from '../context/authStore'

const BD  = (p: string | null, s = 'w1280') => p ? `https://image.tmdb.org/t/p/${s}${p}` : ''
const PS  = (p: string | null) => p ? `https://image.tmdb.org/t/p/w342${p}` : ''
const YR  = (d?: string) => d?.slice(0,4) || ''
const RT  = (n?: number) => n ? n.toFixed(1) : '—'
const DUR = (m?: number) => m ? `${Math.floor(m/60)}h ${m%60}m` : ''

interface Video { key: string; type: string; site: string; official: boolean }

export default function MovieDetail() {
  const { id }    = useParams()
  const navigate  = useNavigate()
  const { user }  = useAuthStore()
  const { items: wl, add: addWL, remove: removeWL } = useWatchlistStore()

  const [movie,      setMovie]      = useState<any>(null)
  const [cast,       setCast]       = useState<any[]>([])
  const [videos,     setVideos]     = useState<Video[]>([])
  const [ratingData, setRatingData] = useState({ avgRating: 0, totalRatings: 0, myRating: 0 })
  const [loading,    setLoading]    = useState(true)
  const [trailerKey, setTrailerKey] = useState<string | null>(null)
  const [wlLoading,  setWlLoading]  = useState(false)
  const [readMore,   setReadMore]   = useState(false)

  const inWL = wl.some(w => w.movieId === Number(id))

  useEffect(() => {
    window.scrollTo(0,0)
    setLoading(true)
    Promise.all([
      api.get(`/movies/${id}`),
      api.get(`/movies/${id}/credits`),
      api.get(`/movies/${id}/videos`),
      api.get(`/ratings/${id}?type=movie`).catch(() => ({ data: { avgRating:0, totalRatings:0, myRating:0 } })),
    ]).then(([m,c,v,r]) => {
      setMovie(m.data); setCast(c.data.cast||[]); setVideos(v.data.results||[]); setRatingData(r.data)
    }).finally(() => setLoading(false))
  }, [id])

  const trailer = videos.find(v => v.type==='Trailer' && v.site==='YouTube' && v.official)
               || videos.find(v => v.type==='Trailer' && v.site==='YouTube')
  const teasers = videos.filter(v => v.site==='YouTube' && v.type!=='Trailer').slice(0,4)

  const toggleWL = async () => {
    if (!user || wlLoading || !movie) return
    setWlLoading(true)
    try {
      inWL ? await removeWL(Number(id)) : await addWL({
        movieId: Number(id), title: movie.title,
        poster: movie.poster_path||'', backdrop: movie.backdrop_path||'',
        rating: movie.vote_average||0, year: YR(movie.release_date),
      })
    } finally { setWlLoading(false) }
  }

  if (loading) return (
    <div className="pt-16 min-h-screen">
      <div className="skeleton" style={{ height: 'clamp(220px,40vw,420px)' }} />
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-4">
        <div className="h-8 skeleton rounded w-2/3" />
        <div className="h-4 skeleton rounded w-1/2" />
        <div className="h-24 skeleton rounded" />
      </div>
    </div>
  )

  if (!movie) return (
    <div className="pt-16 min-h-screen flex items-center justify-center text-slate-500">
      Movie not found
    </div>
  )

  const genres   = (movie.genres||[]).map((g:any)=>g.name)
  const studios  = (movie.production_companies||[]).slice(0,2).map((c:any)=>c.name).join(', ')

  return (
    <div className="min-h-screen">
      {trailerKey && <TrailerModal videoKey={trailerKey} title={movie.title} onClose={() => setTrailerKey(null)} />}

      {/* ── Hero backdrop ── */}
      <div className="relative overflow-hidden" style={{ height: 'clamp(220px, 40vw, 460px)' }}>
        <img src={BD(movie.backdrop_path)} alt="" className="absolute inset-0 w-full h-full object-cover object-top" />
        <div className="absolute inset-0 bg-hero-gradient" />
        <div className="absolute inset-0 bg-hero-bottom" />
        <div className="absolute inset-0" style={{ background:'linear-gradient(to top, #07080c 0%, transparent 45%)' }} />

        {/* Back button */}
        <button onClick={() => navigate(-1)}
          className="absolute top-20 left-4 sm:left-6 flex items-center gap-1.5 text-white/70 hover:text-white transition-colors text-sm glass px-3 py-1.5 rounded-xl">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m15 18-6-6 6-6"/></svg>
          Back
        </button>

        {/* Play button overlay */}
        {trailer && (
          <button onClick={() => setTrailerKey(trailer.key)}
            className="absolute inset-0 flex items-center justify-center group">
            <div className="w-16 h-16 rounded-full glass border border-white/20 flex items-center justify-center
              group-hover:bg-brand group-hover:border-brand transition-all duration-300 shadow-deep">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="white" className="ml-1"><polygon points="5,3 19,12 5,21"/></svg>
            </div>
          </button>
        )}
      </div>

      {/* ── Main content ── */}
      <div className="max-w-5xl mx-auto px-3 sm:px-6 -mt-12 sm:-mt-20 relative z-10 pb-16">
        <div className="flex gap-4 sm:gap-7 mb-8">

          {/* Poster */}
          <div className="flex-shrink-0">
            <img src={PS(movie.poster_path)} alt={movie.title}
              className="w-24 sm:w-40 rounded-2xl shadow-deep ring-1 ring-white/10 hidden sm:block" />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 pt-8 sm:pt-14">
            <h1 className="font-bold leading-tight mb-2 text-shadow"
              style={{ fontFamily:'Syne, sans-serif', fontSize:'clamp(1.4rem,3.5vw,2.5rem)' }}>
              {movie.title}
            </h1>

            {movie.tagline && (
              <p className="text-brand text-sm italic mb-3 opacity-80">"{movie.tagline}"</p>
            )}

            <div className="flex flex-wrap gap-2 items-center mb-4">
              <span className="badge-gold">★ {RT(movie.vote_average)}</span>
              <span className="text-slate-400 text-sm">{YR(movie.release_date)}</span>
              {movie.runtime ? <span className="text-slate-400 text-sm">{DUR(movie.runtime)}</span> : null}
              {genres.slice(0,3).map((g:string) => (
                <span key={g} className="text-xs text-slate-500 border border-dark-border px-2 py-0.5 rounded-full hidden sm:inline">{g}</span>
              ))}
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 mb-4">
              <button onClick={() => navigate(`/player/movie/${id}`)} className="btn-primary px-5 py-2.5 text-sm">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                Play Now
              </button>
              {trailer && (
                <button onClick={() => setTrailerKey(trailer.key)} className="btn-secondary px-4 py-2.5 text-sm">
                  🎬 Trailer
                </button>
              )}
              <button onClick={toggleWL} disabled={wlLoading}
                className={`px-4 py-2.5 text-sm rounded-xl border font-medium transition-all flex items-center gap-2 ${
                  inWL ? 'bg-brand/10 border-brand/40 text-brand' : 'bg-dark-card border-dark-border text-slate-300 hover:border-brand/50'
                }`}>
                {wlLoading
                  ? <div className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />
                  : inWL ? '✓ Saved' : '+ Watchlist'}
              </button>
              <ShareButton title={movie.title} />
            </div>

            {/* User rating */}
            <StarRating tmdbId={Number(id)} type="movie"
              initialRating={ratingData.myRating} avgRating={ratingData.avgRating} totalRatings={ratingData.totalRatings} />
          </div>
        </div>

        {/* Overview */}
        <div className="card p-5 sm:p-6 mb-6">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">Overview</h3>
          <p className={`text-slate-300 text-sm sm:text-base leading-relaxed ${!readMore ? 'line-clamp-4' : ''}`}>
            {movie.overview || 'No overview available.'}
          </p>
          {movie.overview?.length > 200 && (
            <button onClick={() => setReadMore(r => !r)} className="text-brand text-xs mt-2 hover:underline">
              {readMore ? 'Show less' : 'Read more'}
            </button>
          )}

          {/* Details grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-5 pt-5 border-t border-dark-border">
            {[
              { label: 'Status',     value: movie.status },
              { label: 'Language',   value: movie.original_language?.toUpperCase() },
              { label: 'Budget',     value: movie.budget ? `$${(movie.budget/1e6).toFixed(0)}M` : '—' },
              { label: 'Revenue',    value: movie.revenue ? `$${(movie.revenue/1e6).toFixed(0)}M` : '—' },
              { label: 'Studio',     value: studios || '—' },
              { label: 'Genres',     value: genres.join(', ') || '—' },
            ].map(({ label, value }) => value && (
              <div key={label}>
                <p className="text-[11px] uppercase tracking-widest text-slate-600 font-semibold mb-0.5">{label}</p>
                <p className="text-sm text-slate-300">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Cast */}
        <div className="mb-6"><CastSection cast={cast} loading={false} /></div>

        {/* Similar */}
        <div className="mb-6"><SimilarRow tmdbId={Number(id)} type="movie" /></div>

        {/* More videos */}
        {teasers.length > 0 && (
          <div className="mb-6">
            <h3 className="section-title mb-3">More Videos</h3>
            <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
              {teasers.map(v => (
                <button key={v.key} onClick={() => setTrailerKey(v.key)}
                  className="flex-shrink-0 w-48 sm:w-64 rounded-xl overflow-hidden group relative">
                  <img src={`https://img.youtube.com/vi/${v.key}/mqdefault.jpg`} alt={v.type}
                    className="w-full aspect-video object-cover group-hover:opacity-80 transition-opacity" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>
                    </div>
                  </div>
                  <p className="absolute bottom-2 left-2 text-xs text-white font-semibold bg-black/60 px-2 py-0.5 rounded">{v.type}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
