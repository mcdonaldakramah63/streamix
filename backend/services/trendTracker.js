// services/trendTracker.js — keeps New & Hot fresh on its own.
// Every 30 minutes: snapshot TMDB's charts, read this server's recent activity, score everything
// (utils/trendEngine.js), and if the lists changed, tell every open app over the WebSocket.
const { tmdb } = require('../config/tmdb')
const TrendSnapshot = require('../models/TrendSnapshot')
const ViewEvent = require('../models/ViewEvent')
const Profile = require('../models/Profile')
const trend = require('../utils/trendEngine')

const EVERY = 30 * 60 * 1000
let current = null   // { at, version, titles: Map(key → title), lists: { everyone: [...], ... } }
let running = null

/** One page of a TMDB chart → titles with their rank on that chart */
async function chart(path, type, pages = [1]) {
  const out = []
  for (const page of pages) {
    // Fresh data every run (not the 6-hour TMDB cache)
    // (one retry: TMDB occasionally drops a request when many go out at once)
    const fetchOnce = () => tmdb.get(path, { params: { page } }).then(r => r.data)
    const d = await fetchOnce().catch(() => new Promise(r => setTimeout(r, 1500)).then(fetchOnce)).catch(() => null)
    for (const [i, r] of (d?.results || []).entries()) {
      const t = type || (r.media_type === 'tv' ? 'tv' : 'movie')
      if (r.adult || !r.poster_path || (r.media_type && !['movie', 'tv'].includes(r.media_type))) continue
      out.push({ key: `${t}:${r.id}`, type: t, id: r.id, rank: (page - 1) * 20 + i + 1, r })
    }
  }
  return out
}

/** Kid-safe charts: popular G/PG films and kids' / family series */
async function collectKids() {
  const [km, kt, kf] = await Promise.all([
    chart('/discover/movie?certification_country=US&certification.lte=PG&sort_by=popularity.desc&vote_count.gte=20', 'movie', [1, 2]),
    chart('/discover/tv?with_genres=10762&sort_by=popularity.desc', 'tv', [1, 2]),
    chart('/discover/tv?with_genres=10751|16&without_genres=80,18,9648,10768&sort_by=popularity.desc&vote_count.gte=30', 'tv', [1]),
  ])
  const titles = new Map()
  for (const c of [...km, ...kt, ...kf]) {
    if (titles.has(c.key)) continue
    titles.set(c.key, { key: c.key, type: c.type, id: c.id, title: c.r.title || c.r.name, pop: c.r.popularity || 0, rank: null,
      voteAverage: c.r.vote_average || 0, voteCount: c.r.vote_count || 0, date: c.type === 'tv' ? c.r.first_air_date : c.r.release_date,
      poster_path: c.r.poster_path, backdrop_path: c.r.backdrop_path, overview: c.r.overview, genre_ids: c.r.genre_ids || [], original_language: c.r.original_language })
  }
  return titles
}

async function collect() {
  const [tm, tt, np, pm, ot] = await Promise.all([
    chart('/trending/movie/day', 'movie', [1, 2, 3]),
    chart('/trending/tv/day', 'tv', [1, 2, 3]),
    chart('/movie/now_playing', 'movie', [1, 2]),
    chart('/movie/popular', 'movie', [1]),
    chart('/tv/on_the_air', 'tv', [1]),
  ])
  const titles = new Map()
  for (const c of [...tm, ...tt, ...np, ...pm, ...ot]) {
    const prev = titles.get(c.key)
    const fromTrending = tm.includes(c) || tt.includes(c)
    const t = prev || {
      key: c.key, type: c.type, id: c.id, title: c.r.title || c.r.name, pop: c.r.popularity || 0,
      voteAverage: c.r.vote_average || 0, voteCount: c.r.vote_count || 0, date: c.type === 'tv' ? c.r.first_air_date : c.r.release_date,
      poster_path: c.r.poster_path, backdrop_path: c.r.backdrop_path, overview: c.r.overview, genre_ids: c.r.genre_ids || [],
      original_language: c.r.original_language, rank: null,
    }
    if (fromTrending && (!t.rank || c.rank < t.rank)) t.rank = c.rank // rank = position on the daily trending chart
    t.pop = Math.max(t.pop, c.r.popularity || 0)
    titles.set(c.key, t)
  }
  return titles
}

/** Plays, completions, views and trailers on this server in the last week */
async function serverEvents(now) {
  const since = new Date(now - 7 * 24 * 3600 * 1000)
  const [events, history] = await Promise.all([
    ViewEvent.find({ at: { $gte: since } }).select('kind mediaType tmdbId at -_id').lean().catch(() => []),
    Profile.aggregate([
      { $unwind: '$watchHistory' },
      { $match: { 'watchHistory.watchedAt': { $gte: since } } },
      { $project: { _id: 0, id: '$watchHistory.tmdbId', type: '$watchHistory.type', at: '$watchHistory.watchedAt', done: '$watchHistory.completed' } },
    ]).catch(() => []),
  ])
  return [
    ...events.map(e => ({ key: `${e.mediaType}:${e.tmdbId}`, kind: e.kind, at: e.at })),
    ...history.map(h => ({ key: `${h.type === 'movie' ? 'movie' : 'tv'}:${h.id}`, kind: h.done ? 'complete' : 'play', at: h.at })),
  ]
}

async function refresh() {
  if (running) return running
  running = (async () => {
    const now = Date.now()
    const titles = await collect()
    if (!titles.size) return current
    // A run that lost a chunk of the charts (TMDB hiccup) would publish worse lists: keep the last good ones
    if (current && titles.size < 0.75 * current.titles.size && Date.now() - current.at.getTime() < 3 * EVERY) {
      console.warn(`[trends] only ${titles.size} titles this run (had ${current.titles.size}) — keeping the previous lists`)
      return current
    }
    const snapItems = Object.fromEntries([...titles.values()].map(t => [t.key, { pop: t.pop, rank: t.rank }]))
    await TrendSnapshot.create({ at: new Date(now), items: snapItems }).catch(() => {})

    const snaps = await TrendSnapshot.find({ at: { $gte: new Date(now - 40 * 3600 * 1000), $lte: new Date(now - 4 * 3600 * 1000) } }).select('at').lean().catch(() => [])
    const ref = trend.snapshotAround(snaps, now, 24, 4)
    const prev = ref ? await TrendSnapshot.findById(ref._id).lean().catch(() => null) : null
    const mom = trend.momentum({ items: snapItems }, prev, prev ? (now - new Date(prev.at).getTime()) / 3600000 : 24)
    const heat = trend.localHeat(await serverEvents(now), now)

    const scored = trend.scoreAll([...titles.values()], { mom, heat, now })
    const l = trend.lists(scored, { now })
    // Kids profiles get their own lists from kid-safe charts (the global charts are mostly grown-up)
    const kidsTitles = await collectKids().catch(() => new Map())
    for (const [k, t] of kidsTitles) if (snapItems[k] === undefined) snapItems[k] = { pop: t.pop, rank: null }
    const kidsScored = trend.scoreAll([...kidsTitles.values()], { mom, heat, now })
    const kidsLists = trend.lists(kidsScored, { now })
    const version = trend.version(l)
    const changed = !current || current.version !== version
    current = { at: new Date(now), version, titles: new Map(scored.map(t => [t.key, t])), lists: l, kidsLists, hasMomentum: !!prev }
    if (changed) {
      try { require('../websocket').broadcastAll({ type: 'CATALOG_UPDATED', version, at: current.at }) } catch { /* no socket server */ }
    }
    console.log(`[trends] ${titles.size} titles, momentum ${prev ? 'vs ' + Math.round((now - new Date(prev.at).getTime()) / 3600000) + 'h ago' : 'not yet (first day)'}, ${changed ? 'lists changed' : 'no change'}`)
    return current
  })().finally(() => { running = null })
  return running
}

/** The latest lists (refreshing first if they're older than the interval) */
async function get() {
  if (!current || Date.now() - current.at.getTime() > EVERY + 60_000) await refresh()
  return current
}

function start() {
  setTimeout(() => refresh().catch(e => console.warn('[trends] failed:', e.message)), 20_000).unref()
  setInterval(() => refresh().catch(e => console.warn('[trends] failed:', e.message)), EVERY).unref()
}

module.exports = { start, get, refresh }
