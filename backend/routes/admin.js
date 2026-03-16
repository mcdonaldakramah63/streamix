const express = require('express')
const { protect, adminOnly } = require('../middleware/auth')
const {
  getUsers, deleteUser, toggleAdmin, getStats,
  getAuditLogs, unblockUserIP
} = require('../controllers/adminController')

const r = express.Router()
r.use(protect, adminOnly)

r.get('/stats',          getStats)
r.get('/users',          getUsers)
r.delete('/user/:id',    deleteUser)
r.put('/user/:id/admin', toggleAdmin)
r.get('/audit-logs',     getAuditLogs)
r.post('/unblock-ip',    unblockUserIP)

module.exports = r
