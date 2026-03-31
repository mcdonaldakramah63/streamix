// frontend/src/hooks/useWebSocket.ts — NEW FILE
import { useEffect, useRef, useCallback } from 'react'
import { useAuthStore } from '../context/authStore'
import { useContinueWatching } from '../stores/continueWatchingStore'

const WS_URL = (import.meta.env.VITE_API_URL || 'https://streamix-production-1cb4.up.railway.app/api')
  .replace('/api', '')
  .replace('https://', 'wss://')
  .replace('http://', 'ws://')

export function useWebSocket() {
  const { user }          = useAuthStore()
  const { saveTimestamp } = useContinueWatching()
  const wsRef             = useRef<WebSocket | null>(null)
  const reconnectTimer    = useRef<ReturnType<typeof setTimeout>>()
  const reconnectDelay    = useRef(1000)

  const connect = useCallback(() => {
    if (!user?.token) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    try {
      const ws = new WebSocket(`${WS_URL}/ws?token=${user.token}`)
      wsRef.current = ws

      ws.onopen = () => {
        console.log('[WS] Connected')
        reconnectDelay.current = 1000 // reset backoff
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'PROGRESS_SYNC') {
            // Another device updated progress — sync locally
            console.log('[WS] Syncing progress from another device:', msg.movieId)
            saveTimestamp(msg.movieId, msg.timestamp)
          }
        } catch { /* ignore */ }
      }

      ws.onclose = () => {
        console.log('[WS] Disconnected — reconnecting in', reconnectDelay.current, 'ms')
        // Exponential backoff reconnect
        reconnectTimer.current = setTimeout(() => {
          reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30_000)
          connect()
        }, reconnectDelay.current)
      }

      ws.onerror = () => { ws.close() }
    } catch (e) {
      console.warn('[WS] Connection failed:', e)
    }
  }, [user?.token, saveTimestamp])

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [connect])

  // Send progress update to other devices
  const sendProgress = useCallback((movieId: number, timestamp: number, season?: number, episode?: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'PROGRESS_UPDATE',
        movieId, timestamp, season, episode,
      }))
    }
  }, [])

  return { sendProgress }
}
