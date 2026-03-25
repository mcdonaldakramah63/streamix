// frontend/src/stores/profileStore.ts — NEW FILE
import { create } from 'zustand'
import api from '../services/api'

export interface Profile {
  _id:    string
  name:   string
  avatar: string
  color:  string
  isKids: boolean
}

interface ProfileStore {
  profiles:       Profile[]
  activeProfile:  Profile | null
  loading:        boolean
  fetch:          () => Promise<void>
  create:         (data: Partial<Profile>) => Promise<Profile>
  update:         (id: string, data: Partial<Profile>) => Promise<void>
  remove:         (id: string) => Promise<void>
  setActive:      (profile: Profile | null) => void
  recordWatch:    (tmdbId: number, title: string, type: 'movie'|'tv', genres: number[], language?: string, completed?: boolean) => Promise<void>
}

const LS_ACTIVE = 'streamix_active_profile'

function loadActive(): Profile | null {
  try { return JSON.parse(localStorage.getItem(LS_ACTIVE) || 'null') } catch { return null }
}

export const useProfileStore = create<ProfileStore>((set, get) => ({
  profiles:      [],
  activeProfile: loadActive(),
  loading:       false,

  fetch: async () => {
    set({ loading: true })
    try {
      const { data } = await api.get('/profiles')
      set({ profiles: data })
      // Auto-select first profile if none active
      if (!get().activeProfile && data.length > 0) {
        const active = data[0]
        localStorage.setItem(LS_ACTIVE, JSON.stringify(active))
        set({ activeProfile: active })
      }
    } catch { /* ignore */ }
    finally { set({ loading: false }) }
  },

  create: async (profileData) => {
    const { data } = await api.post('/profiles', profileData)
    set(s => ({ profiles: [...s.profiles, data] }))
    return data
  },

  update: async (id, profileData) => {
    const { data } = await api.put(`/profiles/${id}`, profileData)
    set(s => ({
      profiles: s.profiles.map(p => p._id === id ? data : p),
      activeProfile: s.activeProfile?._id === id ? data : s.activeProfile,
    }))
    if (get().activeProfile?._id === id) {
      localStorage.setItem(LS_ACTIVE, JSON.stringify(data))
    }
  },

  remove: async (id) => {
    await api.delete(`/profiles/${id}`)
    set(s => ({ profiles: s.profiles.filter(p => p._id !== id) }))
  },

  setActive: (profile) => {
    if (profile) localStorage.setItem(LS_ACTIVE, JSON.stringify(profile))
    else localStorage.removeItem(LS_ACTIVE)
    set({ activeProfile: profile })
  },

  recordWatch: async (tmdbId, title, type, genres, language = 'en', completed = false) => {
    const profileId = get().activeProfile?._id
    if (!profileId) return
    try {
      await api.post(`/profiles/${profileId}/watch`, { tmdbId, title, type, genres, language, completed })
    } catch { /* silent */ }
  },
}))
