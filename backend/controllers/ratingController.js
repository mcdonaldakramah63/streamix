// backend/controllers/ratingController.js — NEW FILE
const Rating = require('../models/Rating')

// POST /api/ratings
exports.rate = async (req, res) => {
  try {
    const { tmdbId, type, rating } = req.body
    if (!tmdbId || !type || !rating) {
      return res.status(400).json({ message: 'tmdbId, type, rating required' })
    }

    await Rating.findOneAndUpdate(
      { userId: req.user._id, tmdbId: Number(tmdbId), type },
      { rating: Number(rating) },
      { upsert: true, new: true }
    )

    // Return aggregated stats
    const agg = await Rating.aggregate([
      { $match: { tmdbId: Number(tmdbId), type } },
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
    const { tmdbId } = req.params
    const { type = 'movie' } = req.query

    const [agg, myRating] = await Promise.all([
      Rating.aggregate([
        { $match: { tmdbId: Number(tmdbId), type } },
        { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }
      ]),
      req.user
        ? Rating.findOne({ userId: req.user._id, tmdbId: Number(tmdbId), type })
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
