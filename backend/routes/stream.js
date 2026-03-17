// backend/routes/stream.js — NEW FILE
const express = require('express')
const router  = express.Router()
const { protect } = require('../middleware/auth')
const {
  searchAnime,
  getAnimeInfo,
  watchAnime,
  matchAnimeByTitle,
  searchMovie,
  getMovieInfo,
  watchMovie,
  saveTimestamp,
} = require('../controllers/streamController')

// Anime
router.get('/anime/search',   searchAnime)
router.get('/anime/info',     getAnimeInfo)
router.get('/anime/watch',    watchAnime)
router.get('/anime/match',    matchAnimeByTitle)

// Movies / TV
router.get('/movie/search',   searchMovie)
router.get('/movie/info',     getMovieInfo)
router.get('/movie/watch',    watchMovie)

// Timestamp (auth required)
router.post('/timestamp',     protect, saveTimestamp)

module.exports = router
