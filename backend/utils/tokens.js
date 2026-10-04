// utils/tokens.js — every JWT the app issues, in one place.
// Access, refresh and download-link tokens use different keys, so one kind can never be used as
// another, and only HS256 is accepted. `v` is the user's tokenVersion: bumping it (password change,
// "sign out everywhere", suspension, admin reset) instantly invalidates every existing session.
const crypto = require('crypto')
const jwt    = require('jsonwebtoken')

const ALG = { algorithms: ['HS256'] }
const derive = (label) => crypto.createHash('sha256').update(`${label}:${process.env.JWT_SECRET}`).digest('hex')
const accessKey  = () => process.env.JWT_SECRET
const refreshKey = () => process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET + '_refresh'
const fileKey    = () => derive('library-file')

const version = (user) => user.tokenVersion || 0

exports.signAccess  = (user) => jwt.sign({ id: String(user._id), v: version(user), typ: 'access' }, accessKey(), { expiresIn: '15m', algorithm: 'HS256' })
exports.signRefresh = (user) => jwt.sign({ id: String(user._id), v: version(user), typ: 'refresh' }, refreshKey(), { expiresIn: '30d', algorithm: 'HS256' })

/** → { id, v } or throws (expired / wrong kind / bad signature) */
exports.verifyAccess = (token) => {
  const d = jwt.verify(String(token || ''), accessKey(), ALG)
  if (!d.id || d.purpose || (d.typ && d.typ !== 'access')) throw Object.assign(new Error('Wrong token type'), { name: 'JsonWebTokenError' })
  return { id: String(d.id), v: d.v || 0 }
}
exports.verifyRefresh = (token) => {
  const d = jwt.verify(String(token || ''), refreshKey(), ALG)
  if (!d.id || (d.typ && d.typ !== 'refresh')) throw Object.assign(new Error('Wrong token type'), { name: 'JsonWebTokenError' })
  return { id: String(d.id), v: d.v || 0 }
}

/** Does this token still belong to the user's current session generation? */
exports.current = (decoded, user) => (decoded.v || 0) === version(user)

// "Enter the code we emailed you" ticket: proves this device just signed up / signed in with the right
// password for an account whose email isn't confirmed yet. Not a session — it can only verify or resend.
const verifyKey = () => derive('email-verify')
exports.signVerify = (user) => jwt.sign({ id: String(user._id), v: version(user), typ: 'verify' }, verifyKey(), { expiresIn: '1h', algorithm: 'HS256' })
exports.verifyVerify = (token) => {
  const d = jwt.verify(String(token || ''), verifyKey(), ALG)
  if (d.typ !== 'verify' || !d.id) throw new Error('Wrong token type')
  return { id: String(d.id), v: d.v || 0 }
}

// Short-lived links for downloading one library file
exports.signFile   = (libId) => jwt.sign({ lib: String(libId), typ: 'file' }, fileKey(), { expiresIn: '6h', algorithm: 'HS256' })
exports.verifyFile = (token, libId) => {
  const d = jwt.verify(String(token || ''), fileKey(), ALG)
  if (d.typ !== 'file' || d.lib !== String(libId)) throw new Error('Wrong file')
  return d
}
