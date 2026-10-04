// frontend/src/context/authStore.ts — single source of truth for the logged-in user
// Side effects of logging in/out (syncing watchlist, profiles, etc.) live in services/session.ts
import { create } from 'zustand'

export interface User {
  _id:      string
  username: string
  email:    string
  isAdmin:  boolean
  avatar?:  string
  token:    string
}

interface AuthStore {
  user:     User | null
  setUser:  (user: User | null) => void
  setToken: (token: string) => void
  logout:   () => void
}

const LS_USER = 'streamix_user'

function loadUser(): User | null {
  try {
    const raw = localStorage.getItem(LS_USER)
    if (!raw) return null
    const u = JSON.parse(raw)
    // An expired access token is fine here — the API client refreshes it using the HttpOnly cookie
    return u?._id && u?.token ? u : null
  } catch { return null }
}

function persist(user: User | null) {
  try {
    if (user) localStorage.setItem(LS_USER, JSON.stringify(user))
    else localStorage.removeItem(LS_USER)
  } catch { /* storage unavailable */ }
}

export function isTokenExpired(token: string | undefined, bufferMs = 30_000): boolean {
  if (!token) return true
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return !payload.exp || payload.exp * 1000 < Date.now() + bufferMs
  } catch { return true }
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: loadUser(),

  setUser: (user) => { persist(user); set({ user }) },

  setToken: (token) => {
    const user = get().user
    if (!user) return
    const next = { ...user, token }
    persist(next)
    set({ user: next })
  },

  logout: () => { persist(null); set({ user: null }) },
}))
