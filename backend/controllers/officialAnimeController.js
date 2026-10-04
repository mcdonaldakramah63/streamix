// controllers/officialAnimeController.js — free, official anime episodes (YouTube) for players and the Anime page,
// plus the admin's channel list and review queue.
const axios = require('axios')
const OfficialVideo = require('../models/OfficialVideo')
const OfficialSeries = require('../models/OfficialSeries')
const o = require('../utils/officialAnime')
const service = require('../services/officialAnime')
const { cachedTmdb } = require('../config/tmdb')

/**
 * Channels that don't play here at all (region-licensed — e.g. Muse Asia outside Asia): when a channel's videos
 * keep failing for viewers on this server and none have played in the last 30 days, its whole catalogue is
 * hidden, so nobody else walks into a dead end one episode at a time.
 */
let chanCache = { at: 0, blocked: new Set() }
async function blockedChannels() {
  if (Date.now() - chanCache.at < 10 * 60_000) return chanCache.blocked
  const since = new Date(Date.now() - 30 * 86400000)
  const rows = await OfficialVideo.aggregate([
    { $match: { 'stats.at': { $gte: since } } },
    { $group: { _id: '$channelId', ok: { $sum: '$stats.ok' }, blocked: { $sum: '$stats.blocked' }, videos: { $sum: { $cond: [{ $gt: ['$stats.blocked', 0] }, 1, 0] } } } },
  ])
  const blocked = new Set(rows.filter(r => r.ok === 0 && r.blocked >= 3 && r.videos >= 2).map(r => r._id))
  chanCache = { at: Date.now(), blocked }
  return blocked
}

const pub = (v) => ({
  videoId: v.videoId, season: v.season ?? null, episode: v.episode ?? null, channel: v.channelName,
  title: v.title, publishedAt: v.publishedAt, duration: v.duration ?? null,
})

// GET /api/anime/official/title/:type/:tmdbId → { videos: [...] } (only ones that can play here)
exports.forTitle = async (req, res) => {
  const type = req.params.type === 'movie' ? 'movie' : 'tv'
  const tmdbId = Number(req.params.tmdbId)
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) return res.status(400).json({ message: 'Invalid id' })
  const off = await blockedChannels()
  const rows = (await OfficialVideo.find({ tmdbId, mediaType: type, status: 'linked' }).sort({ season: 1, episode: 1, publishedAt: 1 }).lean())
    .filter(v => !off.has(v.channelId))
  // One video per episode: the one that plays best here (most "played", fewest "blocked"), then the oldest upload
  const best = new Map()
  for (const v of rows) {
    if (!o.playable({ ...v.stats, embeddable: v.embeddable, regionBlocked: v.regionBlocked })) continue
    const k = type === 'movie' ? 'movie' : `${v.season}:${v.episode}`
    const cur = best.get(k)
    const s = (v.stats?.ok || 0) - 2 * (v.stats?.blocked || 0)
    if (!cur || s > (cur.stats?.ok || 0) - 2 * (cur.stats?.blocked || 0)) best.set(k, v)
  }
  res.set('Cache-Control', 'public, max-age=300')
  res.json({ videos: [...best.values()].map(pub) })
}

// GET /api/anime/official/shows?limit=20 → series and movies with free official episodes, newest first
let showsCache = { at: 0, data: null }
exports.shows = async (req, res) => {
  const limit = Math.min(60, Math.max(1, Number(req.query.limit) || 24))
  if (!showsCache.data || Date.now() - showsCache.at > 10 * 60_000) {
    const off = await blockedChannels()
    const groups = await OfficialVideo.aggregate([
      { $match: { status: 'linked', embeddable: { $ne: false }, regionBlocked: { $ne: true }, channelId: { $nin: [...off] } } },
      { $group: { _id: { t: '$mediaType', id: '$tmdbId' }, episodes: { $sum: 1 }, latest: { $max: '$publishedAt' }, channel: { $first: '$channelName' } } },
      { $sort: { latest: -1 } },
      { $limit: 60 },
    ])
    const items = await Promise.all(groups.map(async g => {
      const d = await cachedTmdb(`/${g._id.t}/${g._id.id}`).catch(() => null)
      if (!d) return null
      return {
        id: d.id, media_type: g._id.t, title: d.title, name: d.name, poster_path: d.poster_path, backdrop_path: d.backdrop_path,
        vote_average: d.vote_average, overview: d.overview, first_air_date: d.first_air_date, release_date: d.release_date,
        officialEpisodes: g.episodes, officialChannel: g.channel, officialLatest: g.latest,
      }
    }))
    showsCache = { at: Date.now(), data: items.filter(Boolean) }
  }
  res.set('Cache-Control', 'public, max-age=300')
  res.json({ results: showsCache.data.slice(0, limit) })
}

// POST /api/anime/official/:videoId/outcome { ok } — the player tells us whether it actually played here
exports.outcome = async (req, res) => {
  const id = String(req.params.videoId || '')
  if (!o.VIDEO_ID.test(id)) return res.status(400).json({ message: 'Bad id' })
  await OfficialVideo.updateOne({ videoId: id }, { $inc: { [req.body.ok === true ? 'stats.ok' : 'stats.blocked']: 1 }, $set: { 'stats.at': new Date() } })
  if (req.body.ok !== true) { showsCache.at = 0; chanCache.at = 0 }
  res.json({ ok: true })
}

// ── Admin ───────────────────────────────────────────────────────────────────

// GET /api/admin/official
exports.adminStatus = async (_req, res) => {
  const [chans, counts, review, reviewVideos] = await Promise.all([
    service.channels(),
    OfficialVideo.aggregate([{ $group: { _id: { c: '$channelId', s: '$status' }, n: { $sum: 1 } } }]),
    OfficialSeries.find({ status: 'review' }).sort({ updatedAt: -1 }).limit(50).lean(),
    OfficialVideo.find({ status: 'review', kind: 'movie' }).sort({ publishedAt: -1 }).limit(20).select('videoId title cleanTitle channelName').lean(),
  ])
  const byChan = {}
  for (const r of counts) { byChan[r._id.c] = byChan[r._id.c] || {}; byChan[r._id.c][r._id.s] = r.n }
  const samples = await Promise.all(review.map(s => OfficialVideo.find({ seriesKey: s.key }).limit(3).select('title videoId').lean()))
  res.json({
    keyConfigured: !!process.env.YOUTUBE_API_KEY, region: process.env.YOUTUBE_REGION || '',
    channels: await (async () => { const off = await blockedChannels(); return chans.map(c => ({ ...c, counts: byChan[c.id] || {}, blockedHere: off.has(c.id) })) })(),
    reviewSeries: review.map((s, i) => ({ key: s.key, title: s.title, season: s.season, suggestions: s.suggestions, samples: samples[i] })),
    reviewMovies: reviewVideos,
    ...service.status(),
  })
}

/** Resolve "@Handle" / channel URL / id to { id, name } and check its public feed */
async function resolveChannel(input) {
  let id = o.channelIdFrom(input)
  const handle = !id && o.handleFrom(input)
  if (!id && handle && process.env.YOUTUBE_API_KEY) {
    const { data } = await axios.get('https://www.googleapis.com/youtube/v3/channels', { params: { key: process.env.YOUTUBE_API_KEY, part: 'id', forHandle: `@${handle}` }, timeout: 10_000 })
    id = data.items?.[0]?.id || null
  }
  if (!id && handle) {
    // No API key: read the id from the channel's public page (one request, when the admin adds it)
    const { data } = await axios.get(`https://www.youtube.com/@${encodeURIComponent(handle)}`, { timeout: 12_000, responseType: 'text',
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en' } })
    const ids = String(data).match(/UC[A-Za-z0-9_-]{22}/g) || []
    const counts = {}; for (const x of ids) counts[x] = (counts[x] || 0) + 1
    id = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null
  }
  if (!id) throw new Error('Couldn’t find that channel — paste its youtube.com/channel/UC… link')
  const { data: xml } = await axios.get('https://www.youtube.com/feeds/videos.xml', { params: { channel_id: id }, timeout: 12_000, responseType: 'text' })
  const name = String(xml).match(/<title>([^<]*)<\/title>/)?.[1]?.trim()
  if (!name) throw new Error('That channel has no public feed')
  return { id, name }
}

// POST /api/admin/official/channels { input, mode }
exports.addChannel = async (req, res) => {
  try {
    const ch = await resolveChannel(req.body.input)
    const list = await service.channels()
    if (list.some(c => c.id === ch.id)) return res.status(400).json({ message: `${ch.name} is already on the list` })
    const next = [...list, { ...ch, mode: req.body.mode === 'mixed' ? 'mixed' : 'episodes' }]
    await service.saveChannels(next)
    service.run().catch(() => {})
    res.json({ channels: next })
  } catch (e) { res.status(400).json({ message: e.message }) }
}

// PUT /api/admin/official/channels/:id { mode }
exports.updateChannel = async (req, res) => {
  const list = (await service.channels()).map(c => (c.id === req.params.id ? { ...c, mode: req.body.mode === 'mixed' ? 'mixed' : 'episodes' } : c))
  await service.saveChannels(list)
  res.json({ channels: list })
}

// DELETE /api/admin/official/channels/:id — also removes its videos
exports.removeChannel = async (req, res) => {
  const list = (await service.channels()).filter(c => c.id !== req.params.id)
  await service.saveChannels(list)
  await OfficialVideo.deleteMany({ channelId: req.params.id })
  showsCache.at = 0
  res.json({ channels: list })
}

// POST /api/admin/official/sync → runs now (in the background)
exports.sync = async (_req, res) => {
  service.run().then(() => { showsCache.at = 0 }).catch(() => {})
  res.json({ started: true })
}

// PUT /api/admin/official/series { key, tmdbId } | { key, ignore: true }
exports.decideSeries = async (req, res) => {
  const key = String(req.body.key || '')
  const s = await OfficialSeries.findOne({ key })
  if (!s) return res.status(404).json({ message: 'Not found' })
  if (req.body.ignore) {
    s.status = 'ignored'; s.decidedBy = 'admin'
  } else {
    const id = Number(req.body.tmdbId)
    const d = Number.isInteger(id) ? await cachedTmdb(`/tv/${id}`).catch(() => null) : null
    if (!d?.id) return res.status(400).json({ message: 'TMDB series not found' })
    Object.assign(s, { status: 'linked', mediaType: 'tv', tmdbId: d.id, tmdbTitle: d.name, decidedBy: 'admin', confidence: 1 })
    require('../utils/mediaMatcher').learn(s.title, { mediaType: 'tv', tmdbId: d.id, title: d.name }).catch?.(() => {})
  }
  await s.save()
  await OfficialVideo.updateMany({ seriesKey: key, status: 'review' }, { status: 'pending' })
  const linked = await service.placeSeries(s.toObject())
  showsCache.at = 0
  res.json({ status: s.status, linked: linked.length })
}
