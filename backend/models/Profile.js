// backend/models/Profile.js — FIXED WITH PIN FIELD
const mongoose = require('mongoose');

const profileSchema = new mongoose.Schema({
  user:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name:          { type: String, required: true, trim: true, maxlength: 30 },
  avatar:        { type: String, default: '🎬' },
  color:         { type: String, default: '#14b8a6' },
  isKids:        { type: Boolean, default: false },
  pin:           { type: String, default: null },           // 4-digit PIN for adult profiles
  maturityLevel: { type: String, default: 'all', enum: ['kids', 'pg', 'all'] },

  watchHistory: [{
    tmdbId:     { type: Number, required: true },
    title:      String,
    type:       { type: String, enum: ['movie', 'tv', 'anime'] },
    genres:     [Number],
    language:   String,
    progress:   { type: Number, default: 0 },
    completed:  { type: Boolean, default: false },
    watchedAt:  { type: Date, default: Date.now },
  }],

  blockedTitles: [String],
}, { timestamps: true });

profileSchema.index({ user: 1 });
profileSchema.index({ user: 1, isKids: 1 });

const Profile = mongoose.models.Profile || mongoose.model('Profile', profileSchema);
module.exports = Profile;