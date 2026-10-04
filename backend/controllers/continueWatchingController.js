// backend/controllers/continueWatchingController.js
const User = require('../models/User')

// Text from the browser: strings only, length-capped; images must be http(s) or a TMDB path
const text = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '')
const image = (v) => (typeof v === 'string' && /^(https?:\/\/|\/)[^\s"'<>]{0,400}$/.test(v) ? v : '')
const num = (v) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v))

// ── GET /api/users/continue-watching ─────────────────────────────────────
const getAll = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('continueWatching')
    if (!user) return res.status(404).json({ message: 'User not found' })

    const sorted = [...(user.continueWatching || [])].sort(
      (a, b) => new Date(b.watchedAt) - new Date(a.watchedAt)
    )
    // Finished episodes become "Up next", finished movies drop off (utils/continueWatching.js)
    res.json(await require('../utils/continueWatching').smartRow(sorted))
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
      progress, timestamp, duration, durationMins,
    } = req.body

    if (!Number.isInteger(Number(movieId)) || Number(movieId) <= 0 || !text(title, 300)) {
      return res.status(400).json({ message: 'movieId and title required' })
    }

    const user = await User.findById(req.user._id)
    if (!user) return res.status(404).json({ message: 'User not found' })

    user.continueWatching = (user.continueWatching || []).filter(
      item => Number(item.movieId) !== Number(movieId)
    )

    user.continueWatching.unshift({
      movieId:      Number(movieId),
      title:        text(title, 300),
      poster:       image(poster),
      backdrop:     image(backdrop),
      type:         type === 'tv' ? 'tv' : 'movie',
      season:       num(season),
      episode:      num(episode),
      episodeName:  text(episodeName, 200),
      progress:     Math.min(Math.max(num(progress) ?? 0, 0), 100),
      timestamp:    Math.max(num(timestamp) ?? 0, 0),
      duration:     num(duration),
      durationMins: num(durationMins),
      watchedAt:    new Date(),
    })

    user.continueWatching = user.continueWatching.slice(0, 20)
    await user.save()
    res.json({ success: true })
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

    await User.updateOne({ _id: req.user._id }, { $pull: { continueWatching: { movieId } } })
    res.json({ success: true })
  } catch (err) {
    console.error('[CW remove]', err.message)
    res.status(500).json({ message: 'Server error' })
  }
}

module.exports = { getAll, save, remove }
