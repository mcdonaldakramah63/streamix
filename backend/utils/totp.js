// utils/totp.js — authenticator-app codes (RFC 6238 TOTP, SHA-1, 6 digits, 30 s), no packages needed
const crypto = require('crypto')

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32Encode(buf) {
  let bits = 0, value = 0, out = ''
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5 }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}

function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = 0, value = 0
  const out = []
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch); bits += 5
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8 }
  }
  return Buffer.from(out)
}

const newSecret = () => base32Encode(crypto.randomBytes(20))

function codeAt(secret, step) {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))
  const h = crypto.createHmac('sha1', base32Decode(secret)).update(counter).digest()
  const off = h[h.length - 1] & 15
  const n = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3]
  return String(n % 1_000_000).padStart(6, '0')
}

/**
 * Checks a code, allowing one 30-second step of clock drift either way.
 * Returns the matching step (store it to stop the same code being used twice) or null.
 */
function verify(secret, code, lastStep = -1) {
  const c = String(code || '').replace(/\s/g, '')
  if (!/^\d{6}$/.test(c)) return null
  const now = Math.floor(Date.now() / 30000)
  for (const step of [now, now - 1, now + 1]) {
    if (step <= lastStep) continue
    const want = Buffer.from(codeAt(secret, step))
    if (crypto.timingSafeEqual(want, Buffer.from(c))) return step
  }
  return null
}

function otpauthUrl(secret, account, issuer = 'Streamix') {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`
}

/** 8 one-time backup codes like "4f7k-2m9q" (returned once; only hashes are stored) */
function recoveryCodes() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: 8 }, () => {
    const b = crypto.randomBytes(8)
    const s = Array.from(b, x => alphabet[x % alphabet.length]).join('')
    return `${s.slice(0, 4)}-${s.slice(4)}`
  })
}
const hashCode = (c) => crypto.createHash('sha256').update(String(c).toLowerCase().replace(/[^a-z0-9]/g, '')).digest('hex')

module.exports = { newSecret, verify, otpauthUrl, recoveryCodes, hashCode, _test: { base32Encode, base32Decode, codeAt } }
