// backend/routes/movies.js — FULL REPLACEMENT
const express = require('express')
const c = require('../controllers/movieController')
const { discover, nowPlaying } = require('../controllers/discoverController')
const r = express.Router()

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
r.get('/person/:id/credits', c.personCredits)
r.get('/person/:id',         c.personDetails)

// ── TV routes ─────────────────────────────────────────────────────────────────
r.get('/tv/popular',                c.tvShows)
r.get('/tv/trending',               c.trendingTV)
r.get('/tv/:id/season/:season',     c.season)
r.get('/tv/:id/credits',            c.tvCredits)
r.get('/tv/:id/videos',             c.tvVideos)
r.get('/tv/:id/recommendations',    c.tvRecommendations)
r.get('/tv/:id',                    c.tvDetails)

// ── Movie routes ──────────────────────────────────────────────────────────────
r.get('/:id/credits',               c.credits)
r.get('/:id/videos',                c.videos)
r.get('/:id/recommendations',       c.recommendations)
r.get('/:id',                       c.details)

module.exports = r
