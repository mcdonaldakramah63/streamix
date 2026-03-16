import { create } from 'zustand'

interface User {
  _id: string
  username: string
  email: string
  isAdmin: boolean
  avatar?: string
  token: string
  continueWatching?: any[]
  recentlyViewed?: any[]
}

interface AuthState {
  user: User | null
  setUser: (user: User | null) => void
  logout: () => void
}

let stored: User | null = null
try {
  const raw = localStorage.getItem('streamix_user')
  if (raw) stored = JSON.parse(raw)
} catch {
  stored = null
}

export const useAuthStore = create<AuthState>((set) => ({
  user: stored,
  setUser: (user) => {
    try {
      if (user) localStorage.setItem('streamix_user', JSON.stringify(user))
      else localStorage.removeItem('streamix_user')
    } catch {}
    set({ user })
  },
  logout: () => {
    try { localStorage.removeItem('streamix_user') } catch {}
    set({ user: null })
  },
}))
