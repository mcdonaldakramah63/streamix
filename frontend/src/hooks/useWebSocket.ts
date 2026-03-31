// frontend/src/hooks/useWebSocket.ts — FULL REPLACEMENT
// FIXES:
//   1. JWT tokens expire in 15 min — WebSocket now refreshes the token before reconnecting
//   2. Exponential backoff caps at 30s and resets on success
//   3. Stops reconnecting when user is logged out
//   4. Properly cleans up on unmount

import { useEffect, useRef, useCallback } from 'react'
import { useAuthStore } from '../context/authStore'
import { useContinueWatchingStore } from '../stores/continueWatchingStore'
import api from '../services/api'

const WS_BASE = import.meta.env.VITE_BACKEND_URL
  ? import.meta.env.VITE_BACKEND_URL
      .replace('/api', '')
      .replace('https://', 'wss://')
      .replace('http://', 'ws://')
  : 'wss://streamix-production-1cb4.up.railway.app'

// Token refresh helper — gets a fresh access token from the refresh endpoint
async function refreshToken(): Promise<string | null> {
  try {
    const { data } = await api.post('/auth/refresh', {}, { withCredentials: true })
    const token = data?.token || data?.accessToken
    if (token) {
      // Update stored user with new token
      const stored = localStorage.getItem('streamix_user')
      if (stored) {
        const user = JSON.parse(stored)
        user.token = token
        localStorage.setItem('streamix_user', JSON.stringify(user))
      }
      return token
    }
  } catch {
    // Refresh failed — token truly expired, let auth store handle logout
  }
  return null
}

// Check if a JWT is expired (with 30s buffer)
function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.exp * 1000 < Date.now() + 30_000 // 30s buffer
  } catch {
    return true
  }
}

export function useWebSocket() {
  const { user }              = useAuthStore()
  const { saveTimestamp }     = useContinueWatchingStore()

  const wsRef     = useRef<WebSocket | null>(null)
  const timerRef  = useRef<ReturnType<typeof setTimeout>>()
  const backoff   = useRef(1000)
  const stopped   = useRef(false)
  const mountedRef = useRef(true)

  const connect = useCallback(async () => {
    if (stopped.current || !mountedRef.current) return

    // Don't connect if no user
    const { user: currentUser } = useAuthStore.getState()
    if (!currentUser?.token) return

    // Don't open duplicate connection
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    let token = currentUser.token

    // Refresh token if expired
    if (isTokenExpired(token)) {
      const fresh = await refreshToken()
      if (!fresh) {
        console.log('[WS] Token expired and refresh failed — not connecting')
        return
      }
      token = fresh
    }

    try {
      const ws = new WebSocket(`${WS_BASE}/ws?token=${token}`)
      wsRef.current = ws

      ws.onopen = () => {
        if (!mountedRef.current) { ws.close(); return }
        console.log('[WS] Connected')
        backoff.current = 1000 // reset backoff on success
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'PROGRESS_SYNC') {
            saveTimestamp(msg.movieId, msg.timestamp)
          }
        } catch { /* ignore malformed messages */ }
      }

      ws.onclose = (event) => {
        wsRef.current = null
        if (!mountedRef.current || stopped.current) return

        // 4001 = unauthorized (token expired) — try to refresh before reconnecting
        if (event.code === 4001) {
          console.log('[WS] Auth error — refreshing token')
          refreshToken().then(fresh => {
            if (fresh && mountedRef.current && !stopped.current) {
              timerRef.current = setTimeout(connect, 1000)
            }
          })
          return
        }

        // Normal reconnect with exponential backoff
        const delay = Math.min(backoff.current, 30_000)
        console.log(`[WS] Disconnected — reconnecting in ${delay}ms`)
        backoff.current = Math.min(backoff.current * 2, 30_000)
        timerRef.current = setTimeout(connect, delay)
      }

      ws.onerror = () => {
        // onclose fires immediately after — don't double-handle
        ws.close()
      }
    } catch (err) {
      console.warn('[WS] Connection error:', err)
      const delay = Math.min(backoff.current, 30_000)
      backoff.current = Math.min(backoff.current * 2, 30_000)
      if (mountedRef.current && !stopped.current) {
        timerRef.current = setTimeout(connect, delay)
      }
    }
  }, [saveTimestamp])

  useEffect(() => {
    mountedRef.current = true
    stopped.current    = false

    if (user?.token) {
      connect()
    }

    return () => {
      mountedRef.current = false
      stopped.current    = true
      clearTimeout(timerRef.current)
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [user?.token, connect])

  // Send progress to other devices
  const sendProgress = useCallback((
    movieId: number,
    timestamp: number,
    season?: number,
    episode?: number,
  ) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'PROGRESS_UPDATE', movieId, timestamp, season, episode,
      }))
    }
  }, [])

  return { sendProgress }
}
