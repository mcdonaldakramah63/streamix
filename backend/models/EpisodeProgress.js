// How far a profile got in each episode — powers the ✓ / progress bars on series pages
const mongoose = require('mongoose')

const episodeProgressSchema = new mongoose.Schema({
  profile:   { type: mongoose.Schema.Types.ObjectId, ref: 'Profile', required: true },
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tmdbId:    { type: Number, required: true },
  season:    { type: Number, required: true },
  episode:   { type: Number, required: true },
  progress:  { type: Number, default: 0, min: 0, max: 100 },
  completed: { type: Boolean, default: false },
}, { timestamps: true })

episodeProgressSchema.index({ profile: 1, tmdbId: 1, season: 1, episode: 1 }, { unique: true })

module.exports = mongoose.models.EpisodeProgress || mongoose.model('EpisodeProgress', episodeProgressSchema)
