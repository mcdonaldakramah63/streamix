// Shared check: never let the server fetch URLs on this machine or the local network.
//
// Checking the hostname text isn't enough — a public name can point at 127.0.0.1 or 192.168.x.x
// (or switch to one between the check and the request). So every outbound request made with
// `safeHttp` / `safeAgents` checks the *resolved* address at connection time, including on redirects.
const net   = require('net')
const dns   = require('dns')
const http  = require('http')
const https = require('https')
const axios = require('axios')

function isPrivateIPv4(ip) {
  const [a, b] = ip.split('.').map(Number)
  return a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||        // carrier-grade NAT
    (a === 169 && b === 254) ||                  // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||                    // 192.0.0.0/24 + 192.0.2.0/24 (docs)
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||     // benchmarking
    (a === 198 && b === 51) || (a === 203 && b === 0) ||
    a >= 224                                     // multicast, reserved, broadcast
}

function isPrivateIP(ip) {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip)
  if (net.isIPv6(ip)) {
    const h = ip.toLowerCase()
    if (h === '::' || h === '::1') return true
    const mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isPrivateIPv4(mapped[1])
    if (h.startsWith('::ffff:')) return true
    return /^(fc|fd|fe[89ab]|ff)/.test(h) || h.startsWith('64:ff9b:') || h.startsWith('2001:db8')
  }
  return true // not an IP at all — treat as unsafe
}

function isPrivateHost(hostname) {
  const h = String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase()
  if (!h || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.lan') || h.endsWith('.home.arpa')) return true
  if (net.isIP(h)) return isPrivateIP(h)
  return false
}

/** Returns a parsed public http(s) URL, or throws with a readable reason */
function publicUrl(raw) {
  let u
  try { u = new URL(String(raw).trim()) } catch { throw new Error('Not a valid URL') }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Only http(s) URLs are supported')
  if (u.username || u.password) throw new Error('URLs with a username or password are not allowed')
  if (isPrivateHost(u.hostname)) throw new Error('Local/private network addresses are not allowed')
  return u
}

/** dns.lookup that refuses private addresses — used by the agents below at connect time */
function safeLookup(hostname, options, callback) {
  if (typeof options === 'function') { callback = options; options = {} }
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err)
    const list = Array.isArray(addresses) ? addresses : [{ address: addresses, family: options.family || 4 }]
    const bad = list.find(a => isPrivateIP(a.address))
    if (bad || !list.length) {
      const e = new Error(`Blocked request to a private address (${hostname})`)
      e.code = 'EPRIVATE'
      return callback(e)
    }
    if (options.all) return callback(null, list)
    callback(null, list[0].address, list[0].family)
  })
}

const safeAgents = {
  httpAgent:  new http.Agent({ lookup: safeLookup, keepAlive: true, maxSockets: 64 }),
  httpsAgent: new https.Agent({ lookup: safeLookup, keepAlive: true, maxSockets: 64 }),
}

/**
 * axios instance for fetching user-supplied / third-party URLs.
 * Private addresses are refused on every hop (DNS-checked), and responses are size-capped.
 */
function safeHttp(defaults = {}) {
  const instance = axios.create({
    timeout: 15_000,
    maxRedirects: 5,
    maxContentLength: 64 * 1024 * 1024,
    maxBodyLength: 1024 * 1024,
    ...safeAgents,
    ...defaults,
    beforeRedirect: (opts) => {
      if (isPrivateHost(opts.hostname)) throw new Error('Redirect to a private address blocked')
      if (opts.protocol !== 'http:' && opts.protocol !== 'https:') throw new Error('Redirect to an unsupported protocol blocked')
    },
  })
  // IP-address URLs never reach the DNS lookup, so check the first URL explicitly too
  instance.interceptors.request.use(cfg => {
    publicUrl(axios.getUri(cfg))
    return cfg
  })
  return instance
}

module.exports = { isPrivateHost, isPrivateIP, publicUrl, safeLookup, safeAgents, safeHttp }
