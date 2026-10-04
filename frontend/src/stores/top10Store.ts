// Today's Top 10 movies and shows (for "TOP 10" badges and the ranked rows)
import { create } from 'zustand'
import api from '../services/api'
import type { CardMovie } from '../components/MovieCard'

interface Top10State {
  movies: CardMovie[]
  tv: CardMovie[]
  rank: Map<string, number>   // "movie:123" → 1..10
  loaded: boolean
  load: () => Promise<void>
}

let pending: Promise<void> | null = null

export const useTop10 = create<Top10State>((set, get) => ({
  movies: [], tv: [], rank: new Map(), loaded: false,
  load: () => {
    if (get().loaded) return Promise.resolve()
    pending ??= api.get('/movies/top10').then(r => {
      const rank = new Map<string, number>()
      r.data.movies.forEach((m: CardMovie, i: number) => rank.set(`movie:${m.id}`, i + 1))
      r.data.tv.forEach((m: CardMovie, i: number) => rank.set(`tv:${m.id}`, i + 1))
      set({ movies: r.data.movies, tv: r.data.tv, rank, loaded: true })
    }).catch(() => { pending = null })
    return pending
  },
}))
