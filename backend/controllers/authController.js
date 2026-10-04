// backend/controllers/authController.js
// Short-lived access tokens (Authorization header) + long-lived refresh token (HttpOnly cookie)
const User = require('../models/User')
const { recordFailure, clearFailures } = require('../middleware/accountLock')
const { log, ACTIONS } = require('../utils/auditLogger')

const ACCESS_EXPIRE  = '15m'
const REFRESH_EXPIRE = '30d'
const REFRESH_COOKIE = 'streamix_refresh'
const COOKIE_PATH    = '/api/auth'

const tokens = require('../utils/tokens')
const bcrypt = require('bcryptjs')
// Compared against when the email doesn't exist, so both cases take the same time
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-password', 12)

function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge:   30 * 24 * 60 * 60 * 1000,
    path:     COOKIE_PATH,
  })
}

// Minimal cookie reader — avoids an extra dependency for a single cookie
function readCookie(req, name) {
  const header = req.headers.cookie
  if (!header) return null
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    if (part.slice(0, idx).trim() === name) {
      try { return decodeURIComponent(part.slice(idx + 1).trim()) } catch { return null }
    }
  }
  return null
}

function sendSession(res, user, status = 200, extra = {}) {
  setRefreshCookie(res, tokens.signRefresh(user))
  res.status(status).json({
    _id:      user._id,
    username: user.username,
    email:    user.email,
    avatar:   user.avatar || '',
    isAdmin:  user.isAdmin,
    token:    tokens.signAccess(user),
    ...extra,
  })
}

// POST /api/auth/register { username, email, password, confirmTypo? }
// → 201 { verificationRequired, ticket, email, resendIn } — the account works once the emailed code is entered.
//
// An unconfirmed account doesn't own its email or username: if someone signs up with an address that's still
// unconfirmed (a typo'd sign-up, or someone squatting another person's email), the person who can actually
// read that inbox takes it over by signing up again. A username held by an account that was never confirmed
// is released after 30 minutes; never-confirmed accounts are deleted after a week (utils/jobs).
exports.register = async (req, res) => {
  try {
    const ev = require('./emailVerifyController')
    const emailCheck = require('../utils/emailCheck')
    const { username, email, password } = req.body

    const bad = await ev.emailProblem(email, { confirmTypo: req.body.confirmTypo === true })
    if (bad) return res.status(bad.status).json(bad.body)
    const canonical = emailCheck.canonical(email)

    const byEmail = await User.findOne({ $or: [{ email }, { emailCanonical: canonical }] }).select(ev.CODE_FIELDS)
    if (byEmail && byEmail.emailVerified !== false) return res.status(400).json({ message: 'An account with this email already exists — sign in instead', field: 'email' })

    const byName = await User.findOne({ username }).select('_id emailVerified createdAt').lean()
    if (byName && String(byName._id) !== String(byEmail?._id)) {
      const abandoned = byName.emailVerified === false && Date.now() - new Date(byName.createdAt).getTime() > 30 * 60 * 1000
      if (!abandoned) return res.status(400).json({ message: 'That username is taken', field: 'username' })
      await User.deleteOne({ _id: byName._id, emailVerified: false })
    }

    const verify = ev.required()
    let user
    if (byEmail) {
      // Unconfirmed account for this address: whoever can read the inbox gets it
      byEmail.username = username
      byEmail.password = password
      byEmail.email = email
      byEmail.tokenVersion = (byEmail.tokenVersion || 0) + 1
      byEmail.emailCode = {}
      user = byEmail
    } else {
      user = new User({ username, email, password, emailVerified: !verify, emailCanonical: canonical })
    }
    if (!verify) {
      user.emailVerified = true
      await user.save()
      log(ACTIONS.REGISTER, req, { userId: user._id, email: user.email })
      return sendSession(res, user, 201)
    }
    await user.save()
    log(ACTIONS.REGISTER, req, { userId: user._id, email: user.email, details: { verification: 'sent' } })
    const fresh = await User.findById(user._id).select(ev.CODE_FIELDS)
    const r = await ev.issue(fresh, 'signup')
    res.status(201).json(ev.pendingResponse(fresh, r))
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'Email or username already taken' })
    console.error('[auth] register:', err.message)
    res.status(500).json({ message: 'Registration failed — please try again' })
  }
}

// POST /api/auth/login  (trackLoginAttempt middleware runs first and rejects locked accounts)
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body
    const user = await User.findOne({ email }).select('+password')
    if (!user) {
      await bcrypt.compare(String(password), DUMMY_HASH)
      recordFailure(req)
      log(ACTIONS.LOGIN_FAIL, req, { severity: 'warn', email })
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    const match = await user.matchPassword(String(password))
    if (!match) {
      recordFailure(req)
      log(ACTIONS.LOGIN_FAIL, req, { severity: 'warn', userId: user._id, email })
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    if (user.suspended) {
      return res.status(403).json({ message: 'This account has been suspended. Contact the site admin.' })
    }

    clearFailures(req)
    // Email not confirmed yet: no session — send (or re-use) a code and ask for it
    if (user.emailVerified === false && require('./emailVerifyController').required()) {
      const ev = require('./emailVerifyController')
      const full = await User.findById(user._id).select(ev.CODE_FIELDS)
      const live = full.emailCode?.hash && full.emailCode.purpose === 'signup' && new Date(full.emailCode.expires) > new Date(Date.now() + 5 * 60 * 1000) && (full.emailCode.attempts || 0) < 5
      const r = live ? { sent: false, wait: require('../utils/verifyCode').nextWait(full.emailCode) } : await ev.issue(full, 'signup')
      return res.json(ev.pendingResponse(full, r))
    }
    // Two-factor accounts get a short ticket and must send a code next
    if (user.twoFactor?.enabled) {
      return res.json({ twoFactorRequired: true, challenge: require('./twoFactorController').issueChallenge(user) })
    }
    await require('../utils/securityAlerts').onSignIn(req, user)
    log(ACTIONS.LOGIN_SUCCESS, req, { userId: user._id, email })
    sendSession(res, user)
  } catch (err) {
    console.error('[auth] login:', err.message)
    res.status(500).json({ message: 'Sign-in failed — please try again' })
  }
}

// POST /api/auth/refresh — exchange refresh cookie for a new access token
exports.refresh = async (req, res) => {
  try {
    const token = readCookie(req, REFRESH_COOKIE)
    if (!token) return res.status(401).json({ message: 'No refresh token' })

    const decoded = tokens.verifyRefresh(token)
    const user = await User.findById(decoded.id)
    if (!user) return res.status(401).json({ message: 'User not found' })
    if (!tokens.current(decoded, user)) return res.status(401).json({ message: 'Signed out — please sign in again' })
    if (user.suspended) return res.status(401).json({ message: 'This account has been suspended' })

    sendSession(res, user)
  } catch {
    res.status(401).json({ message: 'Invalid or expired refresh token' })
  }
}

// POST /api/auth/logout
exports.logout = (req, res) => {
  res.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH })
  res.json({ success: true })
}

// POST /api/auth/logout-all (signed in) — ends every session on every device
exports.logoutAll = async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } })
  log(ACTIONS.LOGOUT_ALL || 'LOGOUT_ALL', req, { severity: 'warn' })
  res.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH })
  res.json({ success: true })
}

exports.sendSession = sendSession
