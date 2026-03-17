// backend/controllers/continueWatchingController.js — FULL REPLACEMENT
const User = require('../models/User')

// ── GET /api/users/continue-watching ─────────────────────────────────────
const getAll = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('continueWatching')
    if (!user) return res.status(404).json({ message: 'User not found' })

    // Return newest-first
    const sorted = [...(user.continueWatching || [])].sort(
      (a, b) => new Date(b.watchedAt) - new Date(a.watchedAt)
    )
    res.json(sorted)
  } catch (err) {
    console.error('[CW getAll]', err.message)
    res.status(500).json({ message: 'Server error' })
  }
}

// ── POST /api/users/continue-watching ────────────────────────────────────
const save = async (req, res) => {
  try {
    const {
      movieId, title, poster, backdrop,
      type, season, episode, episodeName,
      progress, durationMins,
    } = req.body

    if (!movieId || !title) {
      return res.status(400).json({ message: 'movieId and title required' })
    }

    const user = await User.findById(req.user._id)
    if (!user) return res.status(404).json({ message: 'User not found' })

    // Remove old entry for same movie
    user.continueWatching = (user.continueWatching || []).filter(
      item => Number(item.movieId) !== Number(movieId)
    )

    // Add new entry at front
    user.continueWatching.unshift({
      movieId:     Number(movieId),
      title:       String(title),
      poster:      poster       || '',
      backdrop:    backdrop     || '',
      type:        type         || 'movie',
      season:      season       != null ? Number(season)      : null,
      episode:     episode      != null ? Number(episode)     : null,
      episodeName: episodeName  || '',
      progress:    progress     != null ? Number(progress)    : 0,
      durationMins:durationMins != null ? Number(durationMins): null,
      watchedAt:   new Date(),
    })

    // Keep max 20
    user.continueWatching = user.continueWatching.slice(0, 20)

    await user.save()
    res.json({ success: true, items: user.continueWatching })
  } catch (err) {
    console.error('[CW save]', err.message)
    res.status(500).json({ message: 'Server error' })
  }
}

// ── DELETE /api/users/continue-watching/:movieId ──────────────────────────
const remove = async (req, res) => {
  try {
    const movieId = Number(req.params.movieId)
    if (isNaN(movieId)) return res.status(400).json({ message: 'Invalid movieId' })

    const user = await User.findById(req.user._id)
    if (!user) return res.status(404).json({ message: 'User not found' })

    user.continueWatching = (user.continueWatching || []).filter(
      item => Number(item.movieId) !== movieId
    )
    await user.save()
    res.json({ success: true })
  } catch (err) {
    console.error('[CW remove]', err.message)
    res.status(500).json({ message: 'Server error' })
  }
}

module.exports = { getAll, save, remove }
