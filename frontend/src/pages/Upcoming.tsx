// "Coming up": new and upcoming episodes of shows in My List / Continue Watching
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../services/api'
import Icon from '../components/Icon'

export interface UpEp { showId: number; name: string; poster: string; backdrop: string; season: number; episode: number; episodeName: string; airDate: string }

export function dayLabel(date: string) {
  const d = new Date(date + 'T12:00:00'), t = new Date(); t.setHours(12, 0, 0, 0)
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}

function EpisodeRow({ e, aired }: { e: UpEp; aired: boolean }) {
  const navigate = useNavigate()
  return (
    <button onClick={() => navigate(aired ? `/player/tv/${e.showId}?season=${e.season}&episode=${e.episode}` : `/tv/${e.showId}`)}
      className="w-full flex items-center gap-3 p-2.5 rounded-2xl bg-dark-card hover:bg-dark-border text-left transition-colors">
      <div className="w-12 aspect-[2/3] rounded-lg overflow-hidden bg-dark-void flex-shrink-0">{e.poster && <img src={e.poster} alt="" loading="lazy" className="w-full h-full object-cover" />}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white truncate">{e.name}</p>
        <p className="text-xs text-ink-muted truncate">S{e.season} · E{e.episode}{e.episodeName ? ` — ${e.episodeName}` : ''}</p>
      </div>
      {aired ? <span className="tech-pill text-cyan">Watch</span> : <Icon name="chevron_right" size={20} className="text-ink-faint" />}
    </button>
  )
}

export default function Upcoming() {
  const [data, setData] = useState<{ upcoming: UpEp[]; recent: UpEp[]; following: number } | null>(null)
  useEffect(() => { api.get('/users/upcoming').then(r => setData(r.data)).catch(() => setData({ upcoming: [], recent: [], following: 0 })) }, [])

  const groups = new Map<string, UpEp[]>()
  for (const e of data?.upcoming || []) { const k = dayLabel(e.airDate); groups.set(k, [...(groups.get(k) || []), e]) }

  return (
    <div className="min-h-screen pt-24 px-4 sm:px-6 max-w-3xl mx-auto pb-16">
      <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-2"><Icon name="calendar_month" size={30} className="text-brand" />Coming up</h1>
      <p className="text-sm text-ink-muted mt-1 mb-6">New episodes of the shows in My List and Continue Watching.</p>

      {!data ? <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-20" />)}</div>
        : !data.following ? (
          <div className="card p-8 text-center">
            <Icon name="playlist_add" size={40} className="text-ink-faint" />
            <p className="text-white font-bold mt-2">Follow some shows first</p>
            <p className="text-sm text-ink-muted mt-1">Add series to <Link to="/watchlist" className="text-brand-soft hover:underline">My List</Link> or start watching one, and their new episodes show up here.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {data.recent.length > 0 && (
              <section>
                <h2 className="text-label-sm uppercase text-cyan mb-2">New this week</h2>
                <div className="space-y-2">{data.recent.map(e => <EpisodeRow key={`r${e.showId}`} e={e} aired />)}</div>
              </section>
            )}
            {[...groups.entries()].map(([day, list]) => (
              <section key={day}>
                <h2 className="text-label-sm uppercase text-ink-faint mb-2">{day}</h2>
                <div className="space-y-2">{list.map(e => <EpisodeRow key={`u${e.showId}`} e={e} aired={false} />)}</div>
              </section>
            ))}
            {!data.recent.length && !data.upcoming.length && (
              <p className="text-sm text-ink-faint text-center py-10">No new episodes announced for your {data.following} show{data.following === 1 ? '' : 's'} yet.</p>
            )}
          </div>
        )}
    </div>
  )
}
