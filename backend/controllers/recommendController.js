// controllers/recommendController.js — personalised rows, "More like this", taste onboarding, interest events
const mongoose  = require('mongoose')
const Profile   = require('../models/Profile')
const Rating    = require('../models/Rating')
const Watchlist = require('../models/Watchlist')
const ViewEvent = require('../models/ViewEvent')
const { cachedTmdb } = require('../config/tmdb')
const engine = require('../utils/tasteEngine')
const { getMany, fromListItem, getFeatures } = require('../utils/titleFeatures')
const disc = require('../utils/discoveryEngine')
const ai = require('../utils/ai')

const GENRES = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary', 18: 'Drama',
  10751: 'Family', 14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance',
  878: 'Sci-Fi', 53: 'Thriller', 10752: 'War', 37: 'Western', 10759: 'Action & Adventure', 10762: 'Kids',
  10763: 'News', 10764: 'Reality', 10765: 'Sci-Fi & Fantasy', 10766: 'Soap', 10767: 'Talk', 10768: 'War & Politics',
}
// TV and movie genre ids differ for the same idea — map so taste carries across
const TV_TO_MOVIE = { 10759: 28, 10765: 878, 10768: 10752 }
const MOVIE_TO_TV = { 28: 10759, 12: 10759, 878: 10765, 14: 10765, 10752: 10768 }
const NOT_ROWS = new Set([10763, 10764, 10766, 10767]) // news/reality/soap/talk — never a recommendation row

// ── Cache (per profile; cleared when the profile does something meaningful) ───
const cache = new Map()       // profileId → { at, data, userId }
const TTL = 10 * 60 * 1000
const rebuilds = new Map()    // profileId → timer (debounced background refresh)

/**
 * Something changed for this profile: drop its cached rows and rebuild them in the background
 * a few seconds later, so the next visit to Home is instant instead of waiting on TMDB.
 */
exports.invalidate = (profileId) => {
  const key = String(profileId)
  const prev = cache.get(key)
  cache.delete(key)
  if (!prev?.userId) return
  clearTimeout(rebuilds.get(key))
  const timer = setTimeout(async () => {
    rebuilds.delete(key)
    try {
      const profile = await Profile.findById(key)
      if (!profile) return
      const data = await buildRows(profile, { _id: prev.userId })
      const entry = { at: Date.now(), data, userId: prev.userId }
      cache.set(key, entry)
      enhanceTopPicks(key, entry)
    } catch { /* next request builds it */ }
  }, 4000)
  timer.unref()
  rebuilds.set(key, timer)
}

async function ownProfile(req, select = '') {
  if (!mongoose.isValidObjectId(req.params.id)) return null
  return Profile.findOne({ _id: req.params.id, user: req.user._id }).select(select)
}

// ── Signals → seeds → taste ──────────────────────────────────────────────────
async function tasteFor(profile, user) {
  const kids = !!profile.isKids
  const [ratings, watchlist, events] = await Promise.all([
    kids ? [] : Rating.find({ userId: user._id }).sort({ updatedAt: -1 }).limit(300).lean(),
    kids ? [] : Watchlist.find({ user: user._id }).sort({ addedAt: -1 }).limit(200).lean(),
    ViewEvent.find({ profile: profile._id }).sort({ at: -1 }).limit(400).lean(),
  ])
  const history = profile.watchHistory || []
  const seeds = engine.buildSeeds({ history, ratings, watchlist, hidden: profile.hiddenTitles || [], events, onboard: profile.onboardPicks || [] })
  const top = [...seeds.values()].sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)).slice(0, 24)
  const features = await getMany(top.map(s => ({ type: s.type, id: s.id })))
  for (const s of top) if (!s.title && features.get(s.key)) s.title = features.get(s.key).title
  const hourly = history.filter(h => h.hour !== null && h.hour !== undefined).map(h => ({ hour: h.hour, type: h.type === 'movie' ? 'movie' : 'tv' }))
  const taste = engine.buildTaste(new Map(top.map(s => [s.key, s])), features, hourly)
  // Genre taste should carry across movies ↔ series
  for (const [tv, mv] of Object.entries(TV_TO_MOVIE)) {
    if (taste.genre[tv] && !taste.genre[mv]) taste.genre[mv] = taste.genre[tv] * 0.8
    if (taste.genre[mv] && !taste.genre[tv]) taste.genre[tv] = taste.genre[mv] * 0.8
  }
  for (const [mv, tv] of Object.entries(MOVIE_TO_TV)) if (taste.genre[mv] && !taste.genre[tv]) taste.genre[tv] = taste.genre[mv] * 0.7

  const peopleNames = {}
  for (const f of features.values()) Object.assign(peopleNames, f.peopleNames || {})
  return { seeds, top, taste, features, peopleNames, history }
}

// ── Candidate pool ───────────────────────────────────────────────────────────
function pool() {
  const map = new Map()
  const add = (r, type, src = {}) => {
    if (!r?.id || r.adult || !r.poster_path) return null
    const c = fromListItem(r, type)
    const ex = map.get(c.key)
    if (ex) {
      for (const [k, v] of Object.entries(src)) {
        if (typeof v === 'number') ex.sources[k] = Math.max(ex.sources[k] || 0, v)
        else if (v && !ex.sources[k]) ex.sources[k] = v
      }
      return ex
    }
    c.sources = { ...src }
    map.set(c.key, c)
    return c
  }
  return { map, add }
}

const discover = (type, params) => cachedTmdb(`/discover/${type}`, { include_adult: false, ...params }).then(d => d.results || []).catch(() => [])

async function gatherCandidates({ seeds, top, taste }, profile) {
  const { map, add } = pool()
  const kids = !!profile.isKids
  const liked = top.filter(s => s.weight > 0.25).sort((a, b) => b.weight - a.weight)
  const maxW = liked[0]?.weight || 1

  // 1. "More like" each strongly liked title (TMDB recommendations + similar)
  await Promise.all(liked.slice(0, 7).map(async s => {
    const [rec, sim] = await Promise.all([
      cachedTmdb(`/${s.type}/${s.id}/recommendations`).then(d => d.results || []).catch(() => []),
      cachedTmdb(`/${s.type}/${s.id}/similar`).then(d => d.results || []).catch(() => []),
    ])
    // "watched" only when they actually watched it; picks, ratings and My List are "liked"
    const seedVerb = s.why.includes('watched') ? 'watched' : 'liked'
    rec.slice(0, 20).forEach((r, i) => add(r, s.type, { seed: (s.weight / maxW) * 0.9 / Math.sqrt(i + 1), seedTitle: s.title, seedKey: s.key, seedVerb }))
    sim.slice(0, 10).forEach((r, i) => add(r, s.type, { seed: (s.weight / maxW) * 0.5 / Math.sqrt(i + 1), seedTitle: s.title, seedKey: s.key, seedVerb }))
  }))

  // 2. Viewers like you: other profiles that loved the same titles — what else did they love?
  const likedIds = liked.slice(0, 20).map(s => s.id)
  if (likedIds.length) {
    const rows = await Profile.aggregate([
      { $match: { _id: { $ne: profile._id }, isKids: kids, 'watchHistory.tmdbId': { $in: likedIds } } },
      { $limit: 300 },
      { $project: { h: '$watchHistory', overlap: { $size: { $setIntersection: ['$watchHistory.tmdbId', likedIds] } } } },
      { $unwind: '$h' },
      { $match: { 'h.tmdbId': { $nin: likedIds }, $or: [{ 'h.completed': true }, { 'h.progress': { $gte: 60 } }] } },
      { $group: { _id: { id: '$h.tmdbId', type: '$h.type' }, score: { $sum: '$overlap' }, n: { $sum: 1 } } },
      { $sort: { score: -1 } }, { $limit: 25 },
    ]).catch(() => [])
    const best = rows[0]?.score || 1
    const feats = await getMany(rows.map(r => ({ type: r._id.type === 'movie' ? 'movie' : 'tv', id: r._id.id })))
    for (const r of rows) {
      const t = r._id.type === 'movie' ? 'movie' : 'tv'
      const f = feats.get(`${t}:${r._id.id}`)
      if (f) add({ ...f, genre_ids: f.genres, original_language: f.lang, media_type: t }, t, { cf: 0.9 * (r.score / best) })
    }
  }

  // 3. Favourite genres / keywords / people, through TMDB discover
  const kidsParams = kids ? { certification_country: 'US', 'certification.lte': 'PG' } : {}
  const goodGenres = engine.topOf(taste.genre, 3).filter(g => !NOT_ROWS.has(Number(g)))
  const lang = engine.topOf(taste.lang, 1, 0.5)[0]
  const jobs = []
  for (const g of goodGenres.slice(0, 2)) {
    const movieG = TV_TO_MOVIE[g] || g, tvG = MOVIE_TO_TV[g] || g
    if (GENRES[movieG] && movieG < 10000) jobs.push(discover('movie', { ...kidsParams, with_genres: movieG, sort_by: 'vote_average.desc', 'vote_count.gte': 400 }).then(rs => rs.forEach(r => add(r, 'movie', { discover: 1, genreRow: movieG }))))
    if (!kids) jobs.push(discover('tv', { with_genres: tvG, sort_by: 'popularity.desc', 'vote_count.gte': 150 }).then(rs => rs.forEach(r => add(r, 'tv', { discover: 1, genreRow: tvG }))))
  }
  if (lang && lang !== 'en') {
    jobs.push(discover('movie', { ...kidsParams, with_original_language: lang, sort_by: 'popularity.desc', 'vote_count.gte': 100 }).then(rs => rs.forEach(r => add(r, 'movie', { discover: 1 }))))
    if (!kids) jobs.push(discover('tv', { with_original_language: lang, sort_by: 'popularity.desc', 'vote_count.gte': 50 }).then(rs => rs.forEach(r => add(r, 'tv', { discover: 1 }))))
  }
  const kws = engine.topOf(taste.keyword, 2, 0.4)
  if (kws.length) jobs.push(discover('movie', { ...kidsParams, with_keywords: kws.join('|'), sort_by: 'vote_average.desc', 'vote_count.gte': 200 }).then(rs => rs.forEach(r => add(r, 'movie', { discover: 1 }))))
  const person = engine.topOf(taste.person, 1, 0.45)[0]
  if (person && !kids) jobs.push(discover('movie', { with_people: person, sort_by: 'popularity.desc' }).then(rs => rs.forEach(r => add(r, 'movie', { discover: 1, personRow: person }))))

  // 4. A little of what's popular right now, and (for exploring) acclaimed titles outside their usual genres
  jobs.push(cachedTmdb(kids ? '/discover/movie' : '/trending/all/week', kids ? { ...kidsParams, sort_by: 'popularity.desc' } : {})
    .then(d => (d.results || []).forEach(r => add(r, r.media_type === 'tv' ? 'tv' : 'movie', { trend: 1 }))).catch(() => {}))
  const unexplored = Object.keys(GENRES).filter(g => Number(g) < 10000 && !(taste.genre[g] < 0) && (taste.genre[g] || 0) < 0.15).slice(0, 3)
  if (unexplored.length && taste.strength > 1) {
    jobs.push(discover('movie', { ...kidsParams, with_genres: unexplored.join('|'), sort_by: 'vote_average.desc', 'vote_count.gte': 2000 })
      .then(rs => rs.forEach(r => add(r, 'movie', { explore: 1 }))))
  }
  await Promise.all(jobs)

  // Nothing they've finished, are in the middle of, or said no to
  for (const [key, s] of seeds) {
    const h = s.why.includes('watched') || s.why.includes('rated') || s.why.includes('hidden') || s.why.includes('onboard')
    if (h || s.weight < 0) map.delete(key)
  }
  return map
}

// ── Rows ─────────────────────────────────────────────────────────────────────
function toCard(c, reason) {
  return {
    id: c.id, media_type: c.type, title: c.type === 'movie' ? c.title : undefined, name: c.type === 'tv' ? c.title : undefined,
    poster_path: c.poster_path, backdrop_path: c.backdrop_path, overview: c.overview,
    vote_average: c.voteAverage, release_date: c.release_date, first_air_date: c.first_air_date,
    genre_ids: c.genres, reason: reason || undefined,
  }
}

async function buildRows(profile, user) {
  const ctx = await tasteFor(profile, user)
  const { taste, top, peopleNames } = ctx
  const candidates = await gatherCandidates(ctx, profile)

  const now = new Date()
  const sctx = { hour: now.getHours(), year: now.getFullYear() }
  let scored = [...candidates.values()].map(c => ({ ...c, ...engine.scoreCandidate(c, taste, sctx) }))

  // Re-score the best ones with full features (keywords, cast, director)
  scored.sort((a, b) => b.score - a.score)
  const head = scored.slice(0, 50)
  const full = await getMany(head.map(c => ({ type: c.type, id: c.id })))
  for (const c of head) {
    const f = full.get(c.key)
    if (f) { c.keywords = f.keywords; c.people = f.people; Object.assign(c, engine.scoreCandidate(c, taste, sctx)) }
  }
  scored.sort((a, b) => b.score - a.score)

  // Maturity setting: drop titles rated above it (checked for the titles we might show)
  const maturity = profile.isKids ? null : profile.prefs?.maturity || 'all'
  if (maturity && maturity !== 'all') {
    const { levelFor } = require('./movieController')
    const ORDER = ['7', '13', '16', 'all']
    const checked = await Promise.all(scored.slice(0, 90).map(async c => ({ c, lvl: await levelFor(c.type, c.id) })))
    scored = checked.filter(x => !x.lvl || ORDER.indexOf(x.lvl) <= ORDER.indexOf(maturity)).map(x => x.c)
  }

  const genreName = (id) => GENRES[id]
  const topPerson = engine.topOf(taste.person, 1, 0.45)[0]
  const names = { genre: genreName(engine.topOf(taste.genre, 1)[0]), person: peopleNames[topPerson] }
  const reason = (c) => engine.explain(c, c.parts, { ...names, genre: c.genres?.map(genreName).find(g => g && taste.genre[Object.keys(GENRES).find(k => GENRES[k] === g)] > 0.4) || names.genre })

  const sections = []
  const used = new Set()
  const take = (list, n, title, kind, opts = {}) => {
    const fresh = list.filter(c => opts.allowUsed || !used.has(c.key))
    if (fresh.length < (opts.min || 5)) return
    const picked = engine.diversify(fresh, n, opts.lambda ?? 0.72)
    picked.forEach(c => used.add(c.key))
    sections.push({ title, kind, items: picked.map(c => toCard(c, opts.reasons ? reason(c) : undefined)) })
  }

  const coldStart = taste.strength < 0.5
  const name = profile.name

  if (coldStart) {
    take(scored.filter(c => c.sources.trend), 20, `Popular on Streamix`, 'popular', { lambda: 0.6 })
    take(scored.filter(c => engine.quality(c.voteAverage, c.voteCount) >= 7.4), 20, 'Critically acclaimed', 'acclaimed', { lambda: 0.6 })
  } else {
    // A bit of exploration mixed into the top row (1 in 7)
    const main = scored.filter(c => !c.sources.explore)
    const explore = scored.filter(c => c.sources.explore && c.score > 0)
    const picks = engine.diversify(main.filter(c => !used.has(c.key)), 18)
    if (explore[0]) picks.splice(Math.min(6, picks.length), 0, explore[0])
    if (explore[1]) picks.splice(Math.min(13, picks.length), 0, explore[1])
    picks.forEach(c => used.add(c.key))
    sections.push({ title: `Top picks for ${name}`, kind: 'top', items: picks.map(c => toCard(c, c.sources.explore ? 'Something different' : reason(c))) })

    // "Because you watched …" for the two strongest recent likes that produced enough
    const recentLikes = top.filter(s => s.weight > 0.4 && s.title && (s.why.includes('watched') || s.why.includes('rated') || s.why.includes('onboard')))
    let because = 0
    for (const s of recentLikes) {
      if (because >= 2) break
      const fromSeed = scored.filter(c => c.sources.seedKey === s.key)
      const before = sections.length
      take(fromSeed, 15, `Because you ${s.why.includes('watched') ? 'watched' : 'liked'} ${s.title}`, 'because', { allowUsed: true, min: 6 })
      if (sections.length > before) because++
    }

    take(scored.filter(c => c.sources.cf), 15, 'Viewers like you also watched', 'cf', { min: 5 })

    const g = engine.topOf(taste.genre, 3).map(Number).find(id => GENRES[id] && !NOT_ROWS.has(id))
    if (g) take(scored.filter(c => c.genres.includes(g) || c.genres.includes(TV_TO_MOVIE[g]) || c.genres.includes(MOVIE_TO_TV[g])), 15, `Because you like ${GENRES[g]}`, 'genre')

    if (topPerson && peopleNames[topPerson]) {
      // Only titles they actually star in / directed / wrote (not just produced)
      const maybe = scored.filter(c => c.sources.personRow === topPerson && !c.people)
      const extra = await getMany(maybe.slice(0, 20).map(c => ({ type: c.type, id: c.id })))
      for (const c of maybe) { const f = extra.get(c.key); if (f) { c.people = f.people; c.keywords = f.keywords } }
      take(scored.filter(c => (c.people || []).includes(Number(topPerson))), 15, `With ${peopleNames[topPerson]}`, 'person', { min: 4 })
    }

    const medianPop = scored.map(c => c.popularity).sort((a, b) => a - b)[Math.floor(scored.length / 2)] || 0
    take(scored.filter(c => c.score > 0 && c.popularity < medianPop && engine.quality(c.voteAverage, c.voteCount) >= 7.1), 15, 'Hidden gems for you', 'gems', { min: 5 })

    // Changes every Monday but stays put during the week
    const week = Math.floor((Date.now() / 86400000 + 3) / 7)
    const weekly = scored.filter(c => !used.has(c.key) && engine.quality(c.voteAverage, c.voteCount) >= 6.8).slice(0, 60)
      .sort((a, b) => ((a.id * 9301 + week * 49297) % 233280) - ((b.id * 9301 + week * 49297) % 233280))
    take(weekly, 12, `This week's picks for ${name}`, 'weekly', { lambda: 0.85, reasons: true })

    take(scored.filter(c => c.sources.explore), 12, 'Something different', 'explore', { min: 5 })
  }

  return {
    sections,
    needsOnboarding: !profile.isKids && !profile.onboarded && (profile.watchHistory || []).length < 3 && taste.strength < 1.5,
    summary: tasteSummary(ctx),
  }
}

/** A few lines describing a profile's taste, for the AI writer (no personal data beyond titles and genres) */
function tasteSummary({ top, taste, peopleNames }) {
  const liked = top.filter(s => s.weight > 0.3 && s.title).slice(0, 8).map(s => s.title)
  const disliked = top.filter(s => s.weight < -0.3 && s.title).slice(0, 4).map(s => s.title)
  const genres = engine.topOf(taste.genre, 4).map(g => GENRES[g]).filter(Boolean)
  const person = peopleNames[engine.topOf(taste.person, 1, 0.45)[0]]
  return { liked, disliked, genres, person: person || null, strength: Math.round(taste.strength * 10) / 10 }
}

// ── AI touch: Claude rewrites the "why" under each top pick (in the background) ──
const WRITE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['items'],
  properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['key', 'text'], properties: { key: { type: 'string' }, text: { type: 'string' } } } } },
}
const WRITE_STYLE = {
  picks: 'For each title, write one short reason (max 12 words) this viewer will enjoy it, tied to their taste. Speak to them ("you"). No spoilers, no hype words like "must-watch".',
  feed: 'For each story, write a short, specific headline (max 12 words) telling the viewer what is new and why they would care. No clickbait, no emojis.',
  upcoming: 'For each upcoming title, write one short reason (max 12 words) why this viewer should look forward to it, tied to their taste. No spoilers.',
}

/**
 * Ask Claude to write one line per item. items: [{ key, title, year, type, genres: [names], overview, hint }]
 * → Map(key → text) (empty when AI is off or fails)
 */
async function aiWrite(kind, summary, items, cacheKey) {
  if (!ai.enabled() || !items.length) return new Map()
  const list = items.map(i => `- key=${i.key} | ${i.title}${i.year ? ` (${i.year})` : ''} | ${i.type === 'tv' ? 'series' : 'movie'}` +
    `${i.genres?.length ? ` | ${i.genres.join(', ')}` : ''}${i.hint ? ` | context: ${i.hint}` : ''} | ${String(i.overview || '').slice(0, 180)}`).join('\n')
  const out = await ai.askJson({
    system: 'You write the short personal captions in Streamix, a self-hosted movie and TV app. Be warm, concrete and brief. Only use the keys you are given.',
    prompt: `Viewer taste:\n- Enjoyed: ${summary.liked.join('; ') || 'not much history yet'}\n- Not for them: ${summary.disliked.join('; ') || 'nothing noted'}` +
      `\n- Favourite genres: ${summary.genres.join(', ') || 'unknown'}${summary.person ? `\n- Likes work with: ${summary.person}` : ''}\n\n` +
      `${WRITE_STYLE[kind]}\n\nItems:\n${list}`,
    schema: WRITE_SCHEMA, maxTokens: 3000, cacheKey,
  })
  const keys = new Set(items.map(i => i.key))
  return new Map((out?.items || []).filter(x => keys.has(x.key) && x.text).map(x => [x.key, String(x.text).slice(0, 120)]))
}

const cardKey = c => `${c.media_type}:${c.id}`
const genreNames = ids => (ids || []).map(g => GENRES[g]).filter(Boolean).slice(0, 3)

/** Background: replace the algorithm's reasons on the top row with Claude's, in the cached copy */
function enhanceTopPicks(profileId, entry) {
  const top = entry.data.sections?.[0]
  if (!top || !ai.enabled() || entry.aiDone) return
  entry.aiDone = true
  const items = top.items.slice(0, 12).map(c => ({ key: cardKey(c), title: c.title || c.name, year: (c.release_date || c.first_air_date || '').slice(0, 4),
    type: c.media_type, genres: genreNames(c.genre_ids), overview: c.overview, hint: c.reason }))
  aiWrite('picks', entry.data.summary, items, `picks:${profileId}:${items.map(i => i.key).join(',')}`).then(map => {
    for (const c of top.items) { const t = map.get(cardKey(c)); if (t) { c.reason = t; c.aiReason = true } }
  }).catch(() => {})
}

// ── Learned row order ────────────────────────────────────────────────────────
const ROW_KINDS = new Set(['top', 'because', 'cf', 'genre', 'person', 'gems', 'weekly', 'explore', 'popular', 'acclaimed'])
const shownAt = new Map() // profileId → last time impressions were counted (so refetches don't inflate "shown")

/** Add to a profile's row counters (decaying old evidence first) */
async function bumpRowStats(profileId, kinds, field) {
  const p = await Profile.findById(profileId).select('rowStats rowStatsAt')
  if (!p) return
  const stats = disc.decayStats(p.rowStats || {}, p.rowStatsAt)
  for (const k of kinds) {
    if (!ROW_KINDS.has(k)) continue
    stats[k] = stats[k] || { shown: 0, clicked: 0 }
    stats[k][field] += 1
  }
  p.rowStats = stats
  p.rowStatsAt = new Date()
  p.markModified('rowStats')
  await p.save()
}

/** What the client gets: rows in learned order, internal fields stripped */
function serve(profile, data) {
  const stats = disc.decayStats(profile.rowStats || {}, profile.rowStatsAt)
  const key = String(profile._id)
  if (Date.now() - (shownAt.get(key) || 0) > 20 * 60 * 1000) {
    shownAt.set(key, Date.now())
    bumpRowStats(profile._id, data.sections.map(s => s.kind), 'shown').catch(() => {})
  }
  return { sections: disc.orderRows(data.sections, stats), needsOnboarding: data.needsOnboarding }
}

// GET /api/profiles/:id/recommendations
exports.recommendations = async (req, res) => {
  const profile = await ownProfile(req)
  if (!profile) return res.status(404).json({ message: 'Profile not found' })
  const key = String(profile._id)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL && req.query.fresh !== '1') { enhanceTopPicks(key, hit); return res.json(serve(profile, hit.data)) }
  const data = await buildRows(profile, req.user)
  const entry = { at: Date.now(), data, userId: req.user._id }
  cache.set(key, entry)
  if (cache.size > 500) cache.delete(cache.keys().next().value)
  enhanceTopPicks(key, entry)
  res.json(serve(profile, data))
}

// GET /api/profiles/:id/more-like/:type/:tmdbId → "More like this", ranked for this profile
exports.moreLike = async (req, res) => {
  const profile = await ownProfile(req)
  if (!profile) return res.status(404).json({ message: 'Profile not found' })
  const type = req.params.type === 'tv' ? 'tv' : 'movie'
  const id = Number(req.params.tmdbId)
  if (!Number.isInteger(id)) return res.status(400).json({ message: 'Invalid id' })

  const [base, rec, sim, ctx] = await Promise.all([
    getFeatures(type, id),
    cachedTmdb(`/${type}/${id}/recommendations`).then(d => d.results || []).catch(() => []),
    cachedTmdb(`/${type}/${id}/similar`).then(d => d.results || []).catch(() => []),
    tasteFor(profile, req.user),
  ])
  const { map, add } = pool()
  rec.slice(0, 20).forEach((r, i) => add(r, type, { seed: 0.9 / Math.sqrt(i + 1) }))
  sim.slice(0, 20).forEach((r, i) => add(r, type, { seed: 0.5 / Math.sqrt(i + 1) }))
  map.delete(`${type}:${id}`)
  for (const k of profile.hiddenTitles || []) map.delete(k)

  const cands = [...map.values()]
  const full = await getMany(cands.slice(0, 30).map(c => ({ type: c.type, id: c.id })))
  for (const c of cands) { const f = full.get(c.key); if (f) { c.keywords = f.keywords; c.people = f.people } }
  const scored = cands.map(c => {
    const s = engine.scoreCandidate(c, ctx.taste, { hour: new Date().getHours(), year: new Date().getFullYear() })
    // Similar to this title matters most here; personal taste breaks ties
    const closeness = base ? engine.similarity(base, c) : 0
    return { ...c, ...s, score: 2.2 * closeness + 0.6 * s.score }
  }).sort((a, b) => b.score - a.score)
  res.json(engine.diversify(scored, 20, 0.85).map(c => toCard(c)))
}

// GET /api/profiles/:id/onboarding → a varied set of popular titles to pick from
exports.onboardingChoices = async (req, res) => {
  const profile = await ownProfile(req)
  if (!profile) return res.status(404).json({ message: 'Profile not found' })
  const [m1, m2, t1] = await Promise.all([
    cachedTmdb('/movie/popular').catch(() => ({})),
    cachedTmdb('/movie/top_rated').catch(() => ({})),
    cachedTmdb('/tv/popular').catch(() => ({})),
  ])
  const { map, add } = pool()
  ;(m1.results || []).forEach(r => add(r, 'movie'))
  ;(m2.results || []).forEach(r => add(r, 'movie'))
  ;(t1.results || []).filter(r => !(r.genre_ids || []).some(g => NOT_ROWS.has(g))).forEach(r => add(r, 'tv'))
  const items = [...map.values()].map(c => ({ ...c, score: Math.log10(c.popularity + 1) + engine.quality(c.voteAverage, c.voteCount) / 5 }))
  // Spread across genres so every taste finds something
  res.json(engine.diversify(items, 36, 0.45).map(c => toCard(c)))
}

// POST /api/profiles/:id/onboarding { picks: ["movie:123", …] }
exports.saveOnboarding = async (req, res) => {
  const profile = await ownProfile(req, 'onboarded onboardPicks')
  if (!profile) return res.status(404).json({ message: 'Profile not found' })
  const picks = (Array.isArray(req.body.picks) ? req.body.picks : []).map(String).filter(k => /^(movie|tv):\d{1,9}$/.test(k)).slice(0, 30)
  profile.onboardPicks = picks
  profile.onboarded = true
  await profile.save()
  exports.invalidate(profile._id)
  res.json({ ok: true })
}

// POST /api/profiles/:id/events { events: [{ kind, mediaType, tmdbId }] } — batched from the app
exports.events = async (req, res) => {
  const profile = await ownProfile(req, '_id')
  if (!profile) return res.status(404).json({ message: 'Profile not found' })
  const KINDS = ['detail', 'trailer', 'search_click', 'play']
  const tag = (v) => (typeof v === 'string' && /^[a-z_]{1,24}$/.test(v) ? v : undefined)
  const list = (Array.isArray(req.body.events) ? req.body.events : []).slice(0, 50)
    .filter(e => KINDS.includes(e?.kind) && Number.isInteger(Number(e.tmdbId)) && Number(e.tmdbId) > 0)
    .map(e => ({ profile: profile._id, kind: e.kind, mediaType: e.mediaType === 'tv' ? 'tv' : 'movie', tmdbId: Number(e.tmdbId), row: tag(e.row), source: tag(e.source) }))
  if (list.length) await ViewEvent.insertMany(list, { ordered: false }).catch(() => {})
  // Opening a title from a Home row is a "win" for that row kind (learned row order)
  // A real start counts as accepting a "Play something" suggestion (not the suggestion's own signal)
  for (const e of list) if (e.kind === 'play' && e.source !== 'shuffle') require('./discoveryController').noteActivity(profile._id, `${e.mediaType}:${e.tmdbId}`)
  const rowClicks = [...new Set(list.filter(e => e.row && (e.kind === 'detail' || e.kind === 'play')).map(e => e.row))]
  if (rowClicks.length) await bumpRowStats(profile._id, rowClicks, 'clicked').catch(() => {})
  res.json({ ok: true, saved: list.length })
}

exports._test = { buildRows, tasteFor }
// Shared with the discovery controller (Ask Streamix, Coming up for you, the feed)
exports._internals = { tasteFor, tasteSummary, pool, toCard, discover, aiWrite, GENRES, NOT_ROWS, TV_TO_MOVIE, MOVIE_TO_TV }
exports.peek = (profileId) => cache.get(String(profileId))?.data || null
/** Rows for a profile: the cached copy when fresh, otherwise built (and cached) now */
exports.getRows = async (profile, user) => {
  const key = String(profile._id)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.data
  const data = await buildRows(profile, user)
  const entry = { at: Date.now(), data, userId: user._id }
  cache.set(key, entry)
  enhanceTopPicks(key, entry)
  return data
}
