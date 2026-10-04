// utils/discoveryEngine.js — the ranking maths behind learned row order, "Coming up for you", the news feed
// and the no-AI fallback for "Ask Streamix". Pure functions only (no database / network), unit-tested.
const { quality } = require('./tasteEngine')

const DAY = 86400000

// ── 1. Learned row order (Thompson sampling) ────────────────────────────────
// Every Home row kind ("because", "gems", "cf"…) is a slot machine: shown = pulls, opened/played = wins.
// Sampling each row's Beta(wins+1, misses+1) and sorting by the draw puts rows a profile actually uses
// higher, while still giving rarely-shown rows a chance to prove themselves.

/** Gamma(k, 1) sample (Marsaglia–Tsang), the building block of a Beta sample */
function gamma(k, rand) {
  if (k < 1) return gamma(k + 1, rand) * Math.pow(rand(), 1 / k)
  const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d)
  for (;;) {
    let x, v
    do {
      // Box–Muller normal
      x = Math.sqrt(-2 * Math.log(rand() || 1e-12)) * Math.cos(2 * Math.PI * rand())
      v = 1 + c * x
    } while (v <= 0)
    v = v * v * v
    const u = rand()
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v
  }
}

function betaSample(a, b, rand = Math.random) {
  const x = gamma(a, rand), y = gamma(b, rand)
  return x / (x + y)
}

/**
 * Order Home rows. The first row (Top picks) stays first; the rest are ordered by a Thompson draw.
 * stats: { [kind]: { shown, clicked } } (already decayed). Rows' original order acts as a mild prior.
 */
function orderRows(sections, stats = {}, rand = Math.random) {
  if (sections.length <= 2) return sections
  const [first, ...rest] = sections
  const drawn = rest.map((s, i) => {
    const st = stats[s.kind] || { shown: 0, clicked: 0 }
    const clicked = Math.min(st.clicked, st.shown)
    // Prior: about a 10% open rate, nudged by the hand-tuned position
    const prior = 1 + Math.max(0, 3 - i) * 0.25
    return { s, draw: betaSample(clicked + prior, Math.max(0, st.shown - clicked) + 9, rand) }
  })
  return [first, ...drawn.sort((a, b) => b.draw - a.draw).map(d => d.s)]
}

/** Older evidence counts less: multiply counts by 0.5 every `halfLifeDays` */
function decayStats(stats = {}, lastAt, now = Date.now(), halfLifeDays = 21) {
  const f = lastAt ? Math.pow(0.5, Math.max(0, now - new Date(lastAt).getTime()) / (halfLifeDays * DAY)) : 1
  const out = {}
  for (const [k, v] of Object.entries(stats)) out[k] = { shown: (v.shown || 0) * f, clicked: (v.clicked || 0) * f }
  return out
}

// ── 2. "Coming up for you" ──────────────────────────────────────────────────

/**
 * How much a profile will want an unreleased title.
 * c: { tasteScore, popularity, daysUntil, franchise?, person?, premiere?, reminded? }
 * → { score, reason, kind }
 */
function scoreUpcoming(c) {
  let score = 0.9 * (c.tasteScore || 0)
  // Hype: popularity before release is the best early signal of buzz
  score += 0.35 * Math.min(1.2, Math.log10((c.popularity || 0) + 1) / 2.5)
  // Sooner is more useful to know about, but far-off big titles still count
  const d = Math.max(0, c.daysUntil ?? 60)
  score += d <= 7 ? 0.35 : d <= 30 ? 0.2 : d <= 90 ? 0.05 : -0.1
  let reason = '', kind = 'taste'
  if (c.premiere) { score += 2.6; reason = c.premiere; kind = 'premiere' }
  else if (c.episode) { score += 1.4; reason = c.episode; kind = 'episode' }
  else if (c.franchise) { score += 2.2; reason = c.franchise; kind = 'franchise' }
  else if (c.person) { score += 1.1; reason = c.person; kind = 'person' }
  else if ((c.tasteScore || 0) > 1.1) reason = c.genreReason || 'Matches what you like'
  else if ((c.popularity || 0) > 80) { reason = 'Most anticipated'; kind = 'hype' }
  else if ((c.tasteScore || 0) > 0.5) reason = c.genreReason || 'You might like this'
  else reason = (c.popularity || 0) > 20 ? 'Getting a lot of attention' : 'New release'
  if (c.reminded) score += 0.5
  return { score, reason, kind }
}

// ── 3. News feed ────────────────────────────────────────────────────────────
// Each candidate story has a kind, a relevance (taste match, 0..1) and a date. Score =
//   kind weight × (0.35 + 0.65 × relevance) × freshness × seen-penalty
// then a greedy pass spreads kinds out so the feed isn't ten trending posters in a row.

const FEED_KINDS = {
  new_episode:  { w: 1.45, halfLife: 3,  past: true },   // a show you follow just aired
  premiere:     { w: 1.4,  halfLife: 10, past: false },  // season premiere / reminded title is close
  library:      { w: 1.2,  halfLife: 7,  past: true },   // added to this server's library
  coming_soon:  { w: 1.0,  halfLife: 21, past: false },  // trailer for an upcoming title you'd like
  pick:         { w: 1.0,  halfLife: 2,  past: true },   // today's top pick from your recommendations
  community:    { w: 0.95, halfLife: 7,  past: true },   // viewers like you finished it this week
  fresh_hit:    { w: 0.9,  halfLife: 30, past: true },   // new release that critics/viewers love
  trending:     { w: 0.75, halfLife: 3,  past: true },   // trending now (taste-filtered)
}

/** 1 for "now", fading with distance from now in days (past or future depending on kind) */
function freshness(kind, date, now = Date.now()) {
  const k = FEED_KINDS[kind] || { halfLife: 7 }
  if (!date) return 0.6
  const days = Math.abs(now - new Date(date).getTime()) / DAY
  return Math.max(0.12, Math.pow(0.5, days / k.halfLife))
}

/** A title you've already been shown in the feed fades out: ×0.55 per earlier showing */
const seenPenalty = (n = 0) => Math.pow(0.55, n)

/**
 * items: [{ key, kind, relevance (0..1), date, quality? }], seen: { [key]: timesShown }
 * → same items with .score, ordered for display
 */
function rankFeed(items, { now = Date.now(), seen = {}, day = Math.floor(now / DAY) } = {}) {
  // One story per title: keep its strongest kind
  const best = new Map()
  for (const it of items) {
    const k = FEED_KINDS[it.kind] || { w: 0.6 }
    const q = it.quality ? Math.max(0, Math.min(1, (it.quality - 6) / 2.5)) : 0.5
    // A tiny day-seeded jitter so the feed shifts a little each day even with no new stories
    const jitter = 1 + (((Number(String(it.key).replace(/\D/g, '')) * 2654435761 + day * 40503) % 1000) / 1000 - 0.5) * 0.08
    const score = k.w * (0.35 + 0.65 * Math.max(0, Math.min(1, it.relevance ?? 0.5))) * (0.85 + 0.3 * q)
      * freshness(it.kind, it.date, now) * seenPenalty(seen[it.key]) * jitter
    const prev = best.get(it.key)
    if (!prev || score > prev.score) best.set(it.key, { ...it, score })
  }
  const pool = [...best.values()].sort((a, b) => b.score - a.score)
  // Greedy spread: a story loses ground if the last one or two are the same kind
  const out = []
  while (pool.length) {
    let bi = 0, bv = -Infinity
    for (let i = 0; i < Math.min(pool.length, 12); i++) {
      const it = pool[i]
      let v = it.score
      if (out.length && out[out.length - 1].kind === it.kind) v *= 0.7
      if (out.length > 1 && out[out.length - 2].kind === it.kind) v *= 0.85
      if (v > bv) { bv = v; bi = i }
    }
    out.push(pool.splice(bi, 1)[0])
  }
  return out
}

/** Map a raw taste score (roughly -2..4) to a 0..1 relevance */
const relevance = (tasteScore) => 1 / (1 + Math.exp(-(tasteScore - 0.8) * 1.4))

// ── 4. "Ask Streamix" without AI ────────────────────────────────────────────
// Turns "something funny and short from the 90s, not horror" into discover filters.

const GENRE_WORDS = [
  [/\b(funny|comed(y|ies)|laugh|hilarious|lighthearted|silly)\b/i, 35],
  [/\b(scary|horror|creepy|terrify)/i, 27],
  [/\b(action|explosions?|fight(ing)?|fast[- ]paced)\b/i, 28],
  [/\b(romance|romantic|love story|date night)\b/i, 10749],
  [/\b(sci[- ]?fi|science fiction|space|future|aliens?|robots?)\b/i, 878],
  [/\b(thriller|suspense|tense|edge of (my|your) seat)\b/i, 53],
  [/\b(mystery|whodunit|detective)\b/i, 9648],
  [/\b(crime|heist|gangsters?|mafia)\b/i, 80],
  [/\b(drama|emotional|moving|tear ?jerker|cry)\b/i, 18],
  [/\b(fantasy|magic|dragons?|wizards?)\b/i, 14],
  [/\b(animated|animation|cartoon|anime)\b/i, 16],
  [/\b(family|kids|children)\b/i, 10751],
  [/\b(documentar(y|ies)|true story|real life)\b/i, 99],
  [/\b(war|soldiers?|battle)\b/i, 10752],
  [/\b(history|historical|period piece)\b/i, 36],
  [/\b(adventure|quest|journey)\b/i, 12],
  [/\b(music(al)?|band|concert)\b/i, 10402],
  [/\b(western|cowboys?)\b/i, 37],
]
const LANG_WORDS = { korean: 'ko', japanese: 'ja', french: 'fr', spanish: 'es', german: 'de', italian: 'it', hindi: 'hi', bollywood: 'hi', chinese: 'zh', turkish: 'tr', nigerian: 'en', nollywood: 'en' }

function planFromText(q) {
  const text = String(q || '')
  const lower = text.toLowerCase()
  const plan = { type: 'any', genres: [], avoidGenres: [], keywords: [], similarTo: [], yearFrom: null, yearTo: null, maxRuntime: null, language: null, minRating: null, mood: null }
  // "not horror" / "no horror" / "without horror"
  for (const [re, id] of GENRE_WORDS) {
    const m = lower.match(re)
    if (!m) continue
    const before = lower.slice(Math.max(0, m.index - 12), m.index)
    if (/\b(not|no|without|except|nothing)\s+(too\s+)?$/.test(before)) plan.avoidGenres.push(id)
    else plan.genres.push(id)
  }
  if (/\b(series|show|tv|binge|episodes?)\b/.test(lower)) plan.type = 'tv'
  else if (/\b(movie|film)\b/.test(lower)) plan.type = 'movie'
  const dec = lower.match(/\b(?:19|20)?(\d0)'?s\b/)
  if (dec) { const n = Number(dec[1]); const y = n >= 30 ? 1900 + n : 2000 + n; plan.yearFrom = y; plan.yearTo = y + 9 }
  if (/\b(new|recent|latest|this year)\b/.test(lower)) plan.yearFrom = new Date().getFullYear() - 2
  if (/\b(old|classic)\b/.test(lower)) plan.yearTo = 1995
  if (/\b(short|quick|under (an|1) hour|90 ?min)/.test(lower)) plan.maxRuntime = 100
  if (/\b(best|acclaimed|masterpiece|highly rated|top rated)\b/.test(lower)) plan.minRating = 7.5
  if (/\b(feel[- ]?good|uplifting|happy|cheerful|wholesome|cozy|cosy|light(er)?|less (sad|dark|depressing)|not (too )?(sad|dark|depressing))\b/.test(lower)) plan.mood = 'light'
  else if (/\b(dark|gritty|intense|disturbing|bleak)\b/.test(lower)) plan.mood = 'dark'
  for (const [w, code] of Object.entries(LANG_WORDS)) if (lower.includes(w)) plan.language = code
  const like = text.match(/\blike\s+["“]?([^,"”.!?]+?)["”]?(?:\s+but\b|[,.!?]|$)/i)
  if (like && like[1].trim().length > 1) plan.similarTo.push(like[1].trim())
  return plan
}

/** How well a candidate fits an Ask plan (0..~2), on top of the profile's taste */
// TV uses different genre ids (no "Thriller" or "Horror" on TV): movie genre → the TV genres that mean the same
const TV_EQUIV = { 53: [80, 9648], 27: [9648, 10765], 10749: [18], 10752: [10768], 878: [10765], 14: [10765], 28: [10759], 12: [10759], 36: [18, 10768], 16: [16], 10751: [10751, 10762] }
const LIGHT = [35, 10751, 16, 12, 10402, 10762], HEAVY = [10752, 27]

function planFit(c, plan) {
  let s = 0
  const g = c.genres || []
  const has = (x) => g.includes(x) || (c.type === 'tv' && (TV_EQUIV[x] || []).some(y => g.includes(y)))
  if (plan.genres.length) s += 1.2 * plan.genres.filter(has).length / plan.genres.length
  if (plan.avoidGenres.some(has)) s -= 3
  if (plan.type !== 'any' && c.type !== plan.type) s -= 0.8
  // "Short" means a film, not a long-running series
  if (plan.maxRuntime && plan.type === 'any' && c.type === 'tv') s -= 0.6
  if (plan.mood === 'light') s += (g.some(x => LIGHT.includes(x)) ? 0.5 : 0) - (g.some(x => HEAVY.includes(x)) ? 0.8 : 0) - (g.length === 1 && g[0] === 18 ? 0.4 : 0)
  if (plan.mood === 'dark') s += g.some(x => [53, 80, 27, 9648, 18].includes(x)) ? 0.4 : -0.3
  if (plan.yearFrom && c.year && c.year < plan.yearFrom) s -= 0.6
  if (plan.yearTo && c.year && c.year > plan.yearTo) s -= 0.6
  if (plan.language && c.lang && c.lang !== plan.language) s -= 0.7
  if (plan.minRating && quality(c.voteAverage, c.voteCount) < plan.minRating - 0.6) s -= 0.5
  if (c.sources?.similarTo) s += 0.9 * c.sources.similarTo
  return s
}

module.exports = { TV_EQUIV, betaSample, orderRows, decayStats, scoreUpcoming, FEED_KINDS, freshness, seenPenalty, rankFeed, relevance, planFromText, planFit }
