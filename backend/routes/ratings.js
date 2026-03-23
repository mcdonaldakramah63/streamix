// backend/routes/ratings.js — NEW FILE
const express = require('express')
const router  = express.Router()
const { protect, optionalAuth } = require('../middleware/auth')
const { rate, getStats } = require('../controllers/ratingController')

router.post('/',         protect,      rate)
router.get('/:tmdbId',   optionalAuth, getStats)

module.exports = router
