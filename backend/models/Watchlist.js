// backend/models/Watchlist.js — one document per (user, title)
const mongoose = require('mongoose')

const watchlistSchema = new mongoose.Schema({
  user:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  movieId:  { type: Number, required: true },
  title:    { type: String, required: true },
  poster:   { type: String, default: '' },
  backdrop: { type: String, default: '' },
  rating:   { type: Number, default: 0 },
  year:     { type: String, default: '' },
  type:     { type: String, enum: ['movie', 'tv'], default: 'movie' },
  addedAt:  { type: Date, default: Date.now },
}, { timestamps: true })

watchlistSchema.index({ user: 1, movieId: 1 }, { unique: true })
watchlistSchema.index({ user: 1, addedAt: -1 })

module.exports = mongoose.models.Watchlist || mongoose.model('Watchlist', watchlistSchema)
