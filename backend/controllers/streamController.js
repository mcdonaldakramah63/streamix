// backend/controllers/streamController.js — FULL REPLACEMENT (uses npm package)
const { HiAnime } = require('aniwatch')
const hianime = new HiAnime.Scraper()

// GET /api/stream/anime/search?q=title
exports.searchAnime = async (req, res) => {
  try {
    const { q, page = 1 } = req.query
    if (!q) return res.status(400).json({ message: 'Query required' })
    const data = await hianime.search(q, Number(page))
    res.json(data)
  } catch (err) {
    console.error('[Stream] searchAnime:', err.message)
    res.status(502).json({ message: 'Search failed', error: err.message })
  }
}

// GET /api/stream/anime/info?id=anime-id
exports.getAnimeInfo = async (req, res) => {
  try {
    const { id } = req.query
    if (!id) return res.status(400).json({ message: 'ID required' })
    const data = await hianime.getInfo(id)
    res.json(data)
  } catch (err) {
    console.error('[Stream] getAnimeInfo:', err.message)
    res.status(502).json({ message: 'Info failed', error: err.message })
  }
}

// GET /api/stream/anime/episodes?id=anime-id
exports.getAnimeEpisodes = async (req, res) => {
  try {
    const { id } = req.query
    if (!id) return res.status(400).json({ message: 'ID required' })
    const data = await hianime.getEpisodes(id)
    res.json(data)
  } catch (err) {
    console.error('[Stream] getAnimeEpisodes:', err.message)
    res.status(502).json({ message: 'Episodes failed', error: err.message })
  }
}

// GET /api/stream/anime/watch?id=episode-id&server=hd-1&category=sub
exports.watchAnime = async (req, res) => {
  try {
    const { id, server = 'hd-1', category = 'sub' } = req.query
    if (!id) return res.status(400).json({ message: 'Episode ID required' })
    const data = await hianime.getEpisodeSources(id, server, category)
    res.json(data)
  } catch (err) {
    console.error('[Stream] watchAnime:', err.message)
    res.status(502).json({ message: 'Watch failed', error: err.message })
  }
}

// POST /api/stream/timestamp
exports.saveTimestamp = async (req, res) => {
  try {
    const User = require('../models/User')
    const { movieId, timestamp, duration } = req.body
    if (!movieId || timestamp === undefined) {
      return res.status(400).json({ message: 'movieId and timestamp required' })
    }
    const user = await User.findById(req.user._id)
    if (!user) return res.status(404).json({ message: 'User not found' })
    const entry = user.continueWatching.find(i => Number(i.movieId) === Number(movieId))
    if (entry) {
      entry.timestamp = Number(timestamp)
      entry.duration  = duration ? Number(duration) : entry.duration
      entry.progress  = duration ? Math.min(Math.round((timestamp / duration) * 100), 99) : entry.progress
      entry.watchedAt = new Date()
      user.markModified('continueWatching')
      await user.save()
    }
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
}