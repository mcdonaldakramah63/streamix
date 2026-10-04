// services/sourceTracker.js — runs the provider health checks and stores what viewers' sessions say.
// The scoring itself is in utils/sourceHealth.js (pure, unit-tested).
const axios = require('axios')
const SourceStat = require('../models/SourceStat')
const health = require('../utils/sourceHealth')

const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36'
// Known titles every provider should have
const SAMPLE = { movie: { id: 550 }, tv: { id: 1399, s: 1, e: 1 } }

let stats = { movie: {}, tv: {} } // type → id → stat (mirror of the collection)
let loaded = false

async function load() {
  const rows = await SourceStat.find().lean().catch(() => [])
  stats = { movie: {}, tv: {} }
  for (const r of rows) stats[r.type][r.source] = r
  loaded = true
}

/** Check one provider's player page for a known title */
async function probeOne(p, type) {
  const s = SAMPLE[type]
  const url = health.fill(p[type], s.id, s.s, s.e)
  const t0 = Date.now()
  try {
    const res = await axios.get(url, { timeout: 10_000, maxRedirects: 5, responseType: 'text', validateStatus: () => true,
      headers: { 'User-Agent': UA, Accept: 'text/html' }, maxContentLength: 2_000_000 })
    return { up: health.looksPlayable(res.status, res.data), ms: Date.now() - t0, status: res.status, at: new Date() }
  } catch {
    return { up: false, ms: Date.now() - t0, status: 0, at: new Date() }
  }
}

async function probeAll() {
  const jobs = []
  for (const type of ['movie', 'tv']) {
    for (const p of health.PROVIDERS) {
      jobs.push(probeOne(p, type).then(async probe => {
        await SourceStat.updateOne({ source: p.id, type }, { $set: { probe } }, { upsert: true })
        stats[type][p.id] = { ...(stats[type][p.id] || {}), probe }
      }).catch(() => {}))
    }
  }
  await Promise.all(jobs)
  const up = health.PROVIDERS.filter(p => stats.movie[p.id]?.probe?.up).map(p => p.id)
  console.log(`[sources] health check: ${up.length}/${health.PROVIDERS.length} up (${up.join(', ') || 'none'})`)
}

/** A viewer's session says a provider worked (watched a while) or didn't (error, quick switch, report) */
async function record(sourceId, type, ok) {
  const t = type === 'tv' ? 'tv' : 'movie'
  if (!health.PROVIDERS.some(p => p.id === sourceId)) return
  const cur = stats[t][sourceId] || {}
  const d = health.decay(cur)
  const next = { ok: d.ok + (ok ? 1 : 0), fail: d.fail + (ok ? 0 : 1), at: new Date() }
  stats[t][sourceId] = { ...cur, ...next }
  await SourceStat.updateOne({ source: sourceId, type: t }, { $set: next }, { upsert: true }).catch(() => {})
}

/** Providers best-first for this media type (10% of the time with a little exploration) */
async function ranked(type) {
  if (!loaded) await load()
  return health.rank(type === 'tv' ? 'tv' : 'movie', stats[type === 'tv' ? 'tv' : 'movie'], { explore: Math.random() < 0.1 })
}

/** Map a report's source label ("VidSrc 2") to a provider id */
const idForLabel = (label) => health.PROVIDERS.find(p => p.label.toLowerCase() === String(label || '').toLowerCase())?.id || null

function start() {
  const run = () => load().then(probeAll).catch(e => console.warn('[sources] check failed:', e.message))
  setTimeout(run, 15_000).unref()
  setInterval(run, 20 * 60 * 1000).unref()
}

module.exports = { start, ranked, record, idForLabel, probeAll, load }
