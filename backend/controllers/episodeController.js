// controllers/episodeController.js — per-profile episode progress + the "Coming up" calendar
const mongoose = require('mongoose')
const Profile = require('../models/Profile')
const EpisodeProgress = require('../models/EpisodeProgress')
const Watchlist = require('../models/Watchlist')
const User = require('../models/User')
const { cachedTmdb } = require('../config/tmdb')

const int = (v, max) => { const n = Number(v); return Number.isInteger(n) && n >= 0 && n <= max ? n : null }

async function ownProfile(req) {
  if (!mongoose.isValidObjectId(req.params.id)) return null
  return Profile.exists({ _id: req.params.id, user: req.user._id })
}

// POST /api/profiles/:id/episodes { tmdbId, season, episode, progress }
exports.save = async (req, res) => {
  if (!(await ownProfile(req))) return res.status(404).json({ message: 'Profile not found' })
  const tmdbId = int(req.body.tmdbId, 1e9), season = int(req.body.season, 1000), episode = int(req.body.episode, 100000)
  if (tmdbId === null || season === null || episode === null) return res.status(400).json({ message: 'Invalid episode' })
  const progress = Math.min(100, Math.max(0, Math.round(Number(req.body.progress) || 0)))
  const key = { profile: req.params.id, tmdbId, season, episode }
  const prev = await EpisodeProgress.findOne(key).lean()
  await EpisodeProgress.updateOne(key, {
    $set: { user: req.user._id, progress: Math.max(progress, prev?.completed ? 100 : 0), completed: !!prev?.completed || progress >= 90 },
  }, { upsert: true })
  res.json({ ok: true })
}

// PUT /api/profiles/:id/episodes/mark { tmdbId, season, episodes: [1,2,3], watched: true }
exports.mark = async (req, res) => {
  if (!(await ownProfile(req))) return res.status(404).json({ message: 'Profile not found' })
  const tmdbId = int(req.body.tmdbId, 1e9), season = int(req.body.season, 1000)
  const eps = (Array.isArray(req.body.episodes) ? req.body.episodes : []).map(e => int(e, 100000)).filter(e => e !== null).slice(0, 500)
  if (tmdbId === null || season === null || !eps.length) return res.status(400).json({ message: 'Invalid episodes' })
  const watched = req.body.watched !== false
  await EpisodeProgress.bulkWrite(eps.map(episode => ({
    updateOne: {
      filter: { profile: req.params.id, tmdbId, season, episode },
      update: { $set: { user: req.user._id, progress: watched ? 100 : 0, completed: watched } },
      upsert: true,
    },
  })))
  res.json({ ok: true })
}

// GET /api/profiles/:id/episodes/:tmdbId → [{ season, episode, progress, completed }]
exports.list = async (req, res) => {
  if (!(await ownProfile(req))) return res.status(404).json({ message: 'Profile not found' })
  const tmdbId = int(req.params.tmdbId, 1e9)
  if (tmdbId === null) return res.status(400).json({ message: 'Invalid id' })
  const rows = await EpisodeProgress.find({ profile: req.params.id, tmdbId }).select('season episode progress completed -_id').lean()
  res.json(rows)
}

// GET /api/users/upcoming → episodes airing soon (and new this week) for shows you follow
exports.upcoming = async (req, res) => {
  const [list, user] = await Promise.all([
    Watchlist.find({ user: req.user._id, type: 'tv' }).select('movieId').lean(),
    User.findById(req.user._id).select('continueWatching.movieId continueWatching.type').lean(),
  ])
  const ids = [...new Set([...list.map(w => w.movieId), ...(user?.continueWatching || []).filter(c => c.type === 'tv').map(c => c.movieId)])].slice(0, 60)

  const DAY = 86400000
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const shows = await Promise.all(ids.map(id => cachedTmdb(`/tv/${id}`).catch(() => null)))
  const upcoming = [], recent = []
  for (const d of shows) {
    if (!d) continue
    const base = { showId: d.id, name: d.name, poster: d.poster_path ? `https://image.tmdb.org/t/p/w342${d.poster_path}` : '', backdrop: d.backdrop_path ? `https://image.tmdb.org/t/p/w780${d.backdrop_path}` : '' }
    const next = d.next_episode_to_air
    if (next?.air_date) {
      const t = new Date(next.air_date + 'T12:00:00').getTime()
      if (t >= today.getTime() && t - today.getTime() <= 90 * DAY) {
        upcoming.push({ ...base, season: next.season_number, episode: next.episode_number, episodeName: next.name || '', airDate: next.air_date })
      }
    }
    const last = d.last_episode_to_air
    if (last?.air_date) {
      const t = new Date(last.air_date + 'T12:00:00').getTime()
      if (today.getTime() - t <= 7 * DAY && t <= Date.now()) {
        recent.push({ ...base, season: last.season_number, episode: last.episode_number, episodeName: last.name || '', airDate: last.air_date })
      }
    }
  }
  upcoming.sort((a, b) => a.airDate.localeCompare(b.airDate))
  recent.sort((a, b) => b.airDate.localeCompare(a.airDate))
  res.json({ upcoming, recent, following: ids.length })
}
