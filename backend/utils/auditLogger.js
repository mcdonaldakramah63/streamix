const AuditLog = require('../models/AuditLog')

const log = async (action, req, extra = {}) => {
  try {
    await AuditLog.create({
      action,
      userId:    req.user?._id || extra.userId,
      email:     req.user?.email || req.body?.email || extra.email,
      ip:        req.ip || req.connection?.remoteAddress,
      userAgent: req.headers?.['user-agent']?.slice(0, 200),
      details:   extra.details,
      severity:  extra.severity || 'info',
    })
  } catch (e) {
    console.error('Audit log error:', e.message)
  }
}

const ACTIONS = {
  LOGIN_SUCCESS:        'LOGIN_SUCCESS',
  LOGIN_FAIL:          'LOGIN_FAIL',
  LOGIN_LOCKED:        'LOGIN_LOCKED',
  REGISTER:            'REGISTER',
  LOGOUT:              'LOGOUT',
  PASSWORD_CHANGE:     'PASSWORD_CHANGE',
  PROFILE_UPDATE:      'PROFILE_UPDATE',
  ADMIN_ACCESS:        'ADMIN_ACCESS',
  ADMIN_DELETE_USER:   'ADMIN_DELETE_USER',
  ADMIN_TOGGLE_ADMIN:  'ADMIN_TOGGLE_ADMIN',
  SUSPICIOUS_REQUEST:  'SUSPICIOUS_REQUEST',
}

module.exports = { log, ACTIONS }
