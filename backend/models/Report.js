// A viewer's "something's wrong with this video" report, for the admin queue
const mongoose = require('mongoose')

const REASONS = ['not-playing', 'wrong-video', 'bad-quality', 'audio', 'subtitles', 'buffering', 'other']

const reportSchema = new mongoose.Schema({
  user:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  username: { type: String, default: '' },
  type:     { type: String, enum: ['movie', 'tv'], required: true },
  tmdbId:   { type: Number, required: true },
  season:   { type: Number, default: null },
  episode:  { type: Number, default: null },
  title:    { type: String, default: '', maxlength: 200 },
  source:   { type: String, default: '', maxlength: 60 },   // e.g. "Streamix", "Embed.su", "HLS"
  reason:   { type: String, enum: REASONS, required: true },
  note:     { type: String, default: '', maxlength: 500 },
  status:   { type: String, enum: ['open', 'resolved'], default: 'open', index: true },
  count:    { type: Number, default: 1 },                     // same problem reported again
}, { timestamps: true })

reportSchema.index({ status: 1, updatedAt: -1 })

module.exports = mongoose.models.Report || mongoose.model('Report', reportSchema)
module.exports.REASONS = REASONS
