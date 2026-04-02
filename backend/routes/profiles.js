// backend/routes/profiles.js — FULL FIXED VERSION
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const profileController = require('../controllers/profileController');

// All routes protected
router.get('/', protect, profileController.getProfiles);
router.post('/', protect, profileController.createProfile);
router.put('/:id', protect, profileController.updateProfile);
router.delete('/:id', protect, profileController.deleteProfile);
router.post('/:id/watch', protect, profileController.recordWatch);
router.get('/:id/recommendations', protect, profileController.getRecommendations);

// Kid Mode routes
router.get('/:id/kids-content', protect, profileController.getKidSafeContent);
router.post('/:id/verify-pin', protect, profileController.verifyPin);

module.exports = router;