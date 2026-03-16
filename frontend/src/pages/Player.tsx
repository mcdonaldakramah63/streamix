import { useEffect, useState } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { Movie, Episode } from '../types'
import { fetchMovieDetails, fetchTVDetails, fetchSeason } from '../services/api'
import { poster, rating, year, runtime } from '../services/tmdb'
import VideoPlayer from '../components/VideoPlayer'
import DownloadLinks from '../components/DownloadLinks'

export default function Player() {
  const { type, id } = useParams<{ type: string; id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const season  = Number(searchParams.get('season')  || 1)
  const episode = Number(searchParams.get('episode') || 1)

  const [media,      setMedia]      = useState<Movie | null>(null)
  const [episodes,   setEpisodes]   = useState<Episode[]>([])
  const [curEp,      setCurEp]      = useState<Episode | null>(null)
  const [serverIdx,  setServerIdx]  = useState(0)
  const [showDL,     setShowDL]     = useState(false)
  const [sidebarOpen,setSidebarOpen]= useState(true)
  const [loading,    setLoading]    = useState(true)

  // Load media info
  useEffect(() => {
    window.scrollTo(0, 0)
    setLoading(true)
    const fn = type === 'tv' ? fetchTVDetails : fetchMovieDetails
    fn(Number(id))
      .then(r => setMedia(r.data))
      .finally(() => setLoading(false))
  }, [id, type])

  // Load episodes when season changes (TV only)
  useEffect(() => {
    if (type === 'tv') {
      fetchSeason(Number(id), season).then(r => {
        const eps = r.data.episodes ?? []
        setEpisodes(eps)
        setCurEp(eps.find((e: Episode) => e.episode_number === episode) ?? null)
      })
    }
  }, [id, type, season])

  // Update curEp when episode param changes
  useEffect(() => {
    if (episodes.length) {
      setCurEp(episodes.find(e => e.episode_number === episode) ?? null)
    }
  }, [episode, episodes])

  const imdbId  = media?.external_ids?.imdb_id
  const title   = media?.title || media?.name || ''

  // Build server list after media loads
  const servers = type === 'tv'
    ? [
        { name: 'Server 1', url: imdbId ? `https://multiembed.mov/?video_id=${imdbId}&s=${season}&e=${episode}` : '' },
        { name: 'Server 2', url: `https://multiembed.mov/directstream.php?video_id=${id}&tmdb=1&s=${season}&e=${episode}` },
        { name: 'VidSrc',   url: `https://vidsrc.to/embed/tv/${id}/${season}/${episode}` },
        { name: 'VidSrc 2', url: `https://vidsrc.me/embed/tv?tmdb=${id}&season=${season}&episode=${episode}` },
      ]
    : [
        { name: 'Server 1', url: imdbId ? `https://multiembed.mov/?video_id=${imdbId}` : '' },
        { name: 'Server 2', url: `https://multiembed.mov/directstream.php?video_id=${id}&tmdb=1` },
        { name: 'VidSrc',   url: `https://vidsrc.to/embed/movie/${id}` },
        { name: 'VidSrc 2', url: `https://vidsrc.me/embed/movie?tmdb=${id}` },
      ]

  const activeServers = servers.filter(s => s.url !== '')

  const goEpisode = (ep: number, s = season) => {
    setServerIdx(0)
    setSearchParams({ season: String(s), episode: String(ep) })
  }

  const prevEp = episodes.find(e => e.episode_number === episode - 1)
  const nextEp = episodes.find(e => e.episode_number === episode + 1)

  return (
    <div className="pt-14 min-h-screen bg-black">
      <div className="max-w-7xl mx-auto px-4 py-4">

        {/* Top bar */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-brand text-sm transition-colors flex-shrink-0">
            ← Back
          </button>
          <div className="flex-1 flex items-center gap-2 flex-wrap">
            <span className="font-bold text-white text-sm">{title}</span>
            {type === 'tv' && (
              <span className="text-brand text-xs font-semibold bg-brand/10 border border-brand/20 px-2 py-0.5 rounded-full">
                S{season} E{episode}{curEp ? ` — ${curEp.name}` : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Download button */}
            <button
              onClick={() => setShowDL(prev => !prev)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                showDL
                  ? 'bg-brand text-dark border-brand'
                  : 'bg-dark-card border-dark-border text-slate-300 hover:border-brand hover:text-brand'
              }`}
            >
              ⬇ {showDL ? 'Hide Downloads' : 'Download'}
            </button>
            {type === 'tv' && (
              <button
                onClick={() => setSidebarOpen(prev => !prev)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-dark-card border border-dark-border text-slate-400 hover:text-white transition-colors"
              >
                {sidebarOpen ? '✕ Episodes' : '☰ Episodes'}
              </button>
            )}
          </div>
        </div>

        {/* Main layout */}
        <div className={`flex gap-4 ${type === 'tv' && sidebarOpen ? 'flex-col lg:flex-row' : ''}`}>

          {/* Player column */}
          <div className={type === 'tv' && sidebarOpen ? 'flex-1 min-w-0' : 'w-full'}>

            {/* Server selector */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-xs text-slate-500">Server:</span>
              {activeServers.map((s, i) => (
                <button key={i} onClick={() => setServerIdx(i)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    serverIdx === i
                      ? 'bg-brand text-dark'
                      : 'bg-dark-card border border-dark-border text-slate-400 hover:border-brand hover:text-white'
                  }`}>
                  {s.name}
                </button>
              ))}
            </div>

            {/* Player */}
            <div className="rounded-xl overflow-hidden border border-dark-border">
              {loading ? (
                <div className="aspect-video flex items-center justify-center bg-dark-surface">
                  <div className="w-10 h-10 border-2 border-dark-border border-t-brand rounded-full animate-spin" />
                </div>
              ) : (
                <VideoPlayer
                  src={activeServers[serverIdx]?.url}
                  tmdbId={Number(id)}
                  type={type as 'movie' | 'tv'}
                  season={season}
                  episode={episode}
                />
              )}
            </div>

            {/* Prev / Next for TV */}
            {type === 'tv' && (
              <div className="flex items-center justify-between mt-3">
                <button
                  onClick={() => prevEp && goEpisode(prevEp.episode_number)}
                  disabled={!prevEp}
                  className="flex items-center gap-2 px-4 py-2 bg-dark-card border border-dark-border rounded-xl text-sm text-slate-400 hover:border-brand hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  ← Previous
                </button>
                <span className="text-xs text-slate-600">
                  {episode} / {episodes.length}
                </span>
                <button
                  onClick={() => nextEp && goEpisode(nextEp.episode_number)}
                  disabled={!nextEp}
                  className="flex items-center gap-2 px-4 py-2 bg-dark-card border border-dark-border rounded-xl text-sm text-slate-400 hover:border-brand hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  Next →
                </button>
              </div>
            )}

            {/* Download panel — shown/hidden by button above */}
            {showDL && (
              <div className="mt-4">
                <DownloadLinks
                  title={title}
                  imdbId={imdbId}
                  tmdbId={Number(id)}
                  type={type as 'movie' | 'tv'}
                  season={season}
                  episode={episode}
                />
              </div>
            )}

            {/* Media info */}
            {media && (
              <div className="mt-4 flex gap-4 bg-dark-surface border border-dark-border rounded-xl p-4">
                <img src={poster(media.poster_path)} alt="" className="w-20 rounded-lg hidden sm:block flex-shrink-0" />
                <div>
                  <h2 className="font-bold text-white mb-1">{title}</h2>
                  <div className="flex gap-3 items-center text-xs text-slate-400 mb-2 flex-wrap">
                    <span className="text-yellow-400 font-bold">★ {rating(media.vote_average)}</span>
                    <span>{year(media.release_date || media.first_air_date)}</span>
                    {media.runtime && <span>{runtime(media.runtime)}</span>}
                    {type === 'tv' && media.number_of_seasons && <span>{media.number_of_seasons} Seasons</span>}
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed line-clamp-3">
                    {curEp?.overview || media.overview}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Episode sidebar */}
          {type === 'tv' && sidebarOpen && (
            <div className="w-full lg:w-72 flex-shrink-0">
              <div className="bg-dark-surface border border-dark-border rounded-xl overflow-hidden">
                {/* Season tabs */}
                <div className="p-3 border-b border-dark-border bg-dark-card">
                  <p className="text-xs text-slate-500 mb-2 font-semibold uppercase tracking-wider">Season</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {media?.seasons?.filter(s => s.season_number > 0).map(s => (
                      <button key={s.id}
                        onClick={() => goEpisode(1, s.season_number)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                          season === s.season_number
                            ? 'bg-brand text-dark'
                            : 'bg-dark-surface border border-dark-border text-slate-400 hover:text-white'
                        }`}>
                        S{s.season_number}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Episode list */}
                <div className="overflow-y-auto max-h-[55vh]">
                  {episodes.length === 0 ? (
                    <div className="p-4 text-center text-slate-600 text-sm">Loading episodes...</div>
                  ) : episodes.map(ep => (
                    <button key={ep.id}
                      onClick={() => goEpisode(ep.episode_number)}
                      className={`w-full flex gap-3 items-center p-3 text-left border-b border-dark-border/50 transition-all hover:bg-dark-card group ${
                        ep.episode_number === episode ? 'bg-brand/10 border-l-2 border-l-brand' : ''
                      }`}>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black flex-shrink-0 transition-all ${
                        ep.episode_number === episode
                          ? 'bg-brand text-dark'
                          : 'bg-dark-card text-slate-500 group-hover:text-white'
                      }`}>
                        {ep.episode_number}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-slate-200 truncate">{ep.name}</div>
                        {ep.runtime && <div className="text-xs text-slate-600">{ep.runtime}m</div>}
                      </div>
                      {ep.episode_number === episode && (
                        <span className="text-brand text-xs flex-shrink-0">▶</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
