import axios from 'axios'

const api = axios.create({
  baseURL: (import.meta as any).env?.VITE_API_URL || '/api',
})

api.interceptors.request.use((config) => {
  const user = localStorage.getItem('streamix_user')
  if (user) {
    try {
      const { token } = JSON.parse(user)
      if (token) config.headers.Authorization = `Bearer ${token}`
    } catch {}
  }
  return config
})

export const fetchTrendingAnime  = ()               => api.get('/anime/trending')
export const fetchPopularAnime   = (page = 1)       => api.get(`/anime/popular?page=${page}`)
export const fetchTopRatedAnime  = (page = 1)       => api.get(`/anime/top-rated?page=${page}`)
export const fetchAnimeMovies    = (page = 1)       => api.get(`/anime/movies?page=${page}`)
export const fetchAnimeByGenre   = (genre: string, page = 1) => api.get(`/anime/genre?genre=${genre}&page=${page}`)
export const searchAnime         = (query: string, page = 1) => api.get(`/anime/search?query=${encodeURIComponent(query)}&page=${page}`)
