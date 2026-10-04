// services/officialAnime.js — keeps the catalogue of free, official anime episodes on YouTube up to date.
//
// Every 2 hours, for each official channel:
//   • Without a YouTube API key: the channel's public feed (its latest ~15 uploads). The catalogue grows as
//     channels publish.
//   • With YOUTUBE_API_KEY (free, Google Cloud): the channel's whole upload history once (resumable, about
//     2 quota units per 50 videos), then only new uploads; plus each video's length, whether it may be embedded,
//     and its region list (YOUTUBE_REGION, e.g. KE) — so clips and videos that can't play here are left out.
// New videos are classified (utils/officialAnime), grouped by series, each series matched to TMDB once with the
// library's matcher (utils/mediaMatcher, incl. AniList names), and episodes placed by number. Unsure series go to
// the admin's review list. Newly published episodes notify the show's followers.
const axios = require('axios')
const settings = require('../utils/settings')
const o = require('../utils/officialAnime')
const matcher = require('../utils/mediaMatcher')
const { cachedTmdb } = require('../config/tmdb')
const OfficialVideo = require('../models/OfficialVideo')
const OfficialSeries = require('../models/OfficialSeries')

const KEY = () => process.env.YOUTUBE_API_KEY || ''
const REGION = () => String(process.env.YOUTUBE_REGION || '').toUpperCase()
const yt = axios.create({ baseURL: 'https://www.googleapis.com/youtube/v3', timeout: 15_000 })
const MAX_NEW_SERIES_PER_RUN = 40
const BACKFILL_PAGES_PER_RUN = 60 // 3 000 videos per channel per run; the rest continues next time

let running = null
let lastRun = null

async function channels() {
  const c = await settings.get('official.channels')
  return Array.isArray(c) && c.length ? c : o.DEFAULT_CHANNELS
}
async function saveChannels(list) { await settings.set('official.channels', list) }

// ── Fetching ────────────────────────────────────────────────────────────────

async function feed(channelId) {
  const { data } = await axios.get('https://www.youtube.com/feeds/videos.xml', { params: { channel_id: channelId }, timeout: 15_000, responseType: 'text' })
  return o.parseFeed(data)
}

/** One page of a channel's uploads via the API → { items, next } */
async function uploadsPage(channelId, pageToken) {
  const { data } = await yt.get('/playlistItems', { params: {
    key: KEY(), part: 'snippet,contentDetails', maxResults: 50, playlistId: `UU${channelId.slice(2)}`, ...(pageToken ? { pageToken } : {}),
  } })
  return {
    items: (data.items || []).map(i => ({ videoId: i.contentDetails?.videoId, title: i.snippet?.title, published: i.contentDetails?.videoPublishedAt ? new Date(i.contentDetails.videoPublishedAt) : null }))
      .filter(i => i.videoId && i.title && i.title !== 'Private video' && i.title !== 'Deleted video'),
    next: data.nextPageToken || null,
  }
}

/** Length / embeddable / region for up to 50 ids */
async function details(ids) {
  const out = new Map()
  for (let i = 0; i < ids.length; i += 50) {
    const { data } = await yt.get('/videos', { params: { key: KEY(), part: 'contentDetails,status', id: ids.slice(i, i + 50).join(','), maxResults: 50 } })
    for (const v of data.items || []) {
      out.set(v.id, {
        duration: o.isoDuration(v.contentDetails?.duration),
        embeddable: v.status?.embeddable !== false && v.status?.privacyStatus !== 'private',
        regionBlocked: o.regionBlocked(v.contentDetails?.regionRestriction, REGION()),
      })
    }
  }
  return out
}

/** New uploads of one channel since we last looked (or its history, a chunk per run, with an API key) */
async function collect(ch) {
  if (!KEY()) return feed(ch.id)
  const stateKey = `official.backfill.${ch.id}`
  const state = (await settings.get(stateKey)) || {}
  const found = []
  if (!state.done) {
    // Backfill: walk the whole upload history, resuming where the last run stopped
    let token = state.next || null
    for (let n = 0; n < BACKFILL_PAGES_PER_RUN; n++) {
      const page = await uploadsPage(ch.id, token)
      found.push(...page.items)
      token = page.next
      if (!token) break
    }
    await settings.set(stateKey, token ? { next: token } : { done: true, at: new Date() })
    return found
  }
  // Up to date: newest pages until we reach videos we already have
  let token = null
  for (let n = 0; n < 5; n++) {
    const page = await uploadsPage(ch.id, token)
    const known = new Set((await OfficialVideo.find({ videoId: { $in: page.items.map(i => i.videoId) } }).select('videoId').lean()).map(v => v.videoId))
    found.push(...page.items.filter(i => !known.has(i.videoId)))
    if (known.size || !page.next) break
    token = page.next
  }
  return found
}

/** Store what's new: classify each upload, skip the rest */
async function store(ch, items) {
  const known = new Set((await OfficialVideo.find({ videoId: { $in: items.map(i => i.videoId) } }).select('videoId').lean()).map(v => v.videoId))
  const fresh = items.filter(i => !known.has(i.videoId))
  if (!fresh.length) return 0
  const info = KEY() ? await details(fresh.map(f => f.videoId)).catch(() => new Map()) : new Map()
  const docs = fresh.map(f => {
    const d = info.get(f.videoId) || {}
    const clean = o.cleanTitle(f.title)
    const p = o.readTitle(f.title, matcher.parseName)
    const c = o.classify({ title: f.title, duration: d.duration ?? null, parsed: p }, ch.mode)
    return {
      videoId: f.videoId, channelId: ch.id, channelName: ch.name, title: f.title, cleanTitle: clean, publishedAt: f.published,
      duration: d.duration ?? null, embeddable: d.embeddable ?? null, regionBlocked: d.regionBlocked ?? null,
      kind: c.kind, skipReason: c.kind === 'skip' ? c.reason : '',
      parsed: { title: p.title, alt: p.alt || '', season: p.season, episode: p.episode },
      seriesKey: c.kind === 'episode' ? o.seriesKey(p) : '',
      status: c.kind === 'skip' ? 'skipped' : 'pending',
    }
  })
  await OfficialVideo.insertMany(docs, { ordered: false }).catch(e => { if (e.code !== 11000 && !e.writeErrors) throw e })
  return docs.filter(d => d.status === 'pending').length
}

// ── Matching ────────────────────────────────────────────────────────────────

const seasonsCache = new Map()
async function seasonsOf(tvId) {
  const hit = seasonsCache.get(tvId)
  if (hit && Date.now() - hit.at < 6 * 3600 * 1000) return hit.seasons
  const d = await cachedTmdb(`/tv/${tvId}`).catch(() => null)
  const seasons = (d?.seasons || []).map(s => ({ n: s.season_number, eps: s.episode_count }))
  seasonsCache.set(tvId, { at: Date.now(), seasons, name: d?.name })
  return seasons
}

/** Animation, or a Japanese / Chinese / Korean production */
async function isAnimeLike(type, id) {
  const d = await cachedTmdb(`/${type}/${id}`).catch(() => null)
  if (!d) return false
  return (d.genres || []).some(g => g.id === 16) || ['ja', 'zh', 'ko', 'cn'].includes(d.original_language)
}

/** Decide what a series is (once). → the OfficialSeries doc */
async function decideSeries(key, sample) {
  let s = await OfficialSeries.findOne({ key }).lean()
  if (s) return s
  const se = `${sample.parsed.season != null ? ` S${sample.parsed.season}` : ''} E${sample.parsed.episode ?? 1}`
  // Chinese name first (TMDB keeps it as the original title), then the English one
  let r = await matcher.identify(`${sample.parsed.title}${se}`).catch(() => null)
  if (sample.parsed.alt && !(r?.best?.mediaType === 'tv' && r.best.confidence >= 0.8)) {
    const r2 = await matcher.identify(`${sample.parsed.alt}${se}`).catch(() => null)
    if (r2?.best && (!r?.best || r2.best.confidence > r.best.confidence)) r = r2
  }
  // A brand-new episode that TMDB doesn't list yet costs the match points; the show itself may be certain.
  // Decide the series on its name alone — episodes TMDB hasn't listed simply wait (placeSeries retries them).
  for (const name of [sample.parsed.title, sample.parsed.alt].filter(Boolean)) {
    if (r?.best?.mediaType === 'tv') break
    const r3 = await matcher.identify(name).catch(() => null)
    if (r3?.best?.mediaType === 'tv') r = r3
  }
  // These channels only post anime: a live-action / documentary match is a wrong match
  let best = r?.best?.mediaType === 'tv' && await isAnimeLike('tv', r.best.tmdbId) ? r.best : null
  if (!best && r?.best) {
    for (const sug of (r.suggestions || []).filter(x => x.mediaType === 'tv' && x.confidence >= 0.8)) {
      if (await isAnimeLike('tv', sug.tmdbId)) { best = sug; break }
    }
  }
  s = await OfficialSeries.findOneAndUpdate({ key }, { $setOnInsert: {
    key, title: sample.parsed.title, season: sample.parsed.season ?? null,
    status: best ? 'linked' : 'review', mediaType: best ? 'tv' : null, tmdbId: best?.tmdbId ?? null, tmdbTitle: best?.title || '',
    confidence: best?.confidence ?? r?.suggestions?.[0]?.confidence ?? null, decidedBy: best ? (r.decidedBy === 'claude' ? 'claude' : 'model') : 'none',
    suggestions: (r?.suggestions || []).filter(x => x.mediaType === 'tv').slice(0, 5).map(x => ({ mediaType: x.mediaType, tmdbId: x.tmdbId, title: x.title, year: x.year, poster: x.poster, confidence: x.confidence })),
  } }, { upsert: true, new: true }).lean()
  return s
}

/** Place every pending episode of a linked series; returns the newly linked videos */
async function placeSeries(series) {
  const videos = await OfficialVideo.find({ seriesKey: series.key, status: { $in: ['pending', 'review'] }, kind: 'episode' }).lean()
  seasonsCache.delete(series.tmdbId) // fresh episode counts (new episodes get listed on TMDB within days)
  if (!videos.length) return []
  if (series.status === 'ignored') { await OfficialVideo.updateMany({ seriesKey: series.key, status: { $in: ['pending', 'review'] } }, { status: 'ignored' }); return [] }
  if (series.status !== 'linked') { await OfficialVideo.updateMany({ seriesKey: series.key, status: 'pending' }, { status: 'review' }); return [] }
  const seasons = await seasonsOf(series.tmdbId)
  const linked = []
  for (const v of videos) {
    const at = matcher.placeEpisode(seasons, v.parsed?.season ?? series.season ?? null, v.parsed?.episode)
    // A series matched as "season 2" (key has #s2) but episodes numbered 1..N: place them in that season
    const placed = at || (series.season != null ? matcher.placeEpisode(seasons, series.season, v.parsed?.episode) : null)
    if (!placed) {
      // Usually TMDB just hasn't listed a brand-new episode yet: try again next run; ask the admin after 2 weeks
      const old = v.publishedAt && Date.now() - new Date(v.publishedAt).getTime() > 14 * 86400000
      await OfficialVideo.updateOne({ _id: v._id }, { status: old ? 'review' : 'pending', mediaType: 'tv', tmdbId: series.tmdbId })
      continue
    }
    await OfficialVideo.updateOne({ _id: v._id }, { status: 'linked', mediaType: 'tv', tmdbId: series.tmdbId, season: placed.season, episode: placed.episode, confidence: series.confidence })
    linked.push({ ...v, tmdbId: series.tmdbId, season: placed.season, episode: placed.episode })
  }
  return linked
}

async function matchMovies() {
  const movies = await OfficialVideo.find({ status: 'pending', kind: 'movie' }).limit(30).lean()
  const linked = []
  for (const v of movies) {
    const r = await matcher.identify(`${v.parsed?.title || v.cleanTitle} (movie)`).catch(() => null)
    const best = r?.best?.mediaType === 'movie' && await isAnimeLike('movie', r.best.tmdbId) ? r.best : null
    await OfficialVideo.updateOne({ _id: v._id }, best
      ? { status: 'linked', mediaType: 'movie', tmdbId: best.tmdbId, confidence: best.confidence }
      : { status: 'review' })
    if (best) linked.push({ ...v, mediaType: 'movie', tmdbId: best.tmdbId })
  }
  return linked
}

async function matchPending() {
  const keys = await OfficialVideo.distinct('seriesKey', { status: 'pending', kind: 'episode', seriesKey: { $ne: '' } })
  const linked = []
  let decided = 0
  for (const key of keys) {
    let series = await OfficialSeries.findOne({ key }).lean()
    if (!series) {
      if (decided >= MAX_NEW_SERIES_PER_RUN) continue // the rest next run (keeps TMDB/AniList load gentle)
      const sample = await OfficialVideo.findOne({ seriesKey: key, status: 'pending' }).sort({ 'parsed.episode': 1 }).lean()
      series = await decideSeries(key, sample)
      decided++
    }
    linked.push(...await placeSeries(series))
  }
  linked.push(...await matchMovies())
  return linked
}

/** Followers hear about episodes published in the last 3 days (not the back catalogue) */
async function announce(linked) {
  const recent = linked.filter(v => v.publishedAt && Date.now() - new Date(v.publishedAt).getTime() < 3 * 86400000)
  if (!recent.length) return
  const items = []
  for (const v of recent) {
    const name = v.mediaType === 'movie' ? v.parsed?.title : (seasonsCache.get(v.tmdbId)?.name || v.parsed?.title)
    items.push({ _id: `yt-${v.videoId}`, mediaType: v.mediaType || 'tv', tmdbId: v.tmdbId, season: v.season, episode: v.episode, title: name, tmdbTitle: name })
  }
  await require('../utils/jobs').libraryAdded(items).catch(e => console.warn('[official] notify:', e.message))
}

// ── Run ─────────────────────────────────────────────────────────────────────

async function run() {
  if (running) return running
  running = (async () => {
    const summary = { at: new Date(), channels: [], linked: 0, errors: [] }
    for (const ch of await channels()) {
      try {
        const items = await collect(ch)
        const added = await store(ch, items)
        summary.channels.push({ id: ch.id, name: ch.name, seen: items.length, added })
      } catch (e) {
        const msg = e.response?.data?.error?.message || e.message
        summary.errors.push(`${ch.name}: ${msg}`)
      }
    }
    try {
      const linked = await matchPending()
      summary.linked = linked.length
      await announce(linked)
    } catch (e) { summary.errors.push(`matching: ${e.message}`) }
    lastRun = summary
    await settings.set('official.lastRun', summary).catch(() => {})
    if (summary.linked || summary.errors.length) console.log(`[official] ${summary.linked} episode(s) linked${summary.errors.length ? ` · ${summary.errors.join('; ')}` : ''}`)
    return summary
  })().finally(() => { running = null })
  return running
}

function start() {
  const tick = () => { if (require('mongoose').connection.readyState === 1) run().catch(e => console.warn('[official]', e.message)) }
  setTimeout(tick, 3 * 60_000).unref()
  setInterval(tick, 2 * 3600_000).unref()
}

module.exports = { start, run, channels, saveChannels, feed, placeSeries, seasonsOf, status: () => ({ running: !!running, lastRun }), _test: { store, collect } }
