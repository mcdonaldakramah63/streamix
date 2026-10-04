// Failed sign-in throttling, keyed by IP address + email.
// Keying on the pair means a stranger can't lock someone else out of their account, and unknown
// emails are treated exactly like real ones, so the responses never reveal who has an account.
const MAX_ATTEMPTS = 5
const LOCK_TIME    = 15 * 60 * 1000 // 15 minutes
const WINDOW       = 15 * 60 * 1000

const attempts = new Map() // "ip|email" → { count, first, lockUntil }
const keyOf = (req) => `${req.ip}|${String(req.body?.email || '').toLowerCase().trim()}`

// Forget old entries so the map can't grow forever
setInterval(() => {
  const now = Date.now()
  for (const [k, v] of attempts) if ((v.lockUntil || v.first + WINDOW) < now) attempts.delete(k)
}, 60_000).unref()

const trackLoginAttempt = (req, res, next) => {
  const entry = attempts.get(keyOf(req))
  if (entry?.lockUntil && entry.lockUntil > Date.now()) {
    const mins = Math.ceil((entry.lockUntil - Date.now()) / 60000)
    return res.status(429).json({
      message: `Too many failed attempts. Try again in ${mins} minute${mins > 1 ? 's' : ''}.`,
      locked: true,
    })
  }
  next()
}

function recordFailure(req) {
  const k = keyOf(req)
  const now = Date.now()
  let e = attempts.get(k)
  if (!e || now - e.first > WINDOW) e = { count: 0, first: now, lockUntil: 0 }
  e.count++
  if (e.count >= MAX_ATTEMPTS) {
    e.lockUntil = now + LOCK_TIME
    console.warn(`[SECURITY] Sign-in paused for ${k} — too many failed attempts`)
  }
  attempts.set(k, e)
}

const clearFailures = (req) => attempts.delete(keyOf(req))

/** Admin "unlock": clears every lock for an email */
function unlockEmail(email) {
  const suffix = `|${String(email).toLowerCase()}`
  for (const k of attempts.keys()) if (k.endsWith(suffix)) attempts.delete(k)
}

module.exports = { trackLoginAttempt, recordFailure, clearFailures, unlockEmail }
