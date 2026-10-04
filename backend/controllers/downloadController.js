const axios = require('axios')
const { safeHttp } = require('../utils/netGuard')

const YTS_MIRRORS = [
  'https://yts.mx',
  'https://yts.rs',
  'https://yts.pm',
  'https://yts.do',
  'https://yts.am',
]

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
}

// Try each mirror in order — returns first success
async function ytsGet(path, params = {}) {
  let lastErr = null
  for (const mirror of YTS_MIRRORS) {
    try {
      const { data } = await axios.get(`${mirror}${path}`, {
        params,
        headers: HEADERS,
        timeout: 8000,
      })
      console.log(`YTS mirror OK: ${mirror}`)
      return data
    } catch (e) {
      lastErr = e
      console.log(`YTS mirror ${mirror} failed: ${e.message}`)
    }
  }
  throw new Error(`All YTS mirrors unreachable. Last: ${lastErr?.message}`)
}

const getDownloadLinks = async (req, res) => {
  const { imdbId, title, type } = req.query

  // YTS is movies only
  if (type === 'tv') return res.json({ found: false })

  try {
    let movie = null

    // Attempt 1 — lookup by IMDb ID
    if (imdbId) {
      try {
        const d = await ytsGet('/api/v2/movie_details.json', { imdb_id: imdbId })
        if (d.status === 'ok' && d.data?.movie?.torrents?.length) {
          movie = d.data.movie
        }
      } catch (e) {
        console.log('IMDb lookup failed:', e.message)
      }
    }

    // Attempt 2 — search by title
    if (!movie && title) {
      try {
        const d = await ytsGet('/api/v2/list_movies.json', { query_term: title, limit: 5 })
        const list = d.data?.movies || []
        movie = list.find(m =>
          m.title.toLowerCase() === title.toLowerCase() ||
          m.imdb_code === imdbId
        ) || list[0] || null
      } catch (e) {
        console.log('Title search failed:', e.message)
      }
    }

    if (!movie?.torrents?.length) return res.json({ found: false })

    res.json({
      found:    true,
      title:    movie.title_long,
      year:     movie.year,
      torrents: movie.torrents.map(t => ({
        quality:    t.quality,
        type:       t.type,
        size:       t.size,
        seeders:    t.seeds,
        torrentUrl: t.url,
        hash:       t.hash,
      })),
    })

  } catch (err) {
    console.error('Download controller error:', err.message)
    res.status(500).json({ message: err.message })
  }
}

const torrentHttp = safeHttp({
  responseType: 'arraybuffer', timeout: 15000, maxContentLength: 5 * 1024 * 1024, maxRedirects: 3,
})
torrentHttp.interceptors.request.use(cfg => {
  const host = new URL(axios.getUri(cfg)).hostname
  if (!YTS_MIRRORS.some(m => new URL(m).hostname === host)) throw new Error('Only YTS URLs allowed')
  return cfg
})

const proxyTorrentFile = async (req, res) => {
  const { url, filename } = req.query
  if (!url) return res.status(400).json({ message: 'url required' })

  let host
  try { host = new URL(url).hostname } catch { return res.status(400).json({ message: 'Invalid url' }) }
  const isYTS = YTS_MIRRORS.some(m => new URL(m).hostname === host)
  if (!isYTS) return res.status(403).json({ message: 'Only YTS URLs allowed' })
  const safeName = String(filename || 'movie.torrent').replace(/[^\w .()\[\]-]/g, '_').slice(0, 150)

  try {
    // Stay on YTS hosts even through redirects, and cap the size (torrent files are tiny)
    const response = await torrentHttp.get(url, { headers: HEADERS })
    res.setHeader('Content-Type', 'application/x-bittorrent')
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`)
    res.send(Buffer.from(response.data))
  } catch (err) {
    console.error('[download] torrent fetch failed:', err.message)
    res.status(502).json({ message: 'Could not fetch the torrent file' })
  }
}

module.exports = { getDownloadLinks, proxyTorrentFile }
