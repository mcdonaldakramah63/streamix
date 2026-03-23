// ADD TO backend/middleware/auth.js — add this function alongside your existing `protect`

// Optional auth — attaches user if token present, but doesn't require it
exports.optionalAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization
    if (header && header.startsWith('Bearer ')) {
      const jwt  = require('jsonwebtoken')
      const User = require('../models/User')
      const token = header.split(' ')[1]
      const decoded = jwt.verify(token, process.env.JWT_SECRET)
      req.user = await User.findById(decoded.id).select('-password')
    }
  } catch { /* no token or invalid — that's fine */ }
  next()
}
