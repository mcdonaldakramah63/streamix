// controllers/badgeController.js — achievement badges worked out from a profile's watch history
const mongoose = require('mongoose')
const Profile  = require('../models/Profile')

// Accounts made before this date are "Founding Members" (Streamix is free while growing)
const FOUNDING_UNTIL = new Date(process.env.FOUNDING_UNTIL || '2027-07-01')

function badgesFor(history, user) {
  const movies = history.filter(h => h.type === 'movie').length
  const anime = history.filter(h => h.type === 'anime' || ((h.genres || []).includes(16) && h.language === 'ja')).length
  const completed = history.filter(h => h.completed).length
  const genres = new Set(history.flatMap(h => h.genres || [])).size
  const night = history.filter(h => { const hr = new Date(h.watchedAt).getHours(); return hr >= 0 && hr < 4 }).length
  const perDay = {}
  for (const h of history) if (h.type !== 'movie') { const d = new Date(h.watchedAt).toISOString().slice(0, 10); perDay[d] = (perDay[d] || 0) + 1 }
  const bestDay = Math.max(0, ...Object.values(perDay))
  const languages = new Set(history.map(h => h.language).filter(Boolean)).size

  const b = (id, emoji, name, description, value, goal) => ({ id, emoji, name, description, earned: value >= goal, progress: Math.min(value, goal), goal })
  return [
    { id: 'founder', emoji: '🌱', name: 'Founding Member', description: 'Joined while Streamix was brand new and free',
      earned: !!user.createdAt && new Date(user.createdAt) < FOUNDING_UNTIL, progress: 1, goal: 1 },
    b('first',     '🎬', 'First Watch',    'Watched your first title',              history.length, 1),
    b('buff',      '🍿', 'Movie Buff',     'Watched 25 movies',                     movies, 25),
    b('binge',     '📺', 'Binge Watcher',  'Watched 5 episodes in one day',         bestDay, 5),
    b('anime',     '🍥', 'Anime Fan',      'Watched 10 anime',                      anime, 10),
    b('finisher',  '✅', 'Finisher',       'Finished 10 titles',                    completed, 10),
    b('explorer',  '🧭', 'Explorer',       'Watched 10 different genres',           genres, 10),
    b('world',     '🌍', 'World Traveller','Watched titles in 5 languages',         languages, 5),
    b('night',     '🌙', 'Night Owl',      'Watched 5 times after midnight',        night, 5),
  ]
}

// GET /api/profiles/:id/badges
exports.badges = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Profile not found' })
  const p = await Profile.findOne({ _id: req.params.id, user: req.user._id }).select('watchHistory').lean()
  if (!p) return res.status(404).json({ message: 'Profile not found' })
  const list = badgesFor(p.watchHistory || [], req.user)
  res.json({ badges: list, earned: list.filter(x => x.earned).length })
}

exports._test = { badgesFor }
