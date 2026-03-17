// backend/controllers/streamController.js
const axios = require('axios')

// Your Consumet API URL — set this in Render environment variables
const CONSUMET_URL = process.env.CONSUMET_URL || 'https://consumet-api-xxxx.onrender.com'

const api = axios.create({
  baseURL: CONSUMET_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

// ── ANIME ─────────────────────────────────────────────────────────────────────

// GET /api/stream/anime/search?q=title
exports.searchAnime = async (req, res) => {
  try {
    const { q } = req.query
    if (!q) return res.status(400).json({ message: 'Query required' })

    const { data } = await api.get(`/anime/zoro/${encodeURIComponent(q)}`)
    res.json(data)
  } catch (err) {
    console.error('[Stream] searchAnime:', err.message)
    res.status(502).json({ message: 'Consumet unavailable', error: err.message })
  }
}

// GET /api/stream/anime/info?id=zoro-id
exports.getAnimeInfo = async (req, res) => {
  try {
    const { id } = req.query
    if (!id) return res.status(400).json({ message: 'ID required' })

    const { data } = await api.get(`/anime/zoro/info?id=${encodeURIComponent(id)}`)
    res.json(data)
  } catch (err) {
    console.error('[Stream] getAnimeInfo:', err.message)
    res.status(502).json({ message: 'Consumet unavailable', error: err.message })
  }
}

// GET /api/stream/anime/watch?episodeId=id&server=vidstreaming
exports.watchAnime = async (req, res) => {
  try {
    const { episodeId, server = 'vidstreaming' } = req.query
    if (!episodeId) return res.status(400).json({ message: 'episodeId required' })

    const { data } = await api.get(
      `/anime/zoro/watch?episodeId=${encodeURIComponent(episodeId)}&server=${server}`
    )
    res.json(data)
  } catch (err) {
    console.error('[Stream] watchAnime:', err.message)
    res.status(502).json({ message: 'Consumet unavailable', error: err.message })
  }
}

// GET /api/stream/anime/tmdb-match?title=name&tmdbId=123
// Tries to find the Zoro ID for a TMDB anime
exports.matchAnimeByTitle = async (req, res) => {
  try {
    const { title } = req.query
    if (!title) return res.status(400).json({ message: 'title required' })

    const { data } = await api.get(`/anime/zoro/${encodeURIComponent(title)}`)
    const results  = data?.results || []
    // Return top 5 matches for the frontend to pick best
    res.json({ results: results.slice(0, 5) })
  } catch (err) {
    console.error('[Stream] matchAnimeByTitle:', err.message)
    res.status(502).json({ message: 'Consumet unavailable', error: err.message })
  }
}

// ── MOVIES / TV ───────────────────────────────────────────────────────────────

// GET /api/stream/movie/search?q=title&type=movie|tv
exports.searchMovie = async (req, res) => {
  try {
    const { q, type = 'movie' } = req.query
    if (!q) return res.status(400).json({ message: 'Query required' })

    // Try multiple providers
    const providers = type === 'movie' ? ['flixhx', 'goku'] : ['flixhx', 'goku']
    let result = null

    for (const provider of providers) {
      try {
        const { data } = await api.get(`/movies/${provider}/${encodeURIComponent(q)}`)
        if (data?.results?.length) { result = data; break }
      } catch { continue }
    }

    res.json(result || { results: [] })
  } catch (err) {
    console.error('[Stream] searchMovie:', err.message)
    res.status(502).json({ message: 'Consumet unavailable', error: err.message })
  }
}

// GET /api/stream/movie/info?id=flixhx-id&provider=flixhx
exports.getMovieInfo = async (req, res) => {
  try {
    const { id, provider = 'flixhx' } = req.query
    if (!id) return res.status(400).json({ message: 'ID required' })

    const { data } = await api.get(`/movies/${provider}/info?id=${encodeURIComponent(id)}`)
    res.json(data)
  } catch (err) {
    console.error('[Stream] getMovieInfo:', err.message)
    res.status(502).json({ message: 'Consumet unavailable', error: err.message })
  }
}

// GET /api/stream/movie/watch?episodeId=id&mediaId=id&provider=flixhx
exports.watchMovie = async (req, res) => {
  try {
    const { episodeId, mediaId, provider = 'flixhx', server = 'UpCloud' } = req.query
    if (!episodeId || !mediaId) return res.status(400).json({ message: 'episodeId and mediaId required' })

    const { data } = await api.get(
      `/movies/${provider}/watch?episodeId=${encodeURIComponent(episodeId)}&mediaId=${encodeURIComponent(mediaId)}&server=${server}`
    )
    res.json(data)
  } catch (err) {
    console.error('[Stream] watchMovie:', err.message)
    res.status(502).json({ message: 'Consumet unavailable', error: err.message })
  }
}

// ── TIMESTAMP SAVE (exact second) ─────────────────────────────────────────────

// POST /api/stream/timestamp
// Saves exact playback position to user document
exports.saveTimestamp = async (req, res) => {
  try {
    const User = require('../models/User')
    const { movieId, timestamp, duration } = req.body

    if (!movieId || timestamp === undefined) {
      return res.status(400).json({ message: 'movieId and timestamp required' })
    }

    const user = await User.findById(req.user._id)
    if (!user) return res.status(404).json({ message: 'User not found' })

    // Find and update the CW entry
    const entry = user.continueWatching.find(i => Number(i.movieId) === Number(movieId))
    if (entry) {
      entry.timestamp    = Number(timestamp)
      entry.duration     = duration ? Number(duration) : entry.duration
      entry.progress     = duration ? Math.min(Math.round((timestamp / duration) * 100), 99) : entry.progress
      entry.watchedAt    = new Date()
      user.markModified('continueWatching')
      await user.save()
    }

    res.json({ success: true })
  } catch (err) {
    console.error('[Stream] saveTimestamp:', err.message)
    res.status(500).json({ message: 'Server error' })
  }
}
