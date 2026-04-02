// backend/routes/admin.js — FIXED & CLEAN FOR STREAMIX (free Railway tier)
const express = require('express');
const router = express.Router();

const { protect, adminOnly } = require('../middleware/auth');   // keep your middleware name

// Import controller with EXACT matching names
const {
  getUsers,
  deleteUser,
  toggleAdmin,
  getStats,
  getAuditLogs,
  unblockUserIP,
} = require('../controllers/adminController');

// DEBUG log so you see what's loaded on Railway
console.log('✅ ADMIN ROUTES LOADED - Functions available:', {
  getUsers: typeof getUsers,
  deleteUser: typeof deleteUser,
  toggleAdmin: typeof toggleAdmin,
  getStats: typeof getStats,
  getAuditLogs: typeof getAuditLogs,
  unblockUserIP: typeof unblockUserIP,
});

// Apply middleware to ALL admin routes
router.use(protect, adminOnly);

// Admin routes
router.get('/stats', getStats);
router.get('/users', getUsers);
router.delete('/user/:id', deleteUser);        // matches your original
router.put('/user/:id/admin', toggleAdmin);    // matches your original
router.get('/audit-logs', getAuditLogs);
router.post('/unblock-ip', unblockUserIP);

module.exports = router;