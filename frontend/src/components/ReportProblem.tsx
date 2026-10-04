// Player: tell the admin something's wrong with this video
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import api, { errorMessage } from '../services/api'
import Icon from './Icon'

const REASONS: [string, string, string][] = [
  ['not-playing', 'Won’t play', 'block'],
  ['buffering', 'Keeps buffering', 'hourglass_top'],
  ['wrong-video', 'Wrong movie/episode', 'swap_horiz'],
  ['bad-quality', 'Poor quality', 'blur_on'],
  ['audio', 'Audio problem', 'volume_off'],
  ['subtitles', 'Subtitle problem', 'subtitles_off'],
  ['other', 'Something else', 'help'],
]

export interface ReportTarget { type: 'movie' | 'tv'; tmdbId: number; season?: number; episode?: number; title: string; source: string }

export default function ReportProblem({ target, onClose }: { target: ReportTarget; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  const send = async () => {
    setBusy(true); setError('')
    try { await api.post('/reports', { ...target, reason, note }); setDone(true); setTimeout(onClose, 1600) }
    catch (e) { setError(errorMessage(e)) }
    finally { setBusy(false) }
  }

  // Portal: parents with backdrop-blur would otherwise trap this "fixed" overlay inside them
  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }} role="dialog" aria-modal="true" aria-label="Report a problem">
      <div className="w-full sm:max-w-md card rounded-b-none sm:rounded-2xl p-5 animate-slide-up">
        {done ? (
          <div className="py-8 text-center">
            <Icon name="check_circle" size={40} className="text-cyan" fill />
            <p className="text-white font-bold mt-2">Thanks — we'll look into it</p>
            <p className="text-ink-faint text-sm mt-1">Meanwhile, try another source below the player.</p>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-1 min-w-0">
                <p className="text-white font-extrabold">Report a problem</p>
                <p className="text-xs text-ink-faint truncate">{target.title}{target.type === 'tv' ? ` · S${target.season}E${target.episode}` : ''} · {target.source}</p>
              </div>
              <button onClick={onClose} aria-label="Close" className="btn-icon w-8 h-8"><Icon name="close" size={18} /></button>
            </div>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="What went wrong">
              {REASONS.map(([id, label, icon]) => (
                <button key={id} onClick={() => setReason(id)} role="radio" aria-checked={reason === id}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-left transition-all ${reason === id ? 'bg-brand/15 text-white ring-1 ring-brand/50' : 'bg-dark-surface text-ink hover:bg-white/[0.06]'}`}>
                  <Icon name={icon} size={18} className={reason === id ? 'text-brand' : 'text-ink-faint'} />{label}
                </button>
              ))}
            </div>
            <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={500} rows={2} placeholder="Anything else? (optional)" aria-label="Details"
              className="w-full mt-3 rounded-xl p-3 text-sm text-white outline-none" style={{ background: 'rgba(20,26,38,0.6)', border: '1px solid rgba(255,255,255,0.08)' }} />
            {error && <p role="alert" className="text-sm text-brand-soft mt-2">{error}</p>}
            <button onClick={send} disabled={!reason || busy} className="btn-primary w-full h-11 mt-3 disabled:opacity-40">{busy ? 'Sending…' : 'Send report'}</button>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
