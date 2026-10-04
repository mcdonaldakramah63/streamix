// GET /api/auth/activity — recent sign-ins and security changes for the signed-in account
const AuditLog = require('../models/AuditLog')

const LABELS = {
  LOGIN_SUCCESS: 'Signed in', LOGIN_FAIL: 'Wrong password', LOGIN_2FA_FAIL: 'Wrong two-factor code',
  PASSWORD_CHANGE: 'Password changed', LOGOUT_ALL: 'Signed out everywhere',
  '2FA_ENABLED': 'Two-factor sign-in turned on', '2FA_DISABLED': 'Two-factor sign-in turned off', REGISTER: 'Account created',
}

/** "Chrome on Android" from a user-agent string */
function device(ua = '') {
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /okhttp|Dalvik/i.test(ua) ? 'Streamix app' : 'Browser'
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'unknown device'
  return `${browser} on ${os}`
}

/** Hide the last part of the address (enough to recognise your network, no more) */
const maskIp = (ip = '') => ip.includes('.') ? ip.replace(/\.\d+$/, '.x') : ip.replace(/:[0-9a-f]*$/i, ':x')

exports.activity = async (req, res) => {
  const logs = await AuditLog.find({
    $or: [{ userId: req.user._id }, { email: req.user.email, action: 'LOGIN_FAIL' }],
    action: { $in: Object.keys(LABELS) },
  }).sort({ createdAt: -1 }).limit(40).lean()
  res.json(logs.map(l => ({
    at: l.createdAt, action: l.action, label: LABELS[l.action] || l.action,
    device: device(l.userAgent), ip: maskIp(l.ip), warn: /FAIL|DISABLED/.test(l.action),
  })))
}

exports.device = device
exports.maskIp = maskIp
