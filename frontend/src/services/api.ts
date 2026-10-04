// frontend/src/services/api.ts — axios client for the local Streamix backend
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '../context/authStore'

export const API_BASE = import.meta.env.VITE_API_URL || '/api'

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30_000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

// The viewer's time zone: notifications respect their quiet hours and arrive when they're usually around
let timeZone = ''
try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '' } catch { /* old browser */ }

// Attach the current access token to every request
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().user?.token
  if (token) config.headers.Authorization = `Bearer ${token}`
  if (timeZone) config.headers['X-Timezone'] = timeZone
  return config
})

// ── Silent token refresh (single flight) ─────────────────────────────────────
let refreshing: Promise<string | null> | null = null

export function refreshAccessToken(): Promise<string | null> {
  if (!refreshing) {
    refreshing = axios.post(`${API_BASE}/auth/refresh`, {}, { withCredentials: true })
      .then(({ data }) => {
        const token = data?.token as string | undefined
        if (!token) return null
        const current = useAuthStore.getState().user
        // Keep the stored user in sync with what the server returned (e.g. admin rights changed)
        useAuthStore.getState().setUser({ ...(current || data), ...data, token })
        return token
      })
      .catch(() => null)
      .finally(() => { refreshing = null })
  }
  return refreshing
}

type RetryConfig = InternalAxiosRequestConfig & { _retry?: boolean }

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const config = error.config as RetryConfig | undefined
    const status = error.response?.status
    const isAuthCall = config?.url?.startsWith('/auth/')

    if (status === 401 && config && !config._retry && !isAuthCall && useAuthStore.getState().user) {
      config._retry = true
      const token = await refreshAccessToken()
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
        return api(config)
      }
      // Refresh cookie is gone or expired — the session is over
      useAuthStore.getState().logout()
    }
    // An admin suspended this account — end the session
    if (status === 403 && (error.response?.data as any)?.suspended && useAuthStore.getState().user) {
      useAuthStore.getState().logout()
    }
    return Promise.reject(error)
  }
)

export const errorMessage = (e: unknown, fallback = 'Something went wrong') =>
  (e as any)?.response?.data?.message || (e as any)?.message || fallback

// ── Catalogue cache ───────────────────────────────────────────────────────────
// Movie/TV catalogue data (/movies/*) is the same for everyone and changes slowly, so GETs are kept
// for 5 minutes and identical requests in flight are shared. Going back to a page is instant, and
// hovering a card can warm its details before the click. Personal data is never cached here.
const CACHE_TTL = 5 * 60 * 1000
const cache = new Map<string, { at: number; res: any }>()
const inflight = new Map<string, Promise<any>>()
const baseAdapter = axios.getAdapter(api.defaults.adapter)

const cacheable = (cfg: InternalAxiosRequestConfig) =>
  (cfg.method || 'get').toLowerCase() === 'get' && /^\/movies\//.test(cfg.url || '') && !/smart-search/.test(cfg.url || '')

api.defaults.adapter = async (cfg) => {
  if (!cacheable(cfg)) return baseAdapter(cfg)
  const key = api.getUri(cfg)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL) return { ...hit.res, config: cfg }
  if (inflight.has(key)) return { ...(await inflight.get(key)), config: cfg }
  const p = baseAdapter(cfg).then(res => {
    if (res.status >= 200 && res.status < 300) {
      cache.set(key, { at: Date.now(), res })
      if (cache.size > 400) cache.delete(cache.keys().next().value!)
    }
    return res
  }).finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}

/** Warm the cache for a page the user is probably about to open */
export const prefetch = (path: string) => { api.get(path).catch(() => { /* best effort */ }) }

export default api
