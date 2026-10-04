// frontend/src/pages/TVDetail.tsx
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
import { useProfileStore } from '../stores/profileStore'

interface Video { key: string; type: string; site: string; official: boolean }
interface Episode { id: number; episode_number: number; name: string; overview: string; still_path: string | null; runtime: number | null; air_date: string }

export default function TVDetail() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const resume   = useContinueWatching(s => s.items.find(i => i.movieId === Number(id)))

  const [show,       setShow]       = useState<any>(null)
  const [ratingData, setRatingData] = useState({ avgRating: 0, totalRatings: 0, myRating: 0 })
  const [loading,    setLoading]    = useState(true)
  const [trailerKey, setTrailerKey] = useState<string | null>(null)
  // Interest signals for recommendations
  useEffect(() => { if (id) track('detail', 'tv', Number(id)) }, [id])
  useEffect(() => { if (trailerKey && id) track('trailer', 'tv', Number(id)) }, [trailerKey, id])
  const [season,     setSeason]     = useState(1)
  const [episodes,   setEpisodes]   = useState<Episode[]>([])
  const [epLoading,  setEpLoading]  = useState(false)

  useEffect(() => {
    window.scrollTo(0, 0)
    setLoading(true)
    Promise.all([
      api.get(`/movies/tv/${id}`),
      api.get(`/ratings/${id}`, { params: { type: 'tv' } }).catch(() => ({ data: { avgRating: 0, totalRatings: 0, myRating: 0 } })),
    ]).then(([s, r]) => {
      setShow(s.data); setRatingData(r.data)
      const first = (s.data.seasons || []).find((x: any) => x.season_number > 0)
      setSeason(first?.season_number ?? 1)
    }).catch(() => setShow(null)).finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!show) return
    setEpLoading(true)
    api.get(`/movies/tv/${id}/season/${season}`)
      .then(r => setEpisodes(r.data.episodes || []))
      .catch(() => setEpisodes([]))
      .finally(() => setEpLoading(false))
  }, [id, season, show])

  // This profile's progress in each episode (✓ marks)
  const profileId = useProfileStore(st => st.activeProfile?._id)
  const [progress, setProgress] = useState<{ season: number; episode: number; progress: number; completed: boolean }[]>([])
  useEffect(() => {
    if (!profileId || !id) { setProgress([]); return }
    api.get(`/profiles/${profileId}/episodes/${id}`).then(r => setProgress(r.data)).catch(() => setProgress([]))
  }, [profileId, id])
  const watched = new Map(progress.filter(p => p.season === season).map(p => [p.episode, p]))

  const markEpisodes = async (eps: number[], value: boolean) => {
    if (!profileId) return
    // Optimistic update so the ticks respond instantly
    setProgress(list => {
      const rest = list.filter(p => !(p.season === season && eps.includes(p.episode)))
      return [...rest, ...eps.map(e => ({ season, episode: e, progress: value ? 100 : 0, completed: value }))]
    })
    await api.put(`/profiles/${profileId}/episodes/mark`, { tmdbId: Number(id), season, episodes: eps, watched: value }).catch(() => {})
  }
  const markSeason = (value: boolean) => markEpisodes(episodes.map(e => e.episode_number), value)

  if (loading) return (
    <div className="min-h-screen">
      <div className="skeleton rounded-none" style={{ height: 'clamp(300px,48vw,600px)' }} />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-12 py-8 space-y-4">
        <div className="h-9 skeleton w-2/3" /><div className="h-4 skeleton w-1/2" /><div className="h-24 skeleton" />
      </div>
    </div>
  )

  if (!show) return (
    <div className="pt-32 min-h-screen flex flex-col items-center gap-3 text-ink-muted">
      <Icon name="tv_off" size={48} />Show not found
      <button onClick={() => navigate('/')} className="btn-secondary mt-2">Back home</button>
    </div>
  )

  const videos: Video[] = show.videos?.results || []
  const trailer = videos.find(v => v.type === 'Trailer' && v.site === 'YouTube' && v.official)
               || videos.find(v => v.type === 'Trailer' && v.site === 'YouTube')
  const seasons = (show.seasons || []).filter((s: any) => s.season_number > 0)
  const genres  = (show.genres || []).map((g: any) => g.name)
  const canResume = resume?.type === 'tv' && resume.season && resume.episode
  const play = (s = 1, e = 1) => navigate(`/player/tv/${id}?season=${s}&episode=${e}`)

  return (
    <div className="min-h-screen pb-16">
      {trailerKey && <TrailerModal videoKey={trailerKey} title={show.name} onClose={() => setTrailerKey(null)} />}

      <DetailHero
        id={Number(id)} type="tv" title={show.name} tagline={show.tagline}
        backdrop={show.backdrop_path} poster={show.poster_path}
        year={(show.first_air_date || '').slice(0, 4)} releaseDate={show.first_air_date || ''}
        meta={[`${seasons.length} Season${seasons.length === 1 ? '' : 's'}`, show.number_of_episodes ? `${show.number_of_episodes} Episodes` : '']}
        status={show.status} rating={show.vote_average || 0} genres={genres}
        playLabel={canResume ? `Resume S${resume!.season} E${resume!.episode}` : 'Watch S1 E1'}
        onPlay={() => canResume ? play(resume!.season, resume!.episode) : play(seasons[0]?.season_number ?? 1, 1)}
        trailerKey={trailer?.key} onTrailer={setTrailerKey} ratingData={ratingData}
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-12 mt-8 space-y-10">
        <div className="grid lg:grid-cols-3 gap-6">
          <section className="card p-5 sm:p-6 lg:col-span-2">
            <h2 className="text-label-sm uppercase text-ink-faint mb-3">Storyline</h2>
            <p className="text-ink text-sm sm:text-base leading-relaxed">{show.overview || 'No overview available.'}</p>
            {show.networks?.length > 0 && (
              <p className="text-xs text-ink-faint mt-4">Network: <span className="text-ink">{show.networks.map((n: any) => n.name).join(', ')}</span></p>
            )}
          </section>
          <LiveVoting tmdbId={Number(id)} type="tv" />
        </div>

        {seasons.length > 0 && (
          <section>
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="section-title">Episodes</h2>
              {profileId && episodes.length > 0 && (
                <button onClick={() => markSeason(!episodes.every(e => watched.get(e.episode_number)?.completed))}
                  className="ml-auto h-10 px-3 rounded-full text-xs font-bold text-ink-muted hover:text-white bg-dark-border flex items-center gap-1.5">
                  <Icon name="done_all" size={16} />{episodes.every(e => watched.get(e.episode_number)?.completed) ? 'Unmark season' : 'Mark season watched'}
                </button>
              )}
              <select value={season} onChange={e => setSeason(Number(e.target.value))} aria-label="Season"
                className="h-10 px-4 rounded-full bg-dark-border text-ink text-sm font-semibold outline-none cursor-pointer">
                {seasons.map((s: any) => <option key={s.season_number} value={s.season_number}>{s.name || `Season ${s.season_number}`}</option>)}
              </select>
            </div>
            {epLoading ? (
              <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 skeleton" />)}</div>
            ) : (
              <div className="space-y-2.5">
                {episodes.map(ep => {
                  const current = canResume && resume!.season === season && resume!.episode === ep.episode_number
                  const w = watched.get(ep.episode_number)
                  return (
                    <div key={ep.id} className="relative">
                    <button onClick={() => play(season, ep.episode_number)}
                      className={`w-full flex gap-3 sm:gap-4 p-2.5 pr-12 rounded-2xl text-left transition-colors group ${current ? 'bg-brand/10 ring-1 ring-brand/40' : 'bg-dark-card hover:bg-dark-border'}`}>
                      <div className="relative w-32 sm:w-44 aspect-video rounded-xl overflow-hidden bg-dark-void flex-shrink-0">
                        {ep.still_path && <img src={`https://image.tmdb.org/t/p/w300${ep.still_path}`} alt="" loading="lazy" className={`w-full h-full object-cover ${w?.completed ? 'opacity-60' : ''}`} />}
                        {w && !w.completed && w.progress > 0 && (
                          <span className="absolute bottom-0 inset-x-0 h-1 bg-white/20"><span className="block h-full bg-brand" style={{ width: `${w.progress}%` }} /></span>
                        )}
                        {w?.completed && <span className="absolute top-1.5 left-1.5 tech-pill !bg-dark-void/80 text-cyan"><Icon name="check" size={12} />Watched</span>}
                        <span className="absolute inset-0 m-auto w-9 h-9 rounded-full bg-dark-void/70 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
                          <Icon name="play_arrow" size={22} fill />
                        </span>
                      </div>
                      <div className="min-w-0 py-0.5">
                        <p className="text-sm font-bold text-white truncate">
                          <span className="text-ink-faint mr-1.5">{ep.episode_number}.</span>{ep.name}
                        </p>
                        <p className="text-xs text-ink-faint mt-0.5">{[ep.runtime ? `${ep.runtime}m` : '', ep.air_date].filter(Boolean).join(' • ')}</p>
                        <p className="text-xs text-ink-muted mt-1.5 line-clamp-2 hidden sm:block">{ep.overview}</p>
                      </div>
                    </button>
                    {profileId && (
                      <button onClick={() => markEpisodes([ep.episode_number], !w?.completed)} aria-pressed={!!w?.completed}
                        aria-label={w?.completed ? `Mark episode ${ep.episode_number} unwatched` : `Mark episode ${ep.episode_number} watched`}
                        title={w?.completed ? 'Mark unwatched' : 'Mark watched'}
                        className={`absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center transition-colors ${w?.completed ? 'bg-cyan/20 text-cyan' : 'bg-white/[0.06] text-ink-faint hover:text-white'}`}>
                        <Icon name={w?.completed ? 'check_circle' : 'radio_button_unchecked'} size={20} fill={!!w?.completed} />
                      </button>
                    )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )}

        <CastSection cast={show.credits?.cast || []} loading={false} />
        <SimilarRow tmdbId={Number(id)} type="tv" />
      </div>
    </div>
  )
}
