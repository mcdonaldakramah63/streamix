// Admin: usage limits (all unlimited while Streamix is free) and push broadcasts
import { useEffect, useState } from 'react'
import api, { errorMessage } from '../../services/api'
import Icon from '../Icon'

interface Limits { maxProfiles: number; maxStreams: number; downloadsPerMonth: number; partyMaxMembers: number }
const FIELDS: { key: keyof Limits; label: string; hint: string; min: number; max: number; zero?: string }[] = [
  { key: 'maxProfiles',       label: 'Profiles per account',        hint: 'How many viewer profiles one account can have', min: 1, max: 10 },
  { key: 'maxStreams',        label: 'Screens at once',             hint: 'Videos one account can play at the same time',  min: 0, max: 20, zero: 'Unlimited' },
  { key: 'downloadsPerMonth', label: 'Library downloads per month', hint: 'File downloads from the Streamix library',       min: 0, max: 10000, zero: 'Unlimited' },
  { key: 'partyMaxMembers',   label: 'People per watch party',      hint: 'Including the host',                              min: 2, max: 100 },
]

export default function AppSettings() {
  const [limits, setLimits] = useState<Limits | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [push, setPush] = useState({ title: '', body: '', url: '/' })
  const [pushMsg, setPushMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { api.get('/admin/settings/limits').then(r => setLimits(r.data.limits)).catch(e => setMsg({ ok: false, text: errorMessage(e) })) }, [])

  const saveLimits = async () => {
    if (!limits) return
    setBusy(true); setMsg(null)
    try { const { data } = await api.put('/admin/settings/limits', limits); setLimits(data.limits); setMsg({ ok: true, text: 'Limits saved' }) }
    catch (e) { setMsg({ ok: false, text: errorMessage(e) }) }
    finally { setBusy(false) }
  }

  const sendPush = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!confirm('Send this notification to everyone who turned notifications on?')) return
    setBusy(true); setPushMsg(null)
    try { const { data } = await api.post('/admin/notify', push); setPushMsg({ ok: true, text: `Sent to ${data.sent} device${data.sent === 1 ? '' : 's'}` }); setPush({ title: '', body: '', url: '/' }) }
    catch (err) { setPushMsg({ ok: false, text: errorMessage(err) }) }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <section className="card p-5">
        <h2 className="text-lg font-extrabold text-white">Usage limits</h2>
        <p className="text-sm text-ink-muted mt-1 mb-4">Everything is free and unlimited for now. When you start offering plans, tighten these here — no code changes needed.</p>
        {!limits ? <div className="skeleton h-40" /> : (
          <div className="grid sm:grid-cols-2 gap-3">
            {FIELDS.map(f => (
              <label key={f.key} className="rounded-xl bg-dark-surface p-3 block">
                <span className="text-sm text-white font-semibold">{f.label}</span>
                <span className="block text-xs text-ink-faint mb-2">{f.hint}</span>
                <div className="flex items-center gap-2">
                  <input type="number" min={f.min} max={f.max} value={limits[f.key]}
                    onChange={e => setLimits({ ...limits, [f.key]: Number(e.target.value) })} className="input h-10 w-28" />
                  {f.zero && limits[f.key] === 0 && <span className="text-xs text-cyan">{f.zero}</span>}
                </div>
              </label>
            ))}
          </div>
        )}
        <div className="flex items-center gap-3 mt-4">
          <button onClick={saveLimits} disabled={busy || !limits} className="btn-primary px-5 py-2 disabled:opacity-50">Save limits</button>
          {msg && <span role="status" className={`text-sm ${msg.ok ? 'text-cyan' : 'text-brand-soft'}`}>{msg.text}</span>}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-extrabold text-white flex items-center gap-2"><Icon name="notifications_active" size={22} className="text-gold" />Push notification</h2>
        <p className="text-sm text-ink-muted mt-1 mb-4">Goes to every device where someone turned notifications on. New episodes, new library videos and weekly picks are sent automatically.</p>
        <form onSubmit={sendPush} className="space-y-2">
          <input value={push.title} onChange={e => setPush({ ...push, title: e.target.value })} maxLength={80} placeholder="Title" aria-label="Notification title" className="input h-11 w-full" />
          <input value={push.body} onChange={e => setPush({ ...push, body: e.target.value })} maxLength={200} placeholder="Message" aria-label="Notification message" className="input h-11 w-full" />
          <input value={push.url} onChange={e => setPush({ ...push, url: e.target.value })} maxLength={200} placeholder="Opens page, e.g. /movie/653" aria-label="Page to open" className="input h-11 w-full font-mono" />
          <div className="flex items-center gap-3">
            <button disabled={busy || !push.title.trim()} className="btn-primary px-5 py-2 disabled:opacity-50"><Icon name="send" size={18} />Send</button>
            {pushMsg && <span role="status" className={`text-sm ${pushMsg.ok ? 'text-cyan' : 'text-brand-soft'}`}>{pushMsg.text}</span>}
          </div>
        </form>
      </section>
    </div>
  )
}
