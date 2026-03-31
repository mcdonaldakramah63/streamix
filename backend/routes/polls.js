// backend/routes/polls.js — NEW FILE
const express = require('express')
const router  = express.Router()
const { protect, optionalAuth } = require('../middleware/auth')
const { getPoll, vote }         = require('../controllers/pollController')

router.get('/:tmdbId',  optionalAuth, getPoll)
router.post('/vote',    protect,      vote)

module.exports = router

// ADD TO backend/server.js:
// app.use('/api/polls', require('./routes/polls'))
