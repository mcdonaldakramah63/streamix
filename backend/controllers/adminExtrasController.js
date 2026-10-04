// backend/controllers/adminExtrasController.js — user actions, announcements, analytics, health
const mongoose     = require('mongoose')
const User         = require('../models/User')
const Watchlist    = require('../models/Watchlist')
const Profile      = require('../models/Profile')
const Rating       = require('../models/Rating')
const LibraryItem  = require('../models/LibraryItem')
const Announcement = require('../models/Announcement')
const { log } = require('../utils/auditLogger')

const DAY = 24 * 60 * 60 * 1000
const startedAt = Date.now()

async function targetUser(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) { res.status(400).json({ message: 'Invalid id' }); return null }
  const user = await User.findById(req.params.id)
  if (!user) { res.status(404).json({ message: 'User not found' }); return null }
  return user
}

// ── Users ────────────────────────────────────────────────────────────────────

// GET /api/admin/user/:id — everything an admin needs to help a user
exports.userDetail = async (req, res) => {
  const user = await targetUser(req, res)
  if (!user) return
  const [profiles, watchlistCount, ratingsCount] = await Promise.all([
    Profile.find({ user: user._id }).select('name avatar avatarImage avatarConfig color isKids pin watchHistory').select('+pin').lean(),
    Watchlist.countDocuments({ user: user._id }),
    Rating.countDocuments({ userId: user._id }),
  ])
  const cw = [...(user.continueWatching || [])].sort((a, b) => new Date(b.watchedAt) - new Date(a.watchedAt))
  res.json({
    _id: user._id, username: user.username, email: user.email, isAdmin: user.isAdmin,
    createdAt: user.createdAt, lastActiveAt: user.lastActiveAt,
    suspended: user.suspended, suspendedReason: user.suspendedReason,
    emailVerified: user.emailVerified !== false, pendingEmail: user.pendingEmail || null,
    locked: !!user.lockUntil && user.lockUntil > Date.now(), lockUntil: user.lockUntil, loginAttempts: user.loginAttempts,
    watchlistCount, ratingsCount,
    profiles: profiles.map(p => ({
      _id: p._id, name: p.name, avatar: p.avatar, avatarImage: p.avatarImage, avatarConfig: p.avatarConfig, color: p.color, isKids: p.isKids,
      hasPin: !!p.pin, watched: (p.watchHistory || []).length,
    })),
    recentlyWatched: cw.slice(0, 10).map(i => ({
      movieId: i.movieId, title: i.title, type: i.type, season: i.season, episode: i.episode,
      progress: i.progress, watchedAt: i.watchedAt,
    })),
  })
}

// PUT /api/admin/user/:id/suspend { suspended, reason }
exports.setSuspended = async (req, res) => {
  const user = await targetUser(req, res)
  if (!user) return
  if (user._id.equals(req.user._id)) return res.status(400).json({ message: "You can't suspend your own account" })
  if (user.isAdmin) return res.status(400).json({ message: 'Remove admin rights before suspending this account' })
  user.suspended = !!req.body.suspended
  user.suspendedReason = user.suspended ? String(req.body.reason || '').slice(0, 300) : ''
  if (user.suspended) user.tokenVersion = (user.tokenVersion || 0) + 1
  await user.save()
  log(user.suspended ? 'ADMIN_SUSPEND_USER' : 'ADMIN_UNSUSPEND_USER', req, {
    severity: 'critical', details: { targetUserId: String(user._id), targetEmail: user.email, reason: user.suspendedReason },
  })
  res.json({ suspended: user.suspended, suspendedReason: user.suspendedReason })
}

// PUT /api/admin/user/:id/unlock — clears failed-login lockout
exports.unlockUser = async (req, res) => {
  const user = await targetUser(req, res)
  if (!user) return
  user.loginAttempts = 0
  user.lockUntil = null
  await user.save()
  require('../middleware/accountLock').unlockEmail(user.email)
  log('ADMIN_UNLOCK_USER', req, { severity: 'warn', details: { targetEmail: user.email } })
  res.json({ message: 'Account unlocked' })
}

// PUT /api/admin/user/:id/password { newPassword } — validated by passwordRules in the route
exports.resetPassword = async (req, res) => {
  const user = await targetUser(req, res)
  if (!user) return
  user.password = req.body.newPassword
  user.loginAttempts = 0
  user.lockUntil = null
  user.tokenVersion = (user.tokenVersion || 0) + 1 // sign them out everywhere
  await user.save()
  log('ADMIN_RESET_PASSWORD', req, { severity: 'critical', details: { targetUserId: String(user._id), targetEmail: user.email } })
  res.json({ message: 'Password reset' })
}

// ── Announcements ────────────────────────────────────────────────────────────

const activeFilter = () => ({ active: true, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] })

// GET /api/announcements (public)
exports.publicAnnouncements = async (_req, res) => {
  const items = await Announcement.find(activeFilter()).select('message tone createdAt').sort({ createdAt: -1 }).limit(3).lean()
  res.json(items)
}

// GET /api/admin/announcements
exports.listAnnouncements = async (_req, res) => {
  res.json(await Announcement.find().sort({ createdAt: -1 }).limit(100).lean())
}

// POST /api/admin/announcements { message, tone, expiresInHours }
exports.createAnnouncement = async (req, res) => {
  const message = String(req.body.message || '').trim()
  if (!message) return res.status(400).json({ message: 'Message is required' })
  const hours = Number(req.body.expiresInHours)
  const doc = await Announcement.create({
    message: message.slice(0, 500),
    tone: ['info', 'warning', 'success'].includes(req.body.tone) ? req.body.tone : 'info',
    expiresAt: hours > 0 ? new Date(Date.now() + hours * 3600 * 1000) : null,
    createdBy: req.user._id,
  })
  log('ADMIN_ANNOUNCEMENT', req, { details: { message: doc.message } })
  res.status(201).json(doc)
}

// PUT /api/admin/announcements/:id { active }
exports.toggleAnnouncement = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Not found' })
  const doc = await Announcement.findByIdAndUpdate(req.params.id, { active: !!req.body.active }, { new: true })
  if (!doc) return res.status(404).json({ message: 'Not found' })
  res.json(doc)
}

// DELETE /api/admin/announcements/:id
exports.deleteAnnouncement = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Not found' })
  await Announcement.findByIdAndDelete(req.params.id)
  res.json({ message: 'Deleted' })
}

// ── Analytics & health ───────────────────────────────────────────────────────

// GET /api/admin/analytics
exports.analytics = async (_req, res) => {
  const since = new Date(Date.now() - 13 * DAY)
  since.setHours(0, 0, 0, 0)

  const [signups, active, topWatched, library, suspended] = await Promise.all([
    User.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
    ]),
    User.aggregate([
      { $match: { lastActiveAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$lastActiveAt' } }, count: { $sum: 1 } } },
    ]),
    User.aggregate([
      { $unwind: '$continueWatching' },
      { $group: {
          _id: { id: '$continueWatching.movieId', type: '$continueWatching.type' },
          title: { $first: '$continueWatching.title' },
          poster: { $first: '$continueWatching.poster' },
          viewers: { $sum: 1 },
          avgProgress: { $avg: '$continueWatching.progress' },
      } },
      { $sort: { viewers: -1, avgProgress: -1 } },
      { $limit: 10 },
    ]),
    LibraryItem.countDocuments(),
    User.countDocuments({ suspended: true }),
  ])

  // Fill in every day so the chart has no gaps
  const days = []
  for (let i = 0; i < 14; i++) {
    const d = new Date(since.getTime() + i * DAY).toISOString().slice(0, 10)
    days.push({
      day: d,
      signups: signups.find(s => s._id === d)?.count || 0,
      active: active.find(s => s._id === d)?.count || 0,
    })
  }

  const mem = process.memoryUsage()
  const dbStates = ['disconnected', 'connected', 'connecting', 'disconnecting']
  res.json({
    days,
    topWatched: topWatched.map(t => ({
      movieId: t._id.id, type: t._id.type, title: t.title, poster: t.poster,
      viewers: t.viewers, avgProgress: Math.round(t.avgProgress || 0),
    })),
    libraryCount: library,
    suspendedCount: suspended,
    health: {
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      memoryMb: Math.round(mem.rss / 1024 / 1024),
      heapMb: Math.round(mem.heapUsed / 1024 / 1024),
      node: process.version,
      db: dbStates[mongoose.connection.readyState] || 'unknown',
      dbHost: mongoose.connection.host || '',
    },
  })
}

// ── Library helpers ──────────────────────────────────────────────────────────

// POST /api/admin/library/bulk-delete { ids: [] }
exports.libraryBulkDelete = async (req, res) => {
  const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).filter(id => mongoose.isValidObjectId(id)).slice(0, 500)
  if (!ids.length) return res.status(400).json({ message: 'No titles selected' })
  const { deletedCount } = await LibraryItem.deleteMany({ _id: { $in: ids } })
  log('ADMIN_LIBRARY_DELETE', req, { severity: 'warn', details: { count: deletedCount } })
  res.json({ deleted: deletedCount })
}
