// Admin: build curated collections from TMDB titles and library videos
import { useEffect, useState } from 'react'
import api, { errorMessage } from '../../services/api'
import Icon from '../Icon'

interface Item { kind: 'movie' | 'tv' | 'library'; id: string; title: string; year: string; poster: string }
interface Collection { _id: string; title: string; description: string; emoji: string; showOnHome: boolean; order: number; items: Item[] }

function ItemSearch({ onAdd }: { onAdd: (it: Item) => void }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Item[]>([])
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setHits([]); return }
    const t = setTimeout(async () => {
      const [m, tv, lib] = await Promise.all([
        api.get('/movies/search', { params: { query: term, type: 'movie' } }).catch(() => null),
        api.get('/movies/search', { params: { query: term, type: 'tv' } }).catch(() => null),
        api.get('/library', { params: { q: term } }).catch(() => null),
      ])
      const P = (p: string | null) => (p ? `https://image.tmdb.org/t/p/w92${p}` : '')
      setHits([
        ...(lib?.data.items || []).slice(0, 4).map((r: any) => ({ kind: 'library', id: r._id, title: r.title, year: r.year || '', poster: r.poster || '' })),
        ...(m?.data.results || []).slice(0, 5).map((r: any) => ({ kind: 'movie', id: String(r.id), title: r.title, year: (r.release_date || '').slice(0, 4), poster: P(r.poster_path) })),
        ...(tv?.data.results || []).slice(0, 4).map((r: any) => ({ kind: 'tv', id: String(r.id), title: r.name, year: (r.first_air_date || '').slice(0, 4), poster: P(r.poster_path) })),
      ])
    }, 350)
    return () => clearTimeout(t)
  }, [q])
  return (
    <div className="space-y-2">
      <div className="relative">
        <Icon name="search" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Add a movie, series or library video" aria-label="Find a title to add" className="input h-10 w-full pl-9" />
      </div>
      {hits.length > 0 && (
        <ul className="rounded-xl bg-dark-void/60 divide-y divide-white/[0.05] max-h-64 overflow-y-auto">
          {hits.map(h => (
            <li key={`${h.kind}-${h.id}`} className="flex items-center gap-3 px-3 py-2">
              <div className="w-8 h-12 rounded bg-dark-card overflow-hidden flex-shrink-0">{h.poster && <img src={h.poster} alt="" className="w-full h-full object-cover" />}</div>
              <span className="flex-1 min-w-0 text-sm text-white truncate">{h.title} <span className="text-ink-faint">{h.year} · {h.kind === 'library' ? 'Library' : h.kind === 'tv' ? 'Series' : 'Movie'}</span></span>
              <button onClick={() => onAdd(h)} className="text-xs font-bold text-cyan hover:underline">Add</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function Collections() {
  const [list, setList] = useState<Collection[]>([])
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const load = () => api.get('/admin/collections').then(r => setList(r.data)).catch(e => setError(errorMessage(e)))
  useEffect(() => { load() }, [])

  const save = async (c: Collection, patch: Partial<Collection>) => {
    setError('')
    try {
      const { data } = await api.put(`/admin/collections/${c._id}`, patch)
      setList(xs => xs.map(x => (x._id === c._id ? data : x)))
    } catch (e) { setError(errorMessage(e)) }
  }
  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    try { const { data } = await api.post('/admin/collections', { title: name }); setList(xs => [...xs, data]); setName(''); setOpen(data._id) }
    catch (err) { setError(errorMessage(err)) }
  }
  const remove = async (c: Collection) => {
    if (!confirm(`Delete the collection “${c.title}”?`)) return
    await api.delete(`/admin/collections/${c._id}`).catch(() => {})
    setList(xs => xs.filter(x => x._id !== c._id))
  }
  const move = (c: Collection, dir: -1 | 1) => {
    const i = list.findIndex(x => x._id === c._id), j = i + dir
    if (j < 0 || j >= list.length) return
    const a = list[i], b = list[j]
    save(a, { order: b.order }); save(b, { order: a.order })
    setList(xs => { const n = [...xs]; n[i] = { ...b, order: a.order }; n[j] = { ...a, order: b.order }; return n })
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <section className="card p-5">
        <h2 className="text-lg font-extrabold text-white mb-1">Collections</h2>
        <p className="text-sm text-ink-muted mb-4">Hand-picked rows on Home, like “Silent Era Classics” or “Weekend Anime”.</p>
        <form onSubmit={create} className="flex gap-2">
          <input value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder="New collection name" aria-label="New collection name" className="input h-11 flex-1" />
          <button disabled={!name.trim()} className="btn-primary px-5 disabled:opacity-40"><Icon name="add" size={18} />Create</button>
        </form>
        {error && <p role="alert" className="text-sm text-brand-soft mt-3">{error}</p>}
      </section>

      {list.map((c, idx) => (
        <section key={c._id} className="card overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4">
            <span className="text-2xl">{c.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold truncate">{c.title}</p>
              <p className="text-xs text-ink-faint">{c.items.length} title{c.items.length === 1 ? '' : 's'}{c.showOnHome ? ' · on Home' : ' · hidden'}</p>
            </div>
            <button onClick={() => move(c, -1)} disabled={idx === 0} aria-label="Move up" className="btn-icon w-8 h-8 disabled:opacity-30"><Icon name="arrow_upward" size={18} /></button>
            <button onClick={() => move(c, 1)} disabled={idx === list.length - 1} aria-label="Move down" className="btn-icon w-8 h-8 disabled:opacity-30"><Icon name="arrow_downward" size={18} /></button>
            <button onClick={() => save(c, { showOnHome: !c.showOnHome })} aria-pressed={c.showOnHome} title={c.showOnHome ? 'Hide from Home' : 'Show on Home'}
              className={`btn-icon w-8 h-8 ${c.showOnHome ? 'text-cyan' : 'text-ink-faint'}`}><Icon name={c.showOnHome ? 'visibility' : 'visibility_off'} size={18} /></button>
            <button onClick={() => setOpen(open === c._id ? null : c._id)} aria-expanded={open === c._id} className="btn-secondary px-3 py-1.5 text-xs">{open === c._id ? 'Done' : 'Edit'}</button>
            <button onClick={() => remove(c)} aria-label={`Delete ${c.title}`} className="btn-icon w-8 h-8 text-ink-faint hover:text-brand-soft"><Icon name="delete" size={18} /></button>
          </div>
          {open === c._id && (
            <div className="px-5 pb-5 space-y-3 border-t border-white/[0.05] pt-4">
              <div className="grid grid-cols-[64px_1fr] gap-2">
                <input defaultValue={c.emoji} onBlur={e => e.target.value !== c.emoji && save(c, { emoji: e.target.value })} maxLength={8} aria-label="Emoji" className="input h-10 text-center text-lg" />
                <input defaultValue={c.title} onBlur={e => e.target.value.trim() && e.target.value !== c.title && save(c, { title: e.target.value })} maxLength={80} aria-label="Name" className="input h-10" />
              </div>
              <input defaultValue={c.description} onBlur={e => e.target.value !== c.description && save(c, { description: e.target.value })} maxLength={300}
                placeholder="Short description (optional)" aria-label="Description" className="input h-10 w-full" />
              <ItemSearch onAdd={it => save(c, { items: [...c.items, it] })} />
              <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                {c.items.map((it, i) => (
                  <div key={`${it.kind}-${it.id}`} className="relative flex-shrink-0 w-24">
                    <div className="aspect-[2/3] rounded-xl overflow-hidden bg-dark-void">{it.poster && <img src={it.poster} alt="" className="w-full h-full object-cover" />}</div>
                    <p className="text-[11px] text-ink truncate mt-1">{it.title}</p>
                    <div className="absolute top-1 right-1 flex gap-0.5">
                      {i > 0 && <button onClick={() => { const n = [...c.items]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; save(c, { items: n }) }} aria-label="Move left" className="w-6 h-6 rounded-full bg-dark-void/80 text-white flex items-center justify-center"><Icon name="chevron_left" size={14} /></button>}
                      <button onClick={() => save(c, { items: c.items.filter((_, j) => j !== i) })} aria-label={`Remove ${it.title}`} className="w-6 h-6 rounded-full bg-dark-void/80 text-white flex items-center justify-center hover:text-brand-soft"><Icon name="close" size={14} /></button>
                    </div>
                  </div>
                ))}
                {!c.items.length && <p className="text-sm text-ink-faint">Empty — add titles above. Empty collections don't show on Home.</p>}
              </div>
            </div>
          )}
        </section>
      ))}
    </div>
  )
}
