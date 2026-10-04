// "Ask Streamix": describe what you're in the mood for; the server plans the search (Claude when configured,
// a keyword parser otherwise), ranks the results with your taste profile and says why each one fits.
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api, { errorMessage } from '../services/api'
import Icon from '../components/Icon'
import { useProfileStore } from '../stores/profileStore'
import { track } from '../utils/track'

interface Pick { id: number; media_type: 'movie' | 'tv'; title?: string; name?: string; poster_path?: string | null; vote_average?: number; release_date?: string; first_air_date?: string; reason?: string }
interface Result { query: string; title: string; ai: boolean; items: Pick[] }

const IDEAS = ['Something funny and short for tonight', 'An edge-of-my-seat thriller', 'Feel-good movie for a rainy day',
  'Like Interstellar but less sad', 'A Korean drama to binge', 'Mind-bending sci-fi', 'A classic from the 80s']
const IMG = (p?: string | null) => (p ? `https://image.tmdb.org/t/p/w185${p}` : '')

export default function Ask() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const profile = useProfileStore(s => s.activeProfile)
  const [q, setQ] = useState(params.get('q') || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Result | null>(null)

  const ask = async (text: string) => {
    if (!profile || text.trim().length < 3) return
    setQ(text); setBusy(true); setError(''); setParams({ q: text }, { replace: true })
    try { setResult((await api.post(`/profiles/${profile._id}/ask`, { q: text.trim() })).data) }
    catch (e) { setError(errorMessage(e)) }
    finally { setBusy(false) }
  }
  useEffect(() => { const first = params.get('q'); if (first && profile) ask(first) }, [profile?._id]) // eslint-disable-line react-hooks/exhaustive-deps

  const open = (p: Pick) => { track('detail', p.media_type, p.id, { source: 'ask' }); navigate(p.media_type === 'tv' ? `/tv/${p.id}` : `/movie/${p.id}`) }

  return (
    <div className="min-h-screen pt-20 pb-24 px-4 sm:px-6 max-w-3xl mx-auto">
      <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-2"><Icon name="auto_awesome" size={28} className="text-brand" />Ask Streamix</h1>
      <p className="text-sm text-ink-muted mt-1 mb-5">Say what you're in the mood for — a feeling, a length, a decade, a title you loved.</p>
      {!profile && <p className="text-sm text-gold mb-4">Pick a profile first so the answers fit your taste.</p>}
      <form onSubmit={e => { e.preventDefault(); ask(q) }} className="flex gap-2">
        <label htmlFor="ask-q" className="sr-only">What do you feel like watching?</label>
        <input id="ask-q" value={q} onChange={e => setQ(e.target.value.slice(0, 300))} placeholder="e.g. a funny 90s movie, nothing scary" className="input flex-1 h-12" />
        <button type="submit" disabled={busy || q.trim().length < 3 || !profile} className="btn-primary h-12 px-5 disabled:opacity-40">
          <Icon name={busy ? 'progress_activity' : 'send'} size={18} className={busy ? 'animate-spin' : ''} />Ask
        </button>
      </form>
      <div className="flex flex-wrap gap-2 mt-3">
        {IDEAS.map(idea => (
          <button key={idea} onClick={() => ask(idea)} className="px-3 py-1.5 rounded-full text-xs font-semibold bg-dark-card text-ink-muted hover:text-white">{idea}</button>
        ))}
      </div>

      {error && <p role="alert" className="text-sm text-brand-soft mt-6">{error}</p>}
      {busy && <div className="space-y-3 mt-8">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-28" />)}</div>}
      {result && !busy && (
        <section className="mt-8" aria-live="polite">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-lg font-bold text-white flex-1">{result.title}</h2>
            <span className="tech-pill text-ink-muted">{result.ai ? 'Picked with AI' : 'Picked by Streamix'}</span>
          </div>
          {!result.items.length && <p className="text-sm text-ink-faint">Nothing fits that yet — try saying it another way.</p>}
          <ul className="space-y-3">
            {result.items.map(p => (
              <li key={`${p.media_type}:${p.id}`}>
                <button onClick={() => open(p)} className="w-full flex gap-3 p-2.5 rounded-2xl bg-dark-card hover:bg-white/[0.06] text-left">
                  {p.poster_path ? <img src={IMG(p.poster_path)} alt="" loading="lazy" className="w-16 h-24 rounded-xl object-cover flex-shrink-0" /> : <span className="w-16 h-24 rounded-xl bg-dark-void flex-shrink-0" />}
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-bold text-white">{p.title || p.name}</span>
                    <span className="block text-xs text-ink-faint">{(p.release_date || p.first_air_date || '').slice(0, 4)} · {p.media_type === 'tv' ? 'Series' : 'Movie'}{p.vote_average ? ` · ★ ${p.vote_average.toFixed(1)}` : ''}</span>
                    {p.reason && <span className="block text-sm text-cyan mt-1.5">{p.reason}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
