export interface Movie {
  id: number
  title: string
  name?: string
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  vote_average: number
  release_date: string
  first_air_date?: string
  runtime?: number
  genres?: Genre[]
  genre_ids?: number[]
  external_ids?: { imdb_id?: string }
  credits?: { cast: CastMember[]; crew: CrewMember[] }
  recommendations?: { results: Movie[] }
  similar?: { results: Movie[] }
  videos?: { results: Video[] }
  media_type?: 'movie' | 'tv'
  number_of_seasons?: number
  seasons?: Season[]
  origin_country?: string[]
  original_language?: string
}

export interface Genre { id: number; name: string }

export interface CastMember {
  id: number
  name: string
  character: string
  profile_path: string | null
}

export interface CrewMember {
  id: number
  name: string
  job: string
  profile_path: string | null
}

export interface Video {
  id: string
  key: string
  name: string
  site: string
  type: string
}

export interface Season {
  id: number
  season_number: number
  name: string
  episode_count: number
  poster_path: string | null
}

export interface Episode {
  id: number
  episode_number: number
  name: string
  overview: string
  still_path: string | null
  air_date: string
  runtime: number | null
}

export interface ContinueWatchingItem {
  movieId: number
  title: string
  poster: string
  progress: number
  updatedAt: string
}

export interface RecentItem {
  movieId: number
  title: string
  poster: string
  viewedAt: string
}

// ── User — all fields optional except core ones ──────────────────
export interface User {
  _id: string
  username: string
  email: string
  avatar?: string
  isAdmin: boolean
  token: string
  continueWatching?: ContinueWatchingItem[]
  recentlyViewed?: RecentItem[]
}

export interface WatchlistItem {
  _id: string
  movieId: number
  title: string
  poster: string
  backdrop: string
  rating: number
  year: string
  addedAt: string
}
