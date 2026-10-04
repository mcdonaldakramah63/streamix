const express = require('express')
const {
  getTrendingAnime, getPopularAnime, getTopRatedAnime,
  getAnimeMovies, getAnimeByGenre, searchAnime
} = require('../controllers/animeController')

const r = express.Router()
r.get('/trending',  getTrendingAnime)
r.get('/popular',   getPopularAnime)
r.get('/top-rated', getTopRatedAnime)
r.get('/movies',    getAnimeMovies)
r.get('/genre',     getAnimeByGenre)
r.get('/search',    searchAnime)

// Free, official episodes from the rights holders' YouTube channels
const official = require('../controllers/officialAnimeController')
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
r.get('/official/shows',                 wrap(official.shows))
r.get('/official/title/:type/:tmdbId',   wrap(official.forTitle))
r.post('/official/:videoId/outcome',     wrap(official.outcome))
module.exports = r
