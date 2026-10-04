// "Remind me" for a movie or show that hasn't come out yet
const mongoose = require('mongoose')

const reminderSchema = new mongoose.Schema({
  user:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:        { type: String, enum: ['movie', 'tv'], required: true },
  tmdbId:      { type: Number, required: true },
  title:       { type: String, default: '' },
  poster:      { type: String, default: '' },
  releaseDate: { type: String, default: '' },  // YYYY-MM-DD
  notified:    { type: Boolean, default: false },
}, { timestamps: true })
reminderSchema.index({ user: 1, type: 1, tmdbId: 1 }, { unique: true })
reminderSchema.index({ notified: 1, releaseDate: 1 })

module.exports = mongoose.models.Reminder || mongoose.model('Reminder', reminderSchema)
