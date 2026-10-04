// Signs stream-proxy links so only URLs this server handed out can be fetched through it
const crypto = require('crypto')

const key = () => crypto.createHash('sha256').update(`stream-proxy:${process.env.JWT_SECRET}`).digest()
const sig = (url) => crypto.createHmac('sha256', key()).update(url).digest('base64url').slice(0, 24)

/** "/api/stream/proxy?url=…&sig=…" for an absolute URL */
function signedProxyUrl(url) {
  return `/api/stream/proxy?url=${encodeURIComponent(url)}&sig=${sig(url)}`
}

function verifyProxySig(url, given) {
  if (typeof given !== 'string' || given.length !== 24) return false
  const want = Buffer.from(sig(url))
  const got = Buffer.from(given)
  return want.length === got.length && crypto.timingSafeEqual(want, got)
}

module.exports = { signedProxyUrl, verifyProxySig }
