const User = require('../models/User')

const MAX_ATTEMPTS = 5
const LOCK_TIME    = 30 * 60 * 1000 // 30 minutes

const trackLoginAttempt = async (req, res, next) => {
  const { email } = req.body
  if (!email) return next()

  try {
    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+loginAttempts +lockUntil')
    if (!user) return next() // Don't reveal user existence

    // Still locked?
    if (user.lockUntil && user.lockUntil > Date.now()) {
      const mins = Math.ceil((user.lockUntil - Date.now()) / 60000)
      return res.status(423).json({
        message: `Account locked due to too many failed attempts. Try again in ${mins} minute${mins > 1 ? 's' : ''}.`,
        locked: true,
        lockUntil: user.lockUntil,
      })
    }

    // Lock expired — reset
    if (user.lockUntil && user.lockUntil <= Date.now()) {
      user.loginAttempts = 0
      user.lockUntil     = undefined
      await user.save()
    }

    req._loginUser = user
    next()
  } catch (e) {
    next()
  }
}

const handleFailedLogin = async (req) => {
  const user = req._loginUser
  if (!user) return

  user.loginAttempts = (user.loginAttempts || 0) + 1

  if (user.loginAttempts >= MAX_ATTEMPTS) {
    user.lockUntil     = new Date(Date.now() + LOCK_TIME)
    user.loginAttempts = 0
    console.warn(`[SECURITY] Account locked: ${user.email} — too many failed logins`)
  }

  await user.save()
}

const resetLoginAttempts = async (req) => {
  const user = req._loginUser
  if (!user) return
  if (user.loginAttempts > 0 || user.lockUntil) {
    user.loginAttempts = 0
    user.lockUntil     = undefined
    await user.save()
  }
}

module.exports = { trackLoginAttempt, handleFailedLogin, resetLoginAttempts }
