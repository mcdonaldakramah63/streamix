// Viewing activity for the current profile (like Netflix): history, hide items, hidden titles, CSV download
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api'
import Icon from '../components/Icon'
import { useProfileStore } from '../stores/profileStore'

interface H { tmdbId: number; title: string; type: string; progress: number; completed: boolean; watchedAt: string }

function HiddenRow({ k, onUnhide }: { k: string; onUnhide: () => void }) {
  const [name, setName] = useState(k)
  useEffect(() => {
    const [type, id] = k.split(':')
    api.get(type === 'tv' ? `/movies/tv/${id}` : `/movies/${id}`).then(r => setName(r.data.title || r.data.name)).catch(() => {})
  }, [k])
  const [type, id] = k.split(':')
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <Link to={type === 'tv' ? `/tv/${id}` : `/movie/${id}`} className="flex-1 min-w-0 text-sm text-white truncate hover:underline">{name}</Link>
      <button onClick={onUnhide} className="text-xs font-bold text-cyan hover:underline">Show again</button>
    </li>
  )
}

export default function ViewingActivity() {
  const profile = useProfileStore(s => s.activeProfile)
  const setHidden = useProfileStore(s => s.setHidden)
  const [tab, setTab] = useState<'watched' | 'hidden'>('watched')
  const [history, setHistory] = useState<H[] | null>(null)
  const hidden = profile?.hiddenTitles || []

  useEffect(() => {
    if (!profile) return
    api.get(`/profiles/${profile._id}/history`).then(r => setHistory(r.data.history)).catch(() => setHistory([]))
  }, [profile?._id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!profile) return null

  const remove = async (id: number | 'all') => {
    if (id === 'all' && !confirm(`Clear all of ${profile.name}'s viewing activity? Recommendations will start fresh.`)) return
    await api.delete(`/profiles/${profile._id}/history/${id}`).catch(() => {})
    setHistory(h => (id === 'all' ? [] : (h || []).filter(x => x.tmdbId !== id)))
  }

  const downloadCsv = () => {
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`
    const rows = [['Title', 'Type', 'Date', 'Progress'], ...(history || []).map(h => [h.title, h.type, new Date(h.watchedAt).toISOString().slice(0, 10), h.completed ? 'Finished' : `${Math.round(h.progress)}%`])]
    const url = URL.createObjectURL(new Blob([rows.map(r => r.map(esc).join(',')).join('\n')], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = `streamix-${profile.name}-activity.csv`; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  // Group by day like Netflix
  const groups = new Map<string, H[]>()
  for (const h of history || []) {
    const d = new Date(h.watchedAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    groups.set(d, [...(groups.get(d) || []), h])
  }

  return (
    <div className="min-h-screen pt-24 px-4 sm:px-6 max-w-3xl mx-auto pb-24">
      <h1 className="text-2xl sm:text-3xl font-extrabold text-white">Viewing activity</h1>
      <p className="text-sm text-ink-muted mt-1">{profile.name} · what's here shapes {profile.name}'s recommendations</p>

      <div className="flex items-center gap-2 mt-5 mb-4">
        {(['watched', 'hidden'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} aria-pressed={tab === t}
            className={`px-4 py-2 rounded-full text-sm font-bold ${tab === t ? 'bg-white text-dark-void' : 'bg-dark-card text-ink-muted hover:text-white'}`}>
            {t === 'watched' ? 'Watched' : `Not for me (${hidden.length})`}
          </button>
        ))}
        {tab === 'watched' && !!history?.length && (
          <div className="ml-auto flex gap-1">
            <button onClick={downloadCsv} className="btn-icon w-10 h-10" title="Download as CSV" aria-label="Download as CSV"><Icon name="download" size={20} /></button>
            <button onClick={() => remove('all')} className="btn-icon w-10 h-10 hover:text-brand-soft" title="Clear all" aria-label="Clear all activity"><Icon name="delete_sweep" size={20} /></button>
          </div>
        )}
      </div>

      {tab === 'watched' ? (
        !history ? <div className="skeleton h-48" /> : !history.length ? (
          <p className="text-sm text-ink-faint text-center py-12">Nothing watched on this profile yet.</p>
        ) : (
          <div className="space-y-5">
            {[...groups.entries()].map(([day, list]) => (
              <section key={day}>
                <h2 className="text-label-sm uppercase text-ink-faint mb-2">{day}</h2>
                <ul className="card divide-y divide-white/[0.05]">
                  {list.map(h => (
                    <li key={h.tmdbId} className="flex items-center gap-3 px-4 py-2.5">
                      <Link to={h.type === 'movie' ? `/movie/${h.tmdbId}` : `/tv/${h.tmdbId}`} className="flex-1 min-w-0 text-sm text-white truncate hover:underline">{h.title || 'Untitled'}</Link>
                      <span className="text-xs text-ink-faint">{h.completed ? 'Finished' : `${Math.round(h.progress)}%`}</span>
                      <button onClick={() => remove(h.tmdbId)} title="Hide from viewing activity" aria-label={`Remove ${h.title}`}
                        className="btn-icon w-8 h-8 text-ink-faint hover:text-brand-soft"><Icon name="visibility_off" size={18} /></button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )
      ) : !hidden.length ? (
        <p className="text-sm text-ink-faint text-center py-12">Titles you mark “Not for me” won't appear in rows or recommendations. You haven't hidden any.</p>
      ) : (
        <ul className="card divide-y divide-white/[0.05]">
          {hidden.slice().reverse().map(k => <HiddenRow key={k} k={k} onUnhide={() => setHidden(k, false)} />)}
        </ul>
      )}
    </div>
  )
}
