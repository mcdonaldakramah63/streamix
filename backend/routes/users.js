const express  = require('express')
const router   = express.Router()
const { body } = require('express-validator')
const { protect } = require('../middleware/auth')
const validate    = require('../middleware/validate')
const { passwordRules } = require('../utils/passwordRules')
const { getProfile, updateProfile, changePassword } = require('../controllers/userController')
const { getAll, save, remove } = require('../controllers/continueWatchingController')

// Account
router.get ('/profile',  protect, getProfile)
router.put ('/profile',  protect, updateProfile)
router.put ('/update',   protect, updateProfile)
router.put ('/password', protect,
  body('currentPassword').isString().notEmpty().withMessage('Current password required'),
  ...passwordRules('newPassword'), validate, changePassword)

// Changing the sign-in email: a code goes to the new address first
const ev = require('../controllers/emailVerifyController')
const wrapEv = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
router.post  ('/email',         protect, wrapEv(ev.startChange))
router.post  ('/email/verify',  protect, wrapEv(ev.finishChange))
router.post  ('/email/resend',  protect, wrapEv(ev.resendChange))
router.delete('/email/pending', protect, wrapEv(ev.cancelChange))

// Episodes airing soon for shows you follow
router.get('/upcoming', protect, (req, res, next) => require('../controllers/episodeController').upcoming(req, res).catch(next))

// Continue watching
router.get   ('/continue-watching',          protect, getAll)
router.post  ('/continue-watching',          protect, save)
router.delete('/continue-watching/:movieId', protect, remove)

module.exports = router
