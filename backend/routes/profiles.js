const express   = require('express')
const rateLimit = require('express-rate-limit')
const router    = express.Router()
const { protect } = require('../middleware/auth')
const c = require('../controllers/profileController')

// A 4-digit PIN is only 10,000 combinations — throttle guesses
const pinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false,
  message: { message: 'Too many PIN attempts. Try again in 15 minutes.' },
})

// Photo uploads write to disk — keep them reasonable
const avatarLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false,
  message: { message: 'Too many uploads. Try again later.' },
})

// Requests that carry a PIN: only failures count, so normal edits are never blocked
const pinFailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10, skipSuccessfulRequests: true, standardHeaders: true, legacyHeaders: false,
  message: { message: 'Too many wrong PINs. Try again in 15 minutes.' },
})

router.use(protect)

router.get('/',                    c.getProfiles)
router.post('/parent-pin',         pinFailLimiter, c.checkParentPin)
router.post('/',                   c.createProfile)
router.put('/:id',                 pinFailLimiter, c.updateProfile)
router.delete('/:id',              pinFailLimiter, c.deleteProfile)
router.post('/:id/watch',          c.recordWatch)
// Smart recommendations (utils/tasteEngine.js)
const rec = require('../controllers/recommendController')
const w = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
router.get('/:id/recommendations',            w(rec.recommendations))
router.get('/:id/more-like/:type/:tmdbId',    w(rec.moreLike))
router.get('/:id/onboarding',                 w(rec.onboardingChoices))
router.post('/:id/onboarding',                w(rec.saveOnboarding))
router.post('/:id/events',                    w(rec.events))
// Ask Streamix, Coming up for you, the news feed (controllers/discoveryController.js)
const dsc = require('../controllers/discoveryController')
const askLimiter = rateLimit({ windowMs: 60 * 1000, max: 8, standardHeaders: true, legacyHeaders: false,
  message: { message: 'One moment — too many requests. Try again in a minute.' } })
router.post('/:id/ask',                       askLimiter, w(dsc.ask))
router.get('/:id/upcoming',                   w(dsc.upcoming))
router.get('/:id/feed',                       w(dsc.feed))
router.post('/:id/play-something',            w(dsc.playSomething))
router.get('/:id/new-hot',                    w(require('../controllers/newHotController').forProfile))
router.get('/:id/kids-content',    c.getKidSafeContent)
router.post('/:id/verify-pin',     pinLimiter, c.verifyPin)
router.put('/:id/avatar',          avatarLimiter, c.uploadAvatar)
router.delete('/:id/avatar',       c.deleteAvatar)

router.get('/:id/badges', (req, res, next) => require('../controllers/badgeController').badges(req, res).catch(next))

// Viewing activity + "Not for me"
router.get('/:id/history',            c.getHistory)
router.delete('/:id/history/:tmdbId', c.removeHistory)
router.put('/:id/hidden',             c.setHidden)

// Episode progress (✓ watched markers)
const ep = require('../controllers/episodeController')
router.post('/:id/episodes',         (req, res, next) => ep.save(req, res).catch(next))
router.put('/:id/episodes/mark',     (req, res, next) => ep.mark(req, res).catch(next))
router.get('/:id/episodes/:tmdbId',  (req, res, next) => ep.list(req, res).catch(next))

// Parental controls (kids profiles)
const k = require('../controllers/kidsControlsController')
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
router.get('/:id/kids-status',     wrap(k.kidsStatus))
router.post('/:id/usage',          wrap(k.addUsage))
router.get('/:id/kids-check',      wrap(k.kidsCheck))
router.get('/:id/kids-controls',   pinFailLimiter, wrap(k.getControls))
router.put('/:id/kids-controls',   pinFailLimiter, wrap(k.updateControls))

module.exports = router
