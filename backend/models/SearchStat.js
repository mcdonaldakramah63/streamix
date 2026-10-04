// What people opened after typing a search ("dune" → movie:438631), to rank those results higher next time
const mongoose = require('mongoose')

const searchStatSchema = new mongoose.Schema({
  q:     { type: String, required: true, maxlength: 100 }, // normalised query (utils/searchEngine.normalize)
  key:   { type: String, required: true },                 // "movie:123" / "tv:456"
  n:     { type: Number, default: 0 },                     // clicks, decayed (30-day half-life) at each update
  at:    { type: Date, default: Date.now, expires: '180d' },
  title: { type: String, default: '' },
  poster:{ type: String, default: '' },
  year:  { type: String, default: '' },
})
searchStatSchema.index({ q: 1, key: 1 }, { unique: true })
searchStatSchema.index({ q: 1, n: -1 })

module.exports = mongoose.models.SearchStat || mongoose.model('SearchStat', searchStatSchema)
