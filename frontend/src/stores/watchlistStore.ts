// frontend/src/stores/watchlistStore.ts — NEW FILE
import { create } from 'zustand'
import api from '../services/api'

export interface WatchlistItem {
  movieId:  number
  title:    string
  poster:   string
  backdrop: string
  rating:   number
  year:     string
  addedAt?: number
}

interface WatchlistStore {
  items:   WatchlistItem[]
  loading: boolean
  fetch:   () => Promise<void>
  add:     (item: Omit<WatchlistItem, 'addedAt'>) => Promise<void>
  remove:  (movieId: number) => Promise<void>
  clear:   () => void
}

const LS_KEY = 'streamix_wl'

function loadLocal(): WatchlistItem[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] }
}
function writeLocal(items: WatchlistItem[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(items)) } catch {}
}
function getToken(): string | null {
  try { return JSON.parse(localStorage.getItem('streamix_user') || '{}')?.token || null } catch { return null }
}

export const useWatchlistStore = create<WatchlistStore>((set, get) => ({
  items:   loadLocal(),
  loading: false,

  fetch: async () => {
    if (!getToken()) { set({ items: loadLocal() }); return }
    set({ loading: true })
    try {
      const { data } = await api.get('/watchlist')
      const items = (data || []).map((d: any) => ({
        movieId:  Number(d.movieId),
        title:    d.title    || '',
        poster:   d.poster   || '',
        backdrop: d.backdrop || '',
        rating:   d.rating   || 0,
        year:     d.year     || '',
        addedAt:  d.addedAt ? new Date(d.addedAt).getTime() : Date.now(),
      }))
      writeLocal(items)
      set({ items })
    } catch {
      set({ items: loadLocal() })
    } finally {
      set({ loading: false })
    }
  },

  add: async (item) => {
    const entry: WatchlistItem = { ...item, addedAt: Date.now() }
    set(state => {
      if (state.items.some(i => i.movieId === item.movieId)) return state
      const updated = [entry, ...state.items]
      writeLocal(updated)
      return { items: updated }
    })
    if (!getToken()) return
    try {
      await api.post('/watchlist', {
        movieId:  item.movieId,
        title:    item.title,
        poster:   item.poster   || '',
        backdrop: item.backdrop || '',
        rating:   item.rating   || 0,
        year:     item.year     || '',
      })
    } catch (err: any) {
      console.warn('[WL] add failed:', err?.response?.status)
    }
  },

  remove: async (movieId) => {
    set(state => {
      const updated = state.items.filter(i => i.movieId !== movieId)
      writeLocal(updated)
      return { items: updated }
    })
    if (!getToken()) return
    try { await api.delete(`/watchlist/${movieId}`) } catch {}
  },

  clear: () => { writeLocal([]); set({ items: [] }) },
}))
