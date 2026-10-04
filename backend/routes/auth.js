const express  = require('express')
const { body } = require('express-validator')
const { register, login, refresh, logout, logoutAll } = require('../controllers/authController')
const { protect } = require('../middleware/auth')
const { trackLoginAttempt } = require('../middleware/accountLock')
const validate = require('../middleware/validate')
const { passwordRules } = require('../utils/passwordRules')

const r = express.Router()

const registerRules = [
  body('username').trim()
    .isLength({ min: 3, max: 30 }).withMessage('Username must be 3–30 characters')
    .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username: letters, numbers and underscores only'),
  body('email')
    .isEmail().withMessage('Valid email required')
    .normalizeEmail()
    .isLength({ max: 100 }).withMessage('Email too long'),
  ...passwordRules('password'),
]

const loginRules = [
  body('email').isEmail().withMessage('Valid email required').normalizeEmail(),
  body('password').isString().notEmpty().withMessage('Password required'),
]

r.post('/register', registerRules, validate, register)
r.post('/login',    loginRules, validate, trackLoginAttempt, login)
r.post('/refresh',  refresh)
r.post('/logout',   logout)
r.post('/logout-all', protect, logoutAll)

// Two-factor sign-in
const tf = require('../controllers/twoFactorController')
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
r.post('/2fa/verify',   wrap(tf.verifyLogin))
r.get('/2fa',           protect, wrap(tf.status))
r.post('/2fa/setup',    protect, wrap(tf.setup))
r.post('/2fa/enable',   protect, wrap(tf.enable))
r.post('/2fa/disable',  protect, wrap(tf.disable))
r.post('/2fa/recovery', protect, wrap(tf.newRecovery))
// Email verification (sign-up). email-check gives live feedback on the form; it's rate-limited separately
// because it does DNS lookups and succeeds most of the time (the /api/auth limiter only counts failures).
const ev = require('../controllers/emailVerifyController')
const rateLimit = require('express-rate-limit')
const checkLimit = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { message: 'Slow down a little' } })
const codeLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 40, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many tries — wait a few minutes' } })
r.get ('/email-check',         checkLimit, wrap(ev.check))
r.post('/verify-email',        codeLimit,  wrap(ev.verify))
r.post('/verify-email/resend', codeLimit,  wrap(ev.resend))
// Recent sign-ins for this account
r.get('/activity',      protect, wrap(require('../controllers/activityController').activity))

module.exports = r
