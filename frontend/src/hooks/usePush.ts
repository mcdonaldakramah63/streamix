// Push notification sign-up for this browser
import { useCallback, useEffect, useState } from 'react'
import api from '../services/api'

export interface Topics { newEpisodes: boolean; library: boolean; weekly: boolean }

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext

function keyBytes(b64url: string) {
  const b64 = (b64url + '='.repeat((4 - (b64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0))
}

/** Waits for the service worker (only registered in production builds) */
async function registration() {
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>(r => setTimeout(() => r(null), 4000)),
  ])
  return reg as ServiceWorkerRegistration | null
}

export function usePush() {
  const [state, setState] = useState<'unsupported' | 'loading' | 'off' | 'on' | 'blocked'>(supported() ? 'loading' : 'unsupported')
  const [topics, setTopics] = useState<Topics>({ newEpisodes: true, library: true, weekly: true })
  const [endpoint, setEndpoint] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supported()) return
    ;(async () => {
      if (Notification.permission === 'denied') { setState('blocked'); return }
      const reg = await registration()
      if (!reg) { setState('unsupported'); setError('Notifications work in the installed / built app (npm run build), not the dev server.'); return }
      const sub = await reg.pushManager.getSubscription()
      if (!sub) { setState('off'); return }
      setEndpoint(sub.endpoint)
      const { data } = await api.get('/notifications/subscription', { params: { endpoint: sub.endpoint } }).catch(() => ({ data: { subscribed: false } }))
      if (data.subscribed) { setState('on'); if (data.topics) setTopics(data.topics) }
      else setState('off')
    })().catch(() => setState('off'))
  }, [])

  const enable = useCallback(async () => {
    setError('')
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') { setState(perm === 'denied' ? 'blocked' : 'off'); return }
      const reg = await registration()
      if (!reg) throw new Error('Service worker not ready')
      const { data } = await api.get('/notifications/vapid')
      const sub = (await reg.pushManager.getSubscription()) ||
        await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(data.publicKey) })
      const json = sub.toJSON()
      const res = await api.post('/notifications/subscribe', { subscription: { endpoint: json.endpoint, keys: json.keys }, topics })
      setEndpoint(sub.endpoint); setTopics(res.data.topics); setState('on')
    } catch (e: any) {
      setError(e?.message || 'Could not turn on notifications')
    }
  }, [topics])

  const disable = useCallback(async () => {
    const reg = await registration()
    const sub = await reg?.pushManager.getSubscription()
    if (sub) { await api.delete('/notifications/subscribe', { data: { endpoint: sub.endpoint } }).catch(() => {}); await sub.unsubscribe().catch(() => {}) }
    setState('off')
  }, [])

  const setTopic = useCallback(async (k: keyof Topics, v: boolean) => {
    const next = { ...topics, [k]: v }
    setTopics(next)
    if (endpoint && state === 'on') await api.put('/notifications/subscription', { endpoint, topics: next }).catch(() => {})
  }, [topics, endpoint, state])

  const test = useCallback(() => api.post('/notifications/test').then(r => r.data.sent as number), [])

  return { state, topics, error, enable, disable, setTopic, test }
}
