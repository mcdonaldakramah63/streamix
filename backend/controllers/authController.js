// backend/controllers/authController.js — ADD these functions / replace existing
// This adds refresh token support with HttpOnly cookies

const User    = require('../models/User')
const jwt     = require('jsonwebtoken')
const bcrypt  = require('bcryptjs')

const ACCESS_EXPIRE  = '15m'   // short-lived access token
const REFRESH_EXPIRE = '30d'   // long-lived refresh token

function signAccess(id) {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: ACCESS_EXPIRE })
}
function signRefresh(id) {
  return jwt.sign({ id }, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET + '_refresh', { expiresIn: REFRESH_EXPIRE })
}

function setRefreshCookie(res, token) {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge:   30 * 24 * 60 * 60 * 1000, // 30 days
    path:     '/api/auth',
  })
}

// POST /api/auth/register
exports.register = async (req, res) => {
  try {
    const { username, email, password } = req.body
    if (!username || !email || !password) {
      return res.status(400).json({ message: 'All fields required' })
    }
    const exists = await User.findOne({ $or: [{ email }, { username }] })
    if (exists) {
      return res.status(400).json({ message: 'Email or username already taken' })
    }
    const user = await User.create({ username, email, password })
    const accessToken  = signAccess(user._id)
    const refreshToken = signRefresh(user._id)
    setRefreshCookie(res, refreshToken)
    res.status(201).json({
      _id:      user._id,
      username: user.username,
      email:    user.email,
      isAdmin:  user.isAdmin,
      token:    accessToken,
    })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

// POST /api/auth/login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' })

    const user = await User.findOne({ email }).select('+password')
    if (!user) return res.status(401).json({ message: 'Invalid credentials' })

    // Check lock
    if (user.lockUntil && user.lockUntil > Date.now()) {
      const mins = Math.ceil((user.lockUntil - Date.now()) / 60000)
      return res.status(429).json({ message: `Account locked. Try again in ${mins} minutes.` })
    }

    const match = await user.matchPassword(password)
    if (!match) {
      user.loginAttempts = (user.loginAttempts || 0) + 1
      if (user.loginAttempts >= 5) {
        user.lockUntil = new Date(Date.now() + 15 * 60 * 1000)
      }
      await user.save()
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    // Reset attempts
    user.loginAttempts = 0
    user.lockUntil     = null
    await user.save()

    const accessToken  = signAccess(user._id)
    const refreshToken = signRefresh(user._id)
    setRefreshCookie(res, refreshToken)

    res.json({
      _id:      user._id,
      username: user.username,
      email:    user.email,
      isAdmin:  user.isAdmin,
      token:    accessToken,
    })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

// POST /api/auth/refresh — exchange refresh cookie for new access token
exports.refresh = async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken
    if (!refreshToken) return res.status(401).json({ message: 'No refresh token' })

    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET + '_refresh'
    )
    const user = await User.findById(decoded.id)
    if (!user) return res.status(401).json({ message: 'User not found' })

    const newAccess  = signAccess(user._id)
    const newRefresh = signRefresh(user._id)
    setRefreshCookie(res, newRefresh)

    res.json({
      _id:      user._id,
      username: user.username,
      email:    user.email,
      isAdmin:  user.isAdmin,
      token:    newAccess,
    })
  } catch (err) {
    res.status(401).json({ message: 'Invalid or expired refresh token' })
  }
}

// POST /api/auth/logout
exports.logout = (req, res) => {
  res.clearCookie('refreshToken', { path: '/api/auth' })
  res.json({ success: true })
}
