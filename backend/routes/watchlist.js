// backend/routes/watchlist.js — FULL REPLACEMENT
const express = require('express')
const router  = express.Router()
const { protect } = require('../middleware/auth')
const { getWatchlist, addToWatchlist, removeFromWatchlist } = require('../controllers/watchlistController')

router.get('/',           protect, getWatchlist)
router.post('/',          protect, addToWatchlist)
router.delete('/:movieId',protect, removeFromWatchlist)

module.exports = router
