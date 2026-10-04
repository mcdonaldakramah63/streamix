// frontend/src/hooks/useWebSocket.ts — one shared socket for cross-device progress sync
import { useEffect } from 'react'
import { useAuthStore, isTokenExpired } from '../context/authStore'
import { useContinueWatching } from '../stores/continueWatchingStore'
import { refreshAccessToken } from '../services/api'

const WS_URL = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`

let socket: WebSocket | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let backoff = 1000
let active = false

// Simple message bus so features (watch party, stream limits) can share this one socket
type Handler = (msg: any) => void
const handlers = new Set<Handler>()
/** Listen to every server message; returns an unsubscribe function */
export function onWsMessage(fn: Handler) { handlers.add(fn); return () => { handlers.delete(fn) } }
/** Send a message if connected; returns whether it was sent */
export function wsSend(msg: Record<string, unknown>) {
  if (socket?.readyState === WebSocket.OPEN) { socket.send(JSON.stringify(msg)); return true }
  return false
}
export const wsConnected = () => socket?.readyState === WebSocket.OPEN

async function connect() {
  if (!active || socket) return
  let token = useAuthStore.getState().user?.token
  if (!token) return
  if (isTokenExpired(token)) {
    token = (await refreshAccessToken()) || undefined
    if (!token || !active) return
  }

  const ws = new WebSocket(`${WS_URL()}?token=${encodeURIComponent(token)}`)
  socket = ws

  ws.onopen = () => { backoff = 1000 }

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data)
      handlers.forEach(h => { try { h(msg) } catch { /* listener errors stay local */ } })
      if (msg.type === 'PROGRESS_SYNC') {
        useContinueWatching.getState().applyRemote(
          Number(msg.movieId), Number(msg.timestamp) || 0, msg.duration, msg.season, msg.episode
        )
      }
    } catch { /* ignore malformed messages */ }
  }

  ws.onclose = async (event) => {
    if (socket === ws) socket = null
    handlers.forEach(h => { try { h({ type: 'DISCONNECTED' }) } catch { /* ignore */ } })
    if (!active) return
    if (event.code === 4001) {
      // Token rejected — refresh it, then reconnect
      const fresh = await refreshAccessToken()
      if (!fresh) return
    }
    const delay = Math.min(backoff, 30_000)
    backoff = Math.min(backoff * 2, 30_000)
    timer = setTimeout(connect, delay)
  }

  ws.onerror = () => ws.close()
}

function disconnect() {
  active = false
  clearTimeout(timer)
  socket?.close()
  socket = null
}

/** Broadcast playback progress to this user's other devices */
export function sendProgress(movieId: number, timestamp: number, duration?: number, season?: number, episode?: number) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'PROGRESS_UPDATE', movieId, timestamp, duration, season, episode }))
  }
}

/** Mount once (App) — keeps the socket open while a user is logged in */
export function useWebSocket() {
  const userId = useAuthStore(s => s.user?._id)
  useEffect(() => {
    if (!userId) return
    active = true
    connect()
    return disconnect
  }, [userId])
}
