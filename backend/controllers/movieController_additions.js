// ADD THESE FUNCTIONS TO backend/controllers/movieController.js
// Paste at the bottom of the existing file, before module.exports

const axios = require('axios')
const TMDB_KEY  = process.env.TMDB_API_KEY
const TMDB_BASE = 'https://api.themoviedb.org/3'

// GET /api/movies/:id/recommendations
exports.recommendations = async (req, res) => {
  try {
    const { id } = req.params
    const { data } = await axios.get(
      `${TMDB_BASE}/movie/${id}/recommendations?api_key=${TMDB_KEY}&language=en-US&page=1`
    )
    res.json(data)
  } catch (err) {
    res.status(500).json({ message: 'Failed', error: err.message })
  }
}

// GET /api/movies/tv/:id/recommendations
exports.tvRecommendations = async (req, res) => {
  try {
    const { id } = req.params
    const { data } = await axios.get(
      `${TMDB_BASE}/tv/${id}/recommendations?api_key=${TMDB_KEY}&language=en-US&page=1`
    )
    res.json(data)
  } catch (err) {
    res.status(500).json({ message: 'Failed', error: err.message })
  }
}

// GET /api/movies/:id/credits  (cast & crew)
exports.credits = async (req, res) => {
  try {
    const { id } = req.params
    const { data } = await axios.get(
      `${TMDB_BASE}/movie/${id}/credits?api_key=${TMDB_KEY}&language=en-US`
    )
    res.json(data)
  } catch (err) {
    res.status(500).json({ message: 'Failed', error: err.message })
  }
}

// GET /api/movies/tv/:id/credits
exports.tvCredits = async (req, res) => {
  try {
    const { id } = req.params
    const { data } = await axios.get(
      `${TMDB_BASE}/tv/${id}/credits?api_key=${TMDB_KEY}&language=en-US`
    )
    res.json(data)
  } catch (err) {
    res.status(500).json({ message: 'Failed', error: err.message })
  }
}

// GET /api/movies/:id/videos  (trailers)
exports.videos = async (req, res) => {
  try {
    const { id } = req.params
    const { data } = await axios.get(
      `${TMDB_BASE}/movie/${id}/videos?api_key=${TMDB_KEY}&language=en-US`
    )
    res.json(data)
  } catch (err) {
    res.status(500).json({ message: 'Failed', error: err.message })
  }
}

// GET /api/movies/tv/:id/videos
exports.tvVideos = async (req, res) => {
  try {
    const { id } = req.params
    const { data } = await axios.get(
      `${TMDB_BASE}/tv/${id}/videos?api_key=${TMDB_KEY}&language=en-US`
    )
    res.json(data)
  } catch (err) {
    res.status(500).json({ message: 'Failed', error: err.message })
  }
}

// GET /api/movies/person/:id
exports.personDetails = async (req, res) => {
  try {
    const { id } = req.params
    const { data } = await axios.get(
      `${TMDB_BASE}/person/${id}?api_key=${TMDB_KEY}&language=en-US`
    )
    res.json(data)
  } catch (err) {
    res.status(500).json({ message: 'Failed', error: err.message })
  }
}

// GET /api/movies/person/:id/credits
exports.personCredits = async (req, res) => {
  try {
    const { id } = req.params
    const { data } = await axios.get(
      `${TMDB_BASE}/person/${id}/combined_credits?api_key=${TMDB_KEY}&language=en-US`
    )
    res.json(data)
  } catch (err) {
    res.status(500).json({ message: 'Failed', error: err.message })
  }
}
