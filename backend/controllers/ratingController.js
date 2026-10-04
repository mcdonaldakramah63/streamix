// backend/controllers/ratingController.js — NEW FILE
const Rating = require('../models/Rating')
// Recommendations for every profile on the account should notice this
const refreshRecs = (userId) => require('../models/Profile').find({ user: userId }).select('_id').lean()
  .then(ps => ps.forEach(p => require('./recommendController').invalidate(p._id))).catch(() => {})


// POST /api/ratings
exports.rate = async (req, res) => {
  try {
    const tmdbId = Number(req.body.tmdbId)
    const type = req.body.type === 'tv' ? 'tv' : 'movie'
    const rating = Number(req.body.rating)
    // Stars are whole numbers from 1 to 5 — anything else would skew everyone's average
    if (!Number.isInteger(tmdbId) || tmdbId <= 0 || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rate from 1 to 5 stars' })
    }

    await Rating.findOneAndUpdate(
      { userId: req.user._id, tmdbId, type },
      { rating },
      { upsert: true, new: true }
    )
    refreshRecs(req.user._id)

    // Return aggregated stats
    const agg = await Rating.aggregate([
      { $match: { tmdbId, type } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }
    ])

    res.json({
      success:      true,
      avgRating:    Math.round((agg[0]?.avg || 0) * 10) / 10,
      totalRatings: agg[0]?.count || 0,
    })
  } catch (err) {
    console.error('[Rating]', err.message)
    res.status(500).json({ message: 'Server error' })
  }
}

// GET /api/ratings/:tmdbId?type=movie
exports.getStats = async (req, res) => {
  try {
    const tmdbId = Number(req.params.tmdbId)
    if (!Number.isInteger(tmdbId)) return res.status(400).json({ message: 'Invalid id' })
    const type = req.query.type === 'tv' ? 'tv' : 'movie'

    const [agg, myRating] = await Promise.all([
      Rating.aggregate([
        { $match: { tmdbId, type } },
        { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }
      ]),
      req.user
        ? Rating.findOne({ userId: req.user._id, tmdbId, type })
        : null,
    ])

    res.json({
      avgRating:    Math.round((agg[0]?.avg || 0) * 10) / 10,
      totalRatings: agg[0]?.count || 0,
      myRating:     myRating?.rating || 0,
    })
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
}
