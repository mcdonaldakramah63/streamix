// backend/models/Watchlist.js — FIXED FOR RAILWAY FREE TIER (prevents OverwriteModelError)
const mongoose = require('mongoose');

const watchlistSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,                    // good for fast queries on continue watching / my list
  },
  items: [{
    contentId: { type: String, required: true },   // TMDB id or anime id
    type: { 
      type: String, 
      enum: ['movie', 'tv', 'anime'], 
      required: true 
    },
    title: String,                  // cache from TMDB for fast display
    poster: String,
    addedAt: { type: Date, default: Date.now },
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Add index for better performance on free Railway MongoDB
watchlistSchema.index({ userId: 1 });

// Safe model registration - prevents overwrite error forever
const Watchlist = mongoose.models.Watchlist || mongoose.model('Watchlist', watchlistSchema);

module.exports = Watchlist;