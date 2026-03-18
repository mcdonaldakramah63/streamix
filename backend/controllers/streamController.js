// backend/controllers/streamController.js — FULL REPLACEMENT
const axios = require('axios')

// aniwatch is ESM-only — must use dynamic import in CommonJS
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
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept':          '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
}

// ── ANIME SEARCH ─────────────────────────────────────────────────────────────
exports.searchAnime = async (req, res) => {
  try {
    const { q, page = 1 } = req.query
    if (!q) return res.status(400).json({ message: 'Query required' })
    const hi   = await getHiAnime()
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
    const hi   = await getHiAnime()
    const data = await hi.getInfo(id)
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
    const hi   = await getHiAnime()
    const data = await hi.getEpisodes(id)
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
    console.log(`[Stream] watchAnime id=${id} server=${server} category=${category}`)
    const hi   = await getHiAnime()
    const data = await hi.getEpisodeSources(id, server, category)
    console.log('[Stream] sources:', data?.sources?.length, 'tracks:', data?.tracks?.length)
    res.json(data)
  } catch (err) {
    console.error('[Stream] watchAnime ERROR:', err.message)
    res.status(502).json({ message: 'Watch failed', error: err.message })
  }
}

// ── M3U8 PROXY ────────────────────────────────────────────────────────────────
exports.proxyStream = async (req, res) => {
  const { url } = req.query
  if (!url) return res.status(400).send('url required')

  let targetUrl
  try { targetUrl = decodeURIComponent(url) } catch { targetUrl = url }

  console.log('[Proxy]', targetUrl.substring(0, 100))

  try {
    const response = await axios({
      method:         'GET',
      url:            targetUrl,
      responseType:   'arraybuffer',
      timeout:        30000,
      headers:        HIANIME_HEADERS,
      validateStatus: () => true,
    })

    if (response.status !== 200) {
      return res.status(response.status).send('Upstream error ' + response.status)
    }

    const contentType = response.headers['content-type'] || ''
    const isM3U8 = targetUrl.includes('.m3u8') ||
                   contentType.includes('mpegurl') ||
                   contentType.includes('m3u8')

    res.set('Access-Control-Allow-Origin',  '*')
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.set('Access-Control-Allow-Headers', '*')
    res.set('Cache-Control', 'no-cache')

    if (isM3U8) {
      const text        = Buffer.from(response.data).toString('utf-8')
      const backendBase = process.env.BACKEND_URL || 'https://streamix-backend.up.railway.app'
      const proxyBase   = `${backendBase}/api/stream/proxy?url=`

      const urlObj  = new URL(targetUrl)
      const baseUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname.substring(0, urlObj.pathname.lastIndexOf('/') + 1)}`

      const rewritten = text.split('\n').map(line => {
        const trimmed = line.trim()
        if (!trimmed || trimmed === '#EXT-X-ENDLIST') return line

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
    if (!res.headersSent) res.status(502).send('Proxy error: ' + err.message)
  }
}

exports.proxyOptions = (req, res) => {
  res.set('Access-Control-Allow-Origin',  '*')
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.set('Access-Control-Allow-Headers', '*')
  res.sendStatus(200)
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
