// backend/models/LibraryItem.js — titles an admin added by URL (self-hosted / public-domain / licensed)
const mongoose = require('mongoose')

const LICENSES = ['public-domain', 'creative-commons', 'own-content', 'licensed']

const libraryItemSchema = new mongoose.Schema({
  title:      { type: String, required: true, trim: true, maxlength: 300 },
  year:       { type: String, default: '' },
  overview:   { type: String, default: '', maxlength: 5000 },
  poster:     { type: String, default: '' },   // full image URL
  backdrop:   { type: String, default: '' },
  genres:     { type: [String], default: [] },
  runtime:    { type: Number, default: null }, // minutes

  videoUrl:   { type: String, required: true, unique: true },
  format:     { type: String, enum: ['mp4', 'webm', 'hls', 'other'], default: 'mp4' },
  sizeBytes:  { type: Number, default: null },

  // Rights the admin confirmed when importing
  license:    { type: String, enum: LICENSES, required: true },
  licenseUrl: { type: String, default: '' },  // e.g. the Creative Commons deed from archive.org
  sourcePage: { type: String, default: '' },  // where the file came from (archive.org item page, etc.)

  // What this file is on TMDB — lets it play on that movie's / episode's own page
  tmdbId:     { type: Number, default: null },
  tmdbTitle:  { type: String, default: '' },
  // The uploader's file name (what the matcher reads) and how sure it was
  fileName:        { type: String, default: '' },
  // Seconds — "Skip intro" / "Next episode" buttons in the player
  introStart:      { type: Number, default: null },
  introEnd:        { type: Number, default: null },
  creditsStart:    { type: Number, default: null },
  matchConfidence: { type: Number, default: null },
  matchedBy:       { type: String, enum: ['none', 'model', 'claude', 'id', 'admin', 'alias'], default: 'none' },
  matchSuggestions: [{
    _id: false, mediaType: String, tmdbId: Number, title: String, year: String, poster: String,
    season: Number, episode: Number, confidence: Number,
  }],
  mediaType:  { type: String, enum: ['movie', 'tv'], default: 'movie' },
  season:     { type: Number, default: null },
  episode:    { type: Number, default: null },
  featured:   { type: Boolean, default: false },  // shown first on Home
  addedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true })

libraryItemSchema.index({ createdAt: -1 })
libraryItemSchema.index({ tmdbId: 1, mediaType: 1, season: 1, episode: 1 })
libraryItemSchema.index({ title: 'text', overview: 'text' })

module.exports = mongoose.models.LibraryItem || mongoose.model('LibraryItem', libraryItemSchema)
module.exports.LICENSES = LICENSES
