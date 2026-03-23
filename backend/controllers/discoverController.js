// backend/controllers/discoverController.js — FULL REPLACEMENT
const axios = require('axios')

const TMDB_KEY = () => process.env.TMDB_API_KEY
const TMDB_BASE = 'https://api.themoviedb.org/3'

// 5-minute cache
const cache = new Map()
function getCache(key) {
  const hit = cache.get(key)
  if (!hit) return null
  if (Date.now() - hit.ts > 300_000) { cache.delete(key); return null }
  return hit.data
}
function setCache(key, data) {
  if (cache.size > 200) cache.clear()
  cache.set(key, { data, ts: Date.now() })
}

// ── GET /api/movies/discover ──────────────────────────────────────────────────
exports.discover = async (req, res) => {
  try {
    const key = process.env.TMDB_API_KEY
    if (!key) {
      console.error('[Discover] TMDB_API_KEY not set!')
      return res.status(500).json({ message: 'TMDB_API_KEY not configured' })
    }

    const type = req.query.type || 'movie'
    const endpoint = type === 'tv'
      ? `${TMDB_BASE}/discover/tv`
      : `${TMDB_BASE}/discover/movie`

    // Build params object manually to avoid dot-key issues
    const params = {
      api_key:  key,
      language: 'en-US',
      page:     req.query.page     || 1,
      sort_by:  req.query.sort_by  || 'popularity.desc',
    }

    // Genre filter
    if (req.query.with_genres) {
      params.with_genres = req.query.with_genres
    }

    // Language filter
    if (req.query.with_original_language) {
      params.with_original_language = req.query.with_original_language
    }

    // Vote count minimum — try multiple param name formats
    const voteMin = req.query['vote_count.gte'] || req.query.vote_count_gte
    if (voteMin) {
      params['vote_count.gte'] = voteMin
    } else if (params.sort_by && params.sort_by.includes('vote_average')) {
      params['vote_count.gte'] = 100
    }

    // Air date range (TV only)
    const airFrom = req.query['air_date.gte'] || req.query.air_date_gte
    const airTo   = req.query['air_date.lte'] || req.query.air_date_lte
    if (airFrom && type === 'tv') params['first_air_date.gte'] = airFrom
    if (airTo   && type === 'tv') params['first_air_date.lte'] = airTo

    // Release date range (movies)
    if (airFrom && type === 'movie') params['release_date.gte'] = airFrom
    if (airTo   && type === 'movie') params['release_date.lte'] = airTo

    // Adult filter off
    params.include_adult = false

    const cacheKey = `${endpoint}_${JSON.stringify(params)}`
    const cached = getCache(cacheKey)
    if (cached) return res.json(cached)

    console.log(`[Discover] ${type} sort=${params.sort_by} genres=${params.with_genres || 'all'} lang=${params.with_original_language || 'any'} page=${params.page}`)

    const { data } = await axios.get(endpoint, { params, timeout: 12000 })
    setCache(cacheKey, data)
    res.json(data)

  } catch (err) {
    const status = err?.response?.status
    const msg    = err?.response?.data?.status_message || err.message
    console.error(`[Discover] TMDB error ${status}:`, msg)
    res.status(500).json({ message: 'Discovery failed', error: msg, tmdb_status: status })
  }
}

// ── GET /api/movies/now-playing ───────────────────────────────────────────────
exports.nowPlaying = async (req, res) => {
  try {
    const key = process.env.TMDB_API_KEY
    if (!key) return res.status(500).json({ message: 'TMDB_API_KEY not configured' })

    const { page = 1 } = req.query
    const cacheKey = `now-playing-${page}`
    const cached = getCache(cacheKey)
    if (cached) return res.json(cached)

    const { data } = await axios.get(`${TMDB_BASE}/movie/now_playing`, {
      params: { api_key: key, page, language: 'en-US' },
      timeout: 12000,
    })
    setCache(cacheKey, data)
    res.json(data)

  } catch (err) {
    console.error('[NowPlaying]', err.message)
    res.status(500).json({ message: 'Failed', error: err.message })
  }
}
