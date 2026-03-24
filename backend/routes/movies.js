// backend/routes/movies.js — FULL REPLACEMENT
const express = require('express')
const c       = require('../controllers/movieController')
const { discover, nowPlaying } = require('../controllers/discoverController')
const t       = require('../controllers/tmdbController')
const r       = express.Router()

// ── Named routes BEFORE /:id catch-all ───────────────────────────────────────
r.get('/trending',    c.trending)
r.get('/popular',     c.popular)
r.get('/top-rated',   c.topRated)
r.get('/upcoming',    c.upcoming)
r.get('/now-playing', nowPlaying)
r.get('/discover',    discover)
r.get('/genres',      c.genres)
r.get('/search',      c.search)

// ── Person routes ─────────────────────────────────────────────────────────────
r.get('/person/:id/credits', t.personCredits)
r.get('/person/:id',         t.personDetails)

// ── TV routes ─────────────────────────────────────────────────────────────────
r.get('/tv/popular',             c.tvShows)
r.get('/tv/trending',            c.trendingTV)
r.get('/tv/:id/season/:season',  c.season)
r.get('/tv/:id/credits',         t.tvCredits)
r.get('/tv/:id/videos',          t.tvVideos)
r.get('/tv/:id/recommendations', t.tvRecommendations)
r.get('/tv/:id',                 c.tvDetails)

// ── Movie routes (catch-all /:id LAST) ────────────────────────────────────────
r.get('/:id/credits',            t.movieCredits)
r.get('/:id/videos',             t.movieVideos)
r.get('/:id/recommendations',    t.movieRecommendations)
r.get('/:id',                    c.details)

module.exports = r
