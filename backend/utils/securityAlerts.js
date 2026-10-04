// utils/securityAlerts.js — tells people about sign-ins and account changes they might not have made.
//
// A sign-in only counts as "new" when BOTH the device (browser + OS) and the network (/24 for IPv4, /48 for
// IPv6) haven't been seen on this account in the last 90 days — so the same laptop on a new Wi-Fi, or a new
// phone at home, stays quiet, while an unknown device somewhere else gets a push + email.
// The first sign-in after creating an account never alerts.
const AuditLog = require('../models/AuditLog')
const { device } = require('../controllers/activityController')

const clientIp = (req) => String(req.ip || req.connection?.remoteAddress || '').replace(/^::ffff:/, '')

/** Network a person signs in from: "203.0.113" / "2001:db8:1" */
function network(ip = '') {
  const v4 = ip.replace(/^::ffff:/, '')
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) return v4.split('.').slice(0, 3).join('.')
  return ip.toLowerCase().split(':').slice(0, 3).join(':')
}

/** Pure: is this sign-in from somewhere new, given earlier ones? */
function isNewPlace(prev, cur) {
  if (!prev.length) return false                         // first sign-in ever
  const sameDevice = prev.some(p => p.device === cur.device)
  const sameNetwork = prev.some(p => p.network === cur.network)
  return !sameDevice && !sameNetwork
}

/** Call BEFORE logging this sign-in. Never throws, never slows the sign-in down noticeably. */
async function onSignIn(req, user) {
  try {
    const since = new Date(Date.now() - 90 * 24 * 3600 * 1000)
    const logs = await AuditLog.find({ userId: user._id, action: 'LOGIN_SUCCESS', createdAt: { $gte: since } })
      .sort({ createdAt: -1 }).limit(200).select('ip userAgent').lean()
    const cur = { device: device(req.headers['user-agent'] || ''), network: network(clientIp(req)) }
    const prev = logs.map(l => ({ device: device(l.userAgent || ''), network: network(l.ip || '') }))
    if (!isNewPlace(prev, cur)) return
    const ip = clientIp(req)
    await require('./notify').notify([user._id], {
      kind: 'security',
      title: `New sign-in: ${cur.device}`,
      body: `Someone signed in to your account from ${cur.device} (network ${ip.includes('.') ? ip.replace(/\.\d+$/, '.x') : ip.replace(/:[0-9a-f]*$/i, ':x')}). If this wasn’t you, change your password now.`,
      url: '/profile?tab=account',
      when: new Date().toUTCString(),
    })
  } catch (e) {
    console.warn('[security] sign-in alert:', e.message)
  }
}

/** Password changed / two-factor turned off → push + email (critical, ignores quiet hours) */
function onAccountChange(user, title, body) {
  require('./notify').notify([user._id], { kind: 'security', title, body, url: '/profile?tab=account', when: new Date().toUTCString() })
    .catch(e => console.warn('[security] alert:', e.message))
}

module.exports = { onSignIn, onAccountChange, _test: { network, isNewPlace } }
