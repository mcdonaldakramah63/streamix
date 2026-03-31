// backend/routes/auth.js — VERIFY THIS EXISTS (add refresh if missing)
// Check your existing auth.js has these routes:

const express = require('express')
const router  = express.Router()
const {
  register,
  login,
  logout,
  refresh,          // ← needed for WebSocket token refresh
} = require('../controllers/authController')
const { protect } = require('../middleware/auth')

router.post('/register', register)
router.post('/login',    login)
router.post('/logout',   protect, logout)
router.post('/refresh',  refresh)   // ← ADD if missing — reads refresh token from cookie

module.exports = router

// ─────────────────────────────────────────────────────────────────────────────
// IF /auth/refresh doesn't exist, add this to authController.js:
//
// exports.refresh = async (req, res) => {
//   try {
//     const token = req.cookies?.refreshToken
//     if (!token) return res.status(401).json({ message: 'No refresh token' })
//     const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET)
//     const user    = await User.findById(decoded.id).select('-password')
//     if (!user) return res.status(401).json({ message: 'User not found' })
//     const newToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' })
//     res.json({ token: newToken })
//   } catch {
//     res.status(401).json({ message: 'Invalid refresh token' })
//   }
// }
// ─────────────────────────────────────────────────────────────────────────────
