// backend/controllers/streamController.js — FULL REPLACEMENT
const axios  = require('axios')
const { HiAnime } = require('aniwatch')
const hianime = new HiAnime.Scraper()

// ── ANIME SEARCH ─────────────────────────────────────────────────────────────
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

// ── ANIME INFO ───────────────────────────────────────────────────────────────
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

// ── ANIME EPISODES ────────────────────────────────────────────────────────────
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

// ── ANIME WATCH ───────────────────────────────────────────────────────────────
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

// ── M3U8 PROXY — fixes CORS for hianime streams ───────────────────────────────
// GET /api/stream/proxy?url=https://...m3u8
// Fetches the m3u8 or segment from the streaming server and returns it
// with correct CORS headers so the browser's HLS.js can read it
exports.proxyStream = async (req, res) => {
  try {
    const { url } = req.query
    if (!url) return res.status(400).json({ message: 'url required' })

    // Only allow streaming domains — security guard
    const allowed = [
      'hianime', 'megacloud', 'aniwatch', 'zoro',
      'rapid-cloud', 'bunnycdn', 'akamai',
      'sb-mirror', 'alions', 'workers.dev',
      'cdn', '.m3u8', '.ts', '.mp4',
    ]
    const isAllowed = allowed.some(d => url.includes(d))
    if (!isAllowed) {
      return res.status(403).json({ message: 'Domain not allowed for proxying' })
    }

    const response = await axios.get(url, {
      responseType: 'stream',
      timeout: 20000,
      headers: {
        'Referer':         'https://hianime.to/',
        'Origin':          'https://hianime.to',
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept':          '*/*',
        'Accept-Encoding': 'gzip, deflate, br',
      },
    })

    // Set CORS headers
    res.set('Access-Control-Allow-Origin',  '*')
    res.set('Access-Control-Allow-Methods', 'GET')
    res.set('Content-Type', response.headers['content-type'] || 'application/octet-stream')

    // For m3u8 playlists — rewrite segment URLs to also go through our proxy
    if (url.includes('.m3u8') || (response.headers['content-type'] || '').includes('mpegurl')) {
      let body = ''
      response.data.on('data', (chunk) => { body += chunk.toString() })
      response.data.on('end', () => {
        // Rewrite all absolute http/https URLs in the m3u8 to go through proxy
        const backendBase = process.env.BACKEND_URL || `https://streamix-usak.onrender.com`
        const rewritten = body.replace(
          /(https?:\/\/[^\s"'\n]+)/g,
          (match) => `${backendBase}/api/stream/proxy?url=${encodeURIComponent(match)}`
        )
        res.set('Content-Type', 'application/vnd.apple.mpegurl')
        res.send(rewritten)
      })
    } else {
      // Binary segments (.ts files etc.) — pipe directly
      response.data.pipe(res)
    }
  } catch (err) {
    console.error('[Stream] proxy error:', err.message)
    if (!res.headersSent) {
      res.status(502).json({ message: 'Proxy failed', error: err.message })
    }
  }
}

// ── SAVE TIMESTAMP ────────────────────────────────────────────────────────────
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
      entry.progress  = duration
        ? Math.min(Math.round((Number(timestamp) / Number(duration)) * 100), 99)
        : entry.progress
      entry.watchedAt = new Date()
      user.markModified('continueWatching')
      await user.save()
    }
    res.json({ success: true })
  } catch (err) {
    console.error('[Stream] saveTimestamp:', err.message)
    res.status(500).json({ message: 'Server error' })
  }
}
