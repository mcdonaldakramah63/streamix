// backend/controllers/profileController.js — NEW FILE
const Profile = require('../models/Profile')
const axios   = require('axios')

const TMDB_KEY  = () => process.env.TMDB_API_KEY
const TMDB_BASE = 'https://api.themoviedb.org/3'
const MAX_PROFILES = 5

// ── GET /api/profiles ─────────────────────────────────────────────────────────
exports.getAll = async (req, res) => {
  try {
    const profiles = await Profile.find({ userId: req.user._id })
      .select('-watchHistory -preferences')
      .sort('createdAt')
      .lean()
    res.json(profiles)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

// ── POST /api/profiles ────────────────────────────────────────────────────────
exports.create = async (req, res) => {
  try {
    const count = await Profile.countDocuments({ userId: req.user._id })
    if (count >= MAX_PROFILES) {
      return res.status(400).json({ message: `Maximum ${MAX_PROFILES} profiles allowed` })
    }
    const profile = await Profile.create({
      userId: req.user._id,
      name:   req.body.name   || 'Profile',
      avatar: req.body.avatar || '🎬',
      color:  req.body.color  || '#14b8a6',
      isKids: req.body.isKids || false,
    })
    res.status(201).json(profile)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

// ── PUT /api/profiles/:id ──────────────────────────────────────────────────────
exports.update = async (req, res) => {
  try {
    const profile = await Profile.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { $set: { name: req.body.name, avatar: req.body.avatar, color: req.body.color, isKids: req.body.isKids } },
      { new: true }
    )
    if (!profile) return res.status(404).json({ message: 'Profile not found' })
    res.json(profile)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

// ── DELETE /api/profiles/:id ───────────────────────────────────────────────────
exports.remove = async (req, res) => {
  try {
    const count = await Profile.countDocuments({ userId: req.user._id })
    if (count <= 1) return res.status(400).json({ message: 'Cannot delete your only profile' })
    await Profile.findOneAndDelete({ _id: req.params.id, userId: req.user._id })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

// ── POST /api/profiles/:id/watch ──────────────────────────────────────────────
// Records a watched item and updates genre preferences
exports.recordWatch = async (req, res) => {
  try {
    const { tmdbId, title, type, genres = [], language = 'en', completed = false } = req.body
    if (!tmdbId) return res.status(400).json({ message: 'tmdbId required' })

    const profile = await Profile.findOne({ _id: req.params.id, userId: req.user._id })
    if (!profile) return res.status(404).json({ message: 'Profile not found' })

    // Add to history (keep last 200)
    profile.watchHistory = profile.watchHistory.filter(w => w.tmdbId !== Number(tmdbId))
    profile.watchHistory.unshift({ tmdbId: Number(tmdbId), title, type, genres, language, completed })
    if (profile.watchHistory.length > 200) profile.watchHistory = profile.watchHistory.slice(0, 200)

    // Update genre scores
    const prefs = profile.preferences.genres || new Map()
    genres.forEach((gId: number) => {
      const current = prefs.get(String(gId)) || 0
      prefs.set(String(gId), current + (completed ? 2 : 1))
    })
    profile.preferences.genres = prefs

    // Update language scores
    const langPrefs = profile.preferences.languages || new Map()
    const lCurrent  = langPrefs.get(language) || 0
    langPrefs.set(language, lCurrent + 1)
    profile.preferences.languages = langPrefs

    profile.markModified('preferences')
    await profile.save()

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

// ── GET /api/profiles/:id/recommendations ─────────────────────────────────────
// AI-ish recommendations based on watch history preferences
exports.getRecommendations = async (req, res) => {
  try {
    const profile = await Profile.findOne({ _id: req.params.id, userId: req.user._id })
    if (!profile) return res.status(404).json({ message: 'Profile not found' })

    const genreMap   = Object.fromEntries(profile.preferences.genres   || [])
    const langMap    = Object.fromEntries(profile.preferences.languages || [])
    const watchedIds = new Set(profile.watchHistory.map(w => w.tmdbId))

    // Find top genres by score
    const topGenres = Object.entries(genreMap)
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .slice(0, 3)
      .map(([id]) => id)

    const topLang = Object.entries(langMap)
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .slice(0, 1)
      .map(([lang]) => lang)[0] || 'en'

    // If no history — return popular
    if (topGenres.length === 0) {
      const { data } = await axios.get(`${TMDB_BASE}/trending/all/week?api_key=${TMDB_KEY()}&language=en-US`)
      return res.json({ sections: [{ title: '🔥 Trending Now', items: data.results?.slice(0,20) || [] }] })
    }

    // Fetch recommendations for each top genre in parallel
    const requests = topGenres.map(genreId =>
      axios.get(`${TMDB_BASE}/discover/movie?api_key=${TMDB_KEY()}&with_genres=${genreId}&sort_by=popularity.desc&vote_count.gte=100&language=en-US&page=1`)
        .then(r => ({ genreId, results: r.data.results || [] }))
        .catch(() => ({ genreId, results: [] }))
    )

    // Also fetch "because you watched" — recommendations based on last watched
    const lastWatched = profile.watchHistory[0]
    let becauseYouWatched: any[] = []
    if (lastWatched) {
      try {
        const endpoint = lastWatched.type === 'tv'
          ? `${TMDB_BASE}/tv/${lastWatched.tmdbId}/recommendations`
          : `${TMDB_BASE}/movie/${lastWatched.tmdbId}/recommendations`
        const { data } = await axios.get(`${endpoint}?api_key=${TMDB_KEY()}&language=en-US`)
        becauseYouWatched = (data.results || []).filter((r: any) => !watchedIds.has(r.id)).slice(0,20)
      } catch { /* ignore */ }
    }

    // Fetch top picks for preferred language
    const topPicksReq = topLang !== 'en'
      ? axios.get(`${TMDB_BASE}/discover/movie?api_key=${TMDB_KEY()}&with_original_language=${topLang}&sort_by=popularity.desc&vote_count.gte=50`)
          .then(r => r.data.results || []).catch(() => [])
      : axios.get(`${TMDB_BASE}/movie/popular?api_key=${TMDB_KEY()}&language=en-US`)
          .then(r => r.data.results || []).catch(() => [])

    const [genreResults, topPicks] = await Promise.all([Promise.all(requests), topPicksReq])

    const GENRE_NAMES: Record<string,string> = {
      '28':'Action','12':'Adventure','16':'Animation','35':'Comedy','80':'Crime',
      '18':'Drama','10749':'Romance','878':'Sci-Fi','27':'Horror','53':'Thriller',
      '10751':'Family','14':'Fantasy','9648':'Mystery','10752':'War',
    }

    const sections: any[] = []

    // Because you watched
    if (becauseYouWatched.length > 0) {
      sections.push({
        title: `Because You Watched "${lastWatched.title}"`,
        items: becauseYouWatched,
      })
    }

    // Top picks
    const filteredTopPicks = topPicks.filter((r: any) => !watchedIds.has(r.id)).slice(0, 20)
    if (filteredTopPicks.length > 0) {
      sections.push({ title: '⭐ Top Picks For You', items: filteredTopPicks })
    }

    // Genre rows
    genreResults.forEach(({ genreId, results }) => {
      const filtered = results.filter((r: any) => !watchedIds.has(r.id)).slice(0,20)
      if (filtered.length > 0) {
        sections.push({
          title: `More ${GENRE_NAMES[genreId] || 'Popular'} For You`,
          items: filtered,
        })
      }
    })

    // Add trending as fallback if not enough sections
    if (sections.length < 2) {
      const { data } = await axios.get(`${TMDB_BASE}/trending/all/week?api_key=${TMDB_KEY()}`)
      sections.push({ title: '🔥 Trending Now', items: data.results?.slice(0,20) || [] })
    }

    res.json({ sections, topGenres, watchedCount: watchedIds.size })
  } catch (err) {
    console.error('[Recommendations]', err)
    res.status(500).json({ message: 'Recommendations failed', error: (err as any).message })
  }
}
