// Admin overview: sign-ups/activity chart, most-watched titles, server health
import { useEffect, useState } from 'react'
import api, { errorMessage } from '../../services/api'
import Icon from '../Icon'

interface Day { day: string; signups: number; active: number }
interface Top { movieId: number; type: string; title: string; poster: string; viewers: number; avgProgress: number }
interface Data {
  days: Day[]; topWatched: Top[]; libraryCount: number; suspendedCount: number
  health: { uptimeSec: number; memoryMb: number; heapMb: number; node: string; db: string; dbHost: string }
}

function uptime(s: number) {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`
}

export default function Analytics() {
  const [data,  setData]  = useState<Data | null>(null)
  const [error, setError] = useState('')

  useEffect(() => { api.get('/admin/analytics').then(r => setData(r.data)).catch(e => setError(errorMessage(e))) }, [])

  if (error) return <div className="rounded-xl px-4 py-3 text-sm bg-brand/10 text-brand-soft">{error}</div>
  if (!data) return <div className="skeleton h-64 mt-3" />

  const max = Math.max(1, ...data.days.map(d => Math.max(d.signups, d.active)))
  const h = data.health

  return (
    <div className="grid lg:grid-cols-3 gap-3 mt-3">
      <section className="card p-5 lg:col-span-2">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-label-sm uppercase text-ink-faint">Last 14 days</h2>
          <div className="flex gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-ink-muted"><span className="w-2.5 h-2.5 rounded-sm bg-brand" />Sign-ups</span>
            <span className="flex items-center gap-1.5 text-ink-muted"><span className="w-2.5 h-2.5 rounded-sm bg-cyan" />Active users</span>
          </div>
        </div>
        <div className="flex items-end gap-1.5 h-40" role="img"
          aria-label={`Sign-ups and active users per day: ${data.days.map(d => `${d.day} ${d.signups} sign-ups, ${d.active} active`).join('; ')}`}>
          {data.days.map(d => (
            <div key={d.day} className="flex-1 h-full flex flex-col justify-end items-center gap-1 group relative">
              <div className="w-full flex items-end justify-center gap-0.5 h-full">
                <div className="w-1/2 max-w-[10px] rounded-t bg-brand transition-all" style={{ height: `${(d.signups / max) * 100}%`, minHeight: d.signups ? 3 : 0 }} />
                <div className="w-1/2 max-w-[10px] rounded-t bg-cyan transition-all" style={{ height: `${(d.active / max) * 100}%`, minHeight: d.active ? 3 : 0 }} />
              </div>
              <span className="absolute -top-7 hidden group-hover:block whitespace-nowrap text-[11px] px-2 py-0.5 rounded-md bg-dark-high text-white z-10">
                {d.signups} new · {d.active} active
              </span>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-ink-faint mt-2">
          <span>{new Date(data.days[0].day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
          <span>Today</span>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-label-sm uppercase text-ink-faint mb-4">Server health</h2>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between"><dt className="text-ink-muted">Database</dt>
            <dd className={`font-bold flex items-center gap-1.5 ${h.db === 'connected' ? 'text-cyan' : 'text-brand-soft'}`}>
              <span className={`w-2 h-2 rounded-full ${h.db === 'connected' ? 'bg-cyan' : 'bg-brand'}`} />{h.db}
            </dd></div>
          <div className="flex justify-between"><dt className="text-ink-muted">Uptime</dt><dd className="text-white font-bold">{uptime(h.uptimeSec)}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-muted">Memory</dt><dd className="text-white font-bold">{h.memoryMb} MB <span className="text-ink-faint font-normal">({h.heapMb} heap)</span></dd></div>
          <div className="flex justify-between"><dt className="text-ink-muted">Node.js</dt><dd className="text-white font-bold">{h.node}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-muted">Library titles</dt><dd className="text-white font-bold">{data.libraryCount}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-muted">Suspended accounts</dt><dd className={`font-bold ${data.suspendedCount ? 'text-brand-soft' : 'text-white'}`}>{data.suspendedCount}</dd></div>
        </dl>
      </section>

      <section className="card p-5 lg:col-span-3">
        <h2 className="text-label-sm uppercase text-ink-faint mb-4">Most watched</h2>
        {!data.topWatched.length ? <p className="text-sm text-ink-faint">Nothing watched yet.</p> : (
          <ol className="grid sm:grid-cols-2 gap-2">
            {data.topWatched.map((t, i) => (
              <li key={`${t.type}-${t.movieId}`} className="flex items-center gap-3 rounded-xl bg-dark-surface p-2">
                <span className="w-6 text-center text-lg font-extrabold text-ink-faint">{i + 1}</span>
                <div className="w-9 h-12 rounded-md overflow-hidden bg-dark-void flex-shrink-0">
                  {t.poster && <img src={`https://image.tmdb.org/t/p/w92${t.poster}`} alt="" className="w-full h-full object-cover" loading="lazy" />}
                </div>
                <a href={`/${t.type === 'tv' ? 'tv' : 'movie'}/${t.movieId}`} className="min-w-0 flex-1 hover:underline">
                  <p className="text-sm font-bold text-white truncate">{t.title}</p>
                  <p className="text-xs text-ink-faint">{t.type === 'tv' ? 'Series' : 'Movie'} · avg {t.avgProgress}% watched</p>
                </a>
                <span className="flex items-center gap-1 text-sm font-bold text-gold pr-2"><Icon name="group" size={16} />{t.viewers}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
