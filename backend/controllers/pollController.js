// backend/controllers/pollController.js — "How would you rate this?" poll per title
const PollVote = require('../models/PollVote')

const POLL = {
  question: 'How would you rate this?',
  options: [
    { id: '5', label: 'Masterpiece', emoji: '🏆' },
    { id: '4', label: 'Great',       emoji: '⭐' },
    { id: '3', label: 'Good',        emoji: '👍' },
    { id: '2', label: 'Meh',         emoji: '😐' },
    { id: '1', label: 'Skip it',     emoji: '👎' },
  ],
}
const VALID_IDS = new Set(POLL.options.map(o => o.id))
const normType  = (t) => (t === 'tv' ? 'tv' : 'movie')

async function buildPoll(tmdbId, type) {
  const counts = await PollVote.aggregate([
    { $match: { tmdbId, type } },
    { $group: { _id: '$optionId', count: { $sum: 1 } } },
  ])
  const countMap = Object.fromEntries(counts.map(c => [c._id, c.count]))
  const options = POLL.options.map(o => ({ ...o, votes: countMap[o.id] || 0 }))
  return {
    id:         `${type}-${tmdbId}`,
    question:   POLL.question,
    options,
    totalVotes: options.reduce((s, o) => s + o.votes, 0),
  }
}

// GET /api/polls/:tmdbId?type=movie
exports.getPoll = async (req, res) => {
  try {
    const tmdbId = Number(req.params.tmdbId)
    if (!Number.isFinite(tmdbId)) return res.status(400).json({ message: 'Invalid id' })
    const type = normType(req.query.type)

    const poll = await buildPoll(tmdbId, type)
    let myVote = null
    if (req.user) {
      const existing = await PollVote.findOne({ tmdbId, type, userId: req.user._id }).lean()
      myVote = existing?.optionId || null
    }
    res.json({ poll, myVote })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

// POST /api/polls/vote { tmdbId, optionId, type }
exports.vote = async (req, res) => {
  try {
    const tmdbId   = Number(req.body.tmdbId)
    const optionId = String(req.body.optionId || '')
    const type     = normType(req.body.type)
    if (!Number.isFinite(tmdbId) || !VALID_IDS.has(optionId)) {
      return res.status(400).json({ message: 'tmdbId and a valid optionId are required' })
    }

    await PollVote.findOneAndUpdate(
      { tmdbId, type, userId: req.user._id },
      { optionId },
      { upsert: true, new: true }
    )
    res.json({ poll: await buildPoll(tmdbId, type), myVote: optionId })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}
