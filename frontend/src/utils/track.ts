// Light interest signals for the recommendation engine, batched and sent every few seconds.
// (Opening a title, watching its trailer, clicking it in search, pressing play.)
import { useProfileStore } from '../stores/profileStore'
import { useAuthStore } from '../context/authStore'

type Kind = 'detail' | 'trailer' | 'search_click' | 'play'
interface Ev { kind: Kind; mediaType: 'movie' | 'tv'; tmdbId: number; row?: string; source?: string }

let queue: Ev[] = []
let timer: ReturnType<typeof setTimeout> | undefined
const recent = new Map<string, number>() // de-dupe repeats within 10 minutes

function flush() {
  timer = undefined
  const profile = useProfileStore.getState().activeProfile
  const token = useAuthStore.getState().user?.token
  if (!queue.length || !profile || !token) { queue = []; return }
  const events = queue.splice(0, 50)
  // keepalive lets the last batch go out even when the tab is closing
  fetch(`/api/profiles/${profile._id}/events`, {
    method: 'POST', keepalive: true,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ events }),
  }).catch(() => { /* signals are best-effort */ })
}

/** opts.row: the Home row kind it was opened from (the server learns which rows each profile uses); opts.source: feed/ask/upcoming… */
export function track(kind: Kind, mediaType: 'movie' | 'tv', tmdbId: number, opts: { row?: string; source?: string } = {}) {
  if (!tmdbId || !useProfileStore.getState().activeProfile) return
  const key = `${kind}:${mediaType}:${tmdbId}`
  const last = recent.get(key)
  // Row clicks always count (they train the row order); plain repeats within 10 minutes don't
  if (last && Date.now() - last < 10 * 60 * 1000 && !opts.row) return
  recent.set(key, Date.now())
  queue.push({ kind, mediaType, tmdbId, ...opts })
  if (queue.length >= 20) flush()
  else if (!timer) timer = setTimeout(flush, 8000)
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush() })
}
