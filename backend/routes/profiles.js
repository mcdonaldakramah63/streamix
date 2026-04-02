// backend/routes/profiles.js — Small update for clarity
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const profileController = require('../controllers/profileController');   // renamed for clarity

router.get('/',                      protect, profileController.getProfiles);
router.post('/',                     protect, profileController.createProfile);
router.put('/:id',                   protect, profileController.updateProfile);
router.delete('/:id',                protect, profileController.deleteProfile);
router.post('/:id/watch',            protect, profileController.recordWatch);
router.get('/:id/recommendations',   protect, profileController.getRecommendations);
router.get('/:id/kids-content',      protect, profileController.getKidSafeContent);
router.post('/:id/verify-pin',       protect, profileController.verifyPin);

module.exports = router;