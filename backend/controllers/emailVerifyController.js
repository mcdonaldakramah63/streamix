// controllers/emailVerifyController.js — proving someone owns the email they signed up with (or changed to).
//
// Sign-up and sign-in of an unconfirmed account return { verificationRequired, ticket } instead of a session.
// The ticket (1 h, its own key) lets this device verify or ask for a resend — nothing else. The code itself is
// 6 digits, hashed, 15 minutes, 5 tries, and sends are paced (utils/verifyCode).
// An emailed link carries the account id + code (only when APP_URL is set) so it also works from another device;
// that path confirms the address and asks them to sign in, rather than handing out a session.
const User = require('../models/User')
const tokens = require('../utils/tokens')
const codes = require('../utils/verifyCode')
const mailer = require('../utils/mailer')
const emailCheck = require('../utils/emailCheck')
const { log } = require('../utils/auditLogger')

const CODE_FIELDS = '+emailCode.hash +emailCode.purpose +emailCode.expires +emailCode.attempts +emailCode.sentAt +emailCode.sends +emailCode.windowStart'

/** Is verification on? (EMAIL_VERIFICATION=off in .env turns it off) */
const required = () => String(process.env.EMAIL_VERIFICATION || 'on').toLowerCase() !== 'off'

/**
 * Make and email a fresh code. user must be loaded with CODE_FIELDS.
 * → { sent, wait (s until another send is allowed), error? }
 */
async function issue(user, purpose) {
  const gate = codes.canSend(user.emailCode || {}, Date.now())
  if (!gate.ok) return { sent: false, wait: gate.wait }
  const code = codes.newCode()
  user.emailCode = {
    hash: codes.hash(code, user._id, purpose), purpose, expires: new Date(Date.now() + codes.CODE_TTL), attempts: 0,
    ...gate.next,
  }
  await user.save()
  const to = purpose === 'change' ? user.pendingEmail : user.email
  const base = mailer.appUrl()
  const link = base && purpose === 'signup' ? `${base}/verify-email?uid=${user._id}&code=${code}` : ''
  const r = await mailer.sendTemplate('verify', to, { code, link, username: user.username, purpose })
  const wait = codes.nextWait(user.emailCode, Date.now())
  if (!r.ok) {
    // Let them try again straight away — the email never left
    await User.updateOne({ _id: user._id }, { $set: { 'emailCode.sentAt': null } })
    return { sent: false, wait: 0, error: r.permanent ? 'Our email server refused that address — check it for typos' : 'We couldn’t send the email just now — try again in a moment' }
  }
  return { sent: true, wait }
}

/** What the app gets back instead of a session */
function pendingResponse(user, r) {
  return {
    verificationRequired: true,
    ticket: tokens.signVerify(user),
    email: emailCheck.mask(user.email),
    resendIn: r.wait || 0,
    sent: !!r.sent,
    ...(r.error ? { sendError: r.error } : {}),
  }
}

/**
 * Check a typed code against the stored one. Uses up an attempt *before* comparing (atomically), so parallel
 * guesses can't get more than 5 tries. → null on success, or { status, message, attemptsLeft? }
 */
async function consume(user, code, purpose) {
  const st = user.emailCode
  if (st?.purpose !== purpose) return { status: 400, message: 'Ask for a new code' }
  const bad = codes.unusable(st)
  if (bad) return bad
  const r = await User.updateOne({ _id: user._id, 'emailCode.hash': st.hash, 'emailCode.attempts': { $lt: codes.MAX_ATTEMPTS } }, { $inc: { 'emailCode.attempts': 1 } })
  if (!r.modifiedCount) return { status: 429, message: 'Too many wrong codes — ask for a new one', expired: true }
  if (!codes.matches(st.hash, code, user._id, purpose)) {
    const left = codes.MAX_ATTEMPTS - (st.attempts || 0) - 1
    return left > 0
      ? { status: 400, message: `That code isn’t right — ${left} ${left === 1 ? 'try' : 'tries'} left`, attemptsLeft: left }
      : { status: 429, message: 'Too many wrong codes — ask for a new one', expired: true, attemptsLeft: 0 }
  }
  return null
}

function readTicket(req) {
  try { return tokens.verifyVerify(req.body.ticket) } catch { return null }
}

// POST /api/auth/verify-email { ticket, code } → session    |   { uid, code } (emailed link) → { verified }
exports.verify = async (req, res) => {
  const t = req.body.ticket ? readTicket(req) : null
  if (req.body.ticket && !t) return res.status(401).json({ message: 'That took too long — sign in again to get a new code', restart: true })
  const id = t?.id || String(req.body.uid || '')
  if (!/^[a-f0-9]{24}$/i.test(id)) return res.status(400).json({ message: 'This link is incomplete — copy the 6-digit code from the email instead' })
  const user = await User.findById(id).select(CODE_FIELDS)
  if (!user) return res.status(400).json({ message: 'This account no longer exists — please sign up again', restart: true })
  if (t && (user.tokenVersion || 0) !== t.v) return res.status(401).json({ message: 'Sign in again to get a new code', restart: true })
  if (user.emailVerified !== false) {
    // Already done (e.g. clicked the link twice)
    if (t) return require('./authController').sendSession(res, user)
    return res.json({ verified: true, already: true })
  }
  const fail = await consume(user, req.body.code, 'signup')
  if (fail) return res.status(fail.status).json({ message: fail.message, attemptsLeft: fail.attemptsLeft, expired: !!fail.expired })

  await User.updateOne({ _id: user._id }, { $set: { emailVerified: true, emailCanonical: emailCheck.canonical(user.email) }, $unset: { emailCode: 1 } })
  user.emailVerified = true
  log('EMAIL_VERIFIED', req, { userId: user._id, email: user.email })
  require('../utils/notify').notify([user._id], {
    kind: 'announcement', title: `Welcome to Streamix, ${user.username}!`, body: 'Your email is confirmed. Set up profiles for everyone at home and start watching.',
    url: '/profile', dedupeKey: 'welcome',
  }).catch(() => {})
  if (t) {
    log('LOGIN_SUCCESS', req, { userId: user._id, email: user.email, details: { via: 'email-verify' } })
    return require('./authController').sendSession(res, user, 200)
  }
  res.json({ verified: true })
}

// POST /api/auth/verify-email/resend { ticket }
exports.resend = async (req, res) => {
  const t = readTicket(req)
  if (!t) return res.status(401).json({ message: 'That took too long — sign in again to get a new code', restart: true })
  const user = await User.findById(t.id).select(CODE_FIELDS)
  if (!user || (user.tokenVersion || 0) !== t.v) return res.status(401).json({ message: 'Sign in again', restart: true })
  if (user.emailVerified !== false) return res.json({ verified: true })
  const r = await issue(user, 'signup')
  if (!r.sent && !r.error) return res.status(429).json({ message: `Please wait ${r.wait}s before asking for another code`, resendIn: r.wait })
  if (r.error) return res.status(502).json({ message: r.error, resendIn: 0 })
  res.json({ sent: true, resendIn: r.wait, email: emailCheck.mask(user.email) })
}

// GET /api/auth/email-check?email= — live feedback while typing the sign-up form. Says whether the address can
// receive mail and suggests typo fixes; never whether an account exists (no account fishing).
exports.check = async (req, res) => {
  const r = await emailCheck.check(String(req.query.email || ''), { confirmTypo: req.query.confirm === '1' })
  res.json({ ok: r.ok, reason: r.reason, message: r.ok ? undefined : r.message, suggestion: r.suggestion })
}

// ── Changing the email on an existing account ───────────────────────────────

/** Validation shared by sign-up and change. → null or { status, body } */
async function emailProblem(email, opts, selfId) {
  const r = await emailCheck.check(email, opts)
  if (!r.ok) return { status: 400, body: { message: r.message, reason: r.reason, suggestion: r.suggestion, field: 'email' } }
  const taken = await User.findOne({ _id: { $ne: selfId }, $or: [{ email: r.email.toLowerCase() }, { emailCanonical: r.canonical }], emailVerified: { $ne: false } }).select('_id').lean()
  if (taken) return { status: 400, body: { message: 'Another account already uses this email', field: 'email' } }
  return null
}

/**
 * Start switching an account to a new email: checks the password and the address, then sends a code to the
 * NEW address (the old one stays until it's confirmed). → { status, body }
 */
async function beginChange(userId, rawEmail, password, confirmTypo) {
  const user = await User.findById(userId).select(`+password ${CODE_FIELDS}`)
  if (!(await user.matchPassword(String(password || '')))) {
    return { status: 400, body: { message: 'Enter your current password to change your email', needsPassword: true } }
  }
  const email = String(rawEmail || '').trim().toLowerCase()
  if (email === user.email) return { status: 400, body: { message: 'That’s already your email' } }
  const bad = await emailProblem(email, { confirmTypo: confirmTypo === true }, user._id)
  if (bad) return bad
  if (!required()) {
    const old = user.email
    user.email = email; user.emailCanonical = emailCheck.canonical(email); user.pendingEmail = null
    await user.save()
    securityNotice(user, old, email)
    return { status: 200, body: { changed: true, email } }
  }
  // A new address resets the pacing (it's a different inbox)
  if (user.pendingEmail !== email) user.emailCode = {}
  user.pendingEmail = email
  const r = await issue(user, 'change')
  if (!r.sent && !r.error) return { status: 429, body: { message: `Please wait ${r.wait}s before asking for another code`, resendIn: r.wait, pendingEmail: email } }
  if (r.error) return { status: 502, body: { message: r.error } }
  return { status: 200, body: { verificationRequired: true, pendingEmail: email, resendIn: r.wait } }
}

// POST /api/users/email { email, currentPassword, confirmTypo? } → code sent to the NEW address
exports.startChange = async (req, res) => {
  const r = await beginChange(req.user._id, req.body.email, req.body.currentPassword, req.body.confirmTypo)
  res.status(r.status).json(r.body)
}

// POST /api/users/email/verify { code }
exports.finishChange = async (req, res) => {
  const user = await User.findById(req.user._id).select(CODE_FIELDS)
  if (!user.pendingEmail) return res.status(400).json({ message: 'There’s no email change waiting' })
  const fail = await consume(user, req.body.code, 'change')
  if (fail) return res.status(fail.status).json({ message: fail.message, attemptsLeft: fail.attemptsLeft, expired: !!fail.expired })
  const bad = await emailProblem(user.pendingEmail, { confirmTypo: true }, user._id)
  if (bad) return res.status(bad.status).json(bad.body)
  const old = user.email, next = user.pendingEmail
  try {
    await User.updateOne({ _id: user._id }, { $set: { email: next, emailCanonical: emailCheck.canonical(next), emailVerified: true, pendingEmail: null }, $unset: { emailCode: 1 } })
  } catch (e) {
    if (e.code === 11000) return res.status(400).json({ message: 'Another account already uses this email' })
    throw e
  }
  log('EMAIL_CHANGED', req, { severity: 'warn', details: { from: old, to: next } })
  securityNotice(user, old, next)
  res.json({ changed: true, email: next })
}

// POST /api/users/email/resend
exports.resendChange = async (req, res) => {
  const user = await User.findById(req.user._id).select(CODE_FIELDS)
  if (!user.pendingEmail) return res.status(400).json({ message: 'There’s no email change waiting' })
  const r = await issue(user, 'change')
  if (!r.sent && !r.error) return res.status(429).json({ message: `Please wait ${r.wait}s before asking for another code`, resendIn: r.wait })
  if (r.error) return res.status(502).json({ message: r.error })
  res.json({ sent: true, resendIn: r.wait })
}

// DELETE /api/users/email/pending
exports.cancelChange = async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $set: { pendingEmail: null }, $unset: { emailCode: 1 } })
  res.json({ ok: true })
}

/** The OLD address hears about the change (if someone took over a session, the owner finds out) */
function securityNotice(user, oldEmail, newEmail) {
  const base = mailer.appUrl()
  mailer.sendTemplate('security', oldEmail, {
    title: 'Your Streamix email was changed',
    body: `The email on your account (${user.username}) was changed from ${oldEmail} to ${newEmail}.`,
    when: new Date().toUTCString(), link: base ? `${base}/profile` : '',
  }).catch(() => {})
  require('../utils/notify').notify([user._id], {
    kind: 'security', title: 'Your email was changed', body: `Sign-in email is now ${newEmail}`, url: '/profile', email: false, // the old address was emailed above
  }).catch(() => {})
}

exports.issue = issue
exports.beginChange = beginChange
exports.pendingResponse = pendingResponse
exports.emailProblem = emailProblem
exports.required = required
exports.CODE_FIELDS = CODE_FIELDS
