// backend/routes/profiles.js — ENSURE THIS FILE EXISTS AND IS CORRECT
// If you already have this file, compare it with this one
const express = require('express')
const router  = express.Router()
const { protect, optionalAuth } = require('../middleware/auth')
const profileController = require('../controllers/profileController')

// GET /api/profiles          — get all profiles for logged-in user
router.get('/',               protect, profileController.getProfiles)

// POST /api/profiles         — create a new profile
router.post('/',              protect, profileController.createProfile)

// PUT /api/profiles/:id      — update a profile
router.put('/:id',            protect, profileController.updateProfile)

// DELETE /api/profiles/:id   — delete a profile
router.delete('/:id',         protect, profileController.deleteProfile)

// POST /api/profiles/:id/watch — record a watch event for recommendations
router.post('/:id/watch',     protect, profileController.recordWatch)

// GET /api/profiles/:id/recommendations — get personalised recommendations
router.get('/:id/recommendations', optionalAuth, profileController.getRecommendations)

module.exports = router

// ─────────────────────────────────────────────────────────────────────────────
// ADD TO backend/server.js (if not already there):
//
// app.use('/api/profiles', require('./routes/profiles'))
//
// Make sure it comes AFTER the auth middleware setup and BEFORE the 404 handler
// ─────────────────────────────────────────────────────────────────────────────
