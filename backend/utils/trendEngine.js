// utils/trendEngine.js — what's hot right now, and what's rising. Pure functions, unit-tested.
//
// Every 30 minutes the tracker snapshots TMDB's trending / now-playing lists (popularity + rank per title).
// From those snapshots and this server's own activity:
//   momentum  = log growth of popularity vs ~24h ago (and rank climbed), so a title racing up the charts shows
//               before it's at the top
//   localHeat = plays, completions, page views and trailer views on THIS server, each fading with a 24h half-life
//   hot       = popularity (log) + momentum + local heat + a fresh-release bump, gated by a Bayesian quality floor
// Lists come out of these scores: Everyone's Watching (hot), Rising Fast (momentum), Just Released, Top 10s.

const HOUR = 3600 * 1000

/** Snapshot closest to `hoursAgo` (but at least `minHours` old), or null */
function snapshotAround(snapshots, now, hoursAgo = 24, minHours = 5) {
  let best = null, bestDiff = Infinity
  for (const s of snapshots) {
    const age = (now - new Date(s.at).getTime()) / HOUR
    if (age < minHours) continue
    const diff = Math.abs(age - hoursAgo)
    if (diff < bestDiff) { best = s; bestDiff = diff }
  }
  return best
}

/**
 * Momentum per title key ("movie:1"): growth of popularity and rank since the reference snapshot.
 * now/prev: { items: { [key]: { pop, rank } } }. Hours between them normalises to a per-day rate.
 */
function momentum(now, prev, hoursBetween = 24) {
  const out = {}
  if (!prev) return out
  const scale = 24 / Math.max(4, hoursBetween)
  for (const [k, cur] of Object.entries(now.items)) {
    const old = prev.items[k]
    if (!old) { out[k] = 0.35 * scale; continue } // newly charting
    const popGrowth = Math.log((cur.pop + 5) / (old.pop + 5))
    const rankClimb = old.rank && cur.rank ? (old.rank - cur.rank) / Math.max(10, old.rank) : 0
    out[k] = (popGrowth + 0.5 * rankClimb) * scale
  }
  return out
}

const SIGNAL_W = { play: 3, complete: 4, detail: 1, trailer: 1.5, search_click: 0.8 }

/** Local heat per key from this server's events: [{ key, kind, at }] (24h half-life) */
function localHeat(events, now, halfLifeHours = 24) {
  const out = {}
  for (const e of events) {
    const age = (now - new Date(e.at).getTime()) / HOUR
    if (age < 0 || age > 24 * 7) continue
    out[e.key] = (out[e.key] || 0) + (SIGNAL_W[e.kind] || 0.5) * Math.pow(0.5, age / halfLifeHours)
  }
  return out
}

/** Bayesian average (so 9.8★ from 6 votes doesn't top a chart) */
const quality = (avg = 0, votes = 0, m = 150, C = 6.4) => (votes * avg + m * C) / (votes + m)

/**
 * Score every title. t: { key, pop, rank, voteAverage, voteCount, date (release), type }
 * → [{ ...t, hot, momentum, heat, quality }]
 */
function scoreAll(titles, { mom = {}, heat = {}, now = Date.now() } = {}) {
  const maxLogPop = Math.max(1, ...titles.map(t => Math.log1p(t.pop || 0)))
  const maxHeat = Math.max(1, ...Object.values(heat))
  return titles.map(t => {
    const q = quality(t.voteAverage, t.voteCount)
    const m = mom[t.key] ?? 0
    const h = heat[t.key] || 0
    const days = t.date ? (now - new Date(t.date + 'T12:00:00').getTime()) / (24 * HOUR) : null
    const fresh = days !== null && days >= 0 && days <= 21 ? 0.12 * (1 - days / 21) : 0
    const hot = 0.5 * Math.log1p(t.pop || 0) / maxLogPop
      + 0.22 * Math.tanh(m)
      + 0.28 * Math.log1p(h) / Math.log1p(maxHeat)
      + fresh
      + 0.05 * Math.max(-1, Math.min(1, (q - 6.4) / 1.5))
    return { ...t, hot, momentum: m, heat: h, quality: q }
  })
}

/** Build the New & Hot lists from scored titles */
function lists(scored, { now = Date.now() } = {}) {
  const by = (f) => [...scored].sort((a, b) => f(b) - f(a))
  const released = (t, maxDays) => {
    if (!t.date) return false
    const d = (now - new Date(t.date + 'T12:00:00').getTime()) / (24 * HOUR)
    return d >= 0 && d <= maxDays
  }
  const notJunk = (t) => t.quality >= 5.4 || (t.voteCount || 0) < 30 // unrated new titles get a pass
  const everyone = by(t => t.hot).filter(notJunk).slice(0, 30)
  const rising = by(t => t.momentum + 0.3 * Math.log1p(t.heat)).filter(t => t.momentum > 0.08 && (t.pop || 0) >= 8 && notJunk(t)).slice(0, 20)
  const justReleased = by(t => t.hot + 0.15 * (t.quality - 6.4)).filter(t => t.type === 'movie' && released(t, 45) && notJunk(t)).slice(0, 20)
  const top10Movies = by(t => t.hot).filter(t => t.type === 'movie' && notJunk(t)).slice(0, 10)
  const top10Tv = by(t => t.hot).filter(t => t.type === 'tv' && notJunk(t)).slice(0, 10)
  return { everyone, rising, justReleased, top10Movies, top10Tv }
}

/** Why it's here, in a few words */
function reason(t, listName) {
  if (t.heat >= 1.5) return `Popular on this server right now`
  if (listName === 'rising' || t.momentum > 0.4) return `Rising fast — up ${Math.round((Math.exp(t.momentum) - 1) * 100)}% today`
  if (listName === 'justReleased') return t.quality >= 7.2 ? 'New and well reviewed' : 'Just released'
  if (t.rank && t.rank <= 10) return `#${t.rank} worldwide today`
  return 'Trending now'
}

/** A short fingerprint of the lists, to tell clients "something changed" */
function version(l) {
  const ids = [...l.everyone.slice(0, 10), ...l.top10Movies, ...l.top10Tv, ...l.rising.slice(0, 5)].map(t => t.key).join(',')
  let h = 0
  for (let i = 0; i < ids.length; i++) h = (h * 31 + ids.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

module.exports = { snapshotAround, momentum, localHeat, quality, scoreAll, lists, reason, version }
