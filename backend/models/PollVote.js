const mongoose = require('mongoose')

const pollVoteSchema = new mongoose.Schema({
  tmdbId:   { type: Number, required: true },
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  optionId: { type: String, required: true },
  type:     { type: String, enum: ['movie', 'tv'], default: 'movie' },
}, { timestamps: true })

// One vote per user per title+type
pollVoteSchema.index({ tmdbId: 1, type: 1, userId: 1 }, { unique: true })

module.exports = mongoose.models.PollVote || mongoose.model('PollVote', pollVoteSchema)
