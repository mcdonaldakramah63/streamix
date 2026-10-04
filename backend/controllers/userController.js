const User = require('../models/User')
const { log, ACTIONS } = require('../utils/auditLogger')

const publicUser = (u) => ({
  _id:      u._id,
  username: u.username,
  email:    u.email,
  avatar:   u.avatar,
  isAdmin:  u.isAdmin,
  emailVerified: u.emailVerified !== false,
  pendingEmail: u.pendingEmail || null,
})

// GET /api/users/profile
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-loginAttempts -lockUntil')
    if (!user) return res.status(404).json({ message: 'User not found' })
    res.json(user)
  } catch {
    res.status(500).json({ message: 'Failed to fetch profile' })
  }
}

// PUT /api/users/profile  (also mounted at /api/users/update)
// Password changes go through PUT /api/users/password, which checks the current password.
const updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('+password')
    if (!user) return res.status(404).json({ message: 'User not found' })

    const { username, email, avatar } = req.body
    // Changing the sign-in email needs the password (stops a borrowed session taking over the account)
    if (email !== undefined && String(email).toLowerCase().trim() !== user.email) {
      if (!(await user.matchPassword(String(req.body.currentPassword || '')))) {
        return res.status(400).json({ message: 'Enter your current password to change your email', needsPassword: true })
      }
    }

    if (username !== undefined) {
      if (!/^[a-zA-Z0-9_]{3,30}$/.test(String(username).trim())) {
        return res.status(400).json({ message: 'Username: 3–30 letters, numbers or underscores' })
      }
      user.username = String(username).trim()
    }
    // A new email must be confirmed before it replaces the old one (POST /users/email does the rest)
    const emailChanging = email !== undefined && String(email).toLowerCase().trim() !== user.email
    if (avatar !== undefined && avatar !== '') {
      if (!/^https?:\/\//.test(avatar)) {
        return res.status(400).json({ message: 'Avatar must be a valid URL' })
      }
      user.avatar = String(avatar).slice(0, 500)
    }

    const updated = await user.save()
    log(ACTIONS.PROFILE_UPDATE, req)
    if (emailChanging) {
      const r = await require('./emailVerifyController').beginChange(user._id, email, req.body.currentPassword, req.body.confirmTypo)
      const fresh = await User.findById(user._id)
      return res.status(r.status).json({ ...publicUser(fresh), ...r.body })
    }
    res.json(publicUser(updated))
  } catch (e) {
    if (e.code === 11000) return res.status(400).json({ message: 'Username or email already taken' })
    res.status(500).json({ message: 'Update failed' })
  }
}

// PUT /api/users/password  { currentPassword, newPassword }
const changePassword = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('+password')
    if (!user) return res.status(404).json({ message: 'User not found' })

    const ok = await user.matchPassword(String(req.body.currentPassword || ''))
    if (!ok) return res.status(400).json({ message: 'Current password is incorrect' })

    user.password = req.body.newPassword
    user.tokenVersion = (user.tokenVersion || 0) + 1 // other devices are signed out
    await user.save()
    log(ACTIONS.PASSWORD_CHANGE, req, { severity: 'warn' })
    require('../utils/securityAlerts').onAccountChange(user, 'Your password was changed', 'Other devices were signed out. If you didn’t do this, reset your password right away.')
    // Keep this device signed in with a fresh session
    require('./authController').sendSession(res, user)
  } catch {
    res.status(500).json({ message: 'Failed to change password' })
  }
}

module.exports = { getProfile, updateProfile, changePassword }
