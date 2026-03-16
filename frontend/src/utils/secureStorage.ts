import type { User } from '../types'

const KEY = 'streamix_user'

let memoryStore: User | null = null

export const secureStorage = {
  set(user: User): User {
    const safe: User = {
      _id:      user._id,
      username: user.username,
      email:    user.email,
      isAdmin:  user.isAdmin,
      avatar:   user.avatar || '',
      token:    user.token,
    }
    memoryStore = safe
    try { localStorage.setItem(KEY, JSON.stringify(safe)) } catch {}
    return safe
  },

  get(): User | null {
    if (memoryStore) return memoryStore
    try {
      const stored = localStorage.getItem(KEY)
      if (!stored) return null
      const parsed: User = JSON.parse(stored)
      if (!parsed?.token || parsed.token.split('.').length !== 3) {
        this.clear(); return null
      }
      try {
        const payload = JSON.parse(atob(parsed.token.split('.')[1]))
        if (payload.exp && payload.exp * 1000 < Date.now()) {
          this.clear(); return null
        }
      } catch {}
      memoryStore = parsed
      return parsed
    } catch { this.clear(); return null }
  },

  clear() {
    memoryStore = null
    try { localStorage.removeItem(KEY) } catch {}
  },

  getToken(): string | null {
    return this.get()?.token || null
  },
}