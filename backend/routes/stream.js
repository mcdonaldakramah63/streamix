// backend/routes/stream.js — FIXED & READY FOR NETFLIX VIBES
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');

// Import with correct names from controller
const {
  animeSearch,
  animeInfo,
  animeEpisodes,
  animeWatch,
  proxy: proxyStream,      // alias so we keep proxyStream in code if you like
  saveTimestamp,
} = require('../controllers/streamController');

// Anime routes (public for now)
router.get('/anime/search', animeSearch);
router.get('/anime/info/:id', animeInfo);           // changed to :id for cleaner URL
router.get('/anime/episodes', animeEpisodes);
router.get('/anime/watch', animeWatch);             // returns sources + HLS links

// HLS Proxy — no auth (browser needs direct access)
router.get('/proxy', proxyStream);

// Save watch progress (protected)
router.post('/timestamp', protect, saveTimestamp);

module.exports = router;