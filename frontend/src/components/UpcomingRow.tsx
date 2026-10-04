// Home: new and upcoming episodes for shows you follow
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { RailHeader } from './Carousel'
import { UpEp, dayLabel } from '../pages/Upcoming'

export default function UpcomingRow() {
  const navigate = useNavigate()
  const [items, setItems] = useState<(UpEp & { aired: boolean })[]>([])
  useEffect(() => {
    api.get('/users/upcoming').then(r => setItems([
      ...r.data.recent.map((e: UpEp) => ({ ...e, aired: true })),
      ...r.data.upcoming.slice(0, 12).map((e: UpEp) => ({ ...e, aired: false })),
    ])).catch(() => setItems([]))
  }, [])
  if (!items.length) return null
  return (
    <section className="mb-8 sm:mb-10">
      <RailHeader title="New episodes for you" icon="calendar_month" accent="cyan" right={
        <button onClick={() => navigate('/upcoming')} className="text-label-sm uppercase text-ink-faint hover:text-white">Calendar ›</button>
      } />
      <div className="flex gap-3 sm:gap-4 overflow-x-auto scrollbar-hide px-4 sm:px-6 lg:px-12 pb-2 snap-x">
        {items.map(e => (
          <button key={`${e.aired ? 'r' : 'u'}${e.showId}`} onClick={() => navigate(e.aired ? `/player/tv/${e.showId}?season=${e.season}&episode=${e.episode}` : `/tv/${e.showId}`)}
            className="group flex-shrink-0 w-60 sm:w-72 rounded-2xl overflow-hidden bg-dark-card text-left snap-start hover:shadow-focus transition-all">
            <div className="relative aspect-video bg-dark-void">
              {(e.backdrop || e.poster) && <img src={e.backdrop || e.poster} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />}
              <span className={`absolute top-2 left-2 tech-pill !bg-dark-void/80 ${e.aired ? 'text-cyan' : 'text-gold'}`}>{e.aired ? 'New' : dayLabel(e.airDate)}</span>
            </div>
            <div className="p-3">
              <p className="text-[13px] font-bold text-ink truncate">{e.name}</p>
              <p className="text-xs text-ink-faint truncate">S{e.season} · E{e.episode}{e.episodeName ? ` — ${e.episodeName}` : ''}</p>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}
