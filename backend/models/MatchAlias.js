// Names the library matcher has learned: when an admin links "AX jade dynasty s4 ep 9" to
// Jade Dynasty, every later file whose name boils down to "jadedynasty" links the same way.
const mongoose = require('mongoose')

const matchAliasSchema = new mongoose.Schema({
  key:       { type: String, required: true, unique: true }, // normalized show/movie name from the file
  mediaType: { type: String, enum: ['movie', 'tv'], required: true },
  tmdbId:    { type: Number, required: true },
  title:     { type: String, default: '' },
  hits:      { type: Number, default: 1 },
}, { timestamps: true })

module.exports = mongoose.model('MatchAlias', matchAliasSchema)
