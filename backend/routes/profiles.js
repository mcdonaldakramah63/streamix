// backend/routes/profiles.js — FULL REPLACEMENT
const express = require('express')
const router  = express.Router()
const { protect, optionalAuth } = require('../middleware/auth')
const c = require('../controllers/profileController')

router.get('/',                      protect,      c.getProfiles)
router.post('/',                     protect,      c.createProfile)
router.put('/:id',                   protect,      c.updateProfile)
router.delete('/:id',                protect,      c.deleteProfile)
router.post('/:id/watch',            protect,      c.recordWatch)
router.get('/:id/recommendations',   optionalAuth, c.getRecommendations)

module.exports = router
