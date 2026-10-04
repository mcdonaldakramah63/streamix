// Admin → Official anime: the rights holders' YouTube channels that post free episodes, sync status, and series
// the matcher wasn't sure about.
import { useCallback, useEffect, useState } from 'react'
import api, { errorMessage } from '../../services/api'
import Icon from '../Icon'

interface Channel { id: string; name: string; mode: 'episodes' | 'mixed'; counts: Record<string, number>; blockedHere?: boolean }
interface Suggestion { mediaType: string; tmdbId: number; title: string; year?: string; poster?: string; confidence?: number }
interface ReviewSeries { key: string; title: string; season: number | null; suggestions: Suggestion[]; samples: { title: string; videoId: string }[] }
interface Status {
  keyConfigured: boolean; region: string; running: boolean
  lastRun: { at: string; linked: number; errors: string[]; channels: { name: string; seen: number; added: number }[] } | null
  channels: Channel[]; reviewSeries: ReviewSeries[]; reviewMovies: { videoId: string; title: string; channelName: string }[]
}

const ago = (d: string) => {
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`
}

export default function OfficialAnime() {
  const [s, setS] = useState<Status | null>(null)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [input, setInput] = useState('')
  const [mode, setMode] = useState<'episodes' | 'mixed'>('episodes')
  const [busy, setBusy] = useState(false)
  const [typed, setTyped] = useState<Record<string, string>>({})

  const load = useCallback(() => api.get('/admin/official').then(r => setS(r.data)).catch(e => setErr(errorMessage(e, 'Couldn’t load'))), [])
  useEffect(() => { load() }, [load])
  // While a sync runs, refresh every few seconds
  useEffect(() => { if (!s?.running) return; const t = setInterval(load, 4000); return () => clearInterval(t) }, [s?.running, load])

  const act = async (fn: () => Promise<any>, ok: string) => {
    setBusy(true); setErr(''); setMsg('')
    try { await fn(); setMsg(ok); await load() } catch (e) { setErr(errorMessage(e, 'That didn’t work')) } finally { setBusy(false) }
  }

  if (!s) return <div className="skeleton h-40 rounded-2xl" />
  const total = (k: string) => s.channels.reduce((a, c) => a + (c.counts[k] || 0), 0)

  return (
    <div className="space-y-4">
      <section className="card p-5 space-y-3">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex-1 min-w-[16rem]">
            <h2 className="text-white font-bold">Official anime on YouTube</h2>
            <p className="text-sm text-ink-muted mt-1">Free, full episodes the studios publish themselves. They play on each show’s page as the “Official” source; new episodes notify followers. YouTube doesn’t allow downloading them.</p>
          </div>
          <button disabled={busy || s.running} onClick={() => act(() => api.post('/admin/official/sync'), 'Sync started')} className="btn-secondary px-4 py-2 text-xs disabled:opacity-50">
            <Icon name="sync" size={16} className={s.running ? 'animate-spin' : ''} />{s.running ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[['Playing on Streamix', total('linked'), 'text-cyan'], ['Waiting to match', total('pending'), 'text-ink'], ['Need a look', total('review'), 'text-gold'], ['Trailers, clips…', total('skipped'), 'text-ink-faint']].map(([l, n, tone]) => (
            <div key={l as string} className="rounded-xl bg-dark-surface px-3 py-2.5"><p className={`text-xl font-black ${tone}`}>{n as number}</p><p className="text-[11px] text-ink-faint">{l}</p></div>
          ))}
        </div>
        <div className={`rounded-xl px-3.5 py-2.5 text-xs ${s.keyConfigured ? 'bg-cyan/10 text-cyan' : 'bg-gold/10 text-gold'}`}>
          {s.keyConfigured
            ? <>YouTube API key set — full back-catalogues, episode lengths, and videos not licensed in {s.region || 'your country'} are skipped automatically.</>
            : <>No YouTube API key: only each channel’s latest uploads are picked up, and clip-heavy channels can’t be told apart. Add <code className="font-mono">YOUTUBE_API_KEY</code> (free, Google Cloud → YouTube Data API v3) to <code className="font-mono">backend/.env</code> for full catalogues{s.region ? ` and ${s.region} region filtering` : ''}.</>}
        </div>
        {s.lastRun && <p className="text-xs text-ink-faint">Last sync {ago(s.lastRun.at)} · {s.lastRun.linked} new episode{s.lastRun.linked === 1 ? '' : 's'} linked{s.lastRun.errors.length ? ` · ${s.lastRun.errors.join('; ')}` : ''}</p>}
        {(msg || err) && <p role="status" className={`text-xs ${err ? 'text-brand-soft' : 'text-cyan'}`}>{err || msg}</p>}
      </section>

      <section className="card p-5 space-y-3">
        <h3 className="text-label-sm uppercase text-ink-faint">Channels</h3>
        <ul className="space-y-1.5">
          {s.channels.map(c => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-dark-surface px-3 py-2.5">
              <a href={`https://www.youtube.com/channel/${c.id}`} target="_blank" rel="noreferrer" className="text-sm font-semibold text-white hover:underline flex-1 min-w-[10rem]">{c.name}</a>
              {c.blockedHere && <span className="tech-pill text-brand-soft" title="Viewers here keep getting “not available” — hidden from Streamix">Not available here</span>}
              <span className="text-xs text-ink-faint">{c.counts.linked || 0} playing · {c.counts.skipped || 0} skipped</span>
              <select value={c.mode} disabled={busy} aria-label={`What ${c.name} posts`}
                onChange={e => act(() => api.put(`/admin/official/channels/${c.id}`, { mode: e.target.value }), 'Saved')}
                className="input h-8 py-0 text-xs w-auto">
                <option value="episodes">Full episodes</option>
                <option value="mixed">Mostly clips</option>
              </select>
              <button disabled={busy} onClick={() => confirm(`Remove ${c.name} and its videos?`) && act(() => api.delete(`/admin/official/channels/${c.id}`), `${c.name} removed`)}
                aria-label={`Remove ${c.name}`} className="w-8 h-8 rounded-full flex items-center justify-center text-ink-faint hover:text-brand-soft"><Icon name="delete" size={18} /></button>
            </li>
          ))}
        </ul>
        <form onSubmit={e => { e.preventDefault(); if (input.trim()) act(() => api.post('/admin/official/channels', { input: input.trim(), mode }).then(() => setInput('')), 'Channel added — syncing') }}
          className="flex flex-col sm:flex-row gap-2">
          <input value={input} onChange={e => setInput(e.target.value)} placeholder="youtube.com/@channel or channel link" className="input h-10 flex-1" />
          <select value={mode} onChange={e => setMode(e.target.value as any)} className="input h-10 sm:w-40" aria-label="What this channel posts">
            <option value="episodes">Full episodes</option>
            <option value="mixed">Mostly clips</option>
          </select>
          <button disabled={busy || !input.trim()} className="btn-primary h-10 px-4 text-sm disabled:opacity-50">Add channel</button>
        </form>
        <p className="text-xs text-ink-faint">Only add official channels of the studios or licensors (they own what they post). “Mostly clips” channels only count videos whose length shows a full episode (needs the API key).</p>
      </section>

      {s.reviewSeries.length > 0 && (
        <section className="card p-5 space-y-3">
          <h3 className="text-label-sm uppercase text-ink-faint">Which show is this? ({s.reviewSeries.length})</h3>
          {s.reviewSeries.map(r => (
            <div key={r.key} className="rounded-xl bg-dark-surface p-3 space-y-2">
              <p className="text-sm font-bold text-white">{r.title}{r.season != null ? ` · season ${r.season}` : ''}</p>
              <ul className="text-xs text-ink-faint space-y-0.5">
                {r.samples.map(v => <li key={v.videoId}><a className="hover:text-white" href={`https://www.youtube.com/watch?v=${v.videoId}`} target="_blank" rel="noreferrer">{v.title}</a></li>)}
              </ul>
              <div className="flex flex-wrap gap-1.5">
                {r.suggestions.map(x => (
                  <button key={x.tmdbId} disabled={busy} onClick={() => act(() => api.put('/admin/official/series', { key: r.key, tmdbId: x.tmdbId }), `Linked to ${x.title}`)}
                    className="btn-secondary px-3 py-1.5 text-xs">{x.title}{x.year ? ` (${x.year})` : ''}{x.confidence != null ? <span className="text-ink-faint"> · {Math.round(x.confidence * 100)}%</span> : null}</button>
                ))}
                <input value={typed[r.key] || ''} onChange={e => setTyped(t => ({ ...t, [r.key]: e.target.value.replace(/\D/g, '') }))} placeholder="TMDB tv id" inputMode="numeric" className="input h-8 w-28 text-xs" />
                <button disabled={busy || !typed[r.key]} onClick={() => act(() => api.put('/admin/official/series', { key: r.key, tmdbId: Number(typed[r.key]) }), 'Linked')} className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-50">Link</button>
                <button disabled={busy} onClick={() => act(() => api.put('/admin/official/series', { key: r.key, ignore: true }), 'Ignored')} className="px-3 py-1.5 text-xs text-ink-faint hover:text-white">Not a show</button>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
