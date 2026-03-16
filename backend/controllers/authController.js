const jwt    = require('jsonwebtoken')
const { validationResult } = require('express-validator')
const User   = require('../models/User')
const { log, ACTIONS } = require('../utils/auditLogger')
const { handleFailedLogin, resetLoginAttempts } = require('../middleware/accountLock')

const genToken = (id) =>
  jwt.sign(
    { id, v: 1 },
    process.env.JWT_SECRET,
    { expiresIn: '7d', issuer: 'streamix', audience: 'streamix-client' }
  )

const register = async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg })
  }

  const { username, email, password } = req.body

  try {
    const exists = await User.findOne({ $or: [{ email }, { username }] })
    if (exists) {
      return res.status(400).json({ message: 'An account with those details already exists' })
    }

    const user = await User.create({ username, email: email.toLowerCase().trim(), password })

    await log(ACTIONS.REGISTER, req, { userId: user._id, email: user.email })

    res.status(201).json({
      _id: user._id, username: user.username,
      email: user.email, isAdmin: user.isAdmin,
      token: genToken(user._id),
    })
  } catch (err) {
    console.error('Register error:', err.message)
    res.status(500).json({ message: 'Registration failed' })
  }
}

const login = async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password required' })
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase().trim() })
      .select('+password +loginAttempts +lockUntil')

    const passwordMatch = user ? await user.matchPassword(password) : false

    if (!user || !passwordMatch) {
      await handleFailedLogin(req)
      await log(ACTIONS.LOGIN_FAIL, req, {
        email, severity: 'warn',
        details: { reason: !user ? 'user_not_found' : 'wrong_password' }
      })
      return res.status(401).json({ message: 'Invalid email or password' })
    }

    await resetLoginAttempts(req)
    await log(ACTIONS.LOGIN_SUCCESS, req, { userId: user._id, email: user.email })

    res.json({
      _id: user._id, username: user.username,
      email: user.email, isAdmin: user.isAdmin,
      token: genToken(user._id),
    })
  } catch (err) {
    console.error('Login error:', err.message)
    res.status(500).json({ message: 'Login failed' })
  }
}

module.exports = { register, login }
