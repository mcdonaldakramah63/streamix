// backend/routes/movies.js — FULL REPLACEMENT
const express = require('express')
const c       = require('../controllers/movieController')
const { discover, nowPlaying } = require('../controllers/discoverController')
const t       = require('../controllers/tmdbController')
const r       = express.Router()

// TMDB ids and season numbers go into request paths — digits only
const digits = (max) => (req, res, next, v) => (new RegExp(`^\\d{1,${max}}$`).test(v) ? next() : res.status(400).json({ message: 'Invalid id' }))
r.param('id', digits(9))
r.param('season', digits(4))

// ── Named routes BEFORE /:id catch-all ───────────────────────────────────────
r.get('/trending',    c.trending)
r.get('/popular',     c.popular)
r.get('/top-rated',   c.topRated)
r.get('/upcoming',    c.upcoming)
r.get('/now-playing', nowPlaying)
r.get('/discover',    discover)
r.get('/genres',      c.genres)
r.get('/search',      c.search)
r.get('/kids-search', c.kidsSearch)
r.get('/kids-browse', c.kidsBrowse)
// New & Hot from the trend tracker (refreshes itself every 30 min); Top 10 by hotness, TMDB's slice as fallback
const nh = require('../controllers/newHotController')
const wrapNh = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
r.get('/new-hot',     wrapNh(nh.publicLists))
r.get('/top10',       wrapNh(nh.top10), c.top10)
r.get('/suggest', (req, res, next) => require('../controllers/searchController').suggestions(req, res).catch(next))
r.post('/search-click', (req, res, next) => require('../controllers/searchController').searchClick(req, res).catch(next))
r.get('/smart-search', require('../middleware/auth').optionalAuth, (req, res, next) => require('../controllers/searchController').smartSearch(req, res).catch(next))
r.get('/coming-soon', c.comingSoon)
r.get('/rating/:type/:id', (req, res, next) => c.rating(req, res).catch(next))

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
