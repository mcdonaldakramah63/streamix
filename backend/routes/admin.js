const express = require('express')
const router  = express.Router()
const { protect, adminOnly } = require('../middleware/auth')
const {
  getUsers, deleteUser, toggleAdmin, getStats, getAuditLogs, unblockUserIP,
} = require('../controllers/adminController')

router.use(protect, adminOnly)

router.get('/stats',          getStats)
router.get('/users',          getUsers)
router.delete('/user/:id',    deleteUser)
router.put('/user/:id/admin', toggleAdmin)
router.get('/audit-logs',     getAuditLogs)
router.post('/unblock-ip',    unblockUserIP)

// Library: bulk add videos by URL
router.use(require('./library').adminRouter)

// Extra admin tools
const x = require('../controllers/adminExtrasController')
const validate = require('../middleware/validate')
const { passwordRules } = require('../utils/passwordRules')
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

router.get('/user/:id',            wrap(x.userDetail))
router.put('/user/:id/suspend',    wrap(x.setSuspended))
router.put('/user/:id/unlock',     wrap(x.unlockUser))
router.put('/user/:id/password',   ...passwordRules('newPassword'), validate, wrap(x.resetPassword))
router.get('/analytics',           wrap(x.analytics))
router.get('/announcements',       wrap(x.listAnnouncements))
router.post('/announcements',      wrap(x.createAnnouncement))
router.put('/announcements/:id',   wrap(x.toggleAnnouncement))
router.delete('/announcements/:id', wrap(x.deleteAnnouncement))
router.post('/library/bulk-delete', wrap(x.libraryBulkDelete))

// Problem reports from viewers
const rep = require('../controllers/reportController')
router.get('/reports',        wrap(rep.adminList))
router.put('/reports/:id',    wrap(rep.setStatus))
router.delete('/reports/:id', wrap(rep.remove))

// Collections
const col = require('../controllers/collectionController')
router.get('/collections',        wrap(col.adminList))
router.post('/collections',       wrap(col.create))
router.put('/collections/:id',    wrap(col.update))
router.delete('/collections/:id', wrap(col.remove))

// Push broadcast + usage limits
const settings = require('../utils/settings')
router.post('/notify', wrap(require('../controllers/notificationController').broadcast))
// Official anime channels (YouTube): list, add, sync, review
const off = require('../controllers/officialAnimeController')
router.get('/official',                 wrap(off.adminStatus))
router.post('/official/channels',       wrap(off.addChannel))
router.put('/official/channels/:id',    wrap(off.updateChannel))
router.delete('/official/channels/:id', wrap(off.removeChannel))
router.post('/official/sync',           wrap(off.sync))
router.put('/official/series',          wrap(off.decideSeries))
// Confirm an account's email by hand (e.g. the server has no SMTP set up yet)
router.put('/user/:id/verify-email', wrap(async (req, res) => {
  const User = require('../models/User')
  if (!/^[a-f0-9]{24}$/i.test(req.params.id)) return res.status(400).json({ message: 'Invalid id' })
  const found = await User.findById(req.params.id).select('email').lean()
  if (!found) return res.status(404).json({ message: 'User not found' })
  const u = await User.findByIdAndUpdate(req.params.id, { $set: { emailVerified: true, emailCanonical: require('../utils/emailCheck').canonical(found.email) }, $unset: { emailCode: 1 } }, { new: true })
    .select('username email emailVerified').lean()
  require('../utils/auditLogger').log('ADMIN_VERIFY_EMAIL', req, { severity: 'warn', details: { user: u.username, email: u.email } })
  res.json(u)
}))
// Notification system health: outbox by status, recent failures, whether email is set up
router.get('/notifications/health', wrap(async (_req, res) => {
  const Delivery = require('../models/Delivery')
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000)
  const [byStatus, failures] = await Promise.all([
    Delivery.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: { status: '$status', channel: '$channel' }, n: { $sum: 1 } } }]),
    Delivery.find({ status: 'failed', createdAt: { $gte: since } }).sort({ createdAt: -1 }).limit(10).select('channel kind result createdAt').lean(),
  ])
  res.json({ emailConfigured: require('../utils/mailer').configured(), lastWeek: byStatus.map(r => ({ ...r._id, n: r.n })), failures })
}))
router.get('/settings/limits', wrap(async (_req, res) => res.json({ limits: await settings.limits(), defaults: settings.DEFAULT_LIMITS })))
router.put('/settings/limits', wrap(async (req, res) => {
  const next = { ...((await settings.get('limits')) || {}), ...settings.cleanLimits(req.body) }
  await settings.set('limits', next)
  require('../utils/auditLogger').log('ADMIN_LIMITS', req, { severity: 'warn', details: next })
  res.json({ limits: await settings.limits() })
}))

module.exports = router
