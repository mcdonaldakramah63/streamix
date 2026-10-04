const tokens = require('../utils/tokens')
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
    const decoded = tokens.verifyAccess(token)

    // Fetch user fresh from DB each request — ensures banned/deleted users are blocked
    const user = await User.findById(decoded.id).select('-password')

    if (!user) {
      return res.status(401).json({ message: 'User no longer exists' })
    }
    if (!tokens.current(decoded, user)) {
      return res.status(401).json({ message: 'Session expired — please login again' })
    }
    if (user.suspended) {
      return res.status(403).json({ message: 'This account has been suspended', suspended: true })
    }

    // Cheap activity tracking for the admin dashboard (at most one write per 5 minutes)
    if (!user.lastActiveAt || Date.now() - user.lastActiveAt.getTime() > 5 * 60 * 1000) {
      // Same write also learns their time zone and the hours they're usually here (for quiet hours and
      // sending notifications when they're likely to see them)
      const { validTz, localTime } = require('../utils/notifyEngine')
      const tzHeader = String(req.headers['x-timezone'] || '')
      const tz = validTz(tzHeader) ? tzHeader : user.tz
      const update = { $set: { lastActiveAt: new Date() } }
      if (tz && tz !== user.tz) update.$set.tz = tz
      if (tz) update.$inc = { [`activeHours.${localTime(new Date(), tz).h}`]: 1 }
      User.updateOne({ _id: user._id }, update).catch(() => {})
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
    const decoded = tokens.verifyAccess(auth.split(' ')[1])
    const user = await User.findById(decoded.id).select('-password')
    if (user && !user.suspended && tokens.current(decoded, user)) req.user = user
  } catch {}
  next()
}

module.exports = { protect, adminOnly, optionalAuth }
