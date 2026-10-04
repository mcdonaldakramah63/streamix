// Admin: site-wide banner messages
import { useEffect, useState, useCallback } from 'react'
import api, { errorMessage } from '../../services/api'
import Icon from '../Icon'

interface Ann { _id: string; message: string; tone: 'info' | 'warning' | 'success'; active: boolean; expiresAt: string | null; createdAt: string }

export const TONES = {
  info:    { label: 'Info',    icon: 'campaign',     cls: 'bg-cyan/10 text-cyan border-cyan/30' },
  warning: { label: 'Warning', icon: 'warning',      cls: 'bg-gold/10 text-gold border-gold/30' },
  success: { label: 'Good news', icon: 'celebration', cls: 'bg-brand/10 text-brand-soft border-brand/30' },
} as const

export default function Announcements() {
  const [items,   setItems]   = useState<Ann[]>([])
  const [message, setMessage] = useState('')
  const [tone,    setTone]    = useState<Ann['tone']>('info')
  const [hours,   setHours]   = useState(0)
  const [busy,    setBusy]    = useState(false)
  const [error,   setError]   = useState('')

  const load = useCallback(() => api.get('/admin/announcements').then(r => setItems(r.data)).catch(e => setError(errorMessage(e))), [])
  useEffect(() => { load() }, [load])

  const post = async () => {
    setBusy(true); setError('')
    try { await api.post('/admin/announcements', { message, tone, expiresInHours: hours }); setMessage(''); load() }
    catch (e) { setError(errorMessage(e)) }
    finally { setBusy(false) }
  }

  const live = (a: Ann) => a.active && (!a.expiresAt || new Date(a.expiresAt).getTime() > Date.now())

  return (
    <div className="space-y-6 animate-fade-in">
      <section className="card p-5 sm:p-6">
        <h2 className="text-lg font-extrabold text-white">New announcement</h2>
        <p className="text-sm text-ink-muted mb-4">Shows as a banner at the top of the site for everyone until it expires or you turn it off.</p>
        <label htmlFor="ann-msg" className="sr-only">Message</label>
        <textarea id="ann-msg" value={message} onChange={e => setMessage(e.target.value)} maxLength={500} rows={3}
          placeholder="e.g. New films added to the Streamix Library this weekend!"
          className="w-full rounded-xl p-4 text-sm text-white placeholder-slate-600 outline-none resize-y"
          style={{ background: 'rgba(20,26,38,0.6)', border: '1px solid rgba(255,255,255,0.08)' }} />
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {(Object.keys(TONES) as Ann['tone'][]).map(t => (
            <button key={t} onClick={() => setTone(t)} aria-pressed={tone === t}
              className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all ${tone === t ? TONES[t].cls : 'border-white/10 text-ink-muted'}`}>
              {TONES[t].label}
            </button>
          ))}
          <select value={hours} onChange={e => setHours(Number(e.target.value))} aria-label="Expires"
            className="h-9 px-3 rounded-full bg-dark-border text-ink text-xs font-bold outline-none sm:ml-auto">
            <option value={0}>Until turned off</option><option value={6}>6 hours</option><option value={24}>1 day</option>
            <option value={72}>3 days</option><option value={168}>1 week</option>
          </select>
        </div>
        {message.trim() && (
          <div className={`mt-4 flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm ${TONES[tone].cls}`}>
            <Icon name={TONES[tone].icon} size={18} /><span className="flex-1">{message}</span><span className="text-[10px] uppercase opacity-70">Preview</span>
          </div>
        )}
        {error && <p className="text-sm text-brand-soft mt-3">{error}</p>}
        <button onClick={post} disabled={busy || !message.trim()} className="btn-primary mt-4 disabled:opacity-50"><Icon name="send" size={18} />Publish</button>
      </section>

      <section className="card overflow-hidden">
        <h2 className="text-label-sm uppercase text-ink-faint px-5 py-4">All announcements</h2>
        <div className="divide-y divide-white/[0.05]">
          {items.map(a => (
            <div key={a._id} className="flex items-center gap-3 px-5 py-3">
              <Icon name={TONES[a.tone].icon} size={18} className={TONES[a.tone].cls.split(' ').find(c => c.startsWith('text-'))} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white">{a.message}</p>
                <p className="text-xs text-ink-faint">
                  {new Date(a.createdAt).toLocaleString()}
                  {a.expiresAt && ` · ${new Date(a.expiresAt).getTime() > Date.now() ? 'expires' : 'expired'} ${new Date(a.expiresAt).toLocaleString()}`}
                </p>
              </div>
              <span className={`tech-pill ${live(a) ? 'text-cyan' : 'text-ink-faint'}`}>{live(a) ? 'Live' : 'Off'}</span>
              <button onClick={() => api.put(`/admin/announcements/${a._id}`, { active: !a.active }).then(load)} className="btn-secondary px-3 py-1 text-xs">
                {a.active ? 'Turn off' : 'Turn on'}
              </button>
              <button onClick={() => confirm('Delete this announcement?') && api.delete(`/admin/announcements/${a._id}`).then(load)}
                aria-label="Delete announcement" className="w-8 h-8 rounded-full flex items-center justify-center text-ink-faint hover:text-brand-soft hover:bg-brand/10">
                <Icon name="delete" size={18} />
              </button>
            </div>
          ))}
          {!items.length && <p className="px-5 py-8 text-center text-sm text-ink-faint">No announcements yet</p>}
        </div>
      </section>
    </div>
  )
}
