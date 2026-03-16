const { cachedTmdb } = require('../config/tmdb')

// TMDB genre ID 16 = Animation, keyword 210024 = anime
const ANIME_KEYWORD = 210024
const ANIMATION_GENRE = 16

const getTrendingAnime = async (req, res) => {
  try {
    const d = await cachedTmdb('/trending/tv/week', { with_genres: ANIMATION_GENRE })
    // Filter to likely anime (Japanese origin or anime keyword)
    const results = (d.results || []).filter(s =>
      s.origin_country?.includes('JP') || s.original_language === 'ja'
    )
    res.json({ ...d, results })
  } catch (e) { res.status(500).json({ message: e.message }) }
}

const getPopularAnime = async (req, res) => {
  const { page = 1 } = req.query
  try {
    const d = await cachedTmdb('/discover/tv', {
      with_keywords: ANIME_KEYWORD,
      sort_by: 'popularity.desc',
      page,
      with_original_language: 'ja',
    })
    res.json(d)
  } catch (e) { res.status(500).json({ message: e.message }) }
}

const getTopRatedAnime = async (req, res) => {
  const { page = 1 } = req.query
  try {
    const d = await cachedTmdb('/discover/tv', {
      with_keywords: ANIME_KEYWORD,
      sort_by: 'vote_average.desc',
      'vote_count.gte': 200,
      page,
      with_original_language: 'ja',
    })
    res.json(d)
  } catch (e) { res.status(500).json({ message: e.message }) }
}

const getAnimeMovies = async (req, res) => {
  const { page = 1 } = req.query
  try {
    const d = await cachedTmdb('/discover/movie', {
      with_keywords: ANIME_KEYWORD,
      sort_by: 'popularity.desc',
      page,
      with_original_language: 'ja',
    })
    res.json(d)
  } catch (e) { res.status(500).json({ message: e.message }) }
}

const getAnimeByGenre = async (req, res) => {
  const { genre, page = 1 } = req.query
  // Sub-genres mapped to TMDB keywords
  const genreKeywords = {
    action:   '210024,1562',
    romance:  '210024,9748',
    isekai:   '210024,258720',
    shonen:   '210024,210756',
    seinen:   '210024,210757',
    mecha:    '210024,4270',
    horror:   '210024,9951',
  }
  try {
    const keywords = genreKeywords[genre] || String(ANIME_KEYWORD)
    const d = await cachedTmdb('/discover/tv', {
      with_keywords: keywords,
      sort_by: 'popularity.desc',
      page,
      with_original_language: 'ja',
    })
    res.json(d)
  } catch (e) { res.status(500).json({ message: e.message }) }
}

const searchAnime = async (req, res) => {
  const { query, page = 1 } = req.query
  if (!query) return res.status(400).json({ message: 'Query required' })
  try {
    const d = await cachedTmdb('/search/tv', {
      query,
      page,
      with_original_language: 'ja',
    })
    res.json(d)
  } catch (e) { res.status(500).json({ message: e.message }) }
}

module.exports = { getTrendingAnime, getPopularAnime, getTopRatedAnime, getAnimeMovies, getAnimeByGenre, searchAnime }
