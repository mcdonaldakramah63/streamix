// backend/controllers/streamController.js — IMPROVED VERSION
const axios = require('axios')

// Lazy load HiAnime (ESM-only)
let _hianime = null
async function getHiAnime() {
  if (!_hianime) {
    const { HiAnime } = await import('aniwatch')
    _hianime = new HiAnime.Scraper()
  }
  return _hianime
}

const HIANIME_HEADERS = {
  'Referer':         'https://hianime.to/',
  'Origin':          'https://hianime.to',
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
  'Accept':          '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
}

// Helper: Retry wrapper with exponential backoff
async function withRetry(fn, maxRetries = 3, baseDelay = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      console.warn(`[Stream] Attempt ${attempt}/${maxRetries} failed: ${err.message}`);
      if (attempt === maxRetries) throw err;
      
      const delay = baseDelay * Math.pow(2, attempt - 1); // 1s → 2s → 4s
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// ── ANIME SEARCH ─────────────────────────────────────────────────────────────
exports.searchAnime = async (req, res) => {
  try {
    const { q, page = 1 } = req.query
    if (!q) return res.status(400).json({ message: 'Query required' })

    const hi = await getHiAnime()
    const data = await hi.search(q, Number(page))
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

    const hi = await getHiAnime()
    const data = await hi.getInfo(id)
    res.json(data)
  } catch (err) {
    console.error('[Stream] getAnimeInfo:', err.message)
    res.status(502).json({ message: 'Info failed', error: err.message })
  }
}

// ── ANIME EPISODES ───────────────────────────────────────────────────────────
exports.getAnimeEpisodes = async (req, res) => {
  try {
    const { id } = req.query
    if (!id) return res.status(400).json({ message: 'ID required' })

    const hi = await getHiAnime()
    const data = await hi.getEpisodes(id)
    res.json(data)
  } catch (err) {
    console.error('[Stream] getAnimeEpisodes:', err.message)
    res.status(502).json({ message: 'Episodes failed', error: err.message })
  }
}

// ── ANIME WATCH (MAIN FIX) ───────────────────────────────────────────────────
exports.watchAnime = async (req, res) => {
  const { id, server = 'hd-1', category = 'sub' } = req.query

  if (!id) {
    return res.status(400).json({ message: 'Episode ID required' })
  }

  console.log(`[Stream] watchAnime → id=${id} | server=${server} | category=${category}`)

  try {
    const hi = await getHiAnime()

    // Wrap the scraper call with retry + longer timeout
    const data = await withRetry(
      () => hi.getEpisodeSources(id, server, category),
      3,     // max 3 attempts
      1200   // start with 1.2s delay
    )

    console.log(`[Stream] Success → sources: ${data?.sources?.length || 0}, tracks: ${data?.tracks?.length || 0}`)

    if (!data?.sources || data.sources.length === 0) {
      return res.status(503).json({
        success: false,
        message: 'No sources found',
        fallback: 'iframe'
      })
    }

    res.json(data)

  } catch (err) {
    console.error(`[Stream] watchAnime FAILED → ${id} | server=${server} | error: ${err.message}`)

    // Always return proper JSON (prevents Railway 502 crash)
    res.status(502).json({
      success: false,
      message: 'All streaming servers failed or timed out',
      error: err.message,
      fallback: 'iframe'   // Tell frontend to use iframe
    })
  }
}

// ── M3U8 PROXY (Improved timeout + logging) ──────────────────────────────────
exports.proxyStream = async (req, res) => {
  const { url } = req.query
  if (!url) return res.status(400).send('url required')

  let targetUrl
  try {
    targetUrl = decodeURIComponent(url)
  } catch {
    targetUrl = url
  }

  console.log(`[Proxy] ${targetUrl.substring(0, 120)}...`)

  try {
    const response = await axios({
      method: 'GET',
      url: targetUrl,
      responseType: 'arraybuffer',
      timeout: 25000,                    // Increased
      headers: HIANIME_HEADERS,
      validateStatus: () => true,
    })

    if (response.status !== 200) {
      return res.status(response.status).send(`Upstream error: ${response.status}`)
    }

    const contentType = response.headers['content-type'] || ''
    const isM3U8 = targetUrl.includes('.m3u8') || contentType.includes('mpegurl') || contentType.includes('m3u8')

    // CORS & cache headers
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.set('Access-Control-Allow-Headers', '*')
    res.set('Cache-Control', 'no-cache')

    if (isM3U8) {
      let text = Buffer.from(response.data).toString('utf-8')
      const backendBase = process.env.BACKEND_URL || 'https://streamix-production-1cb4.up.railway.app'
      const proxyBase = `${backendBase}/api/stream/proxy?url=`

      const urlObj = new URL(targetUrl)
      const baseUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname.substring(0, urlObj.pathname.lastIndexOf('/') + 1)}`

      const rewritten = text.split('\n').map(line => {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#EXT-X-ENDLIST')) return line

        if (trimmed.startsWith('#') && trimmed.includes('URI="')) {
          return line.replace(/URI="([^"]+)"/g, (_, uri) => {
            const abs = uri.startsWith('http') ? uri : baseUrl + uri
            return `URI="${proxyBase}${encodeURIComponent(abs)}"`
          })
        }

        if (!trimmed.startsWith('#')) {
          const abs = trimmed.startsWith('http') ? trimmed : baseUrl + trimmed
          return `${proxyBase}${encodeURIComponent(abs)}`
        }

        return line
      }).join('\n')

      res.set('Content-Type', 'application/vnd.apple.mpegurl')
      return res.send(rewritten)
    }

    res.set('Content-Type', response.headers['content-type'] || 'application/octet-stream')
    res.send(Buffer.from(response.data))

  } catch (err) {
    console.error('[Proxy] ERROR:', err.message)
    if (!res.headersSent) res.status(502).send('Proxy error')
  }
}

exports.proxyOptions = (req, res) => {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.set('Access-Control-Allow-Headers', '*')
  res.sendStatus(200)
}

// Timestamp (unchanged)
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
      entry.duration = duration ? Number(duration) : entry.duration
      entry.progress = duration ? Math.min(Math.round((Number(timestamp) / Number(duration)) * 100), 99) : entry.progress
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