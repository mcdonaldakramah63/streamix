const mongoose = require('mongoose');

const watchlistSchema = new mongoose.Schema({
  user:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  movieId: { type: Number, required: true },
  title:   String,
  poster:  String,
  backdrop:String,
  rating:  Number,
  year:    String,
  addedAt: { type: Date, default: Date.now },
});

watchlistSchema.index({ user: 1, movieId: 1 }, { unique: true });

module.exports = mongoose.model('Watchlist', watchlistSchema);
