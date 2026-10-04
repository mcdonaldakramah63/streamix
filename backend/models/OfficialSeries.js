// One series (or season) as an official channel names it, and the TMDB title it is — decided once, then every
// episode of it is placed by number. Admin decisions are kept and win over the matcher.
const mongoose = require('mongoose')

const officialSeriesSchema = new mongoose.Schema({
  key:        { type: String, required: true, unique: true },   // utils/officialAnime seriesKey()
  title:      { type: String, default: '' },                    // as the channel writes it
  season:     { type: Number, default: null },                  // the season the channel named, if any
  status:     { type: String, enum: ['linked', 'review', 'ignored'], default: 'review' },
  mediaType:  { type: String, enum: ['movie', 'tv', null], default: null },
  tmdbId:     { type: Number, default: null },
  tmdbTitle:  { type: String, default: '' },
  confidence: { type: Number, default: null },
  decidedBy:  { type: String, enum: ['model', 'claude', 'admin', 'none'], default: 'none' },
  suggestions: [{ _id: false, mediaType: String, tmdbId: Number, title: String, year: String, poster: String, confidence: Number }],
}, { timestamps: true })

module.exports = mongoose.models.OfficialSeries || mongoose.model('OfficialSeries', officialSeriesSchema)
