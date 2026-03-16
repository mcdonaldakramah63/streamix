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
module.exports = r
