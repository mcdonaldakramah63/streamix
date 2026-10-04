// Learned reliability of each embed provider, per media type (see utils/sourceHealth.js)
const mongoose = require('mongoose')

const sourceStatSchema = new mongoose.Schema({
  source: { type: String, required: true },          // provider id ("vidsrc", "vidlink"…)
  type:   { type: String, enum: ['movie', 'tv'], required: true },
  ok:     { type: Number, default: 0 },               // decayed count of good outcomes (watched 3+ min)
  fail:   { type: Number, default: 0 },               // decayed count of bad ones (errors, quick switches, reports)
  at:     { type: Date, default: Date.now },          // when ok/fail were last decayed
  probe:  { up: Boolean, ms: Number, status: Number, at: Date }, // last health check
})
sourceStatSchema.index({ source: 1, type: 1 }, { unique: true })

module.exports = mongoose.models.SourceStat || mongoose.model('SourceStat', sourceStatSchema)
