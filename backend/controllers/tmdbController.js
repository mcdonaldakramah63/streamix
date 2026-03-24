// backend/controllers/tmdbController.js — NEW FILE
// All new TMDB endpoints: recommendations, credits, videos, person
const axios = require('axios')

const KEY  = () => process.env.TMDB_API_KEY
const BASE = 'https://api.themoviedb.org/3'

async function tmdb(path) {
  const sep = path.includes('?') ? '&' : '?'
  const { data } = await axios.get(`${BASE}${path}${sep}api_key=${KEY()}&language=en-US`, { timeout: 10000 })
  return data
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
