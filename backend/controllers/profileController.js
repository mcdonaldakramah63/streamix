// backend/controllers/profileController.js — FULL REPLACEMENT
const mongoose = require('mongoose')

// ── Profile model (inline so it works even without a separate file) ───────────
const profileSchema = new mongoose.Schema({
  user:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name:        { type: String, required: true, trim: true, maxlength: 30 },
  avatar:      { type: String, default: '🎬' },
  color:       { type: String, default: '#14b8a6' },
  isKids:      { type: Boolean, default: false },
  watchHistory: [{
    tmdbId:     Number,
    title:      String,
    type:       { type: String, enum: ['movie','tv'] },
    genres:     [Number],
    language:   String,
    completed:  Boolean,
    watchedAt:  { type: Date, default: Date.now },
  }],
}, { timestamps: true })

const Profile = mongoose.models.Profile || mongoose.model('Profile', profileSchema)

// ── GET /api/profiles ─────────────────────────────────────────────────────────
exports.getProfiles = async (req, res) => {
  try {
    const profiles = await Profile.find({ user: req.user._id })
      .select('-watchHistory')
      .sort({ createdAt: 1 })
      .lean()
    res.json(profiles)
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
}

// ── POST /api/profiles ────────────────────────────────────────────────────────
exports.createProfile = async (req, res) => {
  try {
    const count = await Profile.countDocuments({ user: req.user._id })
    if (count >= 5) return res.status(400).json({ message: 'Maximum 5 profiles per account' })

    const { name, avatar = '🎬', color = '#14b8a6', isKids = false } = req.body
    if (!name?.trim()) return res.status(400).json({ message: 'Profile name is required' })

    const profile = await Profile.create({
      user:   req.user._id,
      name:   name.trim(),
      avatar,
      color,
      isKids: Boolean(isKids),
    })
    res.status(201).json(profile)
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
}

// ── PUT /api/profiles/:id ─────────────────────────────────────────────────────
exports.updateProfile = async (req, res) => {
  try {
    const profile = await Profile.findOne({ _id: req.params.id, user: req.user._id })
    if (!profile) return res.status(404).json({ message: 'Profile not found' })

    const { name, avatar, color, isKids } = req.body
    if (name  !== undefined) profile.name   = name.trim()
    if (avatar!== undefined) profile.avatar = avatar
    if (color !== undefined) profile.color  = color
    if (isKids!== undefined) profile.isKids = Boolean(isKids)

    await profile.save()
    res.json(profile)
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
}

// ── DELETE /api/profiles/:id ──────────────────────────────────────────────────
exports.deleteProfile = async (req, res) => {
  try {
    const result = await Profile.findOneAndDelete({ _id: req.params.id, user: req.user._id })
    if (!result) return res.status(404).json({ message: 'Profile not found' })
    res.json({ message: 'Deleted' })
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
}

// ── POST /api/profiles/:id/watch ─────────────────────────────────────────────
exports.recordWatch = async (req, res) => {
  try {
    const profile = await Profile.findOne({ _id: req.params.id, user: req.user._id })
    if (!profile) return res.status(404).json({ message: 'Profile not found' })

    const { tmdbId, title, type, genres = [], language = 'en', completed = false } = req.body
    if (!tmdbId || !type) return res.status(400).json({ message: 'tmdbId and type required' })

    // Remove old entry for same title, add new one at front
    profile.watchHistory = profile.watchHistory.filter(h => h.tmdbId !== Number(tmdbId))
    profile.watchHistory.unshift({ tmdbId: Number(tmdbId), title, type, genres, language, completed, watchedAt: new Date() })
    // Keep last 200
    if (profile.watchHistory.length > 200) profile.watchHistory = profile.watchHistory.slice(0, 200)

    await profile.save()
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
}

// ── GET /api/profiles/:id/recommendations ────────────────────────────────────
exports.getRecommendations = async (req, res) => {
  try {
    const profile = await Profile.findById(req.params.id).lean()
    if (!profile) return res.status(404).json({ message: 'Profile not found' })

    // Score genres by watch frequency
    const genreScore: Record<number, number> = {}
    for (const h of profile.watchHistory.slice(0, 50)) {
      for (const g of (h.genres || [])) {
        genreScore[g] = (genreScore[g] || 0) + (h.completed ? 2 : 1)
      }
    }

    const topGenres = Object.entries(genreScore)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 3)
      .map(([id]) => Number(id))

    const watchedIds = profile.watchHistory.slice(0, 100).map(h => h.tmdbId)
    const lastWatched = profile.watchHistory.slice(0, 3)

    res.json({ topGenres, watchedIds, lastWatched })
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
}
