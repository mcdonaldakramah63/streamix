const User     = require('../models/User')
const Watchlist= require('../models/Watchlist')
const AuditLog = require('../models/AuditLog')
const { log, ACTIONS } = require('../utils/auditLogger')
const { getBlockedIPs, unblockIP } = require('../middleware/ipBlocker')

const getUsers = async (req, res) => {
  try {
    await log(ACTIONS.ADMIN_ACCESS, req, { details: { resource: 'users' } })
    const users = await User.find({}).select('-password').sort({ createdAt: -1 })
    res.json(users)
  } catch (e) { res.status(500).json({ message: e.message }) }
}

const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
    if (!user) return res.status(404).json({ message: 'User not found' })
    if (user.isAdmin) return res.status(400).json({ message: 'Cannot delete admin accounts' })
    if (user._id.equals(req.user._id)) return res.status(400).json({ message: 'Cannot delete your own account' })

    await User.deleteOne({ _id: req.params.id })
    await Watchlist.deleteMany({ user: req.params.id })

    await log(ACTIONS.ADMIN_DELETE_USER, req, {
      severity: 'critical',
      details: { deletedUserId: req.params.id, deletedEmail: user.email }
    })

    res.json({ message: 'User deleted' })
  } catch (e) { res.status(500).json({ message: e.message }) }
}

const toggleAdmin = async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot change your own admin status' })
    }
    const user = await User.findById(req.params.id)
    if (!user) return res.status(404).json({ message: 'User not found' })

    user.isAdmin = !user.isAdmin
    await user.save()

    await log(ACTIONS.ADMIN_TOGGLE_ADMIN, req, {
      severity: 'critical',
      details: { targetUserId: req.params.id, targetEmail: user.email, newStatus: user.isAdmin }
    })

    res.json({ message: `Admin ${user.isAdmin ? 'granted' : 'revoked'}`, isAdmin: user.isAdmin })
  } catch (e) { res.status(500).json({ message: e.message }) }
}

const getStats = async (req, res) => {
  try {
    const [totalUsers, adminUsers, totalWatchlist, recentUsers, recentLogs, blockedIPs] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isAdmin: true }),
      Watchlist.countDocuments(),
      User.find({}).select('-password').sort({ createdAt: -1 }).limit(5),
      AuditLog.find({ severity: { $in: ['warn', 'critical'] } }).sort({ createdAt: -1 }).limit(20),
      Promise.resolve(getBlockedIPs()),
    ])
    res.json({ totalUsers, adminUsers, totalWatchlist, recentUsers, recentLogs, blockedIPs })
  } catch (e) { res.status(500).json({ message: e.message }) }
}

const getAuditLogs = async (req, res) => {
  try {
    const { page = 1, severity, action } = req.query
    const filter = {}
    if (severity) filter.severity = severity
    if (action)   filter.action   = action

    const logs = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(50)
      .skip((page - 1) * 50)
    const total = await AuditLog.countDocuments(filter)

    res.json({ logs, total, pages: Math.ceil(total / 50) })
  } catch (e) { res.status(500).json({ message: e.message }) }
}

const unblockUserIP = async (req, res) => {
  const { ip } = req.body
  if (!ip) return res.status(400).json({ message: 'IP required' })
  unblockIP(ip)
  res.json({ message: `IP ${ip} unblocked` })
}

module.exports = { getUsers, deleteUser, toggleAdmin, getStats, getAuditLogs, unblockUserIP }
