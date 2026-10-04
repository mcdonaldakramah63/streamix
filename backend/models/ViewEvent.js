// Light implicit-interest signals (opened a title, watched its trailer, clicked it in search, pressed play).
// Kept for 120 days; the taste engine weighs them far below actually watching.
const mongoose = require('mongoose')

const viewEventSchema = new mongoose.Schema({
  profile:   { type: mongoose.Schema.Types.ObjectId, ref: 'Profile', required: true },
  kind:      { type: String, enum: ['detail', 'trailer', 'search_click', 'play'], required: true },
  mediaType: { type: String, enum: ['movie', 'tv'], required: true },
  tmdbId:    { type: Number, required: true },
  row:       { type: String, default: undefined, maxlength: 24 }, // Home row kind it was opened from (learned row order)
  source:    { type: String, default: undefined, maxlength: 16 }, // 'feed' | 'ask' | 'upcoming' | 'home' …
  at:        { type: Date, default: Date.now, expires: '120d' },
})
viewEventSchema.index({ profile: 1, at: -1 })

module.exports = mongoose.models.ViewEvent || mongoose.model('ViewEvent', viewEventSchema)
