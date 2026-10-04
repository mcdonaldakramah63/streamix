// Admin: viewers' problem reports
import { useEffect, useState } from 'react'
import api, { errorMessage } from '../../services/api'
import Icon from '../Icon'

interface Report {
  _id: string; username: string; type: 'movie' | 'tv'; tmdbId: number; season: number | null; episode: number | null
  title: string; source: string; reason: string; note: string; status: 'open' | 'resolved'; count: number; updatedAt: string
}
const LABEL: Record<string, string> = {
  'not-playing': 'Won’t play', buffering: 'Buffering', 'wrong-video': 'Wrong video', 'bad-quality': 'Poor quality',
  audio: 'Audio', subtitles: 'Subtitles', other: 'Other',
}

export default function Reports() {
  const [status, setStatus] = useState<'open' | 'resolved'>('open')
  const [items, setItems] = useState<Report[] | null>(null)
  const [open, setOpen] = useState(0)
  const [error, setError] = useState('')

  const load = () => api.get('/admin/reports', { params: { status } }).then(r => { setItems(r.data.items); setOpen(r.data.open) }).catch(e => setError(errorMessage(e)))
  useEffect(() => { setItems(null); load() }, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = async (r: Report, s: 'open' | 'resolved') => { await api.put(`/admin/reports/${r._id}`, { status: s }).catch(() => {}); load() }
  const del = async (r: Report) => { await api.delete(`/admin/reports/${r._id}`).catch(() => {}); load() }
  const link = (r: Report) => r.type === 'tv' ? `/player/tv/${r.tmdbId}?season=${r.season || 1}&episode=${r.episode || 1}` : `/player/movie/${r.tmdbId}`

  return (
    <section className="card overflow-hidden animate-fade-in">
      <div className="flex items-center gap-3 px-5 py-4">
        <h2 className="text-lg font-extrabold text-white flex-1">Problem reports</h2>
        {(['open', 'resolved'] as const).map(s => (
          <button key={s} onClick={() => setStatus(s)} aria-pressed={status === s}
            className={`px-3 py-1.5 rounded-full text-xs font-bold ${status === s ? 'bg-brand text-white' : 'bg-dark-surface text-ink-muted'}`}>
            {s === 'open' ? `Open (${open})` : 'Resolved'}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="px-5 pb-3 text-sm text-brand-soft">{error}</p>}
      {!items ? <div className="skeleton h-32 m-5" /> : !items.length ? (
        <p className="px-5 py-10 text-center text-sm text-ink-faint">{status === 'open' ? 'No open reports — everything is playing fine.' : 'Nothing resolved yet.'}</p>
      ) : (
        <ul className="divide-y divide-white/[0.05]">
          {items.map(r => (
            <li key={r._id} className="flex items-start gap-3 px-5 py-3">
              <span className="w-9 h-9 rounded-xl bg-gold/10 text-gold flex items-center justify-center flex-shrink-0"><Icon name="flag" size={18} /></span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-bold truncate">
                  {r.title || `${r.type} ${r.tmdbId}`}{r.type === 'tv' ? ` · S${r.season}E${r.episode}` : ''}
                </p>
                <p className="text-xs text-ink-muted">
                  <span className="text-gold font-semibold">{LABEL[r.reason] || r.reason}</span> on {r.source || 'unknown source'}
                  {r.count > 1 && <span className="text-brand-soft font-bold"> · reported {r.count}×</span>}
                </p>
                {r.note && <p className="text-xs text-ink mt-1 break-words">“{r.note}”</p>}
                <p className="text-[11px] text-ink-faint mt-1">{r.username} · {new Date(r.updatedAt).toLocaleString()}</p>
              </div>
              <a href={link(r)} className="btn-secondary px-3 py-1.5 text-xs">Open</a>
              {r.status === 'open'
                ? <button onClick={() => set(r, 'resolved')} className="btn-primary px-3 py-1.5 text-xs">Resolve</button>
                : <button onClick={() => set(r, 'open')} className="btn-secondary px-3 py-1.5 text-xs">Reopen</button>}
              <button onClick={() => del(r)} aria-label="Delete report" className="btn-icon w-8 h-8 text-ink-faint hover:text-brand-soft"><Icon name="delete" size={18} /></button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
