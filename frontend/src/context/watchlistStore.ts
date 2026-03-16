import { create } from 'zustand'
import { WatchlistItem } from '../types'
import { getWatchlist, addWatchlist, removeWatchlist } from '../services/api'

interface WatchlistState {
  items: WatchlistItem[]
  loading: boolean
  fetch: () => Promise<void>
  add: (data: Omit<WatchlistItem, '_id' | 'addedAt'>) => Promise<void>
  remove: (movieId: number) => Promise<void>
  isInList: (movieId: number) => boolean
}

export const useWatchlistStore = create<WatchlistState>((set, get) => ({
  items: [],
  loading: false,
  fetch: async () => {
    set({ loading: true })
    try {
      const { data } = await getWatchlist()
      set({ items: data })
    } catch {}
    set({ loading: false })
  },
  add: async (data) => {
    try {
      await addWatchlist(data)
      set((s) => ({ items: [{ ...data, _id: Date.now().toString(), addedAt: new Date().toISOString() }, ...s.items] }))
    } catch {}
  },
  remove: async (movieId) => {
    try {
      await removeWatchlist(movieId)
      set((s) => ({ items: s.items.filter((i) => i.movieId !== movieId) }))
    } catch {}
  },
  isInList: (movieId) => get().items.some((i) => i.movieId === movieId),
}))
