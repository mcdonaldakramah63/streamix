// frontend/src/stores/continueWatchingStore.ts
import { create } from 'zustand'
import api from '../services/api'
import { useAuthStore } from '../context/authStore'

export interface CWItem {
  movieId:       number
  title:         string
  poster:        string
  backdrop:      string
  type:          'movie' | 'tv'
  season?:       number
  episode?:      number
  episodeName?:  string
  progress:      number   // 0-100
  timestamp:     number   // seconds
  duration?:     number   // seconds
  durationMins?: number
  watchedAt:     number   // ms epoch
  /** Server turned a finished episode into the next one */
  upNext?:       boolean
}

interface CWState {
  items:  CWItem[]
  synced: boolean
  fetch:        () => Promise<void>
  save:         (item: Omit<CWItem, 'watchedAt'>) => Promise<void>
  applyRemote:  (movieId: number, timestamp: number, duration?: number, season?: number, episode?: number) => void
  remove:       (movieId: number) => Promise<void>
  clear:        () => void
  get:          (movieId: number) => CWItem | undefined
}

const LS_KEY = 'streamix_cw_v3'

const loadLocal = (): CWItem[] => {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] }
}
const saveLocal = (items: CWItem[]) => {
  try { localStorage.setItem(LS_KEY, JSON.stringify(items)) } catch { /* quota */ }
}
const loggedIn = () => !!useAuthStore.getState().user

function normalise(raw: any): CWItem {
  return {
    movieId:      Number(raw.movieId),
    title:        raw.title    || '',
    poster:       raw.poster   || '',
    backdrop:     raw.backdrop || '',
    type:         raw.type === 'tv' ? 'tv' : 'movie',
    season:       raw.season  != null ? Number(raw.season)  : undefined,
    episode:      raw.episode != null ? Number(raw.episode) : undefined,
    episodeName:  raw.episodeName || undefined,
    progress:     Number(raw.progress)  || 0,
    timestamp:    Number(raw.timestamp) || 0,
    duration:     raw.duration     != null ? Number(raw.duration)     : undefined,
    durationMins: raw.durationMins != null ? Number(raw.durationMins) : undefined,
    watchedAt:    raw.watchedAt ? new Date(raw.watchedAt).getTime() : Date.now(),
    upNext:       !!raw.upNext,
  }
}

export const useContinueWatching = create<CWState>((set, get) => ({
  items:  loadLocal(),
  synced: false,

  fetch: async () => {
    if (!loggedIn()) { set({ synced: true }); return }
    try {
      const { data } = await api.get('/users/continue-watching')
      const items = (Array.isArray(data) ? data : []).map(normalise)
      saveLocal(items)
      set({ items, synced: true })
    } catch {
      set({ synced: true })
    }
  },

  save: async (item) => {
    const entry: CWItem = { ...item, watchedAt: Date.now() }
    set(s => {
      const next = [entry, ...s.items.filter(i => i.movieId !== item.movieId)].slice(0, 20)
      saveLocal(next)
      return { items: next }
    })

    if (!loggedIn()) return
    try {
      await api.post('/users/continue-watching', {
        ...entry,
        season:      entry.season      ?? null,
        episode:     entry.episode     ?? null,
        episodeName: entry.episodeName ?? '',
        duration:    entry.duration    ?? null,
        durationMins:entry.durationMins ?? null,
      })
    } catch (e: any) {
      console.warn('[CW] save failed:', e?.response?.status)
    }
  },

  // Progress pushed from another device over the WebSocket — update locally only
  applyRemote: (movieId, timestamp, duration, season, episode) => {
    set(s => {
      const items = s.items.map(i => {
        if (i.movieId !== movieId) return i
        const d = duration || i.duration
        return {
          ...i,
          timestamp,
          duration: d,
          season:   season  ?? i.season,
          episode:  episode ?? i.episode,
          progress: d ? Math.min(99, Math.round(timestamp / d * 100)) : i.progress,
          watchedAt: Date.now(),
        }
      })
      saveLocal(items)
      return { items }
    })
  },

  remove: async (movieId) => {
    set(s => {
      const items = s.items.filter(i => i.movieId !== movieId)
      saveLocal(items)
      return { items }
    })
    if (!loggedIn()) return
    try { await api.delete(`/users/continue-watching/${movieId}`) } catch { /* silent */ }
  },

  clear: () => { saveLocal([]); set({ items: [], synced: false }) },

  get: (movieId) => get().items.find(i => i.movieId === movieId),
}))

// Legacy alias
export const useContinueWatchingStore = useContinueWatching
export default useContinueWatching
