// Kids profile status: screen time left, bedtime, allowed/blocked titles
import { create } from 'zustand'
import api from '../services/api'

export interface KidsStatus {
  allowed: boolean
  reason: 'limit' | 'bedtime' | null
  usedToday: number
  minutesLeft: number | null
  dailyLimitMin: number
  bedtimeStart: string
  bedtimeEnd: string
  blockedTitles: string[]
  allowedOnly: boolean
  allowedTitles: string[]
}

/** The device's local date and time — bedtime and "today" follow the kid's clock */
export function localNow() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return { day: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}` }
}

interface KidsState {
  profileId: string | null
  status: KidsStatus | null
  refresh: (profileId: string) => Promise<void>
  tick: (profileId: string) => Promise<void>
  titleAllowed: (type: 'movie' | 'tv', id: number) => boolean
}

export const useKidsStore = create<KidsState>((set, get) => ({
  profileId: null,
  status: null,
  refresh: async (profileId) => {
    try {
      const { data } = await api.get(`/profiles/${profileId}/kids-status`, { params: localNow() })
      set({ profileId, status: data })
    } catch { /* keep the last known status */ }
  },
  tick: async (profileId) => {
    try {
      const { data } = await api.post(`/profiles/${profileId}/usage`, { ...localNow(), minutes: 1 })
      set({ profileId, status: data })
    } catch { /* offline — try next minute */ }
  },
  titleAllowed: (type, id) => {
    const s = get().status
    if (!s) return true
    const key = `${type}:${id}`
    if (s.blockedTitles?.includes(key)) return false
    if (s.allowedOnly) return s.allowedTitles?.includes(key)
    return true
  },
}))
