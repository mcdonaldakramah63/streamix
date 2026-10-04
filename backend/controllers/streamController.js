// backend/controllers/streamController.js
// Anime lookups via the `aniwatch` package + an HLS proxy that lets the browser
// play the returned .m3u8 streams without CORS errors.
const User  = require('../models/User')

// ── Dynamic ESM import of aniwatch (ESM package in a CJS project) ─────────────
// aniwatch v2 exposes `HiAnime.Scraper`. Its logger spawns a pino-pretty worker thread when
// NODE_ENV is development, and that worker crashes the process on newer Node versions —
// so the package is loaded with the production logger config (plain JSON logs, no worker).
let hianime = null
async function getAniwatch() {
  if (hianime) return hianime
  const prevEnv = process.env.NODE_ENV
  try {
    process.env.NODE_ENV = 'production'
    const mod = await import('aniwatch')
    hianime = new mod.HiAnime.Scraper()
    return hianime
  } catch (e) {
    console.warn('[stream] aniwatch package not available:', e.message)
    return null
  } finally {
    process.env.NODE_ENV = prevEnv
  }
}

// Pages fetched here come from third parties (and the iframe URL is scraped from them)
const vidsrcHttp = require('../utils/netGuard').safeHttp({ responseType: 'text', maxContentLength: 5 * 1024 * 1024 })

// Function to fetch VidSrc stream link
async function getVidSrcStream(tmdbId, isTV = false, season = null, episode = null) {
  const start = Date.now()
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  
  try {
    // Build the embed URL based on content type
    let embedUrl
    if (isTV && season && episode) {
      embedUrl = `https://vidsrc.to/embed/tv/${tmdbId}/${season}/${episode}`
    } else {
      embedUrl = `https://vidsrc.to/embed/movie/${tmdbId}`
    }
    
    // Fetch the embed page to extract the actual stream URL
    const response = await vidsrcHttp.get(embedUrl, {
      headers: { 'User-Agent': userAgent, 'Referer': 'https://vidsrc.to/' },
      timeout: 10000,
      maxRedirects: 5
    })
    
    const html = response.data
    
    // Look for iframe src or video sources in the page
    // VidSrc typically embeds other sources like megacloud, streamtape, etc.
    const iframeMatch = html.match(/src=["'](https?:\/\/[^"']+(?:embed|player)[^"']*)["']/i)
    const videoMatch = html.match(/src=["'](https?:\/\/.+\.m3u8[^"']*)["']/i)
    const sourceMatch = html.match(/(?:file|source|src)["']?\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i)
    
    let streamUrl = null
    
    if (videoMatch) {
      streamUrl = videoMatch[1]
    } else if (sourceMatch) {
      streamUrl = sourceMatch[1]
    } else if (iframeMatch) {
      // If we found an iframe, try to fetch that source too
      const iframeSrc = iframeMatch[1]
      console.log(`[vidsrc] Found iframe: ${iframeSrc.substring(0, 60)}...`)
      
      // Try to fetch the iframe source for HLS
      try {
        const iframeRes = await vidsrcHttp.get(iframeSrc, {
          headers: { 'User-Agent': userAgent, 'Referer': embedUrl },
          timeout: 8000
        })
        const iframeHtml = iframeRes.data
        
        // Look for m3u8 in the iframe content
        const hlsMatch = iframeHtml.match(/(?:file|source|src|playlist)["']?\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i) ||
                        iframeHtml.match(/(?:url|src)["']?\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i)
        if (hlsMatch) {
          streamUrl = hlsMatch[1]
        }
      } catch (e) {
        console.log(`[vidsrc] Could not fetch iframe: ${e.message}`)
      }
    }
    
    if (streamUrl) {
      console.log(`[vidsrc] Found stream after ${Date.now() - start}ms: ${streamUrl.substring(0, 80)}...`)
      return { url: streamUrl, type: 'hls' }
    }
    
    // If no direct HLS found, return the embed URL as fallback
    return { url: embedUrl, type: 'embed' }
    
  } catch (error) {
    console.error(`[vidsrc] Error: ${error.message}`)
    throw error
  }
}

// VidSrc watch endpoint - serves direct HLS or embed URL
exports.vidsrcWatch = async (req, res) => {
  const { tmdbId } = req.params
  const { season, episode } = req.query
  if (!/^\d{1,9}$/.test(tmdbId) || (season && !/^\d{1,4}$/.test(season)) || (episode && !/^\d{1,5}$/.test(episode))) {
    return res.status(400).json({ success: false, message: 'Invalid id' })
  }
  const isTV = season && episode
  
  try {
    const result = await withTimeout(
      getVidSrcStream(tmdbId, isTV, Number(season), Number(episode)),
      15000,
      'vidsrc stream'
    )
    res.json({ success: true, ...result })
  } catch (error) {
    console.error('[vidsrc] Failed:', error.message)
    res.status(502).json({ success: false, message: 'VidSrc is unavailable right now' })
  }
}

function withTimeout(promise, ms, label) {
  let t
  return Promise.race([
    promise,
    new Promise((_, reject) => { t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms) }),
  ]).finally(() => clearTimeout(t))
}

// ── Search anime ─────────────────────────────────────────────────────────────
exports.animeSearch = async (req, res) => {
  const q = String(req.query.q || '').trim()
  const page = Number(req.query.page) || 1
  if (!q) return res.status(400).json({ message: 'Query required' })

  try {
    const aw = await getAniwatch()
    if (!aw) return res.status(503).json({ message: 'Anime service unavailable', animes: [] })
    res.json(await withTimeout(aw.search(q, page), 8000, 'anime search'))
  } catch (e) {
    console.error('[stream] animeSearch error:', e.message)
    res.status(503).json({ message: 'Anime search unavailable', animes: [] })
  }
}

// ── Get anime info ────────────────────────────────────────────────────────────
exports.animeInfo = async (req, res) => {
  const { id } = req.params
  try {
    const aw = await getAniwatch()
    if (!aw) return res.status(503).json({ message: 'Anime service unavailable' })
    res.json(await withTimeout(aw.getInfo(id), 8000, 'anime info'))
  } catch (e) {
    console.error('[stream] animeInfo error:', e.message)
    res.status(503).json({ message: 'Anime info unavailable' })
  }
}

// ── Get episode list ──────────────────────────────────────────────────────────
exports.animeEpisodes = async (req, res) => {
  const id = String(req.query.id || '')
  if (!id) return res.status(400).json({ message: 'Anime ID required' })
  try {
    const aw = await getAniwatch()
    if (!aw) return res.status(503).json({ message: 'Anime service unavailable', episodes: [] })
    res.json(await withTimeout(aw.getEpisodes(id), 8000, 'anime episodes'))
  } catch (e) {
    console.error('[stream] animeEpisodes error:', e.message)
    res.status(503).json({ message: 'Episodes unavailable', episodes: [] })
  }
}

// ── Get stream sources for an episode ─────────────────────────────────────────
exports.animeWatch = async (req, res) => {
  const id       = String(req.query.id || '')
  const server   = String(req.query.server || 'hd-2')
  const category = String(req.query.category || 'sub')
  if (!id) return res.status(400).json({ message: 'Episode ID required' })

  try {
    const aw = await getAniwatch()
    if (!aw) return res.status(503).json({ message: 'Anime service unavailable', sources: [] })
    const data = await withTimeout(
      aw.getEpisodeSources(id, server, category), 8000, `anime watch (${server}/${category})`
    )
    // Hand out signed proxy links — the proxy only accepts URLs this server produced
    const sign = (u) => { try { publicUrl(u); return signedProxyUrl(u) } catch { return null } }
    for (const s of data?.sources || []) if (s?.url) s.proxied = sign(s.url)
    for (const t of data?.tracks || []) if (t?.file) t.proxied = sign(t.file)
    res.json(data)
  } catch (e) {
    const status = e.message?.includes('timed out') ? 504 : 503
    console.error(`[stream] animeWatch ${server}/${category} error:`, e.message)
    res.status(status).json({ message: 'Stream source unavailable', sources: [] })
  }
}

// ── Save exact playback position into the continue-watching entry ─────────────
exports.saveTimestamp = async (req, res) => {
  const movieId   = Number(req.body.movieId)
  const timestamp = Math.max(0, Math.floor(Number(req.body.timestamp) || 0))
  const duration  = req.body.duration ? Math.floor(Number(req.body.duration)) : null
  if (!Number.isFinite(movieId)) return res.status(400).json({ message: 'movieId required' })

  try {
    const set = {
      'continueWatching.$.timestamp': timestamp,
      'continueWatching.$.watchedAt': new Date(),
    }
    if (duration && duration > 0) {
      set['continueWatching.$.duration'] = duration
      set['continueWatching.$.progress'] = Math.min(99, Math.round(timestamp / duration * 100))
    }
    await User.updateOne({ _id: req.user._id, 'continueWatching.movieId': movieId }, { $set: set })
    res.json({ ok: true })
  } catch (e) {
    console.error('[stream] saveTimestamp error:', e.message)
    res.status(500).json({ message: 'Could not save your place' })
  }
}

// ── HLS Proxy ─────────────────────────────────────────────────────────────────
// Only URLs this server handed out can be proxied: each carries an HMAC signature. That stops the
// proxy being used as an open relay. Responses are limited to media types and served with a
// sandboxing CSP + nosniff, so a proxied page can never run as a script on this site.
const { safeHttp, publicUrl } = require('../utils/netGuard')
const { signedProxyUrl, verifyProxySig } = require('../utils/proxySign')

const proxyHttp = safeHttp({ responseType: 'arraybuffer', timeout: 15_000, maxContentLength: 50 * 1024 * 1024 })

// Media the player needs; anything else is sent as a download-only binary
const SAFE_TYPES = /^(video\/|audio\/|image\/(png|jpe?g|webp|gif|avif)|application\/(vnd\.apple\.mpegurl|x-mpegurl|octet-stream|mp4|dash\+xml)|text\/vtt|binary\/octet-stream)/i

// Rewrites every URI in a playlist (segments, variant playlists, keys, subtitles) to go via the proxy
function rewritePlaylist(text, baseUrl) {
  const resolve = (ref) => { try { return new URL(ref, baseUrl).toString() } catch { return null } }
  return text.split(/\r?\n/).map(line => {
    const trimmed = line.trim()
    if (!trimmed) return line
    if (trimmed.startsWith('#')) {
      return line.replace(/URI="([^"]+)"/g, (_, uri) => { const abs = resolve(uri); return abs ? `URI="${signedProxyUrl(abs)}"` : '' })
    }
    const abs = resolve(trimmed)
    return abs ? signedProxyUrl(abs) : ''
  }).join('\n')
}

exports.proxy = async (req, res) => {
  // Express has already URL-decoded the query string once — use it as-is
  const target = typeof req.query.url === 'string' ? req.query.url : ''
  if (!target) return res.status(400).send('url param required')
  if (!verifyProxySig(target, req.query.sig)) return res.status(403).send('Link expired or not allowed')
  try { publicUrl(target) } catch { return res.status(403).send('Host not allowed') }

  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")

  try {
    const response = await proxyHttp.get(target, {
      headers: {
        'Referer':         'https://megacloud.tv/',
        'Origin':          'https://megacloud.tv',
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept':          '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })

    const ct   = String(response.headers['content-type'] || '')
    const body = Buffer.from(response.data)
    const finalUrl = response.request?.res?.responseUrl || target
    const isPlaylist = ct.includes('mpegurl') || /\.m3u8$/i.test(new URL(finalUrl).pathname) ||
      body.subarray(0, 7).toString('utf8') === '#EXTM3U'

    if (isPlaylist) {
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl')
      res.setHeader('Cache-Control', 'no-cache')
      return res.send(rewritePlaylist(body.toString('utf8'), finalUrl))
    }

    res.setHeader('Content-Type', SAFE_TYPES.test(ct) ? ct.split(';')[0] : 'application/octet-stream')
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.send(body)
  } catch (e) {
    const status = e.response?.status && e.response.status < 600 ? e.response.status : 502
    console.error(`[proxy] ${status} for ${target.substring(0, 80)}:`, e.message)
    res.status(status >= 400 ? status : 502).send('Stream unavailable')
  }
}
