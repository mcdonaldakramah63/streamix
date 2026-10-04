// frontend/src/services/session.ts — reacts to login/logout and keeps per-user stores in sync
import axios from 'axios'
import { useAuthStore, isTokenExpired, User } from '../context/authStore'
import { useContinueWatching } from '../stores/continueWatchingStore'
import { useWatchlistStore } from '../stores/watchlistStore'
import { useProfileStore } from '../stores/profileStore'
import { API_BASE, refreshAccessToken } from './api'

function loadUserData() {
  useContinueWatching.getState().fetch()
  useWatchlistStore.getState().fetch()
  useProfileStore.getState().fetch()
}

function clearUserData() {
  useContinueWatching.getState().clear()
  useWatchlistStore.getState().clear()
  useProfileStore.getState().clear()
}

let started = false

export async function initSession() {
  if (started) return
  started = true

  useAuthStore.subscribe((state, prev) => {
    const id = state.user?._id, prevId = prev.user?._id
    if (id === prevId) return
    if (prevId) clearUserData()
    if (id) loadUserData()
  })

  const user = useAuthStore.getState().user
  if (!user) { clearUserData(); return }

  // Restore an expired session from the refresh cookie before anything else runs
  if (isTokenExpired(user.token)) {
    const token = await refreshAccessToken()
    if (!token) { useAuthStore.getState().logout(); return }
  }
  loadUserData()
}

export function login(user: User) {
  useAuthStore.getState().setUser(user)
}

export async function logout() {
  try { await axios.post(`${API_BASE}/auth/logout`, {}, { withCredentials: true }) } catch { /* offline */ }
  useAuthStore.getState().logout()
}
