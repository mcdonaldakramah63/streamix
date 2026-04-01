// frontend/src/stores/continueWatchingStore.ts — FULL REPLACEMENT
// FIX: exports BOTH useContinueWatching (original) AND useContinueWatchingStore (new)
// so every component that imports either name will work without changes
import { create } from 'zustand'
import api from '../services/api'

// ── Types ─────────────────────────────────────────────────────────────────────
export interface CWItem {
  movieId:      number
  title:        string
  poster:       string
  backdrop:     string
  type:         'movie' | 'tv'
  season?:      number
  episode?:     number
  episodeName?: string
  progress:     number   // 0-100
  timestamp:    number   // seconds
  duration?:    number   // seconds
  durationMins?:number
  watchedAt:    number   // Date.now()
}

interface CWState {
  items:  CWItem[]
  synced: boolean
  fetch:         () => Promise<void>
  save:          (item: Omit<CWItem, 'watchedAt'>) => Promise<void>
  saveTimestamp: (movieId: number, timestamp: number, duration?: number) => Promise<void>
  remove:        (movieId: number) => Promise<void>
  clear:         () => void
  get:           (movieId: number) => CWItem | undefined
}

// ── LocalStorage helpers ──────────────────────────────────────────────────────
const LS_KEY = 'streamix_cw_v3'

function loadLocal(): CWItem[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] }
}

function saveLocal(items: CWItem[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(items)) } catch { /* quota exceeded */ }
}

function getToken(): string | null {
  try {
    const u = JSON.parse(localStorage.getItem('streamix_user') || '{}')
    return u?.token || null
  } catch { return null }
}

function normalise(raw: any): CWItem {
  return {
    movieId:     Number(raw.movieId),
    title:       raw.title        || '',
    poster:      raw.poster       || '',
    backdrop:    raw.backdrop     || '',
    type:        raw.type         || 'movie',
    season:      raw.season  != null ? Number(raw.season)  : undefined,
    episode:     raw.episode != null ? Number(raw.episode) : undefined,
    episodeName: raw.episodeName  || undefined,
    progress:    Number(raw.progress)  || 0,
    timestamp:   Number(raw.timestamp) || 0,
    duration:    raw.duration    != null ? Number(raw.duration)    : undefined,
    durationMins:raw.durationMins!= null ? Number(raw.durationMins): undefined,
    watchedAt:   raw.watchedAt ? new Date(raw.watchedAt).getTime() : Date.now(),
  }
}

// ── Store ─────────────────────────────────────────────────────────────────────
const store = create<CWState>((set, get) => ({
  items:  loadLocal(),
  synced: false,

  // ── Fetch from backend (called once on login) ──────────────────────────────
  fetch: async () => {
    if (!getToken()) {
      set({ items: loadLocal(), synced: true })
      return
    }
    try {
      const { data } = await api.get('/users/continue-watching')
      if (!Array.isArray(data)) { set({ items: loadLocal(), synced: true }); return }
      const items = data.map(normalise)
      saveLocal(items)
      set({ items, synced: true })
    } catch {
      set({ items: loadLocal(), synced: true })
    }
  },

  // ── Save / update an entry ─────────────────────────────────────────────────
  save: async (item) => {
    const entry: CWItem = { ...item, watchedAt: Date.now() }

    // Optimistic update
    set(s => {
      const rest = s.items.filter(i => i.movieId !== item.movieId)
      const next = [entry, ...rest].slice(0, 20)
      saveLocal(next)
      return { items: next }
    })

    if (!getToken()) return
    try {
      await api.post('/users/continue-watching', {
        movieId:     entry.movieId,
        title:       entry.title,
        poster:      entry.poster       || '',
        backdrop:    entry.backdrop     || '',
        type:        entry.type,
        season:      entry.season       ?? null,
        episode:     entry.episode      ?? null,
        episodeName: entry.episodeName  ?? '',
        progress:    entry.progress,
        timestamp:   entry.timestamp    ?? 0,
        duration:    entry.duration     ?? null,
        durationMins:entry.durationMins ?? null,
      })
    } catch (e: any) {
      console.warn('[CW] save failed:', e?.response?.status)
    }
  },

  // ── Save just the timestamp (called every ~10s) ────────────────────────────
  saveTimestamp: async (movieId, timestamp, duration) => {
    set(s => {
      const items = s.items.map(i => {
        if (i.movieId !== movieId) return i
        const progress = duration && duration > 0
          ? Math.min(Math.round(timestamp / duration * 100), 99)
          : i.progress
        return { ...i, timestamp, duration: duration ?? i.duration, progress, watchedAt: Date.now() }
      })
      saveLocal(items)
      return { items }
    })

    if (!getToken()) return
    try {
      await api.post('/stream/timestamp', { movieId, timestamp, duration })
    } catch (e: any) {
      console.warn('[CW] timestamp sync failed:', e?.response?.status)
    }
  },

  // ── Remove ─────────────────────────────────────────────────────────────────
  remove: async (movieId) => {
    set(s => {
      const items = s.items.filter(i => i.movieId !== movieId)
      saveLocal(items)
      return { items }
    })
    if (!getToken()) return
    try { await api.delete(`/users/continue-watching/${movieId}`) } catch { /* silent */ }
  },

  // ── Clear all ─────────────────────────────────────────────────────────────
  clear: () => {
    saveLocal([])
    set({ items: [], synced: false })
  },

  // ── Get one ────────────────────────────────────────────────────────────────
  get: (movieId) => get().items.find(i => i.movieId === movieId),
}))

// ── Exports — BOTH names so no import needs changing ─────────────────────────
export const useContinueWatching       = store   // original name (used by ContinueWatchingRow, Player v1)
export const useContinueWatchingStore  = store   // new name (used by HLSPlayer, Player v2)
export default store
