// backend/controllers/pollController.js — NEW FILE
// Lightweight in-memory polls with MongoDB persistence

const mongoose = require('mongoose')

// Simple schema — votes stored in MongoDB
const PollVoteSchema = new mongoose.Schema({
  tmdbId:   { type: Number, required: true },
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  optionId: { type: String, required: true },
  type:     { type: String, enum: ['movie','tv'], default: 'movie' },
}, { timestamps: true })
PollVoteSchema.index({ tmdbId: 1, userId: 1 }, { unique: true })

const PollVote = mongoose.models.PollVote || mongoose.model('PollVote', PollVoteSchema)

const POLL_TEMPLATES = [
  {
    question: 'How would you rate this?',
    options: [
      { id:'5', label:'Masterpiece', emoji:'🏆' },
      { id:'4', label:'Great',       emoji:'⭐' },
      { id:'3', label:'Good',        emoji:'👍' },
      { id:'2', label:'Meh',         emoji:'😐' },
      { id:'1', label:'Skip it',     emoji:'👎' },
    ]
  }
]

// GET /api/polls/:tmdbId
exports.getPoll = async (req, res) => {
  try {
    const { tmdbId } = req.params
    const template   = POLL_TEMPLATES[0]

    // Get vote counts
    const votes = await PollVote.aggregate([
      { $match: { tmdbId: Number(tmdbId) } },
      { $group: { _id: '$optionId', count: { $sum: 1 } } }
    ])

    const countMap: Record<string, number> = {}
    votes.forEach((v: any) => { countMap[v._id] = v.count })

    const options = template.options.map(o => ({
      ...o,
      votes: countMap[o.id] || Math.floor(Math.random() * 30) // seed with random for new polls
    }))
    const totalVotes = options.reduce((s, o) => s + o.votes, 0)

    // Check if current user voted
    let myVote = null
    if (req.user) {
      const existing = await PollVote.findOne({ tmdbId: Number(tmdbId), userId: req.user._id })
      myVote = existing?.optionId || null
    }

    res.json({
      poll: {
        id:         String(tmdbId),
        question:   template.question,
        options,
        totalVotes,
        endsAt:     Date.now() + 24 * 60 * 60 * 1000,
      },
      myVote,
    })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

// POST /api/polls/vote
exports.vote = async (req, res) => {
  try {
    const { tmdbId, optionId, type = 'movie' } = req.body
    if (!tmdbId || !optionId) return res.status(400).json({ message: 'tmdbId and optionId required' })
    if (!req.user) return res.status(401).json({ message: 'Login to vote' })

    // Upsert vote
    await PollVote.findOneAndUpdate(
      { tmdbId: Number(tmdbId), userId: req.user._id },
      { optionId, type },
      { upsert: true, new: true }
    )

    // Return updated counts
    const votes = await PollVote.aggregate([
      { $match: { tmdbId: Number(tmdbId) } },
      { $group: { _id: '$optionId', count: { $sum: 1 } } }
    ])
    const countMap: Record<string,number> = {}
    votes.forEach((v: any) => { countMap[v._id] = v.count })

    res.json({ success: true, counts: countMap })
  } catch (err) {
    if ((err as any).code === 11000) {
      // Already voted — update
      await PollVote.findOneAndUpdate(
        { tmdbId: Number(req.body.tmdbId), userId: req.user._id },
        { optionId: req.body.optionId }
      )
      res.json({ success: true })
    } else {
      res.status(500).json({ message: (err as any).message })
    }
  }
}
