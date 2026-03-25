// backend/models/Profile.js — NEW FILE
const mongoose = require('mongoose')

const profileSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name:      { type: String, required: true, trim: true, maxlength: 30 },
  avatar:    { type: String, default: '' },     // emoji or color code
  color:     { type: String, default: '#14b8a6' },
  isKids:    { type: Boolean, default: false },  // Kids mode — filters 18+ content
  language:  { type: String, default: 'en' },

  // Watch history for recommendations
  watchHistory: [{
    tmdbId:    { type: Number, required: true },
    title:     String,
    type:      { type: String, enum: ['movie','tv'] },
    genres:    [Number],
    language:  String,
    watchedAt: { type: Date, default: Date.now },
    completed: { type: Boolean, default: false },
  }],

  // Preferences learned from watch history
  preferences: {
    genres:    { type: Map, of: Number, default: {} },  // genreId -> score
    languages: { type: Map, of: Number, default: {} },
  },
}, { timestamps: true })

profileSchema.index({ userId: 1 })

module.exports = mongoose.model('Profile', profileSchema)
