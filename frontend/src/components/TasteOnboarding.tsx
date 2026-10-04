// New profile: "Pick a few you like" so recommendations are good from the first visit (like Netflix)
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import api from '../services/api'
import Icon from './Icon'

interface Item { id: number; media_type: 'movie' | 'tv'; title?: string; name?: string; poster_path: string | null }

export default function TasteOnboarding({ profileId, profileName, onDone }: { profileId: string; profileName: string; onDone: () => void }) {
  const [items, setItems] = useState<Item[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.get(`/profiles/${profileId}/onboarding`).then(r => setItems(r.data)).catch(() => setItems([]))
  }, [profileId])

  const toggle = (k: string) => setPicked(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })
  const finish = async (picks: string[]) => {
    setBusy(true)
    try { await api.post(`/profiles/${profileId}/onboarding`, { picks }) } catch { /* still close */ }
    setBusy(false)
    onDone()
  }

  return createPortal(
    <div className="fixed inset-0 z-[230] bg-dark-void/95 backdrop-blur-md overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="onb-title">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="flex items-start gap-4 mb-6">
          <div className="flex-1">
            <h1 id="onb-title" className="text-2xl sm:text-4xl font-black text-white">What do you like, {profileName}?</h1>
            <p className="text-ink-muted mt-2">Pick at least 3 titles you enjoyed. Streamix uses them to recommend things you'll love — and keeps learning as you watch.</p>
          </div>
          <button onClick={() => finish([])} disabled={busy} className="text-sm text-ink-faint hover:text-white whitespace-nowrap">Skip</button>
        </div>

        {!items ? (
          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-3">{Array.from({ length: 18 }).map((_, i) => <div key={i} className="skeleton rounded-xl" style={{ aspectRatio: '2/3' }} />)}</div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-3 pb-28">
            {items.map(it => {
              const k = `${it.media_type}:${it.id}`, on = picked.has(k)
              return (
                <button key={k} onClick={() => toggle(k)} aria-pressed={on} aria-label={it.title || it.name}
                  className={`relative rounded-xl overflow-hidden transition-all duration-200 ${on ? 'ring-4 ring-brand scale-[0.97]' : 'hover:scale-[1.02]'}`} style={{ aspectRatio: '2/3' }}>
                  {it.poster_path && <img src={`https://image.tmdb.org/t/p/w342${it.poster_path}`} alt="" loading="lazy" className={`w-full h-full object-cover ${on ? 'brightness-75' : ''}`} />}
                  {on && <span className="absolute top-2 right-2 w-8 h-8 rounded-full bg-brand text-white flex items-center justify-center shadow-brand"><Icon name="check" size={20} /></span>}
                </button>
              )
            })}
          </div>
        )}
      </div>
      <div className="fixed bottom-0 inset-x-0 p-4 bg-gradient-to-t from-dark-void via-dark-void/95 to-transparent">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <p className="text-sm text-ink-muted flex-1">{picked.size < 3 ? `Pick ${3 - picked.size} more` : `${picked.size} picked — great!`}</p>
          <button onClick={() => finish([...picked])} disabled={picked.size < 3 || busy} className="btn-primary px-8 h-12 disabled:opacity-40">
            {busy ? 'Saving…' : 'Done'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
