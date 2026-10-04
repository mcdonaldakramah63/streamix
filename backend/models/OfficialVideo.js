// A video an official anime channel published on YouTube, and which TMDB episode/movie it is.
const mongoose = require('mongoose')

const officialVideoSchema = new mongoose.Schema({
  videoId:     { type: String, required: true, unique: true },
  channelId:   { type: String, required: true, index: true },
  channelName: { type: String, default: '' },
  title:       { type: String, default: '' },
  cleanTitle:  { type: String, default: '' },
  publishedAt: { type: Date, default: null },
  duration:    { type: Number, default: null },            // seconds (YouTube API only)
  kind:        { type: String, enum: ['episode', 'movie', 'skip'], default: 'skip' },
  skipReason:  { type: String, default: '' },
  parsed:      { title: String, alt: String, season: Number, episode: Number },
  seriesKey:   { type: String, default: '', index: true },
  // pending: waiting to be matched · linked: plays on its TMDB page · review: admin should look · skipped / ignored
  status:      { type: String, enum: ['pending', 'linked', 'review', 'skipped', 'ignored'], default: 'pending', index: true },
  mediaType:   { type: String, enum: ['movie', 'tv', null], default: null },
  tmdbId:      { type: Number, default: null },
  season:      { type: Number, default: null },
  episode:     { type: Number, default: null },
  confidence:  { type: Number, default: null },
  // Can it play here?
  embeddable:    { type: Boolean, default: null },
  regionBlocked: { type: Boolean, default: null },
  stats:         { ok: { type: Number, default: 0 }, blocked: { type: Number, default: 0 }, at: Date },
}, { timestamps: true })
officialVideoSchema.index({ tmdbId: 1, mediaType: 1, season: 1, episode: 1 })
officialVideoSchema.index({ status: 1, publishedAt: -1 })

module.exports = mongoose.models.OfficialVideo || mongoose.model('OfficialVideo', officialVideoSchema)
