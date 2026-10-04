// frontend/src/components/LibraryImport.tsx — admin: add many videos at once by URL
import { useEffect, useState, useCallback } from 'react'
import api, { errorMessage } from '../services/api'
import Icon from './Icon'
import TmdbLinkPicker from './admin/TmdbLinkPicker'
import LibraryDownloadButton from './LibraryDownloadButton'

type License = 'public-domain' | 'creative-commons' | 'own-content' | 'licensed'

interface ImportResult { line: string; ok: boolean; title?: string; year?: string; format?: string; license?: string; error?: string; linked?: string; tmdbId?: number | null; confidence?: number | null; matchedBy?: string; suggestions?: number }
interface LibItem { _id: string; title: string; year: string; overview?: string; poster: string; format: string; license: string; sourcePage: string; videoUrl: string; featured?: boolean; createdAt: string
  tmdbId?: number | null; tmdbTitle?: string; mediaType?: 'movie' | 'tv'; season?: number | null; episode?: number | null; linked?: string
  sizeBytes?: number | null; fileName?: string; matchConfidence?: number | null; matchedBy?: string
  matchSuggestions?: { mediaType: 'movie' | 'tv'; tmdbId: number; title: string; year: string; season: number | null; episode: number | null; confidence: number }[]
  link?: string
  introStart?: number | null; introEnd?: number | null; creditsStart?: number | null
  // Edit-form text for the markers ("1:30")
  m_introStart?: string; m_introEnd?: string; m_creditsStart?: string }

const MARKERS = [['introStart', 'Intro starts'], ['introEnd', 'Intro ends'], ['creditsStart', 'Credits start']] as const
/** "1:30" / "90" / "1:02:03" → seconds; "" → null; bad → undefined */
function parseTime(t: string): number | null | undefined {
  const v = t.trim()
  if (!v) return null
  if (!/^\d+(:\d{1,2}){0,2}$/.test(v)) return undefined
  return v.split(':').reduce((acc, n) => acc * 60 + Number(n), 0)
}
const showTime = (n?: number | null) => (n == null ? '' : n >= 3600
  ? `${Math.floor(n / 3600)}:${String(Math.floor((n % 3600) / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
  : `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`)
const withMarkerText = (it: LibItem): LibItem => ({ ...it, link: linkText(it),
  m_introStart: showTime(it.introStart), m_introEnd: showTime(it.introEnd), m_creditsStart: showTime(it.creditsStart) })

/** "movie:653" / "tv:1399 s1e2" — the same syntax the import box and the Link field accept */
const linkText = (it: LibItem) => !it.tmdbId ? '' : it.mediaType === 'tv'
  ? `tv:${it.tmdbId}${it.episode != null ? ` s${it.season || 1}e${it.episode}` : ''}` : `movie:${it.tmdbId}`

const LICENSES: { value: License; label: string; hint: string }[] = [
  { value: 'public-domain',    label: 'Public domain',      hint: 'Copyright expired or waived (e.g. pre-1929 films, Prelinger archives)' },
  { value: 'creative-commons', label: 'Creative Commons',   hint: 'Released under a CC licence that allows sharing' },
  { value: 'own-content',      label: 'My own content',     hint: 'Videos you made or own the rights to' },
  { value: 'licensed',         label: 'Licensed to me',     hint: 'You have a licence/permission to stream them' },
]

const LICENSE_TONE: Record<string, string> = {
  'public-domain': 'text-cyan', 'creative-commons': 'text-gold', 'own-content': 'text-brand-soft', licensed: 'text-ink',
}

const EXAMPLE = `# One URL per line. Optional: | Title | Year  or  | movie:ID  or  | tv:ID s1e2
https://archive.org/details/TheGeneral1926
https://example.com/videos/my-short-film.mp4 | My Short Film | 2024
https://example.com/videos/night.mp4 | https://www.themoviedb.org/movie/10331
https://example.com/videos/show-ep2.mp4 | tv:1399 s1e2`

export default function LibraryImport() {
  const [text,      setText]      = useState('')
  const [license,   setLicense]   = useState<License>('public-domain')
  const [confirmed, setConfirmed] = useState(false)
  const [matchTmdb, setMatchTmdb] = useState(true)
  const [busy,      setBusy]      = useState(false)
  const [error,     setError]     = useState('')
  const [results,   setResults]   = useState<ImportResult[] | null>(null)
  const [items,     setItems]     = useState<LibItem[]>([])
  const [filter,    setFilter]    = useState('')
  const [selected,  setSelected]  = useState<Set<string>>(new Set())
  const [editing,   setEditing]   = useState<LibItem | null>(null)
  const [rematching, setRematching] = useState(false)
  const [notice,    setNotice]    = useState('')

  const lineCount = text.split('\n').filter(l => l.trim() && !l.trim().startsWith('#')).length

  const loadItems = useCallback(() => {
    api.get('/admin/library').then(r => setItems(r.data)).catch(e => setError(errorMessage(e)))
  }, [])
  useEffect(() => { loadItems() }, [loadItems])

  const runImport = async () => {
    setBusy(true); setError(''); setResults(null)
    try {
      const { data } = await api.post('/admin/library/import', { lines: text, license, confirmRights: confirmed, matchTmdb }, { timeout: 600_000 })
      setResults(data.results)
      // Keep only the lines that failed so they can be fixed and retried
      setText(data.results.filter((r: ImportResult) => !r.ok).map((r: ImportResult) => r.line).join('\n'))
      loadItems()
    } catch (e) {
      setError(errorMessage(e, 'Import failed'))
    } finally { setBusy(false) }
  }

  const remove = async (it: LibItem) => {
    if (!confirm(`Remove “${it.title}” from the library?`)) return
    try { await api.delete(`/admin/library/${it._id}`); setItems(xs => xs.filter(x => x._id !== it._id)) }
    catch (e) { alert(errorMessage(e)) }
  }

  const toggleSelect = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const bulkDelete = async () => {
    if (!selected.size || !confirm(`Remove ${selected.size} title${selected.size === 1 ? '' : 's'} from the library?`)) return
    try { await api.post('/admin/library/bulk-delete', { ids: [...selected] }); setSelected(new Set()); loadItems() }
    catch (e) { alert(errorMessage(e)) }
  }

  const toggleFeatured = async (it: LibItem) => {
    try {
      const { data } = await api.put(`/admin/library/${it._id}`, { featured: !it.featured })
      setItems(xs => xs.map(x => (x._id === it._id ? { ...x, featured: data.featured } : x)).sort((a, b) => Number(!!b.featured) - Number(!!a.featured)))
    } catch (e) { alert(errorMessage(e)) }
  }

  const saveEdit = async () => {
    if (!editing) return
    try {
      const original = items.find(x => x._id === editing._id)
      if (!original) return
      // Only send what changed, so a new link can refresh title/poster/description from TMDB
      const body: Record<string, string | number | null> = {}
      for (const [k, label] of MARKERS) {
        const parsed = parseTime(editing[`m_${k}`] || '')
        if (parsed === undefined) { alert(`${label}: use minutes:seconds, e.g. 1:30`); return }
        if (parsed !== (original[k] ?? null)) body[k] = parsed
      }
      for (const k of ['title', 'year', 'overview', 'poster'] as const) {
        if ((editing[k] || '') !== (original[k] || '')) body[k] = editing[k] || ''
      }
      const link = (editing.link ?? '').trim()
      if (link !== linkText(original)) body.link = link
      if (!Object.keys(body).length) { setEditing(null); return }
      const { data } = await api.put(`/admin/library/${editing._id}`, body)
      setItems(xs => xs.map(x => (x._id === data._id ? { ...x, ...data } : x)))
      setEditing(null)
    } catch (e) { alert(errorMessage(e)) }
  }

  const acceptSuggestion = async (it: LibItem, link: string) => {
    try {
      const { data } = await api.put(`/admin/library/${it._id}`, { link })
      setItems(xs => xs.map(x => (x._id === data._id ? { ...x, ...data } : x)))
    } catch (e) { alert(errorMessage(e)) }
  }

  const rematch = async () => {
    setRematching(true); setNotice('')
    try {
      const { data } = await api.post('/admin/library/rematch')
      setNotice(data.checked ? `Linked ${data.linked} of ${data.checked} unlinked title${data.checked === 1 ? '' : 's'}` : 'Everything is already linked')
      loadItems()
    } catch (e) { setNotice(errorMessage(e)) }
    finally { setRematching(false) }
  }

  const unlinked = items.filter(i => !i.tmdbId || (i.mediaType === 'tv' && i.episode == null)).length
  const shown = items.filter(i => !filter || i.title.toLowerCase().includes(filter.toLowerCase()))
  const added = results?.filter(r => r.ok).length ?? 0

  return (
    <div className="space-y-6 animate-fade-in">
      <section className="card p-5 sm:p-6">
        <div className="flex items-start gap-3 mb-4">
          <span className="w-10 h-10 rounded-xl bg-brand/15 text-brand flex items-center justify-center flex-shrink-0"><Icon name="video_library" size={22} /></span>
          <div>
            <h2 className="text-lg font-extrabold text-white">Add videos by URL</h2>
            <p className="text-sm text-ink-muted">
              Paste direct video links (.mp4, .webm, .m3u8) or Internet Archive pages — up to 200 at once.
              Archive.org items are resolved automatically and keep their own licence.
            </p>
          </div>
        </div>

        <label htmlFor="lib-urls" className="sr-only">Video URLs</label>
        <textarea id="lib-urls" value={text} onChange={e => setText(e.target.value)} rows={9} spellCheck={false}
          placeholder={EXAMPLE}
          className="w-full rounded-xl p-4 text-sm font-mono text-white placeholder-slate-600 outline-none resize-y"
          style={{ background: 'rgba(20,26,38,0.6)', border: '1px solid rgba(255,255,255,0.08)' }} />
        <p className="text-xs text-ink-faint mt-1.5">{lineCount} URL{lineCount === 1 ? '' : 's'} · lines starting with # are ignored</p>

        <fieldset className="mt-5">
          <legend className="text-label-sm uppercase text-ink-faint mb-2">How do you have the rights to these videos?</legend>
          <div className="grid sm:grid-cols-2 gap-2">
            {LICENSES.map(l => (
              <label key={l.value} className={`flex gap-3 p-3 rounded-xl cursor-pointer border transition-colors ${
                license === l.value ? 'border-brand/60 bg-brand/10' : 'border-white/[0.06] bg-dark-surface hover:border-white/15'
              }`}>
                <input type="radio" name="license" value={l.value} checked={license === l.value} onChange={() => setLicense(l.value)} className="mt-1 accent-[#e50914]" />
                <span>
                  <span className="block text-sm font-bold text-white">{l.label}</span>
                  <span className="block text-xs text-ink-faint">{l.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-4 space-y-2">
          <label className="flex items-start gap-2.5 text-sm text-ink cursor-pointer">
            <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-0.5 accent-[#e50914]" />
            I confirm I have the legal right to stream every video in this list to the people who use this server.
          </label>
          <label className="flex items-start gap-2.5 text-sm text-ink-muted cursor-pointer">
            <input type="checkbox" checked={matchTmdb} onChange={e => setMatchTmdb(e.target.checked)} className="mt-0.5 accent-[#e50914]" />
            Look up posters and descriptions on TMDB when the title matches
          </label>
        </div>

        {error && <div role="alert" className="mt-4 rounded-xl px-4 py-3 text-sm bg-brand/10 text-brand-soft">{error}</div>}

        <button onClick={runImport} disabled={busy || !lineCount || !confirmed} className="btn-primary mt-5 h-12 px-8 disabled:opacity-50">
          {busy
            ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Checking {lineCount} URL{lineCount === 1 ? '' : 's'}…</>
            : <><Icon name="upload" size={20} /> Import {lineCount || ''} video{lineCount === 1 ? '' : 's'}</>}
        </button>

        {results && (
          <div className="mt-6">
            <p className="text-sm font-bold text-white mb-2">
              <span className="text-cyan">{added} added</span>
              {results.length - added > 0 && <span className="text-brand-soft"> · {results.length - added} failed (left in the box above to fix and retry)</span>}
            </p>
            <div className="rounded-xl overflow-hidden border border-white/[0.06] divide-y divide-white/[0.05] max-h-80 overflow-y-auto">
              {results.map((r, i) => (
                <div key={i} className="flex items-start gap-3 px-3 py-2 text-sm bg-dark-surface">
                  <Icon name={r.ok ? 'check_circle' : 'error'} size={18} className={r.ok ? 'text-cyan mt-0.5' : 'text-brand-soft mt-0.5'} fill />
                  <div className="min-w-0 flex-1">
                    <p className="text-white truncate">{r.ok ? `${r.title}${r.year ? ` (${r.year})` : ''}` : r.line}</p>
                    <p className="text-xs text-ink-faint truncate">{r.ok ? `${r.format?.toUpperCase()} · ${r.license} · ` : r.error}{r.ok && <span className={r.tmdbId ? 'text-cyan' : 'text-gold'}>{r.linked}{r.tmdbId && r.confidence != null ? ` · ${Math.round(r.confidence * 100)}% sure` : !r.tmdbId && r.suggestions ? ` · ${r.suggestions} suggestion${r.suggestions > 1 ? 's' : ''} to review` : ''}</span>}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4">
          <h2 className="text-label-sm uppercase text-ink-faint">Library · {items.length} title{items.length === 1 ? '' : 's'}</h2>
          {selected.size > 0 && (
            <button onClick={bulkDelete} className="h-10 px-4 rounded-full text-xs font-bold text-brand-soft border border-brand/40 hover:bg-brand/10 flex items-center gap-1.5">
              <Icon name="delete" size={16} />Delete {selected.size} selected
            </button>
          )}
          {unlinked > 0 && (
            <button onClick={rematch} disabled={rematching} title="Try to match unlinked titles to TMDB movies and series again"
              className="h-10 px-4 rounded-full text-xs font-bold text-gold border border-gold/40 hover:bg-gold/10 flex items-center gap-1.5 disabled:opacity-50">
              <Icon name={rematching ? 'progress_activity' : 'link'} size={16} className={rematching ? 'animate-spin' : ''} />Re-match {unlinked} unlinked
            </button>
          )}
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter by title" className="input h-10 sm:ml-auto sm:max-w-xs" />
        </div>
        {notice && <p role="status" className="px-5 pb-3 text-sm text-cyan">{notice}</p>}
        <div className="divide-y divide-white/[0.05] max-h-[640px] overflow-y-auto">
          {shown.map(it => (
            <div key={it._id}>
            <div className="flex items-center gap-3 px-5 py-3">
              <input type="checkbox" checked={selected.has(it._id)} onChange={() => toggleSelect(it._id)} aria-label={`Select ${it.title}`} className="accent-[#e50914]" />
              <div className="w-10 h-14 rounded-lg overflow-hidden bg-dark-void flex-shrink-0">
                {it.poster && <img src={it.poster} alt="" className="w-full h-full object-cover" loading="lazy" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white truncate">{it.title} {it.year && <span className="text-ink-faint font-normal">({it.year})</span>}</p>
                <div className="flex gap-2 mt-1">
                  <span className="tech-pill">{it.format}</span>
                  <span className={`tech-pill ${LICENSE_TONE[it.license] || ''}`}>{it.license.replace('-', ' ')}</span>
                  {it.tmdbId && !(it.mediaType === 'tv' && it.episode == null)
                    ? <a href={it.mediaType === 'tv' ? `/tv/${it.tmdbId}` : `/movie/${it.tmdbId}`} className="tech-pill text-cyan hover:underline" title="Plays on this title's page">
                        {it.tmdbTitle ? `${it.tmdbTitle} · ` : ''}{it.mediaType === 'tv' ? `S${it.season || 1}E${it.episode}` : 'Movie'}
                      </a>
                    : <button onClick={() => setEditing(withMarkerText(it))} className="tech-pill text-gold hover:underline"
                        title="Only playable from the Library row until it's linked to a movie or episode">
                        {it.tmdbId ? 'Needs episode' : 'Not linked'}
                      </button>}
                  {it.tmdbId && it.matchedBy && it.matchedBy !== 'admin' && it.matchConfidence != null && (
                    <span className="tech-pill text-ink-faint" title={`Linked automatically (${it.matchedBy === 'id' ? 'from the id you typed' : it.matchedBy === 'claude' ? 'checked by Claude' : 'smart matcher'})`}>
                      <Icon name="auto_awesome" size={11} /> {Math.round(it.matchConfidence * 100)}%
                    </span>
                  )}
                </div>
                {!it.tmdbId && it.matchSuggestions?.[0] && (() => {
                  const g = it.matchSuggestions[0]
                  const link = g.mediaType === 'tv' ? `tv:${g.tmdbId} s${g.season ?? 1}e${g.episode ?? 1}` : `movie:${g.tmdbId}`
                  return (
                    <p className="text-xs text-ink-muted mt-1.5 flex items-center gap-2 flex-wrap">
                      <Icon name="auto_awesome" size={13} className="text-gold" />
                      Probably <b className="text-ink">{g.title}</b>{g.year ? ` (${g.year})` : ''}{g.mediaType === 'tv' && g.episode != null ? ` S${g.season ?? 1}E${g.episode}` : ''} · {Math.round(g.confidence * 100)}%
                      <button onClick={() => acceptSuggestion(it, link)} className="text-cyan font-bold hover:underline">Accept</button>
                    </p>
                  )
                })()}
              </div>
              <button onClick={() => toggleFeatured(it)} aria-pressed={!!it.featured} title={it.featured ? 'Featured — shown first on Home' : 'Feature on Home'}
                className={`w-9 h-9 rounded-full flex items-center justify-center ${it.featured ? 'text-gold' : 'text-ink-faint hover:text-gold'}`}>
                <Icon name="star" size={20} fill={!!it.featured} />
              </button>
              <button onClick={() => setEditing(editing?._id === it._id ? null : withMarkerText(it))} aria-label={`Edit ${it.title}`} className="w-9 h-9 rounded-full flex items-center justify-center text-ink-faint hover:text-white hover:bg-white/[0.06]">
                <Icon name="edit" size={18} />
              </button>
              {it.format !== 'hls' && <LibraryDownloadButton id={it._id} sizeBytes={it.sizeBytes} compact />}
              <a href={`/watch/${it._id}`} className="btn-secondary px-3 py-1.5 text-xs">Play</a>
              <button onClick={() => remove(it)} aria-label={`Remove ${it.title}`} className="w-9 h-9 rounded-full flex items-center justify-center text-ink-faint hover:text-brand-soft hover:bg-brand/10">
                <Icon name="delete" size={18} />
              </button>
            </div>
            {editing?._id === it._id && (
              <div className="px-5 pb-4 grid sm:grid-cols-[1fr_100px] gap-2 bg-dark-surface/50">
                <input value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} placeholder="Title" aria-label="Title" className="input h-10 mt-3" />
                <input value={editing.year} onChange={e => setEditing({ ...editing, year: e.target.value })} placeholder="Year" aria-label="Year" className="input h-10 sm:mt-3" />
                <input value={editing.poster} onChange={e => setEditing({ ...editing, poster: e.target.value })} placeholder="Poster image URL" aria-label="Poster image URL" className="input h-10 sm:col-span-2" />
                <div className="sm:col-span-2 rounded-xl p-3 bg-dark-void/60 border border-white/[0.06]">
                  <TmdbLinkPicker itemId={it._id} initialQuery={it.tmdbTitle || it.title} value={editing.link ?? ''} onChange={link => setEditing(e => (e ? { ...e, link } : e))} />
                  <p className="text-xs text-ink-faint mt-2">The file plays on this movie's or episode's own page. Saving a new link also updates the title, poster and description from TMDB.</p>
                </div>
                <div className="sm:col-span-2 grid grid-cols-3 gap-2">
                  {MARKERS.map(([k, label]) => (
                    <label key={k} className="text-[11px] text-ink-faint">
                      {label}
                      <input value={editing[`m_${k}`] || ''} onChange={e => setEditing({ ...editing, [`m_${k}`]: e.target.value })}
                        placeholder="m:ss" inputMode="numeric" className="input h-9 mt-1 w-full font-mono" />
                    </label>
                  ))}
                  <p className="col-span-3 text-[11px] text-ink-faint -mt-1">Optional. Adds “Skip intro” and “Next episode” buttons in the player.</p>
                </div>
                <textarea value={editing.overview || ''} onChange={e => setEditing({ ...editing, overview: e.target.value })} rows={3} placeholder="Description" aria-label="Description"
                  className="sm:col-span-2 rounded-xl p-3 text-sm text-white outline-none" style={{ background: 'rgba(20,26,38,0.6)', border: '1px solid rgba(255,255,255,0.08)' }} />
                <div className="sm:col-span-2 flex gap-2">
                  <button onClick={saveEdit} className="btn-primary px-5 py-2 text-xs">Save</button>
                  <button onClick={() => setEditing(null)} className="btn-secondary px-5 py-2 text-xs">Cancel</button>
                </div>
              </div>
            )}
            </div>
          ))}
          {!shown.length && <p className="px-5 py-10 text-center text-sm text-ink-faint">{items.length ? 'No matches' : 'Nothing imported yet'}</p>}
        </div>
      </section>
    </div>
  )
}
