const jwt  = require('jsonwebtoken')
const User = require('../models/User')

const protect = async (req, res, next) => {
  const auth = req.headers.authorization

  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Not authorized — no token provided' })
  }

  const token = auth.split(' ')[1]

  if (!token || token === 'null' || token === 'undefined') {
    return res.status(401).json({ message: 'Not authorized — invalid token format' })
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    // Fetch user fresh from DB each request — ensures banned/deleted users are blocked
    const user = await User.findById(decoded.id).select('-password')

    if (!user) {
      return res.status(401).json({ message: 'User no longer exists' })
    }

    req.user = user
    next()
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Session expired — please login again' })
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token — please login again' })
    }
    return res.status(401).json({ message: 'Not authorized' })
  }
}

const adminOnly = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authorized' })
  }
  if (!req.user.isAdmin) {
    // Log attempted admin access
    console.warn(`[SECURITY] Admin access denied for user: ${req.user.email} — IP: ${req.ip}`)
    return res.status(403).json({ message: 'Admin access required' })
  }
  next()
}

// Optional auth — attaches user if token present, doesn't block if missing
const optionalAuth = async (req, res, next) => {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) return next()
  try {
    const decoded = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET)
    req.user = await User.findById(decoded.id).select('-password')
  } catch {}
  next()
}

module.exports = { protect, adminOnly, optionalAuth }
