const express = require('express');
const { protect } = require('../middleware/auth');
const { getProfile, updateProfile, updateContinueWatching, addRecentlyViewed } = require('../controllers/userController');
const r = express.Router();
r.get('/profile', protect, getProfile);
r.put('/update', protect, updateProfile);
r.post('/continue-watching', protect, updateContinueWatching);
r.post('/recently-viewed', protect, addRecentlyViewed);
module.exports = r;
