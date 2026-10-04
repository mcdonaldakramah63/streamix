// Admin: find the TMDB movie or series episode a library file is, by searching — no IDs to type
import { useEffect, useRef, useState } from 'react'
import api from '../../services/api'
import Icon from '../Icon'

interface Hit { mediaType: 'movie' | 'tv'; id: number; title: string; year: string; poster: string; confidence?: number; season?: number | null; episode?: number | null }
interface Season { season: number; episodes: number; name: string }

/** value/onChange use the import syntax: "movie:653", "tv:1399 s1e2", or "" for unlinked */
export default function TmdbLinkPicker({ itemId, initialQuery, value, onChange }: {
  itemId?: string; initialQuery: string; value: string; onChange: (link: string) => void
}) {
  const [q,        setQ]        = useState('')
  const [smart,    setSmart]    = useState<Hit[] | null>(null)
  const [fileName, setFileName] = useState('')
  const [hits,     setHits]     = useState<Hit[]>([])
  const [loading,  setLoading]  = useState(false)
  const [chosen,   setChosen]   = useState<Hit | null>(null)
  const [seasons,  setSeasons]  = useState<Season[]>([])
  const [season,   setSeason]   = useState(1)
  const [episode,  setEpisode]  = useState(1)
  const seq = useRef(0)

  // Smart suggestions for this file first; typing switches to a normal search
  useEffect(() => {
    if (!itemId) { setQ(initialQuery); return }
    let live = true
    api.get(`/admin/library/${itemId}/suggest`).then(r => {
      if (!live) return
      setFileName(r.data.fileName || '')
      setSmart(r.data.suggestions.map((x: any) => ({ ...x, id: x.tmdbId })))
    }).catch(() => { if (live) { setSmart([]); setQ(initialQuery) } })
    return () => { live = false }
  }, [itemId, initialQuery])

  // Debounced search
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setHits([]); return }
    const n = ++seq.current
    setLoading(true)
    const t = setTimeout(() => {
      api.get('/admin/library/tmdb-search', { params: { q: term } })
        .then(r => { if (n === seq.current) setHits(r.data) })
        .catch(() => { if (n === seq.current) setHits([]) })
        .finally(() => { if (n === seq.current) setLoading(false) })
    }, 350)
    return () => clearTimeout(t)
  }, [q])

  const pick = (h: Hit) => {
    setChosen(h)
    if (h.mediaType === 'movie') { setSeasons([]); onChange(`movie:${h.id}`); return }
    setSeasons([])
    api.get(`/admin/library/tmdb-seasons/${h.id}`).then(r => {
      const list: Season[] = r.data.filter((s: Season) => s.episodes > 0)
      setSeasons(list)
      const first = list.find(s => s.season > 0) || list[0]
      // Smart suggestions already know the season/episode from the file name
      const s = h.season ?? first?.season ?? 1
      const e = h.episode ?? 1
      setSeason(s); setEpisode(e)
      onChange(`tv:${h.id} s${s}e${e}`)
    }).catch(() => onChange(`tv:${h.id} s${h.season ?? 1}e${h.episode ?? 1}`))
  }

  const shown = q.trim().length >= 2 ? hits : smart || []
  const pct = (c?: number) => (c == null ? '' : `${Math.round(c * 100)}%`)

  const setEp = (s: number, e: number) => {
    setSeason(s); setEpisode(e)
    if (chosen) onChange(`tv:${chosen.id} s${s}e${e}`)
  }

  const maxEp = seasons.find(s => s.season === season)?.episodes || 999

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-label-sm uppercase text-ink-faint flex-shrink-0">Plays as</span>
        {value
          ? <span className="tech-pill text-cyan font-mono">{chosen ? `${chosen.title}${chosen.year ? ` (${chosen.year})` : ''} · ` : ''}{value}</span>
          : <span className="tech-pill text-gold">Not linked</span>}
        {value && (
          <button type="button" onClick={() => { setChosen(null); onChange('') }} className="text-xs text-ink-faint hover:text-brand-soft ml-auto">Unlink</button>
        )}
      </div>

      <div className="relative">
        <Icon name="search" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search TMDB for the movie or series, or paste a themoviedb.org link"
          aria-label="Search TMDB" className="input h-10 w-full pl-9" />
        {loading && <span className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-white/10 border-t-brand rounded-full animate-spin" />}
      </div>

      {!q.trim() && (
        <p className="text-xs text-ink-faint flex items-center gap-1.5">
          <Icon name="auto_awesome" size={14} className="text-gold" />
          {smart === null ? 'Reading the file name…'
            : smart.length ? <>Best guesses for <span className="font-mono text-ink-muted truncate">{fileName}</span></>
            : 'No confident guesses — search by name above'}
        </p>
      )}

      {shown.length > 0 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1" role="listbox" aria-label="TMDB results">
          {shown.map(h => {
            const active = chosen?.id === h.id && chosen.mediaType === h.mediaType
            return (
              <button type="button" key={`${h.mediaType}-${h.id}`} onClick={() => pick(h)} role="option" aria-selected={active}
                className={`flex-shrink-0 w-24 rounded-xl overflow-hidden text-left bg-dark-void transition-all ${active ? 'ring-2 ring-brand' : 'hover:ring-1 hover:ring-white/20'}`}>
                <div className="relative aspect-[2/3] bg-dark-card">
                  {h.poster
                    ? <img src={h.poster} alt="" loading="lazy" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-ink-faint"><Icon name={h.mediaType === 'tv' ? 'tv' : 'movie'} size={24} /></div>}
                  <span className={`absolute top-1 left-1 tech-pill !text-[9px] !bg-dark-void/80 ${h.mediaType === 'tv' ? 'text-gold' : 'text-cyan'}`}>{h.mediaType === 'tv' ? 'Series' : 'Movie'}</span>
                  {h.confidence != null && (
                    <span className={`absolute bottom-1 right-1 tech-pill !text-[9px] !bg-dark-void/85 ${h.confidence >= 0.8 ? 'text-cyan' : h.confidence >= 0.5 ? 'text-gold' : 'text-ink-faint'}`}
                      title="How sure the matcher is">{pct(h.confidence)}</span>
                  )}
                </div>
                <p className="px-1.5 pt-1 text-[11px] font-bold text-ink leading-tight line-clamp-2">{h.title}</p>
                <p className="px-1.5 pb-1.5 text-[10px] text-ink-faint">{h.year || '—'}{h.mediaType === 'tv' && h.episode != null ? ` · S${h.season ?? 1}E${h.episode}` : ''}</p>
              </button>
            )
          })}
        </div>
      )}

      {chosen?.mediaType === 'tv' && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-ink-muted flex items-center gap-1.5">Season
            <select value={season} onChange={e => setEp(Number(e.target.value), 1)} className="input h-9 !w-auto pr-8">
              {(seasons.length ? seasons : [{ season: 1, episodes: 0, name: 'Season 1' }]).map(s => (
                <option key={s.season} value={s.season}>{s.name}{s.episodes ? ` (${s.episodes})` : ''}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-ink-muted flex items-center gap-1.5">Episode
            <input type="number" min={1} max={maxEp} value={episode}
              onChange={e => setEp(season, Math.max(1, Math.min(maxEp, Number(e.target.value) || 1)))} className="input h-9 w-20" />
          </label>
        </div>
      )}
    </div>
  )
}
