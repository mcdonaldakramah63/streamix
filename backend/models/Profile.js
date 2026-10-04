// backend/models/Profile.js
const mongoose = require('mongoose')

const profileSchema = new mongoose.Schema({
  user:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name:          { type: String, required: true, trim: true, maxlength: 30 },
  avatar:        { type: String, default: '🎬', maxlength: 16 },
  color:         { type: String, default: '#e50914', match: /^#[0-9a-fA-F]{6}$/ },
  isKids:        { type: Boolean, default: false },
  theme:         { type: String, default: 'scarlet', enum: ['scarlet', 'ocean', 'violet', 'emerald', 'sunset', 'rose'] },

  // Uploaded photo (served from /uploads/avatars) or built avatar; emoji is the fallback
  avatarImage:   { type: String, default: '' },
  avatarConfig:  { type: mongoose.Schema.Types.Mixed, default: null },

  // bcrypt hash of a 4-digit PIN (adult profiles only). Never sent to clients.
  pin:           { type: String, default: null, select: false },

  maturityLevel: { type: String, default: 'all', enum: ['kids', 'pg', 'all'] },

  watchHistory: [{
    tmdbId:     { type: Number, required: true },
    title:      String,
    type:       { type: String, enum: ['movie', 'tv', 'anime'] },
    genres:     [Number],
    language:   String,
    progress:   { type: Number, default: 0, min: 0, max: 100 },
    completed:  { type: Boolean, default: false },
    watchedAt:  { type: Date, default: Date.now },
    watchSeconds: { type: Number, default: 0 },   // total time spent on it
    hour:       { type: Number, default: null },  // local hour last watched (time-of-day habits)
  }],

  // Taste onboarding ("pick a few you like") — "movie:123" keys
  onboarded:    { type: Boolean, default: false },
  onboardPicks: [String],

  blockedTitles: [String],          // "movie:123" / "tv:456" — never shown on this profile

  // Viewing preferences (like Netflix's per-profile playback settings)
  prefs: {
    autoplayNext:     { type: Boolean, default: true },   // play the next episode automatically
    autoplayPreviews: { type: Boolean, default: true },   // trailers when hovering a title
    subtitleLang:     { type: String,  default: '', maxlength: 8 }, // '' = off, 'en', 'es'…
    quality:          { type: String,  default: 'auto', enum: ['auto', 'saver', 'high'] },
    // Highest age rating this profile may watch (kids profiles use kids mode instead)
    maturity:         { type: String,  default: 'all', enum: ['7', '13', '16', 'all'] },
  },
  hiddenTitles: [String],          // "Not for me" — "movie:123" / "tv:456", kept out of rows

  // Learned Home row order: per row kind, how often it was shown and opened (decays over time)
  rowStats:   { type: mongoose.Schema.Types.Mixed, default: {} },
  rowStatsAt: { type: Date, default: null },
  // "Play something": per suggestion kind (resume, pick, new_episode…), how often shown and actually watched
  shuffleStats:   { type: mongoose.Schema.Types.Mixed, default: {} },
  shuffleStatsAt: { type: Date, default: null },

  // Kids profiles: parental controls
  kidsControls: {
    dailyLimitMin: { type: Number, default: 0, min: 0, max: 1440 }, // 0 = no limit
    bedtimeStart:  { type: String, default: '', match: /^$|^([01]\d|2[0-3]):[0-5]\d$/ },
    bedtimeEnd:    { type: String, default: '', match: /^$|^([01]\d|2[0-3]):[0-5]\d$/ },
    allowedOnly:   { type: Boolean, default: false },              // only titles in allowedTitles
    allowedTitles: [String],
  },
  // Minutes watched per day (kept for 30 days) — for limits and the parent report
  usage: [{ _id: false, day: String, minutes: { type: Number, default: 0 } }],
}, { timestamps: true })

profileSchema.index({ user: 1, isKids: 1 })

module.exports = mongoose.models.Profile || mongoose.model('Profile', profileSchema)
