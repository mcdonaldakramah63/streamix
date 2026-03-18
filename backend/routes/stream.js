// backend/routes/stream.js — FULL REPLACEMENT
const express = require('express')
const router  = express.Router()
const { protect } = require('../middleware/auth')
const {
  searchAnime,
  getAnimeInfo,
  getAnimeEpisodes,
  watchAnime,
  proxyStream,
  saveTimestamp,
} = require('../controllers/streamController')

// Anime
router.get('/anime/search',   searchAnime)
router.get('/anime/info',     getAnimeInfo)
router.get('/anime/episodes', getAnimeEpisodes)
router.get('/anime/watch',    watchAnime)

// M3U8 proxy — no auth required (browser fetches directly)
router.get('/proxy', proxyStream)

// Timestamp — auth required
router.post('/timestamp', protect, saveTimestamp)

module.exports = router
