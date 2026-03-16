import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Movie, Episode } from '../types'
import { fetchTVDetails, fetchSeason } from '../services/api'
import { backdrop, poster, avatar, rating, year } from '../services/tmdb'
import { useWatchlistStore } from '../context/watchlistStore'
import { useAuthStore } from '../context/authStore'
import Carousel from '../components/Carousel'

export default function TVDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { add, remove, isInList, fetch: fetchWL } = useWatchlistStore()

  const [show, setShow]           = useState<Movie | null>(null)
  const [episodes, setEpisodes]   = useState<Episode[]>([])
  const [selSeason, setSelSeason] = useState(1)
  const [loadingEps, setLoadingEps] = useState(false)
  const [loading, setLoading]     = useState(true)
  const [activeTab, setActiveTab] = useState<'episodes' | 'cast' | 'similar'>('episodes')

  useEffect(() => {
    window.scrollTo(0, 0)
    setLoading(true)
    fetchTVDetails(Number(id))
      .then(r => {
        setShow(r.data)
        loadSeason(1)
      })
      .finally(() => setLoading(false))
    if (user) fetchWL()
  }, [id])

  const loadSeason = async (s: number) => {
    setSelSeason(s)
    setLoadingEps(true)
    try {
      const r = await fetchSeason(Number(id), s)
      setEpisodes(r.data.episodes ?? [])
    } finally {
      setLoadingEps(false)
    }
  }

  if (loading) return (
    <div className="pt-14">
      <div className="w-full h-[400px] bg-dark-surface animate-pulse" />
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-4">
        {[300, 200, 500].map(w => <div key={w} className="h-4 bg-dark-card rounded animate-pulse" style={{ width: w }} />)}
      </div>
    </div>
  )

  if (!show) return <div className="pt-20 text-center text-slate-400">Show not found</div>

  const inWL = isInList(show.id)
  const validSeasons = (show.seasons ?? []).filter(s => s.season_number > 0)
  const airDate = show.first_air_date
  const imdbId = show.external_ids?.imdb_id

  const handleWatchlist = () => {
    if (!user) return navigate('/login')
    if (inWL) remove(show.id)
    else add({ movieId: show.id, title: show.name || '', poster: show.poster_path ?? '', backdrop: show.backdrop_path ?? '', rating: show.vote_average, year: year(airDate) })
  }

  const currentEpisode = (ep: Episode) =>
    navigate(`/player/tv/${show.id}?season=${selSeason}&episode=${ep.episode_number}`)

  return (
    <div className="pt-14">
      {/* Backdrop */}
      <div className="relative h-[420px] overflow-hidden">
        <img src={backdrop(show.backdrop_path)} alt="" className="w-full h-full object-cover object-top" />
        <div className="absolute inset-0 bg-dark/50" />
        <div className="absolute inset-0 bg-gradient-to-t from-dark via-dark/20 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-dark/80 to-transparent" />
      </div>

      <div className="max-w-6xl mx-auto px-4 -mt-60 relative z-10">
        {/* Header */}
        <div className="flex gap-6 items-end mb-8">
          <img src={poster(show.poster_path)} alt={show.name} className="w-36 rounded-xl shadow-2xl hidden sm:block flex-shrink-0 border border-white/10" />
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="bg-brand text-dark text-xs font-black px-2.5 py-1 rounded-full uppercase tracking-widest">TV Series</span>
              {show.number_of_seasons && <span className="text-xs text-slate-400 bg-dark-card border border-dark-border px-2.5 py-1 rounded-full">{show.number_of_seasons} Seasons</span>}
            </div>
            <h1 className="text-4xl font-black mb-2 tracking-tight leading-tight">{show.name}</h1>
            <div className="flex flex-wrap gap-3 items-center text-sm text-slate-400 mb-3">
              <span className="bg-brand/15 border border-brand/30 text-brand px-2 py-0.5 rounded-full text-xs font-bold">★ {rating(show.vote_average)}</span>
              <span>{year(airDate)}</span>
              {show.genres?.slice(0, 3).map(g => (
                <span key={g.id} className="bg-dark-card border border-dark-border px-2.5 py-0.5 rounded-full text-xs">{g.name}</span>
              ))}
            </div>
            <p className="text-slate-400 text-sm leading-relaxed max-w-2xl mb-5 line-clamp-3">{show.overview}</p>
            <div className="flex gap-3 flex-wrap">
              {imdbId && (
                <button onClick={() => navigate(`/player/tv/${show.id}?season=1&episode=1`)} className="btn-primary flex items-center gap-2">
                  ▶ Play S1E1
                </button>
              )}
              <button onClick={handleWatchlist} className={`btn-ghost flex items-center gap-2 ${inWL ? 'border-brand text-brand' : ''}`}>
                {inWL ? '✓ In Watchlist' : '+ Watchlist'}
              </button>
            </div>
          </div>
        </div>

        {/* Season Selector */}
        {validSeasons.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <h3 className="text-sm font-bold text-slate-300">Season</h3>
              <div className="flex gap-2 flex-wrap">
                {validSeasons.map(s => (
                  <button key={s.id} onClick={() => loadSeason(s.season_number)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${selSeason === s.season_number ? 'bg-brand text-dark scale-105' : 'bg-dark-card border border-dark-border text-slate-400 hover:border-brand hover:text-white'}`}>
                    S{s.season_number}
                    <span className="ml-1.5 text-xs opacity-60">{s.episode_count}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-dark-surface border border-dark-border rounded-xl p-1 w-fit">
          {(['episodes', 'cast', 'similar'] as const).map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold capitalize transition-all ${activeTab === t ? 'bg-brand text-dark' : 'text-slate-400 hover:text-white'}`}>
              {t}
            </button>
          ))}
        </div>

        {/* Episodes Tab */}
        {activeTab === 'episodes' && (
          <div className="mb-10">
            {loadingEps ? (
              <div className="space-y-3">
                {Array(6).fill(0).map((_, i) => (
                  <div key={i} className="h-24 bg-dark-card rounded-xl animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {episodes.map(ep => (
                  <button key={ep.id} onClick={() => currentEpisode(ep)}
                    className="w-full flex gap-4 items-center bg-dark-surface hover:bg-dark-card border border-dark-border rounded-xl p-3 text-left transition-all group hover:border-brand/40">
                    {/* Episode Number Badge */}
                    <div className="w-10 h-10 rounded-lg bg-dark-card border border-dark-border flex items-center justify-center text-xs font-black text-slate-400 group-hover:bg-brand group-hover:text-dark group-hover:border-brand transition-all flex-shrink-0">
                      {ep.episode_number}
                    </div>
                    {/* Still Image */}
                    {ep.still_path ? (
                      <img src={`https://image.tmdb.org/t/p/w300${ep.still_path}`} alt=""
                        className="w-28 aspect-video object-cover rounded-lg flex-shrink-0 bg-dark-card" />
                    ) : (
                      <div className="w-28 aspect-video rounded-lg bg-dark-card flex-shrink-0 flex items-center justify-center text-slate-600 text-xs">No Image</div>
                    )}
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm font-bold text-white truncate">{ep.name}</span>
                        {ep.runtime && <span className="text-xs text-slate-500 flex-shrink-0">{ep.runtime}m</span>}
                        {ep.air_date && <span className="text-xs text-slate-600 flex-shrink-0">{ep.air_date}</span>}
                      </div>
                      <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{ep.overview}</p>
                    </div>
                    {/* Play icon */}
                    <div className="w-9 h-9 rounded-full border border-dark-border flex items-center justify-center text-slate-500 group-hover:border-brand group-hover:text-brand transition-all flex-shrink-0">
                      ▶
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Cast Tab */}
        {activeTab === 'cast' && show.credits?.cast?.length && (
          <div className="mb-10">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {show.credits.cast.slice(0, 20).map(c => (
                <div key={c.id} className="bg-dark-surface border border-dark-border rounded-xl p-3 flex items-center gap-3">
                  <img src={avatar(c.profile_path)} alt={c.name}
                    className="w-12 h-12 rounded-full object-cover bg-dark-card flex-shrink-0"
                    onError={e => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(c.name)}&background=161b27&color=94a3b8` }} />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-200 truncate">{c.name}</div>
                    <div className="text-xs text-slate-500 truncate">{c.character}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Similar Tab */}
        {activeTab === 'similar' && show.recommendations?.results?.length && (
          <div className="mb-10">
            <Carousel title="Similar Shows" movies={show.recommendations.results} />
          </div>
        )}
      </div>
    </div>
  )
}
