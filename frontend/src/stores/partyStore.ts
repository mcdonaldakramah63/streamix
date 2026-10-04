// Watch party state — rides on the shared WebSocket (hooks/useWebSocket.ts)
import { create } from 'zustand'
import { onWsMessage, wsSend, wsConnected } from '../hooks/useWebSocket'

export interface PartyMedia { type: 'movie' | 'tv'; id: number; season?: number | null; episode?: number | null; title: string; poster?: string }
export interface PartyMember { id: string; userId: string; name: string; avatar: string; color: string; avatarImage?: string }
export interface ChatLine { id: string; from: string; name: string; color?: string; text: string; at: number; system?: boolean }
export interface Reaction { key: string; emoji: string; name: string; x: number }
export interface PartyProfile { name: string; avatar?: string; color?: string; avatarImage?: string }
export interface SyncMsg { playing: boolean; time: number; at: number; seek?: boolean }

interface PartyState {
  code: string | null
  myId: string | null
  hostId: string | null
  members: PartyMember[]
  media: PartyMedia | null
  chat: ChatLine[]
  reactions: Reaction[]
  error: string
  countdownAt: number | null      // local timestamp when "play" happens
  unread: number
  panelOpen: boolean
  profile: PartyProfile | null
  lastSync: SyncMsg | null

  create: (media: PartyMedia, profile: PartyProfile) => void
  join: (code: string, profile: PartyProfile) => void
  leave: () => void
  sync: (playing: boolean, time: number, seek?: boolean) => void
  requestSync: () => void
  setMedia: (media: PartyMedia) => void
  say: (text: string) => void
  react: (emoji: string) => void
  countdown: () => void
  kick: (memberId: string) => void
  setPanel: (open: boolean) => void
  isHost: () => boolean
}

let seq = 0
const line = (text: string): ChatLine => ({ id: `s${++seq}`, from: '', name: '', text, at: Date.now(), system: true })
// Sync listeners (the player) — kept outside React state so every update reaches them
const syncListeners = new Set<(m: SyncMsg) => void>()
export const onPartySync = (fn: (m: SyncMsg) => void) => { syncListeners.add(fn); return () => { syncListeners.delete(fn) } }

/** Sends now, or as soon as the socket (re)connects */
function sendWhenReady(msg: Record<string, unknown>, tries = 20) {
  if (wsSend(msg) || tries <= 0) return
  setTimeout(() => sendWhenReady(msg, tries - 1), 500)
}

export const usePartyStore = create<PartyState>((set, get) => {
  onWsMessage((msg) => {
    switch (msg.type) {
      case 'CONNECTED': {
        set({ myId: msg.memberId })
        // Reconnected while in a party → rejoin with the same code
        const { code, profile } = get()
        if (code && profile) wsSend({ type: 'PARTY_JOIN', code, profile })
        return
      }
      case 'PARTY_STATE': {
        const first = get().code !== msg.code
        if (msg.you) set({ myId: msg.you })
        set({
          code: msg.code, hostId: msg.hostId, members: msg.members, media: msg.media, error: '',
          ...(first ? { chat: [line(get().myId === msg.hostId ? `Party ${msg.code} started — share the link to invite people` : `You joined party ${msg.code}`)] } : {}),
        })
        if (first && get().myId !== msg.hostId) wsSend({ type: 'PARTY_REQUEST_SYNC' })
        return
      }
      case 'PARTY_SYNC': {
        const m: SyncMsg = { playing: msg.playing, time: msg.time, at: Date.now(), seek: msg.seek }
        set({ lastSync: m })
        syncListeners.forEach(fn => fn(m))
        return
      }
      case 'PARTY_CHAT':
        set(s => ({
          chat: [...s.chat, { id: `c${++seq}`, from: msg.from, name: msg.name, color: msg.color, text: msg.text, at: msg.at }].slice(-200),
          unread: s.panelOpen || msg.from === s.myId ? s.unread : s.unread + 1,
        }))
        return
      case 'PARTY_NOTICE':
        set(s => ({ chat: [...s.chat, line(msg.text)].slice(-200) }))
        return
      case 'PARTY_REACT': {
        const r: Reaction = { key: `r${++seq}`, emoji: msg.emoji, name: msg.name, x: 10 + Math.random() * 80 }
        set(s => ({ reactions: [...s.reactions, r].slice(-30) }))
        setTimeout(() => set(s => ({ reactions: s.reactions.filter(x => x.key !== r.key) })), 3200)
        return
      }
      case 'PARTY_COUNTDOWN':
        // Server sends its own clock; use the remaining time so clock differences don't matter
        set({ countdownAt: Date.now() + Math.max(0, msg.startAt - msg.serverNow) })
        return
      case 'PARTY_ERROR':
        set({ error: msg.text })
        return
      case 'PARTY_ENDED':
        set({ code: null, hostId: null, members: [], media: null, error: msg.text || 'The party ended' })
        return
    }
  })

  return {
    code: null, myId: null, hostId: null, members: [], media: null, chat: [], reactions: [],
    error: '', countdownAt: null, unread: 0, panelOpen: false, profile: null, lastSync: null,

    create: (media, profile) => { set({ profile, error: '', chat: [] }); sendWhenReady({ type: 'PARTY_CREATE', media, profile }) },
    join: (code, profile) => { set({ profile, error: '' }); sendWhenReady({ type: 'PARTY_JOIN', code: code.trim().toUpperCase(), profile }) },
    leave: () => {
      wsSend({ type: 'PARTY_LEAVE' })
      set({ code: null, hostId: null, members: [], media: null, chat: [], reactions: [], countdownAt: null, unread: 0, lastSync: null })
    },
    sync: (playing, time, seek) => { if (get().isHost()) wsSend({ type: 'PARTY_SYNC', playing, time, seek: !!seek }) },
    requestSync: () => wsSend({ type: 'PARTY_REQUEST_SYNC' }),
    setMedia: (media) => { if (get().isHost()) wsSend({ type: 'PARTY_MEDIA', media }) },
    say: (text) => { if (text.trim()) wsSend({ type: 'PARTY_CHAT', text: text.trim() }) },
    react: (emoji) => wsSend({ type: 'PARTY_REACT', emoji }),
    countdown: () => wsSend({ type: 'PARTY_COUNTDOWN' }),
    kick: (memberId) => wsSend({ type: 'PARTY_KICK', memberId }),
    setPanel: (open) => set(s => ({ panelOpen: open, unread: open ? 0 : s.unread })),
    isHost: () => { const s = get(); return !!s.code && s.myId === s.hostId },
  }
})

export const partyConnected = wsConnected
