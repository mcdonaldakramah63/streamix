// Parent view for a kids profile: screen time, bedtime, allowed/blocked titles, and a weekly activity report
import { useEffect, useState } from 'react'
import api, { errorMessage } from '../../services/api'
import Icon from '../Icon'

interface Controls {
  dailyLimitMin: number; bedtimeStart: string; bedtimeEnd: string
  allowedOnly: boolean; allowedTitles: string[]; blockedTitles: string[]
}
interface Report {
  days: { day: string; minutes: number }[]
  recent: { tmdbId: number; title: string; type: string; progress: number; completed: boolean; watchedAt: string }[]
}
interface Hit { key: string; title: string; year: string; poster: string | null }

const LIMITS = [0, 30, 45, 60, 90, 120, 180, 240]
const IMG = (p: string | null) => (p ? `https://image.tmdb.org/t/p/w92${p}` : '')

/** Shows a title for a "movie:123" key */
function TitleChip({ k, onRemove }: { k: string; onRemove: () => void }) {
  const [name, setName] = useState(k)
  useEffect(() => {
    const [type, id] = k.split(':')
    api.get(type === 'tv' ? `/movies/tv/${id}` : `/movies/${id}`).then(r => setName(r.data.title || r.data.name || k)).catch(() => {})
  }, [k])
  return (
    <span className="flex items-center gap-1.5 rounded-full pl-3 pr-1.5 py-1 bg-dark-surface text-xs text-ink">
      {name}
      <button onClick={onRemove} aria-label={`Remove ${name}`} className="w-5 h-5 rounded-full flex items-center justify-center text-ink-faint hover:text-brand-soft"><Icon name="close" size={14} /></button>
    </span>
  )
}

export default function KidsControlsModal({ profile, onClose }: { profile: { _id: string; name: string }; onClose: () => void }) {
  const [pin, setPin] = useState('')
  const [needsPin, setNeedsPin] = useState(false)
  const [c, setC] = useState<Controls | null>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])

  const load = async (parentPin = pin) => {
    setError('')
    try {
      const { data } = await api.get(`/profiles/${profile._id}/kids-controls`, { params: parentPin ? { parentPin } : {} })
      setC(data.controls); setReport(data.report); setNeedsPin(false)
    } catch (e: any) {
      if (e?.response?.data?.needsPin) { setNeedsPin(true); if (parentPin) setError('That PIN didn’t match a parent profile') }
      else setError(errorMessage(e))
    }
  }
  useEffect(() => { load('') }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  // Title search for the allow/block lists
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setHits([]); return }
    const t = setTimeout(async () => {
      const [m, tv] = await Promise.all([
        api.get('/movies/search', { params: { query: term, type: 'movie' } }).catch(() => null),
        api.get('/movies/search', { params: { query: term, type: 'tv' } }).catch(() => null),
      ])
      const list: (Hit & { pop: number })[] = [
        ...(m?.data.results || []).slice(0, 6).map((r: any) => ({ key: `movie:${r.id}`, title: r.title, year: (r.release_date || '').slice(0, 4), poster: r.poster_path, pop: r.popularity })),
        ...(tv?.data.results || []).slice(0, 6).map((r: any) => ({ key: `tv:${r.id}`, title: r.name, year: (r.first_air_date || '').slice(0, 4), poster: r.poster_path, pop: r.popularity })),
      ].sort((a, b) => b.pop - a.pop)
      setHits(list.slice(0, 8))
    }, 350)
    return () => clearTimeout(t)
  }, [q])

  const save = async () => {
    if (!c) return
    setBusy(true); setError(''); setNotice('')
    try {
      await api.put(`/profiles/${profile._id}/kids-controls`, { ...c, ...(pin ? { parentPin: pin } : {}) })
      setNotice('Saved')
    } catch (e) { setError(errorMessage(e)) }
    finally { setBusy(false) }
  }

  const addTo = (list: 'allowedTitles' | 'blockedTitles', key: string) => setC(x => {
    if (!x) return x
    const other = list === 'allowedTitles' ? 'blockedTitles' : 'allowedTitles'
    return { ...x, [list]: [...new Set([...x[list], key])], [other]: x[other].filter(k => k !== key) }
  })
  const removeFrom = (list: 'allowedTitles' | 'blockedTitles', key: string) => setC(x => (x ? { ...x, [list]: x[list].filter(k => k !== key) } : x))

  const maxMin = Math.max(60, ...(report?.days.map(d => d.minutes) || [0]))

  return (
    <div className="fixed inset-0 z-[210] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }} role="dialog" aria-modal="true" aria-label={`Kids controls for ${profile.name}`}>
      <div className="w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto card rounded-b-none sm:rounded-2xl animate-slide-up">
        <div className="sticky top-0 z-10 flex items-center gap-3 px-5 py-4 bg-dark-card border-b border-white/[0.06]">
          <span className="w-10 h-10 rounded-xl bg-gold/15 text-gold flex items-center justify-center"><Icon name="family_restroom" size={22} /></span>
          <div className="flex-1 min-w-0">
            <p className="text-white font-extrabold truncate">Kids controls · {profile.name}</p>
            <p className="text-xs text-ink-faint">Screen time, bedtime, titles and activity</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="btn-icon w-9 h-9"><Icon name="close" size={20} /></button>
        </div>

        <div className="p-5 space-y-6">
          {error && <div role="alert" className="rounded-xl px-4 py-3 text-sm bg-brand/10 text-brand-soft">{error}</div>}

          {needsPin && (
            <form onSubmit={e => { e.preventDefault(); load(pin) }} className="space-y-2">
              <p className="text-sm text-ink">Enter the PIN of a parent profile to change these settings.</p>
              <div className="flex gap-2">
                <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" type="password"
                  autoComplete="off" placeholder="••••" aria-label="Parent PIN" className="input h-11 w-32 text-center font-mono tracking-[0.4em]" />
                <button disabled={pin.length !== 4} className="btn-primary px-5 disabled:opacity-40">Unlock</button>
              </div>
            </form>
          )}

          {!c && !needsPin && !error && <div className="skeleton h-48" />}

          {c && report && (
            <>
              <section>
                <h3 className="text-label-sm uppercase text-ink-faint mb-2">This week</h3>
                <div className="rounded-xl bg-dark-surface p-4">
                  <div className="flex items-end gap-2 h-28" role="img" aria-label="Minutes watched each day this week">
                    {report.days.map(d => (
                      <div key={d.day} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
                        <span className="text-[10px] text-ink-faint">{d.minutes || ''}</span>
                        <div className={`w-full rounded-t-md ${c.dailyLimitMin && d.minutes >= c.dailyLimitMin ? 'bg-brand' : 'bg-gold/70'}`}
                          style={{ height: `${Math.max(2, (d.minutes / maxMin) * 100)}%` }} />
                        <span className="text-[10px] text-ink-faint">{new Date(d.day + 'T12:00').toLocaleDateString(undefined, { weekday: 'short' })}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-ink-faint mt-2">
                    {report.days.reduce((a, d) => a + d.minutes, 0)} minutes in 7 days · today {report.days[report.days.length - 1].minutes} min
                  </p>
                </div>
                {report.recent.length > 0 && (
                  <ul className="mt-3 divide-y divide-white/[0.05] rounded-xl bg-dark-surface max-h-48 overflow-y-auto">
                    {report.recent.map((h, i) => (
                      <li key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
                        <span className="flex-1 min-w-0 truncate text-white">{h.title}</span>
                        <span className="text-xs text-ink-faint">{h.completed ? 'Finished' : `${Math.round(h.progress)}%`}</span>
                        <span className="text-xs text-ink-faint hidden sm:inline">{new Date(h.watchedAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</span>
                        <button onClick={() => addTo('blockedTitles', `${h.type === 'movie' ? 'movie' : 'tv'}:${h.tmdbId}`)} className="text-xs text-brand-soft hover:underline">Block</button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="kc-limit" className="text-label-sm uppercase text-ink-faint">Daily screen time</label>
                  <select id="kc-limit" value={c.dailyLimitMin} onChange={e => setC({ ...c, dailyLimitMin: Number(e.target.value) })} className="input h-11 mt-1.5 w-full">
                    {LIMITS.map(m => <option key={m} value={m}>{m === 0 ? 'No limit' : m < 60 ? `${m} minutes` : `${m / 60} hour${m > 60 ? 's' : ''}`}</option>)}
                  </select>
                </div>
                <div>
                  <p className="text-label-sm uppercase text-ink-faint">Bedtime</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <input type="time" value={c.bedtimeStart} onChange={e => setC({ ...c, bedtimeStart: e.target.value })} aria-label="Bedtime starts" className="input h-11 flex-1" />
                    <span className="text-ink-faint text-xs">to</span>
                    <input type="time" value={c.bedtimeEnd} onChange={e => setC({ ...c, bedtimeEnd: e.target.value })} aria-label="Bedtime ends" className="input h-11 flex-1" />
                  </div>
                  {(c.bedtimeStart || c.bedtimeEnd) && <button onClick={() => setC({ ...c, bedtimeStart: '', bedtimeEnd: '' })} className="text-xs text-ink-faint hover:text-white mt-1">Turn off bedtime</button>}
                </div>
              </section>

              <section className="space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={c.allowedOnly} onChange={e => setC({ ...c, allowedOnly: e.target.checked })} className="mt-1 accent-[#e50914]" />
                  <span>
                    <span className="text-sm text-white font-semibold">Only titles I pick</span>
                    <span className="block text-xs text-ink-faint">{profile.name} will only see the titles in the “Allowed” list.</span>
                  </span>
                </label>

                <div className="relative">
                  <Icon name="search" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
                  <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a movie or show to allow or block" aria-label="Find a title" className="input h-11 w-full pl-9" />
                </div>
                {hits.length > 0 && (
                  <ul className="rounded-xl bg-dark-surface divide-y divide-white/[0.05]">
                    {hits.map(h => (
                      <li key={h.key} className="flex items-center gap-3 px-3 py-2">
                        <div className="w-8 h-12 rounded bg-dark-void overflow-hidden flex-shrink-0">{h.poster && <img src={IMG(h.poster)} alt="" className="w-full h-full object-cover" />}</div>
                        <span className="flex-1 min-w-0 text-sm text-white truncate">{h.title} <span className="text-ink-faint">{h.year} · {h.key.startsWith('tv') ? 'Series' : 'Movie'}</span></span>
                        <button onClick={() => addTo('allowedTitles', h.key)} className="text-xs font-bold text-cyan hover:underline">Allow</button>
                        <button onClick={() => addTo('blockedTitles', h.key)} className="text-xs font-bold text-brand-soft hover:underline">Block</button>
                      </li>
                    ))}
                  </ul>
                )}
                <div>
                  <p className="text-xs text-ink-muted mb-1.5">Allowed ({c.allowedTitles.length})</p>
                  <div className="flex flex-wrap gap-1.5">{c.allowedTitles.length ? c.allowedTitles.map(k => <TitleChip key={k} k={k} onRemove={() => removeFrom('allowedTitles', k)} />) : <span className="text-xs text-ink-faint">None</span>}</div>
                </div>
                <div>
                  <p className="text-xs text-ink-muted mb-1.5">Blocked ({c.blockedTitles.length})</p>
                  <div className="flex flex-wrap gap-1.5">{c.blockedTitles.length ? c.blockedTitles.map(k => <TitleChip key={k} k={k} onRemove={() => removeFrom('blockedTitles', k)} />) : <span className="text-xs text-ink-faint">None</span>}</div>
                </div>
              </section>

              <div className="flex items-center gap-3">
                <button onClick={save} disabled={busy} className="btn-primary px-6 py-2.5 disabled:opacity-50">{busy ? 'Saving…' : 'Save controls'}</button>
                {notice && <span role="status" className="text-sm text-cyan">{notice}</span>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
