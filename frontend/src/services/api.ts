import axios from 'axios'
import { secureStorage } from '../utils/secureStorage'

const api = axios.create({
  baseURL: 'https://streamix-usak.onrender.com/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

// Attach JWT token to every request
api.interceptors.request.use(
  (config) => {
    const token = secureStorage.getToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Handle auth errors globally
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      // Token expired or invalid — clear storage and redirect
      secureStorage.clear()
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(err)
  }
)

// ── Movie endpoints ──────────────────────────────────────────────
export const fetchTrending     = ()          => api.get('/movies/trending')
export const fetchPopular      = (page = 1)  => api.get(`/movies/popular?page=${page}`)
export const fetchTopRated     = (page = 1)  => api.get(`/movies/top-rated?page=${page}`)
export const fetchUpcoming     = ()          => api.get('/movies/upcoming')
export const fetchMovieDetails = (id: number)=> api.get(`/movies/${id}`)
export const fetchTVShows      = (page = 1)  => api.get(`/movies/tv/popular?page=${page}`)
export const fetchTrendingTV   = ()          => api.get('/movies/tv/trending')
export const fetchTVDetails    = (id: number)=> api.get(`/movies/tv/${id}`)
export const fetchSeason       = (id: number, season: number) => api.get(`/movies/tv/${id}/season/${season}`)
export const searchContent     = (query: string, page = 1) => api.get(`/movies/search?query=${encodeURIComponent(query)}&page=${page}`)

// ── Auth ─────────────────────────────────────────────────────────
export const loginUser    = (email: string, password: string) =>
  api.post('/auth/login', { email, password })

export const registerUser = (username: string, email: string, password: string) =>
  api.post('/auth/register', { username, email, password })

// ── User ─────────────────────────────────────────────────────────
export const getProfile              = ()           => api.get('/users/profile')
export const updateProfile           = (data: object) => api.put('/users/update', data)
export const saveContinueWatching    = (data: object) => api.post('/users/continue-watching', data)
export const saveRecentlyViewed      = (data: object) => api.post('/users/recently-viewed', data)

// ── Watchlist ────────────────────────────────────────────────────
export const getWatchlist    = ()              => api.get('/watchlist')
export const addWatchlist    = (data: object)  => api.post('/watchlist/add', data)
export const removeWatchlist = (movieId: number) => api.delete(`/watchlist/remove/${movieId}`)
export const checkWatchlist  = (movieId: number) => api.get(`/watchlist/check/${movieId}`)

// ── Admin ────────────────────────────────────────────────────────
export const adminGetUsers    = ()           => api.get('/admin/users')
export const adminDeleteUser  = (id: string) => api.delete(`/admin/user/${id}`)
export const adminToggleAdmin = (id: string) => api.put(`/admin/user/${id}/admin`)
export const adminGetStats    = ()           => api.get('/admin/stats')

export default api
