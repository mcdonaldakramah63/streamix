// backend/controllers/watchlistController.js — FULL REPLACEMENT
const mongoose = require('mongoose')

// ── Watchlist model ───────────────────────────────────────────────────────────
const watchlistSchema = new mongoose.Schema({
  user:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  movieId:  { type: Number, required: true },
  title:    { type: String, required: true },
  poster:   { type: String, default: '' },
  backdrop: { type: String, default: '' },
  rating:   { type: Number, default: 0 },
  year:     { type: String, default: '' },
  type:     { type: String, enum: ['movie','tv'], default: 'movie' },
  addedAt:  { type: Date, default: Date.now },
}, { timestamps: true })

watchlistSchema.index({ user: 1, movieId: 1 }, { unique: true })
watchlistSchema.index({ user: 1, addedAt: -1 })

const Watchlist = mongoose.models.Watchlist || mongoose.model('Watchlist', watchlistSchema)

// ── GET /api/watchlist ────────────────────────────────────────────────────────
exports.getWatchlist = async (req, res) => {
  try {
    const items = await Watchlist.find({ user: req.user._id })
      .sort({ addedAt: -1 })
      .lean()
    res.json(items)
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
}

// ── POST /api/watchlist ───────────────────────────────────────────────────────
exports.addToWatchlist = async (req, res) => {
  try {
    const { movieId, title, poster, backdrop, rating, year, type = 'movie' } = req.body
    if (!movieId || !title) return res.status(400).json({ message: 'movieId and title required' })

    const item = await Watchlist.findOneAndUpdate(
      { user: req.user._id, movieId: Number(movieId) },
      {
        user:     req.user._id,
        movieId:  Number(movieId),
        title,
        poster:   poster   || '',
        backdrop: backdrop || '',
        rating:   Number(rating) || 0,
        year:     year     || '',
        type,
        addedAt:  new Date(),
      },
      { upsert: true, new: true }
    )
    res.status(201).json(item)
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ message: 'Already in watchlist' })
    res.status(500).json({ message: e.message })
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
    res.status(500).json({ message: e.message })
  }
}
