// backend/controllers/tmdbController.js — NEW FILE
// All new TMDB endpoints: recommendations, credits, videos, person


// Through the shared client: cache, stale copies when TMDB is down, rate limiting, retries (config/tmdb.js)
const { cachedTmdb } = require('../config/tmdb')
async function tmdb(path) {
  const [p, qs] = path.split('?')
  const params = Object.fromEntries(new URLSearchParams(qs || ''))
  return cachedTmdb(p, { language: 'en-US', ...params })
}

// ── Movie endpoints ───────────────────────────────────────────────────────────
exports.movieRecommendations = async (req, res) => {
  try { res.json(await tmdb(`/movie/${req.params.id}/recommendations`)) }
  catch (err) { res.status(500).json({ message: err.message }) }
}

exports.movieCredits = async (req, res) => {
  try { res.json(await tmdb(`/movie/${req.params.id}/credits`)) }
  catch (err) { res.status(500).json({ message: err.message }) }
}

exports.movieVideos = async (req, res) => {
  try { res.json(await tmdb(`/movie/${req.params.id}/videos`)) }
  catch (err) { res.status(500).json({ message: err.message }) }
}

// ── TV endpoints ──────────────────────────────────────────────────────────────
exports.tvRecommendations = async (req, res) => {
  try { res.json(await tmdb(`/tv/${req.params.id}/recommendations`)) }
  catch (err) { res.status(500).json({ message: err.message }) }
}

exports.tvCredits = async (req, res) => {
  try { res.json(await tmdb(`/tv/${req.params.id}/credits`)) }
  catch (err) { res.status(500).json({ message: err.message }) }
}

exports.tvVideos = async (req, res) => {
  try { res.json(await tmdb(`/tv/${req.params.id}/videos`)) }
  catch (err) { res.status(500).json({ message: err.message }) }
}

// ── Person endpoints ──────────────────────────────────────────────────────────
exports.personDetails = async (req, res) => {
  try { res.json(await tmdb(`/person/${req.params.id}`)) }
  catch (err) { res.status(500).json({ message: err.message }) }
}

exports.personCredits = async (req, res) => {
  try { res.json(await tmdb(`/person/${req.params.id}/combined_credits`)) }
  catch (err) { res.status(500).json({ message: err.message }) }
}
