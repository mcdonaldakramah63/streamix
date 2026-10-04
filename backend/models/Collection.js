// Admin-curated collections ("Silent Era Classics") shown as rows on Home
const mongoose = require('mongoose')

const collectionSchema = new mongoose.Schema({
  title:       { type: String, required: true, trim: true, maxlength: 80 },
  description: { type: String, default: '', maxlength: 300 },
  emoji:       { type: String, default: '🎞️', maxlength: 8 },
  showOnHome:  { type: Boolean, default: true },
  order:       { type: Number, default: 0 },
  // Snapshot of title/poster so the row renders without extra lookups
  items: [{
    _id: false,
    kind:   { type: String, enum: ['movie', 'tv', 'library'], required: true },
    id:     { type: String, required: true }, // TMDB id, or LibraryItem _id
    title:  { type: String, default: '' },
    year:   { type: String, default: '' },
    poster: { type: String, default: '' },
  }],
}, { timestamps: true })

module.exports = mongoose.models.Collection || mongoose.model('Collection', collectionSchema)
