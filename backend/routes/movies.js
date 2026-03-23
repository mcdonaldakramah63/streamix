// backend/routes/movies.js — FULL REPLACEMENT
const express = require('express')
const c = require('../controllers/movieController')
const { discover, nowPlaying } = require('../controllers/discoverController')
const r = express.Router()

// ── Specific named routes FIRST (before /:id catch-all) ──────────────────────
r.get('/trending',    c.trending)
r.get('/popular',     c.popular)
r.get('/top-rated',   c.topRated)
r.get('/upcoming',    c.upcoming)
r.get('/now-playing', nowPlaying)       // ← NEW — must be before /:id
r.get('/discover',    discover)         // ← NEW — must be before /:id
r.get('/genres',      c.genres)
r.get('/search',      c.search)

// ── TV routes ─────────────────────────────────────────────────────────────────
r.get('/tv/popular',  c.tvShows)
r.get('/tv/trending', c.trendingTV)
r.get('/tv/:id/season/:season', c.season)
r.get('/tv/:id',      c.tvDetails)

// ── Catch-all LAST ────────────────────────────────────────────────────────────
r.get('/:id',         c.details)

module.exports = r
