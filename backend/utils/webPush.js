// utils/webPush.js — Web Push (RFC 8030/8291/8292) with Node's built-in crypto, no extra packages.
// VAPID keys are generated on first use and kept in the settings collection.
const crypto = require('crypto')
const axios  = require('axios')
const settings = require('./settings')
const { safeAgents } = require('./netGuard')

// Browsers' push services — subscriptions pointing anywhere else are refused
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/,
  /^[a-z0-9-]+\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/, /^web\.push\.apple\.com$/, /\.push\.apple\.com$/]
function isPushService(endpoint) {
  try {
    const u = new URL(String(endpoint))
    return u.protocol === 'https:' && !u.port && PUSH_HOSTS.some(re => re.test(u.hostname))
  } catch { return false }
}

const b64u = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64u = s => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64')

let vapid = null // { publicKey (b64url raw), privateJwk }

async function getVapid() {
  if (vapid) return vapid
  let stored = await settings.get('vapid')
  if (!stored?.privateJwk) {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    const jwk = publicKey.export({ format: 'jwk' })
    stored = {
      publicKey: b64u(Buffer.concat([Buffer.from([4]), unb64u(jwk.x), unb64u(jwk.y)])),
      privateJwk: privateKey.export({ format: 'jwk' }),
    }
    await settings.set('vapid', stored)
  }
  vapid = stored
  return vapid
}

function vapidHeader(endpoint, keys) {
  const aud = new URL(endpoint).origin
  const header = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))
  const body = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: process.env.PUSH_CONTACT || 'mailto:admin@streamix.local' }))
  const key = crypto.createPrivateKey({ key: keys.privateJwk, format: 'jwk' })
  const sig = crypto.sign('sha256', Buffer.from(`${header}.${body}`), { key, dsaEncoding: 'ieee-p1363' })
  return `vapid t=${header}.${body}.${b64u(sig)}, k=${keys.publicKey}`
}

const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest()

/** RFC 8291 aes128gcm payload encryption */
function encrypt(payload, p256dh, authSecret) {
  const uaPublic = unb64u(p256dh)
  const auth = unb64u(authSecret)
  const ecdh = crypto.createECDH('prime256v1')
  const asPublic = ecdh.generateKeys()
  const shared = ecdh.computeSecret(uaPublic)

  const prkKey = hmac(auth, shared)
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]))
  const salt = crypto.randomBytes(16)
  const prk = hmac(salt, ikm)
  const cek = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])])).subarray(0, 16)
  const nonce = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])])).subarray(0, 12)

  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce)
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()])
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096)
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body])
}

/**
 * Sends one notification. Returns 'ok', 'gone' (subscription expired — delete it) or 'failed'.
 * payload: { title, body, url, icon, tag }
 */
async function send(sub, payload) {
  if (!isPushService(sub.endpoint)) return 'gone'
  const keys = await getVapid()
  try {
    await axios.post(sub.endpoint, encrypt(JSON.stringify(payload), sub.keys.p256dh, sub.keys.auth), {
      headers: {
        Authorization: vapidHeader(sub.endpoint, keys),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: '86400',
        Urgency: 'normal',
      },
      timeout: 10_000, maxRedirects: 0, ...safeAgents,
    })
    return 'ok'
  } catch (e) {
    const status = e.response?.status
    return status === 404 || status === 410 ? 'gone' : 'failed'
  }
}

/** Sends to every matching subscription; cleans up dead ones */
async function sendToUsers(userIds, payload, topic) {
  const PushSubscription = require('../models/PushSubscription')
  const filter = { ...(userIds ? { user: { $in: userIds } } : {}), ...(topic ? { [`topics.${topic}`]: { $ne: false } } : {}) }
  const subs = await PushSubscription.find(filter).lean()
  let sent = 0
  for (const s of subs) {
    const r = await send(s, payload)
    if (r === 'ok') { sent++; if (s.failures) PushSubscription.updateOne({ _id: s._id }, { failures: 0 }).catch(() => {}) }
    else if (r === 'gone' || s.failures >= 5) await PushSubscription.deleteOne({ _id: s._id }).catch(() => {})
    else await PushSubscription.updateOne({ _id: s._id }, { $inc: { failures: 1 } }).catch(() => {})
  }
  return sent
}

module.exports = { getVapid, send, sendToUsers, isPushService, _test: { encrypt, vapidHeader, b64u, unb64u } }
