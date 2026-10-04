// controllers/twoFactorController.js — authenticator-app sign-in codes
const crypto = require('crypto')
const jwt    = require('jsonwebtoken')
const User   = require('../models/User')
const totp   = require('../utils/totp')
const { log } = require('../utils/auditLogger')

const SECRET_FIELDS = '+twoFactor.secret +twoFactor.pendingSecret +twoFactor.recovery +twoFactor.lastStep +password'
const challengeKey = () => crypto.createHash('sha256').update(`2fa-challenge:${process.env.JWT_SECRET}`).digest('hex')
const failures = new Map() // userId → wrong codes for the current challenge

/** After a correct password: a 5-minute ticket that only works for the code step */
exports.issueChallenge = (user) =>
  jwt.sign({ id: String(user._id), typ: '2fa', v: user.tokenVersion || 0 }, challengeKey(), { expiresIn: '5m', algorithm: 'HS256' })

/** Accepts a 6-digit code or a backup code; updates lastStep / removes the used backup code */
async function checkCode(user, code) {
  const step = totp.verify(user.twoFactor.secret, code, user.twoFactor.lastStep ?? -1)
  if (step !== null) { user.twoFactor.lastStep = step; await user.save(); return 'code' }
  const h = totp.hashCode(code)
  if (String(code || '').replace(/[^a-z0-9]/gi, '').length === 8 && user.twoFactor.recovery.includes(h)) {
    user.twoFactor.recovery = user.twoFactor.recovery.filter(x => x !== h)
    await user.save()
    return 'recovery'
  }
  return null
}

// POST /api/auth/2fa/verify { challenge, code } → full session
exports.verifyLogin = async (req, res) => {
  let d
  try { d = jwt.verify(String(req.body.challenge || ''), challengeKey(), { algorithms: ['HS256'] }) }
  catch { return res.status(401).json({ message: 'That took too long — sign in again' }) }
  if (d.typ !== '2fa') return res.status(401).json({ message: 'Sign in again' })

  const tries = failures.get(d.id) || 0
  if (tries >= 5) return res.status(429).json({ message: 'Too many wrong codes — sign in again in a few minutes' })

  const user = await User.findById(d.id).select(SECRET_FIELDS)
  if (!user || user.suspended || !user.twoFactor?.enabled || (user.tokenVersion || 0) !== d.v) return res.status(401).json({ message: 'Sign in again' })

  const how = await checkCode(user, req.body.code)
  if (!how) {
    failures.set(d.id, tries + 1)
    setTimeout(() => failures.delete(d.id), 10 * 60 * 1000).unref()
    log('LOGIN_2FA_FAIL', req, { severity: 'warn', userId: user._id, email: user.email })
    return res.status(401).json({ message: 'Wrong code — check your authenticator app' })
  }
  failures.delete(d.id)
  await require('../utils/securityAlerts').onSignIn(req, user)
  log('LOGIN_SUCCESS', req, { userId: user._id, email: user.email, details: { twoFactor: how } })
  require('./authController').sendSession(res, user, 200, how === 'recovery' ? { recoveryLeft: user.twoFactor.recovery.length } : {})
}

// GET /api/auth/2fa → status
exports.status = async (req, res) => {
  const user = await User.findById(req.user._id).select('+twoFactor.recovery')
  res.json({ enabled: !!user.twoFactor?.enabled, recoveryLeft: user.twoFactor?.recovery?.length || 0 })
}

// POST /api/auth/2fa/setup { password } → secret to add to an authenticator app
exports.setup = async (req, res) => {
  const user = await User.findById(req.user._id).select(SECRET_FIELDS)
  if (user.twoFactor?.enabled) return res.status(400).json({ message: 'Two-factor sign-in is already on' })
  if (!(await user.matchPassword(String(req.body.password || '')))) return res.status(400).json({ message: 'Wrong password' })
  const secret = totp.newSecret()
  user.twoFactor.pendingSecret = secret
  await user.save()
  res.json({ secret, otpauthUrl: totp.otpauthUrl(secret, user.email) })
}

// POST /api/auth/2fa/enable { code } → turns it on, returns backup codes (shown once)
exports.enable = async (req, res) => {
  const user = await User.findById(req.user._id).select(SECRET_FIELDS)
  if (!user.twoFactor?.pendingSecret) return res.status(400).json({ message: 'Start the setup again' })
  const step = totp.verify(user.twoFactor.pendingSecret, req.body.code)
  if (step === null) return res.status(400).json({ message: "That code didn't match — check the time on your phone and try the newest code" })
  const codes = totp.recoveryCodes()
  user.twoFactor.secret = user.twoFactor.pendingSecret
  user.twoFactor.pendingSecret = null
  user.twoFactor.enabled = true
  user.twoFactor.lastStep = step
  user.twoFactor.recovery = codes.map(totp.hashCode)
  user.tokenVersion = (user.tokenVersion || 0) + 1 // other devices must sign in again with a code
  await user.save()
  log('2FA_ENABLED', req, { severity: 'warn' })
  require('./authController').sendSession(res, user, 200, { recoveryCodes: codes })
}

// POST /api/auth/2fa/disable { password, code }
exports.disable = async (req, res) => {
  const user = await User.findById(req.user._id).select(SECRET_FIELDS)
  if (!user.twoFactor?.enabled) return res.json({ enabled: false })
  if (!(await user.matchPassword(String(req.body.password || '')))) return res.status(400).json({ message: 'Wrong password' })
  if (!(await checkCode(user, req.body.code))) return res.status(400).json({ message: 'Wrong code' })
  user.twoFactor = { enabled: false, secret: null, pendingSecret: null, recovery: [], lastStep: -1 }
  await user.save()
  log('2FA_DISABLED', req, { severity: 'critical' })
  require('../utils/securityAlerts').onAccountChange(user, 'Two-factor sign-in was turned off', 'Your account now signs in with just a password. If you didn’t do this, change your password and turn it back on.')
  res.json({ enabled: false })
}

// POST /api/auth/2fa/recovery { password, code } → a fresh set of backup codes
exports.newRecovery = async (req, res) => {
  const user = await User.findById(req.user._id).select(SECRET_FIELDS)
  if (!user.twoFactor?.enabled) return res.status(400).json({ message: 'Two-factor sign-in is off' })
  if (!(await user.matchPassword(String(req.body.password || '')))) return res.status(400).json({ message: 'Wrong password' })
  if (!(await checkCode(user, req.body.code))) return res.status(400).json({ message: 'Wrong code' })
  const codes = totp.recoveryCodes()
  user.twoFactor.recovery = codes.map(totp.hashCode)
  await user.save()
  res.json({ recoveryCodes: codes })
}
