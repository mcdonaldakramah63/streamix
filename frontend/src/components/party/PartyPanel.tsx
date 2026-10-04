// Watch party side panel: start/join, invite link, members, chat, reactions, countdown
import { useEffect, useRef, useState } from 'react'
import { usePartyStore, PartyMedia } from '../../stores/partyStore'
import { useProfileStore } from '../../stores/profileStore'
import ProfileAvatar from '../avatar/ProfileAvatar'
import Icon from '../Icon'

export const REACTIONS = ['😂', '😮', '😍', '😱', '👏', '🔥', '😢', '💀']

export function partyLink(code: string, media: PartyMedia | null) {
  if (!media) return `${location.origin}/?party=${code}`
  const path = media.type === 'tv'
    ? `/player/tv/${media.id}?season=${media.season || 1}&episode=${media.episode || 1}&party=${code}`
    : `/player/movie/${media.id}?party=${code}`
  return `${location.origin}${path}`
}

export default function PartyPanel({ media, canSync, onClose }: { media: PartyMedia; canSync: boolean; onClose: () => void }) {
  const p = usePartyStore()
  const active = useProfileStore(s => s.activeProfile)
  const [joinCode, setJoinCode] = useState('')
  const [text, setText] = useState('')
  const [copied, setCopied] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const isHost = p.isHost()

  const me = { name: active?.name || 'Viewer', avatar: active?.avatar, color: active?.color, avatarImage: active?.avatarImage }

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }) }, [p.chat.length])

  const copy = async () => {
    const link = partyLink(p.code!, p.media)
    try {
      if (navigator.share && /Android|iPhone|iPad/i.test(navigator.userAgent)) await navigator.share({ title: 'Watch with me on Streamix', url: link })
      else { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800) }
    } catch { /* cancelled */ }
  }

  const sendChat = (e: React.FormEvent) => { e.preventDefault(); p.say(text); setText('') }

  return (
    <div className="flex flex-col h-full min-h-0 bg-dark">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
        <Icon name="groups" size={20} className="text-brand" />
        <p className="text-sm font-bold text-white flex-1">Watch party</p>
        <button onClick={onClose} aria-label="Close watch party panel" className="btn-icon w-8 h-8"><Icon name="close" size={18} /></button>
      </div>

      {!p.code ? (
        <div className="p-4 space-y-5 overflow-y-auto">
          <div>
            <p className="text-sm text-ink-muted mb-3">Watch together with friends — play, pause and seeking stay in sync, with live chat and reactions.</p>
            <button onClick={() => p.create(media, me)} className="btn-primary w-full py-3"><Icon name="add" size={20} /> Start a party</button>
          </div>
          <form onSubmit={e => { e.preventDefault(); if (joinCode.trim().length === 6) p.join(joinCode, me) }} className="space-y-2">
            <label htmlFor="party-code" className="text-label-sm uppercase text-ink-faint">Have a code?</label>
            <div className="flex gap-2">
              <input id="party-code" value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                placeholder="ABC123" autoComplete="off" className="input h-11 flex-1 font-mono tracking-[0.3em] text-center uppercase" />
              <button disabled={joinCode.length !== 6} className="btn-secondary px-4 disabled:opacity-40">Join</button>
            </div>
          </form>
          {p.error && <p role="alert" className="text-sm text-brand-soft">{p.error}</p>}
        </div>
      ) : (
        <>
          <div className="px-4 py-3 space-y-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-2">
              <span className="font-mono text-lg font-black tracking-[0.25em] text-white">{p.code}</span>
              <button onClick={copy} className="ml-auto btn-secondary px-3 py-1.5 text-xs">
                <Icon name={copied ? 'check' : 'share'} size={16} />{copied ? 'Copied' : 'Invite'}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {p.members.map(m => (
                <span key={m.id} className="flex items-center gap-1.5 rounded-full pl-1 pr-2.5 py-0.5 bg-dark-surface text-xs text-ink">
                  <ProfileAvatar p={m} className="w-5 h-5 rounded-full" emojiSize="text-[10px]" />
                  {m.name}{m.id === p.myId ? ' (you)' : ''}
                  {m.id === p.hostId && <Icon name="crown" size={13} className="text-gold" fill />}
                  {isHost && m.id !== p.myId && (
                    <button onClick={() => p.kick(m.id)} aria-label={`Remove ${m.name}`} className="text-ink-faint hover:text-brand-soft"><Icon name="close" size={12} /></button>
                  )}
                </span>
              ))}
            </div>
            <p className={`text-xs flex items-start gap-1.5 ${canSync ? 'text-cyan' : 'text-gold'}`}>
              <Icon name={canSync ? 'sync' : 'info'} size={14} className="mt-0.5 flex-shrink-0" />
              {canSync
                ? isHost ? 'You control playback for everyone.' : 'Playback follows the host.'
                : "This source can't be synced automatically. Pick the same source, then use the countdown to press play together."}
            </p>
            {isHost && (
              <button onClick={p.countdown} className="btn-secondary w-full py-2 text-xs"><Icon name="timer" size={16} /> 3‑2‑1 countdown for everyone</button>
            )}
            {!isHost && canSync && (
              <button onClick={p.requestSync} className="text-xs text-ink-faint hover:text-white flex items-center gap-1"><Icon name="sync" size={14} />Out of sync? Catch up</button>
            )}
          </div>

          <div ref={listRef} className="flex-1 min-h-[160px] overflow-y-auto px-4 py-3 space-y-2" aria-live="polite">
            {p.chat.map(c => c.system ? (
              <p key={c.id} className="text-[11px] text-ink-faint text-center">{c.text}</p>
            ) : (
              <p key={c.id} className="text-sm leading-snug break-words">
                <b style={{ color: c.color || '#fff' }}>{c.name}</b> <span className="text-ink">{c.text}</span>
              </p>
            ))}
          </div>

          <div className="px-3 pb-3 pt-2 border-t border-white/[0.06] space-y-2">
            <div className="flex justify-between">
              {REACTIONS.map(e => (
                <button key={e} onClick={() => p.react(e)} aria-label={`React ${e}`} className="w-9 h-9 rounded-full text-lg hover:bg-white/[0.06] active:scale-90 transition-transform">{e}</button>
              ))}
            </div>
            <form onSubmit={sendChat} className="flex gap-2">
              <input value={text} onChange={e => setText(e.target.value)} maxLength={300} placeholder="Say something…" aria-label="Chat message" className="input h-10 flex-1" />
              <button disabled={!text.trim()} aria-label="Send" className="btn-primary w-10 h-10 !p-0 disabled:opacity-40"><Icon name="send" size={18} /></button>
            </form>
            <button onClick={p.leave} className="w-full text-xs text-ink-faint hover:text-brand-soft py-1">Leave party</button>
          </div>
        </>
      )}
    </div>
  )
}

/** Floating reactions + the shared countdown, drawn over the video */
export function PartyOverlay() {
  const reactions = usePartyStore(s => s.reactions)
  const countdownAt = usePartyStore(s => s.countdownAt)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!countdownAt) return
    const t = setInterval(() => setNow(Date.now()), 100)
    const end = setTimeout(() => usePartyStore.setState({ countdownAt: null }), Math.max(0, countdownAt - Date.now()) + 1200)
    return () => { clearInterval(t); clearTimeout(end) }
  }, [countdownAt])

  const left = countdownAt ? Math.ceil((countdownAt - now) / 1000) : null
  return (
    <div className="absolute inset-0 pointer-events-none z-40 overflow-hidden">
      {reactions.map(r => (
        <span key={r.key} className="absolute bottom-6 text-3xl party-float" style={{ left: `${r.x}%` }}>
          {r.emoji}<span className="block text-[10px] text-white/80 text-center font-bold">{r.name}</span>
        </span>
      ))}
      {left !== null && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <span key={left} className="text-white font-black text-7xl sm:text-8xl animate-scale-in drop-shadow-2xl">{left > 0 ? left : 'Play!'}</span>
        </div>
      )}
      <style>{`@keyframes partyFloat { 0% { transform: translateY(0) scale(.6); opacity: 0 } 15% { opacity: 1; transform: translateY(-20px) scale(1.1) } 100% { transform: translateY(-260px) scale(1); opacity: 0 } }
        .party-float { animation: partyFloat 3s ease-out forwards }`}</style>
    </div>
  )
}
