// utils/tasteEngine.js — the "what does this person want to watch" model.
// Pure functions only (no database / network), so it can be unit-tested.
//
//  signals ──► weighted seeds ──► taste profile ──► score candidates ──► diversify (MMR) ──► rows
//
// Signals are everything a profile does: how far they got into titles (finishing is a strong yes,
// bailing early is a soft no), star ratings, My List, "Not for me", taste onboarding, and light
// implicit interest (opening a title's page, watching its trailer, clicking a search result).
// Recent behaviour counts more than old behaviour; explicit signals fade slower than implicit ones.

const DAY = 86400000

// ── 1. Signals → weights ─────────────────────────────────────────────────────

/** How strongly a single viewing says "more like this" (negative = "less like this") */
function watchWeight(entry, now = Date.now()) {
  const p = Number(entry.progress) || 0
  const ageDays = (now - new Date(entry.watchedAt || now).getTime()) / DAY
  let w
  if (entry.completed || p >= 90) w = 1.0
  else if (p >= 70) w = 0.9
  else if (p >= 40) w = 0.6
  else if (p >= 15) w = 0.3
  else w = ageDays > 7 ? -0.35 : 0.1          // started and never came back → probably not for them
  return w * decay(ageDays, 45)
}

const RATING_W = { 5: 1.5, 4: 1.0, 3: 0.2, 2: -0.8, 1: -1.3 }
const EVENT_W = { detail: 0.12, trailer: 0.25, search_click: 0.2, play: 0.15, onboard: 0.9 }

/** Exponential fade with a floor, so old favourites still count a little */
function decay(ageDays, halfLife, floor = 0.2) {
  return Math.max(floor, Math.pow(0.5, Math.max(0, ageDays) / halfLife))
}

/**
 * Merge every signal into one weight per title.
 * input: { history[], ratings[], watchlist[], hidden[], events[], onboard[] }
 * → Map("movie:123" → { key, type, id, weight, why })
 */
function buildSeeds({ history = [], ratings = [], watchlist = [], hidden = [], events = [], onboard = [] }, now = Date.now()) {
  const seeds = new Map()
  const add = (type, id, w, why, title) => {
    if (!id || !Number.isFinite(w) || w === 0) return
    const t = type === 'tv' || type === 'anime' ? 'tv' : 'movie'
    const key = `${t}:${id}`
    const s = seeds.get(key) || { key, type: t, id: Number(id), weight: 0, why: [], title: '' }
    s.weight += w
    s.why.push(why)
    if (title && !s.title) s.title = title
    seeds.set(key, s)
  }

  for (const h of history) add(h.type, h.tmdbId, watchWeight(h, now), 'watched', h.title)
  for (const r of ratings) {
    const age = (now - new Date(r.updatedAt || r.createdAt || now).getTime()) / DAY
    add(r.type, r.tmdbId, (RATING_W[r.rating] ?? 0) * decay(age, 180, 0.4), 'rated')
  }
  for (const w of watchlist) {
    const age = (now - new Date(w.addedAt || now).getTime()) / DAY
    add(w.type, w.movieId, 0.6 * decay(age, 90, 0.3), 'listed', w.title)
  }
  for (const k of hidden) { const [t, id] = String(k).split(':'); add(t, Number(id), -1.5, 'hidden') }
  for (const o of onboard) { const [t, id] = String(o).split(':'); add(t, Number(id), EVENT_W.onboard, 'onboard') }

  // Implicit interest is capped per title so browsing alone can't outweigh watching
  const implicit = new Map()
  for (const e of events) {
    const key = `${e.mediaType === 'tv' ? 'tv' : 'movie'}:${e.tmdbId}`
    const age = (now - new Date(e.at || now).getTime()) / DAY
    implicit.set(key, Math.min(0.45, (implicit.get(key) || 0) + (EVENT_W[e.kind] || 0) * decay(age, 21, 0.1)))
  }
  for (const [key, w] of implicit) { const [t, id] = key.split(':'); add(t, Number(id), w, 'browsed') }

  return seeds
}

// ── 2. Seeds + their features → taste profile ───────────────────────────────

/**
 * features: Map(key → { genres[], keywords[], people[], lang, year, type, runtime })
 * Each feature dimension is a weight map normalised to [-1, 1].
 */
function buildTaste(seeds, features, hourly = []) {
  const taste = { genre: {}, keyword: {}, person: {}, lang: {}, decade: {}, type: {}, strength: 0, hourType: null }
  const bump = (map, k, w) => { if (k !== undefined && k !== null && k !== '') map[k] = (map[k] || 0) + w }

  for (const s of seeds.values()) {
    const f = features.get(s.key)
    taste.strength += Math.abs(s.weight)
    bump(taste.type, s.type, s.weight)
    if (!f) continue
    const g = f.genres || [], k = (f.keywords || []).slice(0, 12), p = (f.people || []).slice(0, 8)
    // Spread a title's weight over its features so long keyword lists don't dominate
    g.forEach(x => bump(taste.genre, x, s.weight / Math.sqrt(g.length || 1)))
    k.forEach(x => bump(taste.keyword, x, s.weight / Math.sqrt(k.length || 1)))
    p.forEach(x => bump(taste.person, x, s.weight / Math.sqrt(p.length || 1)))
    bump(taste.lang, f.lang, s.weight)
    if (f.year) bump(taste.decade, Math.floor(f.year / 10) * 10, s.weight)
  }
  for (const dim of ['genre', 'keyword', 'person', 'lang', 'decade', 'type']) taste[dim] = normalise(taste[dim])

  // What they tend to watch at each hour of the day (movie vs series), for context
  if (hourly.length >= 6) {
    const byHour = Array.from({ length: 24 }, () => ({ movie: 0, tv: 0 }))
    for (const h of hourly) if (h.hour >= 0 && h.hour < 24) byHour[h.hour][h.type === 'movie' ? 'movie' : 'tv'] += 1
    taste.hourType = byHour
  }
  return taste
}

function normalise(map) {
  const max = Math.max(0, ...Object.values(map).map(Math.abs))
  if (!max) return {}
  const out = {}
  for (const [k, v] of Object.entries(map)) if (Math.abs(v / max) >= 0.02) out[k] = v / max
  return out
}

// ── 3. Scoring ───────────────────────────────────────────────────────────────

const W = { genre: 1.6, keyword: 1.0, person: 0.9, lang: 0.5, decade: 0.3, type: 0.35, quality: 0.8, pop: 0.25, source: 1.2, fresh: 0.12, context: 0.3 }

/** Bayesian rating: few votes pull towards the average, so 9.5★ from 4 votes doesn't win */
function quality(voteAverage = 0, voteCount = 0, m = 300, C = 6.6) {
  const v = Math.max(0, voteCount)
  return (v * voteAverage + m * C) / (v + m)
}

const sumOver = (map, list, cap) => {
  if (!list?.length) return 0
  const items = list.slice(0, cap)
  return items.reduce((s, x) => s + (map[x] || 0), 0) / Math.sqrt(items.length)
}

/**
 * candidate: { type, id, genres[], keywords?[], people?[], lang, year, voteAverage, voteCount, popularity, sources: {seed, cf, trend, discover} }
 * → { score, parts } (parts are kept to explain the pick)
 */
function scoreCandidate(c, taste, ctx = {}) {
  const parts = {
    genre:   sumOver(taste.genre, c.genres, 6),
    keyword: Math.max(-1, Math.min(1.5, sumOver(taste.keyword, c.keywords, 15))),
    person:  Math.max(-1, Math.min(1.5, sumOver(taste.person, c.people, 8))),
    lang:    taste.lang[c.lang] || 0,
    decade:  c.year ? taste.decade[Math.floor(c.year / 10) * 10] || 0 : 0,
    type:    taste.type[c.type] || 0,
    quality: (quality(c.voteAverage, c.voteCount) - 6.5) / 2,
    pop:     Math.min(1, Math.log10((c.popularity || 0) + 1) / 3),
    source:  Math.min(1.5, (c.sources?.seed || 0) + (c.sources?.cf || 0) + 0.3 * (c.sources?.trend || 0)),
    fresh:   c.year && ctx.year && ctx.year - c.year <= 1 ? 1 : 0,
    context: 0,
  }
  if (taste.hourType && ctx.hour !== undefined) {
    const h = taste.hourType[ctx.hour] || { movie: 0, tv: 0 }
    const total = h.movie + h.tv
    if (total >= 2) parts.context = (c.type === 'movie' ? h.movie : h.tv) / total - 0.5
  }
  // With little history, lean on quality/popularity; with lots, lean on taste
  const confidence = Math.min(1, (taste.strength || 0) / 6)
  let score = 0
  for (const [k, v] of Object.entries(parts)) {
    const personal = ['genre', 'keyword', 'person', 'lang', 'decade', 'type', 'context'].includes(k)
    score += W[k] * v * (personal ? 0.3 + 0.7 * confidence : 1)
  }
  return { score, parts }
}

/** Short human reason for a pick, from its strongest part */
function explain(c, parts, names = {}) {
  if (c.sources?.seedTitle && c.sources.seed >= 0.35) return `Because you ${c.sources.seedVerb || 'watched'} ${c.sources.seedTitle}`
  if (c.sources?.cf >= 0.4) return 'Popular with viewers like you'
  if (parts.person >= 0.5 && names.person) return `With ${names.person}`
  if (parts.keyword >= 0.6) return 'Matches what you like'
  if (parts.genre >= 0.5 && names.genre) return `Because you like ${names.genre}`
  if (parts.quality >= 0.8) return 'Critically acclaimed'
  if (c.sources?.trend) return 'Trending now'
  return ''
}

// ── 4. Diversity (Maximal Marginal Relevance) ────────────────────────────────

const jaccard = (a = [], b = []) => {
  if (!a.length || !b.length) return 0
  const A = new Set(a)
  const inter = b.filter(x => A.has(x)).length
  return inter / (A.size + b.length - inter)
}
const similarity = (a, b) => 0.7 * jaccard(a.genres, b.genres) + 0.3 * jaccard(a.keywords, b.keywords) + (a.type === b.type ? 0.05 : 0)

/**
 * Picks `n` items balancing relevance and variety, so a row isn't ten near-identical films.
 * lambda 1 = pure relevance, 0 = pure variety.
 */
function diversify(items, n, lambda = 0.72) {
  if (!items.length) return []
  const max = Math.max(...items.map(i => i.score)), min = Math.min(...items.map(i => i.score))
  // Score gaps under ~2 points are "about equally good" — don't stretch them to 0..1, or near-duplicates always win
  const rel = i => (i.score - min) / Math.max(max - min, 2)
  const pool = [...items], out = []
  while (out.length < n && pool.length) {
    let best = 0, bestVal = -Infinity
    for (let i = 0; i < pool.length; i++) {
      const sim = out.length ? Math.max(...out.map(o => similarity(o, pool[i]))) : 0
      const val = lambda * rel(pool[i]) - (1 - lambda) * sim
      if (val > bestVal) { bestVal = val; best = i }
    }
    out.push(pool.splice(best, 1)[0])
  }
  return out
}

/** The profile's strongest liked items in a dimension (for row titles like "Because you like Sci-Fi") */
const topOf = (map, n = 3, min = 0.25) => Object.entries(map).filter(([, v]) => v >= min).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k)

module.exports = { watchWeight, buildSeeds, buildTaste, scoreCandidate, explain, diversify, quality, similarity, topOf, decay, _W: W }
