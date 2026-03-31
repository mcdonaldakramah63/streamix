// frontend/src/stores/profileStore.ts — FULL REPLACEMENT
// Fixes: isKids flag properly typed, setActive persists to localStorage,
//        fetch correctly hydrates, kids redirect works
import { create } from 'zustand'
import api from '../services/api'

const STORAGE_KEY = 'streamix_active_profile'

// ── Types ────────────────────────────────────────────────────────────────────
export interface Profile {
  _id:    string
  name:   string
  avatar: string
  color:  string
  isKids: boolean
}

interface ProfileState {
  profiles:      Profile[]
  activeProfile: Profile | null
  loading:       boolean

  fetch:       () => Promise<void>
  create:      (data: Partial<Profile>) => Promise<Profile>
  update:      (id: string, data: Partial<Profile>) => Promise<void>
  remove:      (id: string) => Promise<void>
  setActive:   (p: Profile | null) => void
  recordWatch: (
    tmdbId:    number,
    title:     string,
    type:      'movie' | 'tv',
    genres:    number[],
    language:  string,
    completed: boolean
  ) => Promise<void>
}

// ── Read persisted profile ────────────────────────────────────────────────────
function readStored(): Profile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as Profile
  } catch {
    return null
  }
}

// ── Store ─────────────────────────────────────────────────────────────────────
export const useProfileStore = create<ProfileState>((set, get) => ({
  profiles:      [],
  activeProfile: readStored(),
  loading:       false,

  fetch: async () => {
    set({ loading: true })
    try {
      const { data } = await api.get('/profiles')
      const profiles: Profile[] = data

      set(state => {
        // Re-sync active profile from server data (picks up isKids flag changes)
        const stored  = state.activeProfile
        const synced  = stored
          ? profiles.find(p => p._id === stored._id) || null
          : null

        // Auto-select first profile if none active
        const active = synced ?? (profiles.length > 0 ? profiles[0] : null)

        if (active) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(active))
        }

        return { profiles, activeProfile: active }
      })
    } catch (err) {
      console.error('[ProfileStore] fetch failed:', err)
    } finally {
      set({ loading: false })
    }
  },

  create: async (data) => {
    const { data: created } = await api.post('/profiles', data)
    set(s => ({ profiles: [...s.profiles, created] }))
    return created
  },

  update: async (id, data) => {
    const { data: updated } = await api.put(`/profiles/${id}`, data)
    set(s => {
      const profiles = s.profiles.map(p => p._id === id ? updated : p)
      const active   = s.activeProfile?._id === id ? updated : s.activeProfile
      if (active) localStorage.setItem(STORAGE_KEY, JSON.stringify(active))
      return { profiles, activeProfile: active }
    })
  },

  remove: async (id) => {
    await api.delete(`/profiles/${id}`)
    set(s => {
      const profiles = s.profiles.filter(p => p._id !== id)
      const active   = s.activeProfile?._id === id ? null : s.activeProfile
      if (!active) localStorage.removeItem(STORAGE_KEY)
      return { profiles, activeProfile: active }
    })
  },

  setActive: (p) => {
    if (p) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
    set({ activeProfile: p })
  },

  recordWatch: async (tmdbId, title, type, genres, language, completed) => {
    const { activeProfile } = get()
    if (!activeProfile) return
    try {
      await api.post(`/profiles/${activeProfile._id}/watch`, {
        tmdbId, title, type, genres, language, completed,
      })
    } catch { /* silent */ }
  },
}))
