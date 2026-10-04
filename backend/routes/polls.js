const express = require('express')
const router  = express.Router()
const { protect, optionalAuth } = require('../middleware/auth')
const { getPoll, vote }         = require('../controllers/pollController')

router.post('/vote',   protect,      vote)
router.get('/:tmdbId', optionalAuth, getPoll)

module.exports = router
