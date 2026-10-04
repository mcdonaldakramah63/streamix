// backend/controllers/adminController.js
const mongoose  = require('mongoose')
const User      = require('../models/User')
const Watchlist = require('../models/Watchlist')
const Profile   = require('../models/Profile')
const Rating    = require('../models/Rating')
const AuditLog  = require('../models/AuditLog')
const PollVote  = require('../models/PollVote')
const { log, ACTIONS } = require('../utils/auditLogger')
const { getBlockedIPs, unblockIP } = require('../middleware/ipBlocker')

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const DAY = 24 * 60 * 60 * 1000

// GET /api/admin/users?page=1&limit=15&search=foo
const getUsers = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1)
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 15))
    const search = String(req.query.search || '').trim().slice(0, 60)

    const filter = search
      ? { $or: [
          { username: { $regex: escapeRegex(search), $options: 'i' } },
          { email:    { $regex: escapeRegex(search), $options: 'i' } },
        ] }
      : {}

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('username email isAdmin createdAt updatedAt loginAttempts lockUntil suspended lastActiveAt emailVerified pendingEmail')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ])

    log(ACTIONS.ADMIN_ACCESS, req, { details: { resource: 'users', page, search } })
    res.json({ users, total, page, pages: Math.ceil(total / limit) })
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
}

// DELETE /api/admin/user/:id
const deleteUser = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid id' })
    const user = await User.findById(req.params.id)
    if (!user) return res.status(404).json({ message: 'User not found' })
    if (user._id.equals(req.user._id)) return res.status(400).json({ message: 'Cannot delete your own account' })
    if (user.isAdmin) return res.status(400).json({ message: 'Remove admin rights before deleting this account' })

    // Profile photos on disk go too
    const photos = await Profile.find({ user: user._id }).select('avatarImage').lean()
    photos.forEach(p => require('../utils/avatarStore').removeStored(p.avatarImage))
    await Promise.all([
      User.deleteOne({ _id: user._id }),
      require('../models/PushSubscription').deleteMany({ user: user._id }),
      require('../models/EpisodeProgress').deleteMany({ user: user._id }),
      Watchlist.deleteMany({ user: user._id }),
      Profile.deleteMany({ user: user._id }),
      Rating.deleteMany({ userId: user._id }),
      PollVote.deleteMany({ userId: user._id }),
    ])

    log(ACTIONS.ADMIN_DELETE_USER, req, {
      severity: 'critical',
      details: { deletedUserId: String(user._id), deletedEmail: user.email },
    })
    res.json({ message: 'User deleted' })
  } catch (e) {
    res.status(500).json({ message: 'Could not delete the user' })
  }
}

// PUT /api/admin/user/:id/admin — toggles admin rights
const toggleAdmin = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid id' })
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot change your own admin status' })
    }
    const user = await User.findById(req.params.id)
    if (!user) return res.status(404).json({ message: 'User not found' })

    user.isAdmin = !user.isAdmin
    await user.save()

    log(ACTIONS.ADMIN_TOGGLE_ADMIN, req, {
      severity: 'critical',
      details: { targetUserId: req.params.id, targetEmail: user.email, newStatus: user.isAdmin },
    })
    res.json({ message: `Admin ${user.isAdmin ? 'granted' : 'revoked'}`, isAdmin: user.isAdmin })
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
}

// GET /api/admin/stats
const getStats = async (req, res) => {
  try {
    const now = Date.now()
    const [totalUsers, adminUsers, totalWatchlist, newUsersToday, activeUsers, lockedAccounts, recentLogs] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isAdmin: true }),
      Watchlist.countDocuments(),
      User.countDocuments({ createdAt: { $gte: new Date(now - DAY) } }),
      // "active" = watched something in the last 7 days
      User.countDocuments({ 'continueWatching.watchedAt': { $gte: new Date(now - 7 * DAY) } }),
      User.countDocuments({ lockUntil: { $gt: new Date(now) } }),
      AuditLog.find({ severity: { $in: ['warn', 'critical'] } }).sort({ createdAt: -1 }).limit(20).lean(),
    ])
    res.json({
      totalUsers, adminUsers, totalWatchlist, newUsersToday, activeUsers, lockedAccounts,
      recentLogs, blockedIPs: getBlockedIPs(),
    })
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
}

// GET /api/admin/audit-logs?page=1&severity=warn&action=LOGIN_FAIL
const getAuditLogs = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const filter = {}
    if (['info', 'warn', 'critical'].includes(req.query.severity)) filter.severity = req.query.severity
    if (typeof req.query.action === 'string' && /^[A-Z_]+$/.test(req.query.action)) filter.action = req.query.action

    const [logs, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * 50).limit(50).lean(),
      AuditLog.countDocuments(filter),
    ])
    res.json({ logs, total, pages: Math.ceil(total / 50) })
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
}

// POST /api/admin/unblock-ip { ip }
const unblockUserIP = (req, res) => {
  const { ip } = req.body
  if (!ip || typeof ip !== 'string') return res.status(400).json({ message: 'IP required' })
  unblockIP(ip)
  res.json({ message: `IP ${ip} unblocked` })
}

module.exports = { getUsers, deleteUser, toggleAdmin, getStats, getAuditLogs, unblockUserIP }
