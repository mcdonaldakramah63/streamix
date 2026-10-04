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
  proxy: proxyStream,
  saveTimestamp,
  vidsrcWatch,
} = require('../controllers/streamController');

// Anime routes (public for now)
router.get('/anime/search', animeSearch);
router.get('/anime/info/:id', animeInfo);
router.get('/anime/episodes', animeEpisodes);
router.get('/anime/watch', animeWatch);

// HLS Proxy — no auth (browser needs direct access)
router.get('/proxy', proxyStream);

// VidSrc direct stream route
router.get('/vidsrc/:tmdbId', vidsrcWatch);

// Embed providers, best-first (learned from health checks + what happened in viewers' sessions)
const sources = require('../services/sourceTracker')
router.get('/sources', async (req, res, next) => {
  try { res.json({ type: req.query.type === 'tv' ? 'tv' : 'movie', sources: await sources.ranked(req.query.type) }) } catch (e) { next(e) }
})
// A session's outcome for a provider: ok = watched a while; not ok = failed to load / switched away fast
const outcomeCounts = new Map() // userId → [timestamps] (60 per hour each)
router.post('/source-outcome', protect, async (req, res, next) => {
  try {
    const now = Date.now(), k = String(req.user._id)
    const list = (outcomeCounts.get(k) || []).filter(t => now - t < 3600_000)
    if (list.length >= 60) return res.status(429).json({ message: 'Too many reports' })
    list.push(now); outcomeCounts.set(k, list)
    await sources.record(String(req.body.source || ''), req.body.type, req.body.ok === true)
    res.json({ ok: true })
  } catch (e) { next(e) }
})

// Save watch progress (protected)
router.post('/timestamp', protect, saveTimestamp);

module.exports = router;