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
  durationMins?:number
  watchedAt:    number    // ms
}

interface Store {
  items:   WatchProgress[]
  synced:  boolean
  fetch:   () => Promise<void>
  save:    (item: Omit<WatchProgress, 'watchedAt'>) => Promise<void>
  remove:  (movieId: number) => Promise<void>
  clear:   () => void
  get:     (movieId: number) => WatchProgress | undefined
}

const LS_KEY = 'streamix_cw_v2'

// ── Local storage helpers ────────────────────────────────────────────────────
function loadLocal(): WatchProgress[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') }
  catch { return [] }
}
function writeLocal(items: WatchProgress[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(items)) } catch {}
}

// ── Get JWT token from storage ───────────────────────────────────────────────
function getToken(): string | null {
  try {
    const raw = localStorage.getItem('streamix_user')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.token || null
  } catch { return null }
}

// ── Map backend response to frontend shape ───────────────────────────────────
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
    progress:    Number(d.progress) || 0,
    durationMins:d.durationMins != null ? Number(d.durationMins) : undefined,
    watchedAt:   d.watchedAt ? new Date(d.watchedAt).getTime() : Date.now(),
  }
}

// ── Store ────────────────────────────────────────────────────────────────────
export const useContinueWatching = create<Store>((set, get) => ({
  items:  loadLocal(),
  synced: false,

  // ── Fetch from backend ─────────────────────────────────────────────────────
  fetch: async () => {
    const token = getToken()
    if (!token) {
      console.log('[CW] No token — using localStorage only')
      set({ items: loadLocal(), synced: true })
      return
    }

    try {
      console.log('[CW] Fetching from backend…')
      const { data } = await api.get('/users/continue-watching')

      if (!Array.isArray(data)) {
        console.warn('[CW] Unexpected response:', data)
        set({ items: loadLocal(), synced: true })
        return
      }

      const items = data.map(mapItem)
      console.log(`[CW] Fetched ${items.length} items from backend`)
      writeLocal(items)
      set({ items, synced: true })
    } catch (err: any) {
      const status = err?.response?.status
      console.warn(`[CW] Fetch failed (${status || err.message}) — using localStorage`)
      set({ items: loadLocal(), synced: true })
    }
  },

  // ── Save entry ──────────────────────────────────────────────────────────────
  save: async (item) => {
    const entry: WatchProgress = { ...item, watchedAt: Date.now() }

    // Optimistic local update
    set(state => {
      const filtered = state.items.filter(i => i.movieId !== item.movieId)
      const updated  = [entry, ...filtered].slice(0, 20)
      writeLocal(updated)
      return { items: updated }
    })

    // Sync to backend
    const token = getToken()
    if (!token) return

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
        durationMins:item.durationMins ?? null,
      })
    } catch (err: any) {
      console.warn('[CW] Save to backend failed:', err?.response?.status || err.message)
    }
  },

  // ── Remove entry ────────────────────────────────────────────────────────────
  remove: async (movieId) => {
    set(state => {
      const updated = state.items.filter(i => i.movieId !== movieId)
      writeLocal(updated)
      return { items: updated }
    })

    const token = getToken()
    if (!token) return

    try {
      await api.delete(`/users/continue-watching/${movieId}`)
    } catch (err: any) {
      console.warn('[CW] Remove from backend failed:', err?.response?.status || err.message)
    }
  },

  clear: () => {
    writeLocal([])
    set({ items: [], synced: false })
  },

  get: (movieId) => get().items.find(i => i.movieId === movieId),
}))
