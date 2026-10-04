// config/tmdb.js — every TMDB request goes through here, so every algorithm on top of it is as robust as this.
//
//  • Cache with per-path freshness (trending 10 min, search 1 h, details 6 h…), kept up to 24 h as a stale copy.
//    Stale-while-revalidate: a stale hit is answered at once and refreshed in the background.
//  • If TMDB fails (timeout, 5xx, network), the last good answer is served instead of an error.
//  • Identical requests in flight share one call.
//  • At most 8 requests at a time (bursts from recommendation / trend jobs used to trip TMDB's rate limit),
//    one retry with backoff on 429 / 5xx / network errors (Retry-After respected).
//  • Circuit breaker: after 8 failures in a row, stop calling for 30 s and serve cached copies.
const axios = require('axios')

const http = axios.create({ baseURL: 'https://api.themoviedb.org/3', timeout: 10_000 })

// ── Limiter ─────────────────────────────────────────────────────────────────
const MAX_CONCURRENT = Number(process.env.TMDB_CONCURRENCY) || 8
let active = 0
const queue = []
function limit(fn) {
  return new Promise((resolve, reject) => {
    const run = () => { active++; fn().then(resolve, reject).finally(() => { active--; queue.shift()?.() }) }
    if (active < MAX_CONCURRENT) run(); else queue.push(run)
  })
}

// ── Circuit breaker ─────────────────────────────────────────────────────────
let failures = 0, openUntil = 0
const breakerOpen = () => Date.now() < openUntil
function onResult(ok) {
  if (ok) { failures = 0; return }
  if (++failures >= 8) { openUntil = Date.now() + 30_000; failures = 0; console.warn('[tmdb] many failures in a row — pausing calls for 30 s, serving cached data') }
}

const retryable = (e) => !e.response || e.response.status === 429 || e.response.status >= 500
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

/** One GET with the API key, limiter, one retry and the breaker. Same shape as axios (resolves { data }). */
async function get(url, config = {}) {
  if (breakerOpen()) { const e = new Error('TMDB temporarily unavailable'); e.code = 'TMDB_BREAKER'; throw e }
  const params = { api_key: process.env.TMDB_API_KEY, ...(config.params || {}) }
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await limit(() => http.get(url, { ...config, params }))
      onResult(true)
      return res
    } catch (e) {
      if (attempt === 0 && retryable(e)) {
        const after = Number(e.response?.headers?.['retry-after'])
        await sleep(Number.isFinite(after) && after > 0 ? Math.min(after * 1000, 5000) : 600 + Math.random() * 600)
        continue
      }
      if (retryable(e)) onResult(false)
      throw e
    }
  }
}

// ── Cache ───────────────────────────────────────────────────────────────────
const MAX_ENTRIES = Number(process.env.TMDB_CACHE_MAX) || 8000
const STALE_FOR = 24 * 3600 * 1000
const cache = new Map()     // key → { at, data }  (Map order = least recently used first)
const inflight = new Map()  // key → Promise

/** How long an answer counts as fresh, by kind of request */
function freshFor(url) {
  if (/^\/trending|now_playing|on_the_air|airing_today|\/upcoming/.test(url)) return 10 * 60 * 1000
  if (/^\/search/.test(url)) return 60 * 60 * 1000
  if (/^\/discover/.test(url)) return 30 * 60 * 1000
  if (/^\/(movie|tv)\/\d+\/(recommendations|similar)/.test(url)) return 6 * 3600 * 1000
  if (/^\/(movie|tv|person|collection)\/\d+/.test(url)) return 6 * 3600 * 1000
  return 15 * 60 * 1000
}

function remember(key, data) {
  cache.delete(key)
  cache.set(key, { at: Date.now(), data })
  if (cache.size > MAX_ENTRIES) {
    // Drop the least recently used ~5%
    let n = Math.ceil(MAX_ENTRIES / 20)
    for (const k of cache.keys()) { cache.delete(k); if (--n <= 0) break }
  }
}

function fetchInto(key, url, params) {
  if (inflight.has(key)) return inflight.get(key)
  const p = get(url, { params })
    .then(({ data }) => { remember(key, data); return data })
    .finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}

/** Cached GET: fresh hit → cached; stale hit → cached now + refresh in background; miss → fetch; failure → stale copy */
async function cachedTmdb(url, params = {}) {
  const key = url + JSON.stringify(params)
  const hit = cache.get(key)
  const age = hit ? Date.now() - hit.at : Infinity
  if (hit && age < freshFor(url)) {
    cache.delete(key); cache.set(key, hit) // mark recently used
    return hit.data
  }
  if (hit && age < STALE_FOR) {
    fetchInto(key, url, params).catch(() => { /* keep serving the stale copy */ })
    return hit.data
  }
  try {
    return await fetchInto(key, url, params)
  } catch (e) {
    if (hit) return hit.data // older than a day, but better than nothing during an outage
    throw e
  }
}

const tmdb = { get }
const stats = () => ({ cached: cache.size, inflight: inflight.size, active, queued: queue.length, breakerOpen: breakerOpen() })

module.exports = { tmdb, cachedTmdb, stats, _test: { freshFor, limit } }
