// frontend/src/stores/watchlistStore.ts — FULL REPLACEMENT
// FIX: correct API request body fields, proper auth check, optimistic rollback on failure
import { create } from 'zustand'
import api from '../services/api'

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

function loadLocal(): WLItem[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] }
}
function saveLocal(items: WLItem[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(items)) } catch {}
}
function getToken(): string | null {
  try { return JSON.parse(localStorage.getItem('streamix_user') || '{}')?.token || null } catch { return null }
}

export const useWatchlistStore = create<WLState>((set, get) => ({
  items:   loadLocal(),
  loading: false,
  synced:  false,

  fetch: async () => {
    if (!getToken()) { set({ items: loadLocal(), synced: true }); return }
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
        type:     d.type     || 'movie',
        addedAt:  d.addedAt  ? new Date(d.addedAt).getTime() : Date.now(),
      }))
      saveLocal(items)
      set({ items, synced: true })
    } catch (e: any) {
      console.warn('[WL] fetch failed:', e?.response?.status)
      set({ items: loadLocal(), synced: true })
    } finally { set({ loading: false }) }
  },

  add: async (item) => {
    // Optimistic add
    if (get().isIn(item.movieId)) return
    const entry: WLItem = { ...item, addedAt: Date.now() }
    set(s => { const items = [entry, ...s.items]; saveLocal(items); return { items } })

    if (!getToken()) return
    try {
      await api.post('/watchlist', {
        movieId:  entry.movieId,
        title:    entry.title,
        poster:   entry.poster   || '',
        backdrop: entry.backdrop || '',
        rating:   entry.rating   || 0,
        year:     entry.year     || '',
        type:     entry.type     || 'movie',
      })
    } catch (e: any) {
      const status = e?.response?.status
      if (status !== 409) {
        // Rollback
        set(s => { const items = s.items.filter(i => i.movieId !== item.movieId); saveLocal(items); return { items } })
      }
      console.warn('[WL] add failed:', status)
    }
  },

  remove: async (movieId) => {
    const prev = get().items
    set(s => { const items = s.items.filter(i => i.movieId !== movieId); saveLocal(items); return { items } })

    if (!getToken()) return
    try {
      await api.delete(`/watchlist/${movieId}`)
    } catch (e: any) {
      console.warn('[WL] remove failed:', e?.response?.status)
      // Rollback
      set(() => { saveLocal(prev); return { items: prev } })
    }
  },

  toggle: async (item) => {
    const { isIn, add, remove } = get()
    if (isIn(item.movieId)) await remove(item.movieId)
    else                     await add(item)
  },

  isIn:  (movieId) => get().items.some(i => i.movieId === movieId),
  clear: () => { saveLocal([]); set({ items: [], synced: false }) },
}))

export default useWatchlistStore
