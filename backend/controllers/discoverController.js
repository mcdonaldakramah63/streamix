// backend/controllers/discoverController.js — NEW FILE
const axios = require('axios')

const TMDB = 'https://api.themoviedb.org/3'
const KEY  = () => process.env.TMDB_API_KEY

// Simple 5-minute cache
const cache = new Map()
function cacheKey(url) { return url }
function fromCache(key) {
  const hit = cache.get(key)
  if (!hit) return null
  if (Date.now() - hit.ts > 5 * 60 * 1000) { cache.delete(key); return null }
  return hit.data
}
function toCache(key, data) { cache.set(key, { data, ts: Date.now() }) }

// ── GET /api/movies/discover ─────────────────────────────────────────────────
// query params:
//   type                  = movie | tv  (default: movie)
//   page                  = 1
//   sort_by               = popularity.desc
//   with_genres           = 16,28  (comma-separated genre IDs)
//   with_original_language= ja
//   vote_count.gte        = 50
//   air_date.gte          = 2024-01-01
//   air_date.lte          = 2024-12-31
exports.discover = async (req, res) => {
  try {
    const type  = req.query.type  || 'movie'
    const page  = req.query.page  || 1
    const sort  = req.query.sort_by || 'popularity.desc'

    const endpoint = type === 'tv'
      ? `${TMDB}/discover/tv`
      : `${TMDB}/discover/movie`

    const params = {
      api_key:  KEY(),
      page,
      sort_by:  sort,
      language: 'en-US',
    }

    if (req.query.with_genres)            params.with_genres             = req.query.with_genres
    if (req.query.with_original_language) params.with_original_language  = req.query.with_original_language
    if (req.query['vote_count.gte'])      params['vote_count.gte']       = req.query['vote_count.gte']
    if (req.query['air_date.gte'])        params['first_air_date.gte']   = req.query['air_date.gte']
    if (req.query['air_date.lte'])        params['first_air_date.lte']   = req.query['air_date.lte']

    // Add minimum votes for quality when sorting by rating
    if (sort.includes('vote_average') && !params['vote_count.gte']) {
      params['vote_count.gte'] = 100
    }

    const cKey = `${endpoint}?${JSON.stringify(params)}`
    const cached = fromCache(cKey)
    if (cached) return res.json(cached)

    const { data } = await axios.get(endpoint, { params, timeout: 10000 })
    toCache(cKey, data)
    res.json(data)
  } catch (err) {
    console.error('[Discover]', err.message)
    res.status(500).json({ message: 'Discovery failed', error: err.message })
  }
}

// ── GET /api/movies/now-playing ──────────────────────────────────────────────
exports.nowPlaying = async (req, res) => {
  try {
    const { page = 1 } = req.query
    const cKey = `now-playing-${page}`
    const cached = fromCache(cKey)
    if (cached) return res.json(cached)

    const { data } = await axios.get(`${TMDB}/movie/now_playing`, {
      params: { api_key: KEY(), page, language: 'en-US' },
      timeout: 10000,
    })
    toCache(cKey, data)
    res.json(data)
  } catch (err) {
    console.error('[NowPlaying]', err.message)
    res.status(500).json({ message: 'Failed', error: err.message })
  }
}
