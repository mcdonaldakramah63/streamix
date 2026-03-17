// backend/routes/users.js — FULL REPLACEMENT
const express = require('express')
const router  = express.Router()
const { protect } = require('../middleware/auth')
const { getProfile, updateProfile } = require('../controllers/userController')
const { getAll, save, remove } = require('../controllers/continueWatchingController')

// Profile
router.get ('/profile', protect, getProfile)
router.put ('/update',  protect, updateProfile)

// Continue watching
router.get   ('/continue-watching',           protect, getAll)
router.post  ('/continue-watching',           protect, save)
router.delete('/continue-watching/:movieId',  protect, remove)

module.exports = router
