// backend/controllers/libraryController.js — bulk "add by URL" library for admins
const mongoose = require('mongoose')
const LibraryItem = require('../models/LibraryItem')
const { LICENSES } = require('../models/LibraryItem')
const { cachedTmdb } = require('../config/tmdb')
const { publicUrl, safeHttp } = require('../utils/netGuard')
const { signedProxyUrl } = require('../utils/proxySign')
const { log } = require('../utils/auditLogger')
const matcher = require('../utils/mediaMatcher')
const localMedia = require('../utils/localMedia')

const MAX_LINES   = 200
const CONCURRENCY = 4
const VIDEO_EXT   = /\.(mp4|m4v|webm|m3u8|mov|mkv|ogv)(\?|$)/i
const UA = 'Mozilla/5.0 (X11; Linux x86_64) Streamix-Library/1.0'

// Checks resolved addresses on every hop, so no URL can reach this machine or the local network
const http = safeHttp({
  headers: { 'User-Agent': UA },
  validateStatus: s => s < 400,
})

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * MediaFire direct links (download1234.mediafire.com/<token>/<key>/file.mp4) expire after a while,
 * so we keep the file's page and look up a fresh direct link whenever it's played or downloaded.
 */
const MEDIAFIRE_PAGE   = /^https?:\/\/(?:www\.)?mediafire\.com\/(?:file|view|download|file_premium)\/([a-z0-9]+)/i
const MEDIAFIRE_DIRECT = /^https?:\/\/download\d*\.mediafire\.com\/[^/]+\/([a-z0-9]+)\//i
const mediafireKey = url => (String(url).match(MEDIAFIRE_PAGE) || String(url).match(MEDIAFIRE_DIRECT) || [])[1] || null
const mfCache = new Map() // key → { url, at }

async function mediafireDirect(key) {
  const hit = mfCache.get(key)
  if (hit && Date.now() - hit.at < 20 * 60 * 1000) return hit.url
  const { data } = await http.get(`https://www.mediafire.com/file/${key}/`, { responseType: 'text' })
  const m = String(data).match(/href="(https:\/\/download\d*\.mediafire\.com\/[^"]+)"/i)
  if (!m) throw new Error('MediaFire file not found — it may have been removed or made private')
  const url = publicUrl(m[1].replace(/&amp;/g, '&')).toString()
  mfCache.set(key, { url, at: Date.now() })
  return url
}

/** The URL to fetch right now (refreshes expiring MediaFire links) */
async function currentUrl(doc) {
  const key = mediafireKey(doc.sourcePage) || mediafireKey(doc.videoUrl)
  if (!key) return doc.videoUrl
  try { return await mediafireDirect(key) } catch { return doc.videoUrl }
}

function formatOf(url, contentType = '') {
  const ct = contentType.toLowerCase()
  if (ct.includes('mpegurl') || /\.m3u8(\?|$)/i.test(url)) return 'hls'
  if (ct.includes('webm') || /\.webm(\?|$)/i.test(url)) return 'webm'
  if (ct.includes('mp4') || /\.(mp4|m4v)(\?|$)/i.test(url)) return 'mp4'
  return 'other'
}

const QUALITY_TAGS = /\b(480p|576p|720p|1080p|2160p|4k|uhd|hdr|x264|x265|h264|h265|hevc|aac|web[- ]?dl|web[- ]?rip|bluray|brrip|bdrip|hdrip|dvdrip|hdtv|512kb|mpeg4|eng|english|subbed|sub|subs|dubbed|dub|multi|raw)\b/gi

/**
 * "Night.of.the.Living.Dead.1968.1080p.mp4" → { title: "Night of the Living Dead", year: "1968" }
 * "Show.Name.S02E05.720p.mkv"              → { title: "Show Name", season: 2, episode: 5 }
 * "AX+Renegade+Immortal+-+Slaying...+eng"  → '+' decoded as spaces, language tags dropped
 */
function guessFromFilename(url) {
  let name = new URL(url).pathname.split('/').pop() || ''
  try { name = decodeURIComponent(name.replace(/\+/g, ' ')) } catch { name = name.replace(/\+/g, ' ') }
  name = name.replace(/\.[a-z0-9]{2,4}$/i, '').replace(/\[[^\]]*\]/g, ' ').replace(/[._]+/g, ' ')

  let season = null, episode = null
  const se = name.match(/\bS(\d{1,2})\s?E(\d{1,3})\b/i) || name.match(/\b(\d{1,2})x(\d{1,3})\b/)
  if (se) {
    season = Number(se[1]); episode = Number(se[2]); name = name.slice(0, se.index)
  } else {
    const ep = name.match(/\b(?:episode|ep)\s?(\d{1,4})\b/i) || name.match(/\s-\s(\d{1,4})(?=\s|$)/)
    if (ep) { episode = Number(ep[1]); name = name.slice(0, ep.index) }
  }

  const yearMatch = name.match(/(?:^|[\s(-])((?:19|20)\d{2})(?:[\s)-]|$)/)
  const year = yearMatch ? yearMatch[1] : ''
  if (yearMatch && yearMatch.index > 0) name = name.slice(0, yearMatch.index)

  name = name.replace(QUALITY_TAGS, ' ').replace(/[()]/g, ' ').replace(/\s+-\s*$/, '').replace(/\s+/g, ' ').trim()
  return { title: name || 'Untitled', year, season, episode }
}

/** Checks the URL actually serves video and returns its type + size */
async function probe(url) {
  let res
  try {
    res = await http.head(url)
  } catch {
    // Some hosts reject HEAD — ask for the first byte instead
    res = await http.get(url, { headers: { Range: 'bytes=0-0', 'User-Agent': UA }, responseType: 'stream' })
    res.data.destroy()
  }
  const ct = String(res.headers['content-type'] || '')
  const range = String(res.headers['content-range'] || '')
  const size = Number(range.split('/')[1]) || Number(res.headers['content-length']) || null
  const finalUrl = res.request?.res?.responseUrl || url
  const looksVideo = ct.startsWith('video/') || ct.includes('mpegurl') || VIDEO_EXT.test(finalUrl) || VIDEO_EXT.test(url)
  if (!looksVideo) throw new Error(`Doesn't look like a video (${ct || 'unknown type'})`)
  return { contentType: ct, size }
}

const ARCHIVE_RE = /^https?:\/\/(?:www\.)?archive\.org\/(?:details|download|embed)\/([^/?#]+)/i

function licenseFromUrl(licenseUrl = '') {
  if (/publicdomain/i.test(licenseUrl)) return 'public-domain'
  if (/creativecommons\.org/i.test(licenseUrl)) return 'creative-commons'
  return null
}

/** archive.org item page → best playable file + metadata (title, year, description, license) */
async function resolveArchive(identifier) {
  const { data } = await http.get(`https://archive.org/metadata/${encodeURIComponent(identifier)}`)
  if (!data?.files?.length) throw new Error('Internet Archive item not found or has no files')
  const md = data.metadata || {}
  const files = data.files.filter(f => /\.(mp4|m4v|webm|ogv)$/i.test(f.name || ''))
  if (!files.length) throw new Error('This Internet Archive item has no browser-playable video file')

  // Uploads split into "1of5", "part 2", "cd1"… can't play as one movie
  const PART = /(\d+\s?of\s?\d+|part[\s_-]?\d+|\bcd\s?\d+|\bdisc\s?\d+|reel[\s_-]?\d+)/i
  const whole = files.filter(f => !PART.test(f.name))
  if (!whole.length) {
    throw new Error(`This Internet Archive item is split into ${files.filter(f => /\.mp4$/i.test(f.name)).length || 'several'} parts — find a single-file copy instead`)
  }

  // Prefer the h.264 derivative, then the largest MP4
  const rank = f => (/h\.264/i.test(f.format || '') ? 3 : 0) + (/\.mp4$/i.test(f.name) ? 2 : 0) + (/512kb/i.test(f.name) ? -1 : 0)
  whole.sort((a, b) => rank(b) - rank(a) || Number(b.size || 0) - Number(a.size || 0))
  const file = whole[0]
  const first = v => (Array.isArray(v) ? v[0] : v) || ''

  return {
    videoUrl:   `https://archive.org/download/${identifier}/${encodeURIComponent(file.name).replace(/%2F/g, '/')}`,
    title:      first(md.title) || identifier,
    year:       String(first(md.year) || first(md.date)).slice(0, 4),
    overview:   String(first(md.description)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 5000),
    poster:     `https://archive.org/services/img/${identifier}`,
    licenseUrl: first(md.licenseurl),
    sourcePage: `https://archive.org/details/${identifier}`,
    sizeBytes:  Number(file.size) || null,
    runtime:    file.length ? Math.round(Number(file.length) / 60) || null : null,
  }
}

const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '')
const img = (p, size) => (p ? `https://image.tmdb.org/t/p/${size}${p}` : '')

/**
 * Explicit links an admin can type: "movie:653", "tv:1399 s1e2", "tmdb:653",
 * or a TMDB page URL (…/movie/653-nosferatu, …/tv/1399/season/1/episode/2)
 */
function parseLink(text) {
  const s = String(text || '').trim()
  let m = s.match(/themoviedb\.org\/(movie|tv)\/(\d+)[^/\s]*(?:\/season\/(\d+)(?:\/episode\/(\d+))?)?/i)
  if (m) return { mediaType: m[1].toLowerCase(), tmdbId: Number(m[2]), season: m[3] ? Number(m[3]) : null, episode: m[4] ? Number(m[4]) : null }
  m = s.match(/^(movie|tv|tmdb)\s*:\s*(\d+)(?:\s*s(\d{1,3})\s*e(\d{1,4}))?$/i)
  if (m) return { mediaType: m[1].toLowerCase() === 'tv' ? 'tv' : 'movie', tmdbId: Number(m[2]), season: m[3] ? Number(m[3]) : null, episode: m[4] ? Number(m[4]) : null }
  return null
}

/** Full TMDB details for an explicit link (also validates that the id exists) */
async function linkDetails(link) {
  const d = await cachedTmdb(`/${link.mediaType}/${link.tmdbId}`)
  let episodeName = ''
  if (link.mediaType === 'tv' && link.season != null && link.episode != null) {
    const ep = await cachedTmdb(`/tv/${link.tmdbId}/season/${link.season}/episode/${link.episode}`).catch(() => null)
    if (!ep) throw new Error(`Season ${link.season} episode ${link.episode} doesn't exist for this series on TMDB`)
    episodeName = ep.name || ''
  }
  return {
    ...link,
    title:    link.mediaType === 'tv' ? d.name : d.title,
    year:     ((link.mediaType === 'tv' ? d.first_air_date : d.release_date) || '').slice(0, 4),
    poster:   img(d.poster_path, 'w500'),
    backdrop: img(d.backdrop_path, 'w1280'),
    overview: d.overview || '',
    episodeName,
  }
}

/** Applies a TMDB match/link to an item (keeps any title/overview the admin already set) */
function applyLink(item, m, { overwrite = false } = {}) {
  item.mediaType = m.mediaType
  item.tmdbId = m.tmdbId
  item.tmdbTitle = m.title || ''
  item.season = m.mediaType === 'tv' ? (m.season ?? item.season ?? (item.episode != null ? 1 : null)) : null
  item.episode = m.mediaType === 'tv' ? (m.episode ?? item.episode ?? null) : null
  if (m.backdrop) item.backdrop = m.backdrop
  if (m.poster && (overwrite || !item.poster || /archive\.org\/services\/img/.test(item.poster))) item.poster = m.poster
  if (m.overview && (overwrite || !item.overview)) item.overview = m.overview
  if (m.year && (overwrite || !item.year)) item.year = m.year
  if (overwrite && m.title) item.title = m.mediaType === 'tv' && item.season && item.episode
    ? `${m.title} S${item.season}E${item.episode}${m.episodeName ? ` · ${m.episodeName}` : ''}` : m.title
}

/** The video's file name, as the uploader named it */
function fileNameOf(url) {
  try { return decodeURIComponent((new URL(url).pathname.split('/').pop() || '').replace(/\+/g, ' ')) }
  catch { return String(url).split('/').pop() || '' }
}

/** Episode name for nicer titles ("Jade Dynasty S4E9 · The Sword") */
async function withEpisodeName(m) {
  if (m.mediaType !== 'tv' || m.season == null || m.episode == null) return m
  const ep = await cachedTmdb(`/tv/${m.tmdbId}/season/${m.season}/episode/${m.episode}`).catch(() => null)
  return { ...m, episodeName: ep?.name || '' }
}

const keepSuggestions = list => (list || []).slice(0, 5).map(s => ({
  mediaType: s.mediaType, tmdbId: s.tmdbId, title: s.title, year: s.year, poster: s.poster,
  season: s.season ?? null, episode: s.episode ?? null, confidence: s.confidence,
}))

/** Runs the smart matcher on an item and links it when it's confident */
async function smartLink(item, hintText = '') {
  const name = item.fileName || item.title
  const r = await matcher.identify(name, hintText)
  item.matchSuggestions = keepSuggestions(r.suggestions)
  if (!r.best) {
    item.matchConfidence = r.suggestions[0]?.confidence ?? 0
    item.matchedBy = 'none'
    if (!r.parsed.titleFromAdmin && r.parsed.title && (!item.title || item.title === name)) item.title = r.parsed.title
    if (r.parsed.season != null) item.season = r.parsed.season
    if (r.parsed.episode != null) item.episode = r.parsed.episode
    return r
  }
  applyLink(item, await withEpisodeName(r.best), { overwrite: !r.parsed.titleFromAdmin })
  item.matchConfidence = r.best.confidence
  item.matchedBy = r.parsed.ids.tmdb || r.parsed.ids.imdb ? 'id' : r.decidedBy
  // An id the admin typed teaches the matcher this name
  if ((r.parsed.ids.tmdb || r.parsed.ids.imdb) && r.parsed.title) matcher.learn(matcher.parseName(name).title || r.parsed.title, r.best)
  return r
}

/**
 * One import line: a URL, then optionally anything that helps identify it, e.g.
 *   https://example.org/film.mp4
 *   https://example.org/film.mp4 | My Film Title | 1968
 *   https://example.org/ep5.mp4  | tv:1399 s1e5      or  | jade dynasty s4 ep 9  or  | tt0013442
 *   https://example.org/film.mp4 | https://www.themoviedb.org/movie/653
 *   https://archive.org/details/TheGeneral1926
 */
async function importLine(line, { license, matchTmdb, userId }) {
  const [rawUrl, ...fields] = line.split('|').map(s => s.trim())
  const hint = fields.filter(Boolean).join(' ')

  // A file in this computer's library folder (put there by scripts/library-upload.js)
  if (localMedia.isLocal(rawUrl)) {
    const f = localMedia.inspect(rawUrl)
    const videoUrl = localMedia.PREFIX + require('path').relative(localMedia.ROOT, f.abs).split(require('path').sep).join('/')
    if (await LibraryItem.exists({ videoUrl })) throw new Error('Already in the library')
    const parsed = matcher.parseInput(f.fileName, hint)
    const item = { videoUrl, fileName: f.fileName, title: (parsed.title || f.fileName).slice(0, 300), sizeBytes: f.size, format: formatOf(f.abs) }
    if (/^\d{4}$/.test(parsed.year || '')) item.year = parsed.year
    if (matchTmdb || parsed.ids.tmdb || parsed.ids.imdb) await smartLink(item, hint)
    return LibraryItem.create({ ...item, license, addedBy: userId })
  }

  const url = publicUrl(rawUrl).toString()
  let item
  const archive = url.match(ARCHIVE_RE)
  if (archive) {
    item = await resolveArchive(archive[1])
    // Archive metadata (title + year) is a better name than the file
    item.fileName = `${item.title}${item.year ? ` ${item.year}` : ''}`
  } else if (mediafireKey(url)) {
    const key = mediafireKey(url)
    const direct = await mediafireDirect(key)
    // videoUrl stays stable (one entry per MediaFire file); the direct link is looked up when played
    item = { videoUrl: `https://www.mediafire.com/file/${key}/`, sourcePage: `https://www.mediafire.com/file/${key}/`,
      probeUrl: direct, fileName: fileNameOf(direct) }
  } else {
    item = { videoUrl: url, fileName: fileNameOf(url) }
  }
  const parsed = matcher.parseInput(item.fileName, hint)
  if (!archive) { item.title = parsed.title || item.fileName; item.year = parsed.year }
  if (parsed.titleFromAdmin) item.title = parsed.title.slice(0, 300)
  if (/^\d{4}$/.test(parsed.year || '')) item.year = parsed.year

  const { contentType, size } = await probe(item.probeUrl || item.videoUrl)
  item.format = formatOf(item.probeUrl || item.videoUrl, contentType)
  delete item.probeUrl
  item.sizeBytes = item.sizeBytes || size

  if (await LibraryItem.exists({ videoUrl: item.videoUrl })) throw new Error('Already in the library')

  // Typed ids always count; otherwise only when TMDB matching is on
  if (matchTmdb || parsed.ids.tmdb || parsed.ids.imdb) await smartLink(item, hint)

  // Archive items carry their own license; otherwise use what the admin confirmed
  return LibraryItem.create({
    ...item,
    license: licenseFromUrl(item.licenseUrl) || license,
    addedBy: userId,
  })
}

/** Short human description of what an item is linked to */
function linkSummary(doc) {
  if (!doc.tmdbId) return 'Not linked to a TMDB title'
  const name = doc.tmdbTitle ? ` “${doc.tmdbTitle}”` : ''
  if (doc.mediaType === 'tv') {
    return doc.episode != null ? `Series${name} · S${doc.season || 1}E${doc.episode}` : `Series${name} · needs season/episode`
  }
  return `Movie${name}`
}

async function runPool(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
    }
  }))
  return results
}

// ── Admin endpoints ──────────────────────────────────────────────────────────

// POST /api/admin/library/import { lines: string | string[], license, confirmRights: true, matchTmdb }
exports.importUrls = async (req, res) => {
  const { license, confirmRights, matchTmdb = true } = req.body
  if (!LICENSES.includes(license)) return res.status(400).json({ message: 'Choose how you have the rights to these videos' })
  if (confirmRights !== true) return res.status(400).json({ message: 'You must confirm you have the right to stream these videos' })

  const raw = Array.isArray(req.body.lines) ? req.body.lines.join('\n') : String(req.body.lines || '')
  const lines = [...new Set(raw.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#')))]
  if (!lines.length) return res.status(400).json({ message: 'Paste at least one URL' })
  if (lines.length > MAX_LINES) return res.status(400).json({ message: `Up to ${MAX_LINES} URLs per import` })

  const results = await runPool(lines, CONCURRENCY, async (line) => {
    try {
      const doc = await importLine(line, { license, matchTmdb: !!matchTmdb, userId: req.user._id })
      return { line, ok: true, id: doc._id, title: doc.title, year: doc.year, format: doc.format, license: doc.license,
        tmdbId: doc.tmdbId, mediaType: doc.mediaType, linked: linkSummary(doc),
        confidence: doc.matchConfidence, matchedBy: doc.matchedBy, suggestions: doc.matchSuggestions?.length || 0 }
    } catch (e) {
      const msg = e.code === 11000 ? 'Already in the library'
        : e.response ? `Server answered ${e.response.status}` : e.message
      return { line, ok: false, error: msg }
    }
  })

  const added = results.filter(r => r.ok).length
  // Tell followers about new episodes / movies (in the background)
  if (added) {
    LibraryItem.find({ _id: { $in: results.filter(r => r.ok).map(r => r.id) } }).lean()
      .then(items => require('../utils/jobs').libraryAdded(items)).catch(() => {})
  }
  log('ADMIN_LIBRARY_IMPORT', req, { severity: 'info', details: { added, failed: results.length - added, license } })
  res.json({ added, failed: results.length - added, results })
}

// GET /api/admin/library
exports.adminList = async (_req, res) => {
  const items = await LibraryItem.find().sort({ featured: -1, createdAt: -1 }).limit(1000).lean()
  res.json(items.map(i => ({ ...i, linked: linkSummary(i) })))
}

/** Backfills the original file name for items imported before it was stored */
async function ensureFileName(doc) {
  if (doc.fileName) return
  const url = await currentUrl(doc)
  doc.fileName = /mediafire\.com\/file\//.test(url) ? doc.title : fileNameOf(url)
}

// POST /api/admin/library/rematch — runs the smart matcher on every unlinked (or half-linked) item
exports.rematch = async (req, res) => {
  const items = await LibraryItem.find({ $or: [
    { tmdbId: null }, { tmdbId: { $exists: false } }, { mediaType: 'tv', episode: null },
  ] })
  let linked = 0
  await runPool(items, CONCURRENCY, async (doc) => {
    await ensureFileName(doc)
    const r = await smartLink(doc)
    if (r.best) linked++
    await doc.save()
  })
  log('ADMIN_LIBRARY_REMATCH', req, { details: { checked: items.length, linked } })
  res.json({ checked: items.length, linked })
}

// GET /api/admin/library/:id/suggest — ranked guesses (with confidence) for the link picker
exports.suggest = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Not found' })
  const doc = await LibraryItem.findById(req.params.id)
  if (!doc) return res.status(404).json({ message: 'Not found' })
  await ensureFileName(doc)
  const r = await matcher.identify(doc.fileName || doc.title, String(req.query.hint || '').slice(0, 300))
  res.json({ fileName: doc.fileName, parsed: r.parsed, suggestions: r.suggestions, best: r.best, decidedBy: r.decidedBy })
}

// PUT /api/admin/library/:id { title, year, overview, poster }
exports.update = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Not found' })
  const allowed = {}
  for (const k of ['title', 'year', 'overview', 'poster', 'backdrop']) {
    if (typeof req.body[k] === 'string') allowed[k] = req.body[k].slice(0, k === 'overview' ? 5000 : 500)
  }
  if (typeof req.body.featured === 'boolean') allowed.featured = req.body.featured
  // Markers: seconds, or null/'' to clear
  for (const k of ['introStart', 'introEnd', 'creditsStart']) {
    if (req.body[k] === null || req.body[k] === '') allowed[k] = null
    else if (req.body[k] !== undefined) {
      const n = Number(req.body[k])
      if (!Number.isFinite(n) || n < 0 || n > 86400) return res.status(400).json({ message: 'Markers must be seconds (e.g. 90)' })
      allowed[k] = Math.round(n)
    }
  }

  const doc = await LibraryItem.findById(req.params.id)
  if (!doc) return res.status(404).json({ message: 'Not found' })
  Object.assign(doc, allowed)

  // link: "" unlinks; "movie:653" / "tv:1399 s1e2" / a TMDB URL links
  if (typeof req.body.link === 'string') {
    if (!req.body.link.trim()) {
      Object.assign(doc, { tmdbId: null, tmdbTitle: '', mediaType: 'movie', season: null, episode: null, matchedBy: 'none' })
    } else {
      const link = parseLink(req.body.link)
      if (!link) return res.status(400).json({ message: 'Use movie:ID, tv:ID s1e2, or paste a themoviedb.org link' })
      if (link.mediaType === 'tv' && (link.season == null || link.episode == null)) {
        return res.status(400).json({ message: 'For a series, include the episode — e.g. tv:1399 s1e2' })
      }
      try {
        const details = await linkDetails(link)
        applyLink(doc, details, { overwrite: true })
        Object.assign(doc, allowed) // anything the admin typed in the same save wins
        doc.matchedBy = 'admin'; doc.matchConfidence = 1; doc.matchSuggestions = []
        // Learn from the correction: later files with the same show/movie name link by themselves
        await ensureFileName(doc)
        matcher.learn(matcher.parseName(doc.fileName || '').title, details)
      }
      catch (e) { return res.status(400).json({ message: e.response?.status === 404 ? 'No TMDB title with that id' : e.message }) }
    }
  }

  await doc.save()
  res.json({ ...doc.toObject(), linked: linkSummary(doc) })
}

// DELETE /api/admin/library/:id
exports.remove = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Not found' })
  const doc = await LibraryItem.findByIdAndDelete(req.params.id)
  if (!doc) return res.status(404).json({ message: 'Not found' })
  log('ADMIN_LIBRARY_DELETE', req, { severity: 'warn', details: { title: doc.title } })
  res.json({ message: 'Removed' })
}

// ── Public endpoints ─────────────────────────────────────────────────────────

const publicFields = 'title year overview poster backdrop genres runtime format sizeBytes license licenseUrl sourcePage tmdbId tmdbTitle mediaType season episode featured createdAt'

// GET /api/library?q=&page=
exports.list = async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1)
  const q = String(req.query.q || '').trim().slice(0, 100)
  const filter = q ? { $text: { $search: q } } : {}
  const [items, total] = await Promise.all([
    LibraryItem.find(filter).select(publicFields).sort({ featured: -1, createdAt: -1 }).skip((page - 1) * 40).limit(40).lean(),
    LibraryItem.countDocuments(filter),
  ])
  res.json({ items, total, pages: Math.ceil(total / 40) })
}

// GET /api/library/:id → includes the playable URL (HLS goes through the stream proxy)
exports.get = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Not found' })
  const doc = await LibraryItem.findById(req.params.id).lean()
  if (!doc) return res.status(404).json({ message: 'Not found' })
  res.json({ ...doc, playUrl: await playUrlOf(doc), addedBy: undefined })
}

/**
 * WebVTT files next to a local video ("Ep 01.mp4" → "Ep 01.en.vtt"), made by the upload script from the
 * subtitles inside the original MKV or the .srt/.ass files beside it. Same signed token as the video.
 */
function subtitlesOf(doc) {
  if (!localMedia.isLocal(doc.videoUrl)) return []
  const abs = localMedia.resolve(doc.videoUrl)
  if (!abs) return []
  const token = encodeURIComponent(require('../utils/tokens').signFile(doc._id))
  return require('../utils/mediaPrep').subtitlesFor(abs).slice(0, 12)
    .map((s, n) => ({ url: `/api/library/${doc._id}/subtitles/${n}?token=${token}`, lang: s.lang, label: s.label }))
}

// GET /api/library/:id/subtitles/:n?token= → one WebVTT file
exports.subtitle = async (req, res) => {
  try { require('../utils/tokens').verifyFile(req.query.token, req.params.id) }
  catch { return res.status(401).json({ message: 'Link expired' }) }
  const doc = await LibraryItem.findById(req.params.id).lean()
  const abs = doc && localMedia.isLocal(doc.videoUrl) ? localMedia.resolve(doc.videoUrl) : null
  const sub = abs ? require('../utils/mediaPrep').subtitlesFor(abs)[Number(req.params.n)] : null
  if (!sub) return res.status(404).json({ message: 'Not found' })
  res.setHeader('Content-Type', 'text/vtt; charset=utf-8')
  res.setHeader('Cache-Control', 'private, max-age=3600')
  res.sendFile(sub.file, { dotfiles: 'deny' })
}

async function playUrlOf(doc) {
  if (localMedia.isLocal(doc.videoUrl)) {
    return `/api/library/${doc._id}/file?token=${encodeURIComponent(require('../utils/tokens').signFile(doc._id))}`
  }
  const url = await currentUrl(doc)
  return doc.format === 'hls' ? signedProxyUrl(url) : url
}

// GET /api/library/for/:type/:tmdbId[?season=&episode=] → files for a TMDB movie / series (episode)
exports.forTitle = async (req, res) => {
  const type = req.params.type === 'tv' ? 'tv' : 'movie'
  const tmdbId = Number(req.params.tmdbId)
  if (!Number.isFinite(tmdbId)) return res.status(400).json({ message: 'Invalid id' })
  // Items imported before mediaType existed are movies
  const filter = { tmdbId, mediaType: type === 'movie' ? { $in: ['movie', null] } : 'tv' }
  if (type === 'tv' && req.query.season && req.query.episode) {
    filter.season = Number(req.query.season)
    filter.episode = Number(req.query.episode)
  }
  const docs = await LibraryItem.find(filter).sort({ featured: -1, createdAt: 1 }).lean()
  res.json(await Promise.all(docs.map(async d => ({
    _id: d._id, title: d.title, format: d.format, license: d.license, sizeBytes: d.sizeBytes,
    season: d.season ?? null, episode: d.episode ?? null, playUrl: await playUrlOf(d), subtitles: subtitlesOf(d),
    markers: { introStart: d.introStart ?? null, introEnd: d.introEnd ?? null, creditsStart: d.creditsStart ?? null },
  }))))
}

// ── Downloads ────────────────────────────────────────────────────────────────

// POST /api/library/:id/download (signed in) → short-lived link the browser can open directly
exports.downloadLink = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Not found' })
  const doc = await LibraryItem.findById(req.params.id).select('title year format sizeBytes').lean()
  if (!doc) return res.status(404).json({ message: 'Not found' })
  if (doc.format === 'hls') return res.status(400).json({ message: 'Streams (HLS) can only be saved for offline viewing in the app' })
  const { downloadsPerMonth } = await require('../utils/settings').limits()
  if (downloadsPerMonth > 0) {
    const AuditLog = require('../models/AuditLog')
    const since = new Date(); since.setDate(1); since.setHours(0, 0, 0, 0)
    const used = await AuditLog.countDocuments({ action: 'LIBRARY_DOWNLOAD', userId: req.user._id, createdAt: { $gte: since } }).catch(() => 0)
    if (used >= downloadsPerMonth) return res.status(429).json({ message: `You've used all ${downloadsPerMonth} downloads for this month` })
  }
  // No user id inside, so this token can't be used as a login token
  const token = require('../utils/tokens').signFile(doc._id)
  const base = `/api/library/${doc._id}/file?token=${encodeURIComponent(token)}`
  log('LIBRARY_DOWNLOAD', req, { details: { id: String(doc._id), title: doc.title } })
  res.json({ url: `${base}&dl=1`, offlineUrl: base, sizeBytes: doc.sizeBytes || null })
}

const mimeOf = f => ({ webm: 'video/webm', mkv: 'video/x-matroska', mov: 'video/quicktime', ogv: 'video/ogg' })[require('path').extname(f).slice(1).toLowerCase()] || 'video/mp4'

const safeName = s => String(s || 'video').replace(/[\\/:*?"<>|\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150) || 'video'

// GET /api/library/:id/file?token=…[&dl=1] → the file, through this server (same origin, Range supported)
exports.file = async (req, res) => {
  try { require('../utils/tokens').verifyFile(req.query.token, req.params.id) }
  catch { return res.status(401).json({ message: 'Download link expired — start the download again' }) }

  const doc = await LibraryItem.findById(req.params.id).lean()
  if (!doc || doc.format === 'hls') return res.status(404).json({ message: 'Not found' })

  // Files on this computer: sendFile handles Range requests (seeking, resumable downloads)
  if (localMedia.isLocal(doc.videoUrl)) {
    const abs = localMedia.resolve(doc.videoUrl)
    if (!abs || !require('fs').existsSync(abs)) return res.status(404).json({ message: 'The video file is missing from the library folder' })
    if (req.query.dl) {
      const ext = require('path').extname(abs).slice(1).toLowerCase() || 'mp4'
      const name = `${safeName(doc.title)}${doc.year && !doc.title.includes(doc.year) ? ` (${doc.year})` : ''}.${ext}`
      res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`)
    }
    res.setHeader('Cache-Control', 'private, no-store')
    return res.sendFile(abs, { dotfiles: 'deny', headers: { 'Content-Type': mimeOf(abs) } })
  }

  const url = await currentUrl(doc)
  const upstream = await http.get(url, {
    responseType: 'stream', timeout: 30_000,
    headers: { 'User-Agent': UA, ...(req.headers.range ? { Range: req.headers.range } : {}) },
  })
  res.status(upstream.status === 206 ? 206 : 200)
  for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag']) {
    if (upstream.headers[h]) res.setHeader(h, upstream.headers[h])
  }
  const ext = (url.split('?')[0].match(/\.(mp4|m4v|webm|mov|mkv|ogv)$/i) || [, doc.format === 'webm' ? 'webm' : 'mp4'])[1].toLowerCase()
  if (req.query.dl) {
    const name = `${safeName(doc.title)}${doc.year && !doc.title.includes(doc.year) ? ` (${doc.year})` : ''}.${ext}`
    res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`)
  }
  res.setHeader('Cache-Control', 'private, no-store')
  upstream.data.pipe(res)
  req.on('close', () => upstream.data.destroy())
}

// GET /api/admin/library/tmdb-search?q= → movies and series to link a file to
exports.tmdbSearch = async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100)
  if (!q) return res.json([])
  const direct = parseLink(q)
  const [movies, shows] = await Promise.all([
    cachedTmdb('/search/movie', { query: q, include_adult: false }).catch(() => null),
    cachedTmdb('/search/tv',    { query: q, include_adult: false }).catch(() => null),
  ])
  const pick = (r, mediaType) => ({
    mediaType, id: r.id,
    title: mediaType === 'tv' ? r.name : r.title,
    year: ((mediaType === 'tv' ? r.first_air_date : r.release_date) || '').slice(0, 4),
    poster: img(r.poster_path, 'w185'), popularity: r.popularity || 0,
  })
  const out = [
    ...(movies?.results || []).slice(0, 10).map(r => pick(r, 'movie')),
    ...(shows?.results  || []).slice(0, 10).map(r => pick(r, 'tv')),
  ].sort((a, b) => b.popularity - a.popularity)
  if (direct) {
    const d = await cachedTmdb(`/${direct.mediaType}/${direct.tmdbId}`).catch(() => null)
    if (d) out.unshift(pick(d, direct.mediaType))
  }
  res.json(out.slice(0, 16))
}

// GET /api/admin/library/tmdb-seasons/:id → seasons + episode counts for the episode picker
exports.tmdbSeasons = async (req, res) => {
  const d = await cachedTmdb(`/tv/${Number(req.params.id)}`).catch(() => null)
  if (!d) return res.status(404).json({ message: 'Series not found' })
  res.json((d.seasons || []).map(s => ({ season: s.season_number, episodes: s.episode_count, name: s.name })))
}

exports._test = { guessFromFilename, formatOf, licenseFromUrl, parseLink, resolveArchive, linkDetails, applyLink, smartLink }
