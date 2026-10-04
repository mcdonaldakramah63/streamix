// controllers/newHotController.js — New & Hot from the trend tracker (services/trendTracker.js),
// optionally re-ranked for a profile. Lists refresh every 30 minutes on the server; apps are told when they change.
const mongoose = require('mongoose')
const Profile = require('../models/Profile')
const tracker = require('../services/trendTracker')
const trend = require('../utils/trendEngine')
const engine = require('../utils/tasteEngine')
const disc = require('../utils/discoveryEngine')

const card = (t, listName) => ({
  id: t.id, media_type: t.type, title: t.type === 'movie' ? t.title : undefined, name: t.type === 'tv' ? t.title : undefined,
  poster_path: t.poster_path, backdrop_path: t.backdrop_path, overview: t.overview, genre_ids: t.genre_ids,
  vote_average: t.voteAverage, vote_count: t.voteCount, original_language: t.original_language,
  release_date: t.type === 'movie' ? t.date : undefined, first_air_date: t.type === 'tv' ? t.date : undefined, date: t.date,
  reason: trend.reason(t, listName), hot: Math.round(t.hot * 1000) / 1000, momentum: Math.round(t.momentum * 100) / 100,
})

function shape(cur, lists = cur.lists) {
  return {
    updatedAt: cur.at, version: cur.version, hasMomentum: cur.hasMomentum,
    everyone: lists.everyone.map(t => card(t, 'everyone')),
    rising: lists.rising.map(t => card(t, 'rising')),
    justReleased: lists.justReleased.map(t => card(t, 'justReleased')),
    top10Movies: lists.top10Movies.map(t => card(t, 'top10')),
    top10Tv: lists.top10Tv.map(t => card(t, 'top10')),
  }
}

// GET /api/movies/new-hot → the lists for everyone
exports.publicLists = async (_req, res) => {
  const cur = await tracker.get()
  if (!cur) return res.status(503).json({ message: 'Trends are warming up — try again in a minute' })
  res.json(shape(cur))
}

// GET /api/movies/top10 (replaces the raw TMDB slice): Top 10 by hotness
exports.top10 = async (req, res, next) => {
  try {
    const cur = await tracker.get()
    if (!cur) return next()
    res.json({ movies: cur.lists.top10Movies.map(t => card(t, 'top10')), tv: cur.lists.top10Tv.map(t => card(t, 'top10')), updatedAt: cur.at })
  } catch { next() }
}

// GET /api/profiles/:id/new-hot → the same lists, re-ranked for this profile (taste 30%, hotness 70%),
// minus "Not for me" and anything they've finished; plus their personal Coming Soon
exports.forProfile = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Profile not found' })
  const profile = await Profile.findOne({ _id: req.params.id, user: req.user._id })
  if (!profile) return res.status(404).json({ message: 'Profile not found' })
  const cur = await tracker.get()
  if (!cur) return res.status(503).json({ message: 'Trends are warming up — try again in a minute' })

  const { tasteFor } = require('./recommendController')._internals
  const ctx = await tasteFor(profile, req.user)
  const hidden = new Set([...(profile.hiddenTitles || []), ...(profile.blockedTitles || [])])
  const finished = new Set((profile.watchHistory || []).filter(h => h.completed || (h.progress || 0) >= 90).map(h => `${h.type === 'movie' ? 'movie' : 'tv'}:${h.tmdbId}`))
  const personal = (list) => {
    const kept = list.filter(t => !hidden.has(t.key) && !finished.has(t.key))
    const maxHot = Math.max(0.01, ...kept.map(t => t.hot))
    return kept.map(t => {
      const s = engine.scoreCandidate({ ...t, genres: t.genre_ids, lang: t.original_language, year: Number((t.date || '').slice(0, 4)) || null, sources: {} }, ctx.taste, {})
      return { ...t, rank2: 0.7 * (t.hot / maxHot) + 0.3 * disc.relevance(s.score) }
    }).sort((a, b) => b.rank2 - a.rank2)
  }
  // Kids: lists built from kid-safe charts
  const L = profile.isKids && cur.kidsLists ? cur.kidsLists : cur.lists
  const lists = {
    everyone: personal(L.everyone), rising: personal(L.rising), justReleased: personal(L.justReleased),
    // Top 10s stay a true chart (just without what they've hidden)
    top10Movies: L.top10Movies.filter(t => !hidden.has(t.key)), top10Tv: L.top10Tv.filter(t => !hidden.has(t.key)),
  }
  // Kids & maturity limits
  if (profile.isKids || (profile.prefs?.maturity && profile.prefs.maturity !== 'all')) {
    const { levelFor } = require('./movieController')
    const limit = profile.isKids ? '7' : profile.prefs.maturity
    const ORDER = ['7', '13', '16', 'all']
    const all = [...new Map(Object.values(lists).flat().map(t => [t.key, t])).values()]
    const lv = await Promise.all(all.map(t => levelFor(t.type, t.id).catch(() => null)))
    const ok = new Set(all.filter((t, i) => lv[i] ? ORDER.indexOf(lv[i]) <= ORDER.indexOf(limit) : !profile.isKids || (t.genre_ids || []).some(g => [10751, 10762].includes(g))).map(t => t.key))
    for (const k of Object.keys(lists)) lists[k] = lists[k].filter(t => ok.has(t.key))
  }
  res.json(shape(cur, lists))
}
