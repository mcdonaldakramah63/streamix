import { create } from 'zustand'
import type { User } from '../types'

interface AuthState {
  user: User | null
  setUser: (user: User | null) => void
  logout: () => void
}

const stored = localStorage.getItem('streamix_user')

export const useAuthStore = create<AuthState>((set) => ({
  user: stored ? JSON.parse(stored) : null,
  setUser: (user) => {
    if (user) localStorage.setItem('streamix_user', JSON.stringify(user))
    else localStorage.removeItem('streamix_user')
    set({ user })
  },
  logout: () => {
    localStorage.removeItem('streamix_user')
    set({ user: null })
  },
}))