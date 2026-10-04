// Popularity/rank of trending titles at one moment (every ~30 min, kept 10 days) — for momentum
const mongoose = require('mongoose')

const trendSnapshotSchema = new mongoose.Schema({
  at:    { type: Date, default: Date.now, expires: '10d' },
  items: { type: mongoose.Schema.Types.Mixed, default: {} }, // "movie:123" → { pop, rank }
})
trendSnapshotSchema.index({ at: -1 })

module.exports = mongoose.models.TrendSnapshot || mongoose.model('TrendSnapshot', trendSnapshotSchema)
