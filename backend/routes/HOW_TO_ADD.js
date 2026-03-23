// ─────────────────────────────────────────────────────────────────────────────
// OPEN backend/routes/movies.js
// Add these lines — place them with the other router.get() lines
// ─────────────────────────────────────────────────────────────────────────────

// Add this near the top of movies.js, with the other requires:
const { discover, nowPlaying } = require('../controllers/discoverController')

// Add these two routes alongside the other router.get() calls:
router.get('/discover',    discover)
router.get('/now-playing', nowPlaying)

// ─────────────────────────────────────────────────────────────────────────────
// FINAL movies.js should look something like:
//
// const express = require('express')
// const router  = express.Router()
// const { getTrending, getPopular, ... } = require('../controllers/movieController')
// const { discover, nowPlaying }         = require('../controllers/discoverController')  ← ADD
//
// router.get('/trending',    getTrending)
// router.get('/popular',     getPopular)
// router.get('/top-rated',   getTopRated)
// router.get('/upcoming',    getUpcoming)
// router.get('/discover',    discover)    ← ADD
// router.get('/now-playing', nowPlaying)  ← ADD
// ...
// ─────────────────────────────────────────────────────────────────────────────
