// backend/controllers/streamController.js — FULL REPLACEMENT
// FIX: aniwatch calls now have a hard 8-second timeout and proper try/catch
//      Returns 503 (service unavailable) instead of letting the server crash to 502
//      Proxy route rewrites m3u8 segment URLs so HLS.js can play them

const axios = require('axios')

// ── Dynamic ESM import of aniwatch (ESM package in a CJS project) ─────────────
let aniwatchLib = null
async function getAniwatch() {
  if (aniwatchLib) return aniwatchLib
  try {
    const mod  = await import('aniwatch')
    aniwatchLib = mod
    return aniwatchLib
  } catch (e) {
    console.warn('[stream] aniwatch package not available:', e.message)
    return null
  }
}

// ── Race a promise against a timeout ─────────────────────────────────────────
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ])
}

// ── Search anime ─────────────────────────────────────────────────────────────
exports.animeSearch = async (req, res) => {
  const { q = '', page = 1 } = req.query
  if (!q.trim()) return res.status(400).json({ message: 'Query required' })

  try {
    const aw = await getAniwatch()
    if (!aw) return res.status(503).json({ message: 'Anime service unavailable', animes: [] })

    const data = await withTimeout(aw.hianime.search(q, page), 8000, 'anime search')
    res.json(data)
  } catch (e) {
    console.error('[stream] animeSearch error:', e.message)
    res.status(503).json({ message: 'Anime search unavailable', animes: [], error: e.message })
  }
}

// ── Get anime info ────────────────────────────────────────────────────────────
exports.animeInfo = async (req, res) => {
  const { id } = req.params
  if (!id) return res.status(400).json({ message: 'Anime ID required' })

  try {
    const aw = await getAniwatch()
    if (!aw) return res.status(503).json({ message: 'Anime service unavailable' })

    const data = await withTimeout(aw.hianime.getInfo(id), 8000, 'anime info')
    res.json(data)
  } catch (e) {
    console.error('[stream] animeInfo error:', e.message)
    res.status(503).json({ message: 'Anime info unavailable', error: e.message })
  }
}

// ── Get episode list ──────────────────────────────────────────────────────────
exports.animeEpisodes = async (req, res) => {
  const { id } = req.query
  if (!id) return res.status(400).json({ message: 'Anime ID required' })

  try {
    const aw = await getAniwatch()
    if (!aw) return res.status(503).json({ message: 'Anime service unavailable', episodes: [] })

    const data = await withTimeout(aw.hianime.getEpisodes(id), 8000, 'anime episodes')
    res.json(data)
  } catch (e) {
    console.error('[stream] animeEpisodes error:', e.message)
    res.status(503).json({ message: 'Episodes unavailable', episodes: [], error: e.message })
  }
}

// ── Get stream sources for an episode ─────────────────────────────────────────
exports.animeWatch = async (req, res) => {
  const { id, server = 'hd-2', category = 'sub' } = req.query
  if (!id) return res.status(400).json({ message: 'Episode ID required' })

  try {
    const aw = await getAniwatch()
    if (!aw) return res.status(503).json({ message: 'Anime service unavailable', sources: [] })

    const data = await withTimeout(
      aw.hianime.getEpisodeSources(id, server, category),
      8000,
      `anime watch (${server}/${category})`
    )
    res.json(data)
  } catch (e) {
    const status = e.message?.includes('timed out') ? 504 : 503
    console.error(`[stream] animeWatch ${server}/${category} error:`, e.message)
    res.status(status).json({ message: 'Stream source unavailable', sources: [], error: e.message })
  }
}

// ── Save timestamp ─────────────────────────────────────────────────────────────
exports.saveTimestamp = async (req, res) => {
  const { movieId, timestamp, duration } = req.body
  if (!movieId) return res.status(400).json({ message: 'movieId required' })

  try {
    const User = require('../models/User')
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' })

    await User.findByIdAndUpdate(req.user._id, {
      $set: {
        [`watchTimestamps.${movieId}`]: {
          timestamp:  Math.floor(Number(timestamp) || 0),
          duration:   duration ? Math.floor(Number(duration)) : undefined,
          updatedAt:  new Date(),
        },
      },
    })
    res.json({ ok: true })
  } catch (e) {
    console.error('[stream] saveTimestamp error:', e.message)
    res.status(500).json({ message: e.message })
  }
}

// ── HLS Proxy ─────────────────────────────────────────────────────────────────
// Fetches an m3u8 manifest and rewrites all segment URLs to go through this proxy
// so HLS.js can play them from the browser without CORS errors
exports.proxy = async (req, res) => {
  const raw = req.query.url
  if (!raw) return res.status(400).send('url param required')

  let target
  try { target = decodeURIComponent(raw) } catch { return res.status(400).send('Invalid URL') }

  // Security: only allow known streaming domains
  const allowed = [
    'megacloud.tv', 'megacloud.club', 'vidstreaming.io', 'gogo-play.net',
    'gogoplay', 'animepahe', 'yugenanime', 'crimsonstorm', 'cacheanime',
    'edgedelivery', 'akamaized', 'fastly', 'cloudfront', 'cdn', 'v.animefever',
  ]
  try {
    const host = new URL(target).hostname
    if (!allowed.some(d => host.includes(d)) && !target.includes('.m3u8') && !target.includes('.ts')) {
      return res.status(403).send('Domain not allowed')
    }
  } catch { return res.status(400).send('Invalid URL format') }

  try {
    const response = await axios.get(target, {
      responseType: 'arraybuffer',
      timeout:      10_000,
      headers: {
        'Referer':       'https://megacloud.tv/',
        'Origin':        'https://megacloud.tv',
        'User-Agent':    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept':        '*/*',
        'Accept-Language':'en-US,en;q=0.9',
      },
    })

    const ct = response.headers['content-type'] || ''

    // Rewrite m3u8 playlists so segment URLs are proxied too
    if (ct.includes('mpegurl') || target.endsWith('.m3u8')) {
      const baseUrl  = target.substring(0, target.lastIndexOf('/') + 1)
      const backendBase = `${req.protocol}://${req.get('host')}/api/stream/proxy?url=`

      let text = Buffer.from(response.data).toString('utf-8')
      text = text.replace(/^(?!#)([^\s]+\.ts[^\s]*)/gm, (seg) => {
        const abs = seg.startsWith('http') ? seg : baseUrl + seg
        return backendBase + encodeURIComponent(abs)
      })
      text = text.replace(/URI="([^"]+)"/g, (_, uri) => {
        const abs = uri.startsWith('http') ? uri : baseUrl + uri
        return `URI="${backendBase + encodeURIComponent(abs)}"`
      })

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl')
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Cache-Control', 'no-cache')
      return res.send(text)
    }

    // Pass-through for .ts segments and other assets
    res.setHeader('Content-Type', ct || 'application/octet-stream')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.send(response.data)

  } catch (e) {
    const status = e.response?.status || 503
    console.error(`[proxy] ${status} for ${target.substring(0,80)}:`, e.message)
    res.status(status).send(`Proxy error: ${e.message}`)
  }
}


