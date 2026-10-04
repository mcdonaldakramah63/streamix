// utils/verifyCode.js — one-time email codes. Pure functions, unit-tested.
//
//  • 6 digits from a CSPRNG, stored only as an HMAC (keyed with the server secret, the user and the purpose),
//    so a database leak doesn't reveal live codes and a sign-up code can't be used to change an email.
//  • 15 minutes to use it, 5 tries per code: 5 guesses in 10⁶ ≈ 0.0005% chance for an attacker per code.
//  • Sending is paced: the wait between sends doubles (30 s → 1 → 2 → 5 → 10 min) and at most 6 an hour,
//    so the form can't be used to flood someone's inbox.
const crypto = require('crypto')

const CODE_TTL = 15 * 60 * 1000
const MAX_ATTEMPTS = 5
const MAX_PER_HOUR = 6
const WAITS = [0, 30, 60, 120, 300, 600] // seconds before send #n (by sends so far this hour)

const key = () => crypto.createHash('sha256').update(`email-code:${process.env.JWT_SECRET || 'dev'}`).digest()

const newCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')

const hash = (code, userId, purpose) =>
  crypto.createHmac('sha256', key()).update(`${purpose}:${userId}:${String(code).replace(/\D/g, '')}`).digest('hex')

/** Constant-time comparison of a typed code with the stored hash */
function matches(stored, code, userId, purpose) {
  if (!stored || !/^\d{6}$/.test(String(code || '').replace(/\D/g, ''))) return false
  const a = Buffer.from(stored, 'hex'), b = Buffer.from(hash(code, userId, purpose), 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/**
 * May we send another code now?
 * st: { sentAt, sends, windowStart } from the user → { ok, wait (s), next: fields to store when sending }
 */
function canSend(st = {}, now = Date.now()) {
  const windowStart = st.windowStart && now - new Date(st.windowStart).getTime() < 3600_000 ? new Date(st.windowStart).getTime() : now
  const sends = windowStart === now ? 0 : (st.sends || 0)
  if (sends >= MAX_PER_HOUR) {
    return { ok: false, wait: Math.ceil((windowStart + 3600_000 - now) / 1000) }
  }
  const since = st.sentAt ? (now - new Date(st.sentAt).getTime()) / 1000 : Infinity
  const need = WAITS[Math.min(sends, WAITS.length - 1)]
  if (since < need) return { ok: false, wait: Math.ceil(need - since) }
  return { ok: true, wait: 0, next: { sentAt: new Date(now), sends: sends + 1, windowStart: new Date(windowStart) } }
}

/** Seconds until another send is allowed after one just went out */
function nextWait(st = {}, now = Date.now()) {
  const r = canSend(st, now)
  return r.ok ? 0 : r.wait
}

/** Why a code can't be used, or null */
function unusable(st, now = Date.now()) {
  if (!st?.hash) return { status: 400, message: 'Ask for a new code' }
  if (new Date(st.expires).getTime() < now) return { status: 400, message: 'That code has expired — we can send you a new one', expired: true }
  if ((st.attempts || 0) >= MAX_ATTEMPTS) return { status: 429, message: 'Too many wrong codes — ask for a new one', expired: true }
  return null
}

module.exports = { newCode, hash, matches, canSend, nextWait, unusable, CODE_TTL, MAX_ATTEMPTS, MAX_PER_HOUR }
