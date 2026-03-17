// frontend/src/stores/continueWatchingStore.ts — FULL REPLACEMENT
import { create } from 'zustand'
import api from '../services/api'

export interface WatchProgress {
  movieId:      number
  title:        string
  poster:       string
  backdrop:     string
  type:         'movie' | 'tv'
  season?:      number
  episode?:     number
  episodeName?: string
  progress:     number    // 0–100
  timestamp:    number    // exact second
  duration?:    number    // total seconds
  durationMins?:number
  watchedAt:    number    // ms
}

interface Store {
  items:          WatchProgress[]
  synced:         boolean
  fetch:          () => Promise<void>
  save:           (item: Omit<WatchProgress, 'watchedAt'>) => Promise<void>
  saveTimestamp:  (movieId: number, timestamp: number, duration?: number) => Promise<void>
  remove:         (movieId: number) => Promise<void>
  clear:          () => void
  get:            (movieId: number) => WatchProgress | undefined
}

const LS_KEY = 'streamix_cw_v3'

function loadLocal(): WatchProgress[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] }
}
function writeLocal(items: WatchProgress[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(items)) } catch {}
}
function getToken(): string | null {
  try { return JSON.parse(localStorage.getItem('streamix_user') || '{}')?.token || null } catch { return null }
}
function mapItem(d: any): WatchProgress {
  return {
    movieId:     Number(d.movieId),
    title:       d.title        || '',
    poster:      d.poster       || '',
    backdrop:    d.backdrop     || '',
    type:        d.type         || 'movie',
    season:      d.season       != null ? Number(d.season)       : undefined,
    episode:     d.episode      != null ? Number(d.episode)      : undefined,
    episodeName: d.episodeName  || undefined,
    progress:    Number(d.progress)  || 0,
    timestamp:   Number(d.timestamp) || 0,
    duration:    d.duration     != null ? Number(d.duration)     : undefined,
    durationMins:d.durationMins != null ? Number(d.durationMins) : undefined,
    watchedAt:   d.watchedAt ? new Date(d.watchedAt).getTime() : Date.now(),
  }
}

export const useContinueWatching = create<Store>((set, get) => ({
  items:  loadLocal(),
  synced: false,

  fetch: async () => {
    if (!getToken()) { set({ items: loadLocal(), synced: true }); return }
    try {
      const { data } = await api.get('/users/continue-watching')
      if (!Array.isArray(data)) { set({ items: loadLocal(), synced: true }); return }
      const items = data.map(mapItem)
      writeLocal(items)
      set({ items, synced: true })
    } catch {
      set({ items: loadLocal(), synced: true })
    }
  },

  save: async (item) => {
    const entry: WatchProgress = { ...item, watchedAt: Date.now() }
    set(state => {
      const filtered = state.items.filter(i => i.movieId !== item.movieId)
      const updated  = [entry, ...filtered].slice(0, 20)
      writeLocal(updated)
      return { items: updated }
    })
    if (!getToken()) return
    try {
      await api.post('/users/continue-watching', {
        movieId:     item.movieId,
        title:       item.title,
        poster:      item.poster       || '',
        backdrop:    item.backdrop     || '',
        type:        item.type,
        season:      item.season       ?? null,
        episode:     item.episode      ?? null,
        episodeName: item.episodeName  ?? '',
        progress:    item.progress,
        timestamp:   item.timestamp    ?? 0,
        duration:    item.duration     ?? null,
        durationMins:item.durationMins ?? null,
      })
    } catch (err: any) {
      console.warn('[CW] save failed:', err?.response?.status)
    }
  },

  // ── Save exact timestamp (called every 10s by HLS player) ───────────────────
  saveTimestamp: async (movieId, timestamp, duration) => {
    // Update local first
    set(state => {
      const updated = state.items.map(item => {
        if (item.movieId !== movieId) return item
        const progress = duration && duration > 0
          ? Math.min(Math.round((timestamp / duration) * 100), 99)
          : item.progress
        const entry = { ...item, timestamp, duration: duration ?? item.duration, progress, watchedAt: Date.now() }
        return entry
      })
      writeLocal(updated)
      return { items: updated }
    })

    // Sync to backend
    if (!getToken()) return
    try {
      await api.post('/stream/timestamp', { movieId, timestamp, duration })
    } catch (err: any) {
      console.warn('[CW] timestamp sync failed:', err?.response?.status)
    }
  },

  remove: async (movieId) => {
    set(state => {
      const updated = state.items.filter(i => i.movieId !== movieId)
      writeLocal(updated)
      return { items: updated }
    })
    if (!getToken()) return
    try { await api.delete(`/users/continue-watching/${movieId}`) } catch {}
  },

  clear: () => { writeLocal([]); set({ items: [], synced: false }) },
  get:   (movieId) => get().items.find(i => i.movieId === movieId),
}))
