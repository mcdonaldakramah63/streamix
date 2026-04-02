// backend/routes/profiles.js — FULL REWRITE WITH ROBUST KID MODE
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const c = require('../controllers/profileController');

// Public profile routes (protected by auth)
router.get('/', protect, c.getProfiles);
router.post('/', protect, c.createProfile);
router.put('/:id', protect, c.updateProfile);
router.delete('/:id', protect, c.deleteProfile);
router.post('/:id/watch', protect, c.recordWatch);
router.get('/:id/recommendations', protect, c.getRecommendations);

// Kid Mode specific
router.get('/:id/kids-content', protect, c.getKidSafeContent);
router.post('/:id/verify-pin', protect, c.verifyPin);

module.exports = router;