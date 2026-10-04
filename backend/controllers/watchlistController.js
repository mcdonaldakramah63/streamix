// backend/controllers/watchlistController.js
const Watchlist = require('../models/Watchlist')
// Recommendations for every profile on the account should notice this
const refreshRecs = (userId) => require('../models/Profile').find({ user: userId }).select('_id').lean()
  .then(ps => ps.forEach(p => require('./recommendController').invalidate(p._id))).catch(() => {})


// Text from the browser: strings only, length-capped; images must be http(s) or a TMDB path
const text = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '')
const image = (v) => (typeof v === 'string' && /^(https?:\/\/|\/)[^\s"'<>]{0,400}$/.test(v) ? v : '')

// ── GET /api/watchlist ────────────────────────────────────────────────────────
exports.getWatchlist = async (req, res) => {
  try {
    const items = await Watchlist.find({ user: req.user._id }).sort({ addedAt: -1 }).lean()
    res.json(items)
  } catch (e) {
    res.status(500).json({ message: 'Something went wrong' })
  }
}

// ── POST /api/watchlist ───────────────────────────────────────────────────────
exports.addToWatchlist = async (req, res) => {
  try {
    const { movieId, title, poster, backdrop, rating, year, type } = req.body
    if (!Number.isInteger(Number(movieId)) || Number(movieId) <= 0 || !text(title, 300)) return res.status(400).json({ message: 'movieId and title required' })
    if (await Watchlist.countDocuments({ user: req.user._id }) >= 2000) return res.status(400).json({ message: 'My List is full' })

    const item = await Watchlist.findOneAndUpdate(
      { user: req.user._id, movieId: Number(movieId) },
      {
        user:     req.user._id,
        movieId:  Number(movieId),
        title:    text(title, 300),
        poster:   image(poster),
        backdrop: image(backdrop),
        rating:   Math.min(10, Math.max(0, Number(rating) || 0)),
        year:     text(year, 10),
        type:     type === 'tv' ? 'tv' : 'movie',
        addedAt:  new Date(),
      },
      { upsert: true, new: true, runValidators: true }
    )
    refreshRecs(req.user._id)
    res.status(201).json(item)
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ message: 'Already in watchlist' })
    res.status(500).json({ message: 'Something went wrong' })
  }
}

// ── DELETE /api/watchlist/:movieId ────────────────────────────────────────────
exports.removeFromWatchlist = async (req, res) => {
  try {
    const result = await Watchlist.findOneAndDelete({
      user:    req.user._id,
      movieId: Number(req.params.movieId),
    })
    if (!result) return res.status(404).json({ message: 'Not in watchlist' })
    res.json({ message: 'Removed' })
  } catch (e) {
    res.status(500).json({ message: 'Something went wrong' })
  }
}
