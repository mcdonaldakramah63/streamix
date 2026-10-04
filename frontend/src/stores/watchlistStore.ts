// frontend/src/stores/watchlistStore.ts — optimistic watchlist synced with the backend
import { create } from 'zustand'
import api from '../services/api'
import { useAuthStore } from '../context/authStore'

export interface WLItem {
  movieId:  number
  title:    string
  poster:   string
  backdrop: string
  rating:   number
  year:     string
  type?:    'movie' | 'tv'
  addedAt?: number
}

interface WLState {
  items:   WLItem[]
  loading: boolean
  synced:  boolean
  fetch:   () => Promise<void>
  add:     (item: Omit<WLItem, 'addedAt'>) => Promise<void>
  remove:  (movieId: number) => Promise<void>
  toggle:  (item: Omit<WLItem, 'addedAt'>) => Promise<void>
  isIn:    (movieId: number) => boolean
  clear:   () => void
}

const LS_KEY = 'streamix_watchlist_v2'

const loadLocal = (): WLItem[] => {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] }
}
const saveLocal = (items: WLItem[]) => {
  try { localStorage.setItem(LS_KEY, JSON.stringify(items)) } catch { /* quota */ }
}
const loggedIn = () => !!useAuthStore.getState().user

export const useWatchlistStore = create<WLState>((set, get) => ({
  items:   loggedIn() ? loadLocal() : [],
  loading: false,
  synced:  false,

  fetch: async () => {
    if (!loggedIn()) { set({ items: [], synced: true }); return }
    set({ loading: true })
    try {
      const { data } = await api.get('/watchlist')
      const items: WLItem[] = (Array.isArray(data) ? data : []).map((d: any) => ({
        movieId:  Number(d.movieId),
        title:    d.title    || '',
        poster:   d.poster   || '',
        backdrop: d.backdrop || '',
        rating:   Number(d.rating) || 0,
        year:     d.year     || '',
        type:     d.type === 'tv' ? 'tv' : 'movie',
        addedAt:  d.addedAt ? new Date(d.addedAt).getTime() : Date.now(),
      }))
      saveLocal(items)
      set({ items, synced: true })
    } catch (e: any) {
      console.warn('[WL] fetch failed:', e?.response?.status)
      set({ synced: true })
    } finally { set({ loading: false }) }
  },

  add: async (item) => {
    if (!loggedIn() || get().isIn(item.movieId)) return
    const entry: WLItem = { ...item, addedAt: Date.now() }
    set(s => { const items = [entry, ...s.items]; saveLocal(items); return { items } })

    try {
      await api.post('/watchlist', { ...entry, type: entry.type || 'movie' })
    } catch (e: any) {
      if (e?.response?.status !== 409) {
        set(s => { const items = s.items.filter(i => i.movieId !== item.movieId); saveLocal(items); return { items } })
      }
      console.warn('[WL] add failed:', e?.response?.status)
    }
  },

  remove: async (movieId) => {
    if (!loggedIn()) return
    const prev = get().items
    set(s => { const items = s.items.filter(i => i.movieId !== movieId); saveLocal(items); return { items } })
    try {
      await api.delete(`/watchlist/${movieId}`)
    } catch (e: any) {
      // 404 means it's already gone server-side — keep the removal
      if (e?.response?.status !== 404) { saveLocal(prev); set({ items: prev }) }
    }
  },

  toggle: async (item) => {
    if (get().isIn(item.movieId)) await get().remove(item.movieId)
    else                          await get().add(item)
  },

  isIn:  (movieId) => get().items.some(i => i.movieId === movieId),
  clear: () => { saveLocal([]); set({ items: [], synced: false }) },
}))

export default useWatchlistStore
