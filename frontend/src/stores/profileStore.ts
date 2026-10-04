// frontend/src/stores/profileStore.ts — viewer profiles + server-verified PIN gate
import { create } from 'zustand'
import { withPinRetry } from '../utils/pinPrompt'
import api, { errorMessage } from '../services/api'

const STORAGE_KEY = 'streamix_active_profile'

export interface AvatarConfig {
  skin: number; hair: number; hairColor: number; eyes: number; mouth: number; accessory: number; bg: number
}

export interface Profile {
  _id:           string
  name:          string
  avatar:        string
  color:         string
  isKids:        boolean
  hasPin?:       boolean
  /** Uploaded photo URL (served by the backend) — shown first when set */
  avatarImage?:  string
  /** Built avatar — shown when there's no photo */
  avatarConfig?: AvatarConfig | null
  /** Accent colour theme (utils/theme.ts) */
  theme?:        string
  prefs?:        Partial<ProfilePrefs>
  /** "Not for me" titles ("movie:123") kept out of rows */
  hiddenTitles?: string[]
}

export interface ProfilePrefs {
  autoplayNext: boolean
  autoplayPreviews: boolean
  subtitleLang: string
  quality: 'auto' | 'saver' | 'high'
  maturity: '7' | '13' | '16' | 'all'
}
export const DEFAULT_PREFS: ProfilePrefs = { autoplayNext: true, autoplayPreviews: true, subtitleLang: '', quality: 'auto', maturity: 'all' }

/** The active profile's preferences with defaults filled in */
export const usePrefs = (): ProfilePrefs => {
  const p = useProfileStore(s => s.activeProfile?.prefs)
  return { ...DEFAULT_PREFS, ...(p || {}) }
}

/** Set of "type:id" keys the active profile hid */
export const useHidden = () => {
  const list = useProfileStore(s => s.activeProfile?.hiddenTitles)
  return new Set(list || [])
}

export interface ProfileInput {
  name?:   string
  avatar?: string
  color?:  string
  isKids?: boolean
  /** undefined = unchanged, null = remove PIN, '1234' = set PIN */
  pin?:    string | null
  avatarConfig?: AvatarConfig | null
  /** Remove the uploaded photo */
  clearImage?: boolean
  theme?: string
  prefs?: Partial<ProfilePrefs>
}

interface PinRequest {
  profile: Profile
  resolve: (ok: boolean) => void
}

interface ProfileState {
  profiles:      Profile[]
  activeProfile: Profile | null
  loading:       boolean
  loaded:        boolean
  pinRequest:    PinRequest | null

  fetch:     () => Promise<void>
  create:    (data: ProfileInput) => Promise<Profile>
  update:    (id: string, data: ProfileInput) => Promise<void>
  remove:    (id: string) => Promise<void>
  /** "Not for me": hide (or unhide) a title for the active profile */
  setHidden: (key: string, hidden: boolean) => Promise<void>
  uploadAvatar: (id: string, dataUrl: string) => Promise<void>
  removeAvatar: (id: string) => Promise<void>
  /** Switches profile. Asks for the PIN first when the profile has one. Resolves false if cancelled. */
  setActive: (p: Profile | null) => Promise<boolean>
  submitPin: (pin: string) => Promise<string | null>
  cancelPin: () => void
  clear:     () => void
  recordWatch: (tmdbId: number, title: string, type: 'movie' | 'tv', genres: number[], language: string, completed: boolean, extra?: { progress?: number; seconds?: number }) => Promise<void>
}

function readStored(): Profile | null {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') } catch { return null }
}
function writeStored(p: Profile | null) {
  try {
    if (p) localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
    else localStorage.removeItem(STORAGE_KEY)
  } catch { /* storage unavailable */ }
}

function replaceProfile(set: (fn: (s: ProfileState) => Partial<ProfileState>) => void, updated: Profile) {
  set(s => {
    const active = s.activeProfile?._id === updated._id ? updated : s.activeProfile
    writeStored(active)
    return { profiles: s.profiles.map(p => (p._id === updated._id ? updated : p)), activeProfile: active }
  })
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profiles:      [],
  activeProfile: readStored(),
  loading:       false,
  loaded:        false,
  pinRequest:    null,

  fetch: async () => {
    set({ loading: true })
    try {
      const { data } = await api.get<Profile[]>('/profiles')
      const profiles = Array.isArray(data) ? data : []
      const stored = get().activeProfile
      // Keep the active profile only if it still exists for this account
      const active = stored ? profiles.find(p => p._id === stored._id) ?? null : null
      writeStored(active)
      set({ profiles, activeProfile: active, loaded: true })
    } catch (err) {
      console.error('[ProfileStore] fetch failed:', err)
      set({ loaded: true })
    } finally {
      set({ loading: false })
    }
  },

  create: async (input) => {
    const { data } = await api.post<Profile>('/profiles', input)
    set(s => ({ profiles: [...s.profiles, data] }))
    return data
  },

  update: async (id, input) => {
    // PIN changes / kids switches ask for the needed PIN when the server requires it
    const name = get().profiles.find(p => p._id === id)?.name
    const { data } = await withPinRetry(pins => api.put<Profile>(`/profiles/${id}`, { ...input, ...pins }), name)
    set(s => {
      const profiles = s.profiles.map(p => (p._id === id ? data : p))
      const active = s.activeProfile?._id === id ? data : s.activeProfile
      writeStored(active)
      return { profiles, activeProfile: active }
    })
  },

  setHidden: async (key, hidden) => {
    const active = get().activeProfile
    if (!active) return
    const { data } = await api.put(`/profiles/${active._id}/hidden`, { key, hidden })
    replaceProfile(set, { ...active, hiddenTitles: data.hiddenTitles })
  },

  remove: async (id) => {
    const name = get().profiles.find(p => p._id === id)?.name
    await withPinRetry(pins => api.delete(`/profiles/${id}`, { data: pins }), name)
    set(s => {
      const active = s.activeProfile?._id === id ? null : s.activeProfile
      writeStored(active)
      return { profiles: s.profiles.filter(p => p._id !== id), activeProfile: active }
    })
  },

  uploadAvatar: async (id, dataUrl) => {
    const { data } = await api.put<Profile>(`/profiles/${id}/avatar`, { image: dataUrl })
    replaceProfile(set, data)
  },

  removeAvatar: async (id) => {
    const { data } = await api.delete<Profile>(`/profiles/${id}/avatar`)
    replaceProfile(set, data)
  },

  setActive: async (profile) => {
    if (!profile) { writeStored(null); set({ activeProfile: null }); return true }
    if (get().activeProfile?._id === profile._id) return true

    if (!profile.isKids && profile.hasPin) {
      const ok = await new Promise<boolean>(resolve => set({ pinRequest: { profile, resolve } }))
      if (!ok) return false
    }
    writeStored(profile)
    set({ activeProfile: profile })
    return true
  },

  submitPin: async (pin) => {
    const req = get().pinRequest
    if (!req) return 'No profile selected'
    try {
      await api.post(`/profiles/${req.profile._id}/verify-pin`, { pin })
      set({ pinRequest: null })
      req.resolve(true)
      return null
    } catch (e) {
      return errorMessage(e, 'Incorrect PIN')
    }
  },

  cancelPin: () => {
    const req = get().pinRequest
    set({ pinRequest: null })
    req?.resolve(false)
  },

  clear: () => {
    get().pinRequest?.resolve(false)
    writeStored(null)
    set({ profiles: [], activeProfile: null, loaded: false, pinRequest: null })
  },

  recordWatch: async (tmdbId, title, type, genres, language, completed, extra = {}) => {
    const { activeProfile } = get()
    if (!activeProfile) return
    try {
      // progress / seconds watched / local hour feed the recommendation engine
      await api.post(`/profiles/${activeProfile._id}/watch`, {
        tmdbId, title, type, genres, language, completed,
        progress: completed ? 100 : extra.progress ?? 0, seconds: extra.seconds ?? 0, hour: new Date().getHours(),
      })
    } catch (err) {
      console.warn('recordWatch failed:', err)
    }
  },
}))
