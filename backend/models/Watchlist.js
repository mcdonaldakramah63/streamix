// backend/models/Watchlist.js — FIXED (prevents OverwriteModelError forever)
const mongoose = require('mongoose');

const watchlistSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  items: [{
    contentId: String,        // TMDB or anime ID
    type: { type: String, enum: ['movie', 'tv', 'anime'] },
    addedAt: { type: Date, default: Date.now },
    title: String,            // optional cache from TMDB
    poster: String,
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Prevent overwrite error — use existing model if already compiled
const Watchlist = mongoose.models.Watchlist || mongoose.model('Watchlist', watchlistSchema);

module.exports = Watchlist;