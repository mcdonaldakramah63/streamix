// ADD THESE TO backend/controllers/movieController.js
// (add the discover function and register the route in movies.js router)

// ── DISCOVER — flexible filter endpoint ───────────────────────────────────────
// Supports: type (movie|tv), with_genres, with_original_language,
//           sort_by, page, vote_count.gte, air_date.gte, air_date.lte
exports.discover = async (req, res) => {
  try {
    const {
      type = 'movie',
      page = 1,
      sort_by = 'popularity.desc',
      with_genres,
      with_original_language,
      'vote_count.gte': voteMin,
      'air_date.gte':   airFrom,
      'air_date.lte':   airTo,
    } = req.query

    const endpoint = type === 'tv'
      ? 'https://api.themoviedb.org/3/discover/tv'
      : 'https://api.themoviedb.org/3/discover/movie'

    const params = new URLSearchParams({
      api_key: process.env.TMDB_API_KEY,
      page:    String(page),
      sort_by,
    })

    if (with_genres)            params.set('with_genres',            with_genres)
    if (with_original_language) params.set('with_original_language', with_original_language)
    if (voteMin)                params.set('vote_count.gte',         voteMin)
    if (airFrom)                params.set('first_air_date.gte',     airFrom)
    if (airTo)                  params.set('first_air_date.lte',     airTo)

    // Apply minimum vote filter for quality
    if (!voteMin && sort_by.includes('vote_average')) params.set('vote_count.gte', '100')

    const axios = require('axios')
    const { data } = await axios.get(`${endpoint}?${params.toString()}`)
    res.json(data)
  } catch (err) {
    console.error('[Movies] discover:', err.message)
    res.status(500).json({ message: 'Discovery failed' })
  }
}

// ── NOW PLAYING ────────────────────────────────────────────────────────────────
exports.nowPlaying = async (req, res) => {
  try {
    const { page = 1 } = req.query
    const axios = require('axios')
    const { data } = await axios.get(
      `https://api.themoviedb.org/3/movie/now_playing?api_key=${process.env.TMDB_API_KEY}&page=${page}&language=en-US`
    )
    res.json(data)
  } catch (err) {
    console.error('[Movies] nowPlaying:', err.message)
    res.status(500).json({ message: 'Failed' })
  }
}
