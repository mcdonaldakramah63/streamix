// frontend/src/context/authStore.ts — FULL REPLACEMENT
import { create } from 'zustand'
import { useContinueWatching } from '../stores/continueWatchingStore'

export interface User {
  _id:      string
  username: string
  email:    string
  isAdmin:  boolean
  avatar?:  string
  token:    string
}

interface AuthStore {
  user:    User | null
  setUser: (user: User | null) => void
  logout:  () => void
}

const LS_USER = 'streamix_user'

function loadUser(): User | null {
  try {
    const raw = localStorage.getItem(LS_USER)
    if (!raw) return null
    const u = JSON.parse(raw)
    if (!u?.token) return null
    // Check token expiry
    try {
      const payload = JSON.parse(atob(u.token.split('.')[1]))
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        localStorage.removeItem(LS_USER)
        return null
      }
    } catch { /* non-standard token, keep it */ }
    return u
  } catch { return null }
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: loadUser(),

  setUser: (user) => {
    if (user) {
      try { localStorage.setItem(LS_USER, JSON.stringify(user)) } catch {}
      set({ user })
      // Fetch this user's continue watching from backend
      // Small delay so the token is available in localStorage before the request fires
      setTimeout(() => useContinueWatching.getState().fetch(), 200)
    } else {
      try { localStorage.removeItem(LS_USER) } catch {}
      set({ user: null })
    }
  },

  logout: () => {
    try { localStorage.removeItem(LS_USER) } catch {}
    useContinueWatching.getState().clear()
    set({ user: null })
  },
}))

// Auto-fetch CW when the page loads if user is already logged in
const existing = loadUser()
if (existing) {
  setTimeout(() => useContinueWatching.getState().fetch(), 300)
}
