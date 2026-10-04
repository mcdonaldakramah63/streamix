// controllers/discoveryController.js — "Ask Streamix" (natural-language picks), "Coming up for you"
// (personalised upcoming movies, sequels and season premieres) and the news feed.
// The ranking maths lives in utils/discoveryEngine.js; Claude (utils/ai.js) plans requests and writes
// captions when ANTHROPIC_API_KEY is set — everything works without it.
const mongoose    = require('mongoose')
const Profile     = require('../models/Profile')
const Watchlist   = require('../models/Watchlist')
const User        = require('../models/User')
const Reminder    = require('../models/Reminder')
const LibraryItem = require('../models/LibraryItem')
const { cachedTmdb } = require('../config/tmdb')
const engine = require('../utils/tasteEngine')
const disc   = require('../utils/discoveryEngine')
const ai     = require('../utils/ai')
const { getMany, getFeatures } = require('../utils/titleFeatures')
const rec    = require('./recommendController')
const { tasteFor, tasteSummary, pool, toCard, discover, aiWrite, GENRES, NOT_ROWS } = rec._internals

const DAY = 86400000
const isoDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10)
const daysUntil = (date) => (date ? Math.round((new Date(date + 'T12:00:00').getTime() - Date.now()) / DAY) : null)
const key = (c) => `${c.type}:${c.id}`

async function ownProfile(req, select = '') {
  if (!mongoose.isValidObjectId(req.params.id)) return null
  return Profile.findOne({ _id: req.params.id, user: req.user._id }).select(select)
}

/** Kids profiles and maturity settings: keep only titles rated at or below what the profile may watch */
async function rated(profile, list, max = 60) {
  const limit = profile.isKids ? '7' : profile.prefs?.maturity || 'all'
  if (limit === 'all') return list
  const { levelFor } = require('./movieController')
  const ORDER = ['7', '13', '16', 'all']
  const head = list.slice(0, max)
  const lv = await Promise.all(head.map(c => levelFor(c.type, c.id).catch(() => null)))
  // Kids: unrated titles only with a kids/family/animation genre
  return head.filter((c, i) => lv[i] ? ORDER.indexOf(lv[i]) <= ORDER.indexOf(limit)
    : !profile.isKids || (c.genres || []).some(g => [10751, 10762].includes(g)))
}

const scored = (c, taste) => ({ ...c, ...engine.scoreCandidate(c, taste, { hour: new Date().getHours(), year: new Date().getFullYear() }) })

/** Fill in keywords / cast / runtime for these candidates and rescore their taste match (in place) */
async function enrich(head, taste) {
  const full = await getMany(head.map(c => ({ type: c.type, id: c.id })))
  for (const c of head) {
    const f = full.get(c.key)
    if (f) { c.keywords = f.keywords; c.people = f.people; c.collection = f.collection; c.runtime = f.runtime; Object.assign(c, engine.scoreCandidate(c, taste, {})) }
  }
}

/** Enrich the best `n` by taste, then re-sort */
async function rescoreHead(list, taste, n = 40) {
  list.sort((a, b) => b.score - a.score)
  await enrich(list.slice(0, n), taste)
  return list.sort((a, b) => b.score - a.score)
}

async function trailerKey(type, id) {
  const d = await cachedTmdb(`/${type}/${id}/videos`).catch(() => null)
  const yt = (d?.results || []).filter(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'))
  return (yt.find(v => v.official && v.type === 'Trailer') || yt.find(v => v.type === 'Trailer') || yt[0])?.key || null
}

// ════════════════════════════════════════════════════════════════════════════
// 1. Ask Streamix — "something funny and short from the 90s, not horror"
// ════════════════════════════════════════════════════════════════════════════

const GENRE_BY_NAME = Object.fromEntries(Object.entries(GENRES).map(([id, n]) => [n.toLowerCase(), Number(id)]))
Object.assign(GENRE_BY_NAME, { 'science fiction': 878, scifi: 878, 'sci fi': 878, kids: 10751, children: 10751, anime: 16, animated: 16, romcom: 10749, superhero: 28 })
const nullable = (type) => ({ anyOf: [{ type }, { type: 'null' }] })
const PLAN_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['title', 'type', 'genres', 'avoidGenres', 'keywords', 'similarTo', 'yearFrom', 'yearTo', 'maxRuntime', 'language', 'minRating'],
  properties: {
    title: { type: 'string' },
    type: { type: 'string', enum: ['movie', 'tv', 'any'] },
    genres: { type: 'array', items: { type: 'string' } },
    avoidGenres: { type: 'array', items: { type: 'string' } },
    keywords: { type: 'array', items: { type: 'string' } },
    similarTo: { type: 'array', items: { type: 'string' } },
    yearFrom: nullable('integer'), yearTo: nullable('integer'), maxRuntime: nullable('integer'),
    language: nullable('string'), minRating: nullable('number'),
  },
}
const PICK_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['picks'],
  properties: { picks: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['key', 'reason'], properties: { key: { type: 'string' }, reason: { type: 'string' } } } } },
}

/** Claude turns the request into search filters; without AI the keyword parser does it */
async function planFor(q, summary, userKey) {
  const out = await ai.askJson({
    system: 'You turn a viewer\'s request into search filters for a movie/TV catalogue (TMDB). Use standard TMDB genre names ' +
      `(${Object.values(GENRES).join(', ')}). keywords are short TMDB-style themes ("time loop", "heist", "found family"). ` +
      'similarTo lists real titles the request mentions or clearly implies. language is an ISO 639-1 code or null. ' +
      'title is a short row title for the results (max 6 words). Leave filters empty/null when the request does not ask for them.',
    prompt: `Request: "${q}"\nThe viewer usually enjoys: ${summary.liked.slice(0, 6).join('; ') || 'unknown'} (genres: ${summary.genres.join(', ') || 'unknown'}).`,
    schema: PLAN_SCHEMA, maxTokens: 1500, cacheKey: `plan:${userKey}:${q.toLowerCase()}`,
  })
  if (!out) return { ...disc.planFromText(q), title: null, ai: false }
  const lookup = (n) => { const l = String(n).toLowerCase().trim(); return GENRE_BY_NAME[l] ?? GENRE_BY_NAME[l.replace(/ and /g, ' & ')] ?? GENRE_BY_NAME[l.replace(/s$/, '')] }
  const ids = (names) => [...new Set((names || []).map(lookup).filter(Boolean))]
  return {
    title: out.title, type: out.type, genres: ids(out.genres), avoidGenres: ids(out.avoidGenres), keywords: out.keywords.slice(0, 4),
    similarTo: out.similarTo.slice(0, 3), yearFrom: out.yearFrom, yearTo: out.yearTo, maxRuntime: out.maxRuntime,
    language: out.language, minRating: out.minRating, mood: null, ai: true,
  }
}

async function gatherForPlan(plan, profile) {
  const { map, add } = pool()
  const kids = !!profile.isKids
  const types = plan.type === 'any' ? ['movie', 'tv'] : [plan.type]
  const jobs = []

  // Titles the request names: their recommendations are the closest matches
  for (const title of plan.similarTo) {
    jobs.push((async () => {
      const s = await cachedTmdb('/search/multi', { query: title, include_adult: false }).catch(() => null)
      const hit = (s?.results || []).find(r => r.media_type === 'movie' || r.media_type === 'tv')
      if (!hit) return
      const [r1, r2] = await Promise.all([
        cachedTmdb(`/${hit.media_type}/${hit.id}/recommendations`).catch(() => ({})),
        cachedTmdb(`/${hit.media_type}/${hit.id}/similar`).catch(() => ({})),
      ])
      ;[...(r1.results || []), ...(r2.results || []).slice(0, 10)].forEach((r, i) => add(r, hit.media_type, { similarTo: 1 / Math.sqrt(i + 1), seedTitle: hit.title || hit.name }))
    })())
  }

  // Themes → TMDB keyword ids
  const kwIds = (await Promise.all(plan.keywords.map(k => cachedTmdb('/search/keyword', { query: k }).then(d => d.results?.[0]?.id).catch(() => null)))).filter(Boolean)

  for (const type of types) {
    const p = { include_adult: false, 'vote_count.gte': kids ? 30 : 120 }
    const g = type === 'tv' ? [...new Set(plan.genres.flatMap(x => disc.TV_EQUIV[x] || [x]))] : plan.genres
    if (g.length) p.with_genres = g.join('|')
    const avoid = type === 'tv' ? [...new Set(plan.avoidGenres.flatMap(x => disc.TV_EQUIV[x] || [x]))] : plan.avoidGenres
    if (avoid.length) p.without_genres = avoid.join(',')
    const from = plan.yearFrom ? `${plan.yearFrom}-01-01` : null, to = plan.yearTo ? `${plan.yearTo}-12-31` : null
    if (type === 'movie') { if (from) p['primary_release_date.gte'] = from; if (to) p['primary_release_date.lte'] = to; if (plan.maxRuntime) p['with_runtime.lte'] = plan.maxRuntime }
    else { if (from) p['first_air_date.gte'] = from; if (to) p['first_air_date.lte'] = to }
    if (plan.language) p.with_original_language = plan.language
    if (plan.minRating) p['vote_average.gte'] = Math.max(0, plan.minRating - 0.8)
    if (kids && type === 'movie') Object.assign(p, { certification_country: 'US', 'certification.lte': 'PG' })
    const src = { ask: 1 }
    jobs.push(discover(type, { ...p, sort_by: 'popularity.desc' }).then(rs => rs.forEach(r => add(r, type, src))))
    jobs.push(discover(type, { ...p, sort_by: 'vote_average.desc', 'vote_count.gte': kids ? 50 : 400 }).then(rs => rs.forEach(r => add(r, type, src))))
    if (kwIds.length) jobs.push(discover(type, { ...p, with_keywords: kwIds.join('|'), sort_by: 'popularity.desc' }).then(rs => rs.forEach(r => add(r, type, { ...src, keyword: 1 }))))
  }
  await Promise.all(jobs)
  return map
}

// POST /api/profiles/:id/ask { q }
exports.ask = async (req, res) => {
  const profile = await ownProfile(req)
  if (!profile) return res.status(404).json({ message: 'Profile not found' })
  const q = String(req.body.q || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 300)
  if (q.length < 3) return res.status(400).json({ message: 'Tell me what you feel like watching' })
  // AI calls cost money: a per-account hourly budget (the algorithm alone still answers past it)
  const useAi = ai.enabled() && ai.allow(req.user._id)

  const ctx = await tasteFor(profile, req.user)
  const summary = tasteSummary(ctx)
  const plan = useAi ? await planFor(q, summary, req.user._id) : { ...disc.planFromText(q), title: null, ai: false }
  let map = await gatherForPlan(plan, profile)
  // Too strict (e.g. a rare genre + language + decade)? Loosen step by step rather than answer with nothing
  if (map.size < 8) map = await gatherForPlan({ ...plan, yearFrom: null, yearTo: null, minRating: null, keywords: [] }, profile)
  if (map.size < 8) map = await gatherForPlan({ ...plan, genres: [], yearFrom: null, yearTo: null, minRating: null, keywords: [] }, profile)

  // Nothing they've finished, rated, hidden or said no to
  for (const [k, s] of ctx.seeds) if (s.why.includes('watched') || s.why.includes('hidden') || s.weight < 0) map.delete(k)
  for (const k of profile.hiddenTitles || []) map.delete(k)

  // The request matters most; personal taste and quality break ties
  const fit = c => 1.5 * disc.planFit(c, plan) + 0.45 * c.score + 0.25 * (engine.quality(c.voteAverage, c.voteCount) - 6.5)
  let list = [...map.values()].map(c => scored(c, ctx.taste)).sort((a, b) => fit(b) - fit(a))
  await enrich(list.slice(0, 40), ctx.taste)
  list = list.filter(c => !(plan.maxRuntime && c.runtime && c.runtime > plan.maxRuntime + 10))
    .map(c => ({ ...c, rank: fit(c) })).sort((a, b) => b.rank - a.rank)
  list = await rated(profile, list, 45)
  const shortlist = engine.diversify(list.slice(0, 45).map(c => ({ ...c, score: c.rank })), 24, 0.75)

  // Claude picks the best 12 from the shortlist and says why (only ids it was given)
  let picks = null
  if (useAi && shortlist.length) {
    const lines = shortlist.map(c => `- key=${key(c)} | ${c.title} (${c.year || '?'}) | ${c.type === 'tv' ? 'series' : 'movie'} | ` +
      `${(c.genres || []).map(g => GENRES[g]).filter(Boolean).slice(0, 3).join(', ')} | ${String(c.overview || '').slice(0, 160)}`).join('\n')
    const out = await ai.askJson({
      system: 'You are Streamix\'s film-savvy recommender. From the candidates only, choose the titles that best answer the request, ' +
        'best first, up to 12. Each reason: one sentence, max 16 words, speaking to the viewer, specific to the request. No spoilers.',
      prompt: `Request: "${q}"\nViewer enjoys: ${summary.liked.slice(0, 6).join('; ') || 'unknown'}; dislikes: ${summary.disliked.join('; ') || 'nothing noted'}.\n\nCandidates:\n${lines}`,
      schema: PICK_SCHEMA, maxTokens: 3000, cacheKey: `pick:${profile._id}:${q.toLowerCase()}:${shortlist.map(key).join(',')}`,
    })
    const byKey = new Map(shortlist.map(c => [key(c), c]))
    picks = (out?.picks || []).filter(p => byKey.has(p.key)).slice(0, 12).map(p => ({ c: byKey.get(p.key), reason: String(p.reason).slice(0, 140) }))
    if (picks.length < 4) picks = null
  }
  if (!picks) {
    picks = shortlist.slice(0, 12).map(c => ({ c, reason: c.sources?.seedTitle ? `Like ${c.sources.seedTitle}` : engine.explain(c, c.parts || {}) || 'Fits what you asked for' }))
  }

  const title = plan.title || (plan.similarTo[0] ? `Like ${plan.similarTo[0]}` : 'Picked for your request')
  res.json({ query: q, title, ai: !!plan.ai || picks.some(p => p.reason && useAi), items: picks.map(p => toCard(p.c, p.reason)) })
}

// ════════════════════════════════════════════════════════════════════════════
// 2. Coming up for you — upcoming movies, sequels, new work from people you like, season premieres
// ════════════════════════════════════════════════════════════════════════════

const upcomingCache = new Map() // profileId → { at, data }

/** Shows this account follows: My List, Continue Watching and series the profile has been watching */
async function followedShowIds(profile, userId) {
  const [list, user] = await Promise.all([
    Watchlist.find({ user: userId, type: 'tv' }).select('movieId').lean(),
    User.findById(userId).select('continueWatching.movieId continueWatching.type').lean(),
  ])
  const fromHistory = (profile.watchHistory || []).filter(h => h.type !== 'movie' && (h.progress || 0) > 10).map(h => h.tmdbId)
  return [...new Set([...list.map(w => w.movieId), ...(user?.continueWatching || []).filter(c => c.type === 'tv').map(c => c.movieId), ...fromHistory])].slice(0, 60)
}

async function buildUpcoming(profile, user) {
  const ctx = await tasteFor(profile, user)
  const { taste, top, peopleNames } = ctx
  const kids = !!profile.isKids
  const today = isoDay(), until = isoDay(Date.now() + 150 * DAY)
  const { map, add } = pool()
  const kidsP = kids ? { certification_country: 'US', 'certification.lte': 'PG' } : {}
  const extra = new Map() // key → { franchise, person, premiere, date }
  const mark = (k, v) => extra.set(k, { ...(extra.get(k) || {}), ...v })

  const jobs = []
  // The wider release calendar
  for (const page of [1, 2, 3]) {
    jobs.push(discover('movie', { ...kidsP, 'primary_release_date.gte': today, 'primary_release_date.lte': until, region: 'US', with_release_type: '2|3', sort_by: 'popularity.desc', page })
      .then(rs => rs.forEach(r => add(r, 'movie', { upcoming: 1 }))))
  }
  if (!kids) for (const page of [1, 2]) {
    jobs.push(discover('tv', { 'first_air_date.gte': today, 'first_air_date.lte': until, sort_by: 'popularity.desc', page })
      .then(rs => rs.filter(r => !(r.genre_ids || []).some(g => NOT_ROWS.has(g))).forEach(r => add(r, 'tv', { upcoming: 1 }))))
  }

  // Next film in a franchise they watched (TMDB collections)
  const likedMovies = top.filter(s => s.type === 'movie' && s.weight > 0.3).slice(0, 14)
  jobs.push((async () => {
    const feats = await getMany(likedMovies.map(s => ({ type: 'movie', id: s.id })))
    const cols = new Map()
    for (const s of likedMovies) { const c = feats.get(s.key)?.collection; if (c) cols.set(c.id, { name: c.name, from: s.title }) }
    await Promise.all([...cols].slice(0, 8).map(async ([id, info]) => {
      const col = await cachedTmdb(`/collection/${id}`).catch(() => null)
      for (const part of col?.parts || []) {
        const date = part.release_date || ''
        if (date && date < today) continue // already out
        const c = add({ ...part, poster_path: part.poster_path || col.poster_path }, 'movie', { upcoming: 1 })
        if (c) mark(c.key, { franchise: `Next in ${info.name}`, date: date || null })
      }
    }))
  })())

  // New work from directors / actors they like
  const people = engine.topOf(taste.person, 3, 0.45)
  if (!kids) for (const pid of people) {
    const name = peopleNames[pid]
    if (!name) continue
    jobs.push(discover('movie', { with_people: pid, 'primary_release_date.gte': today, sort_by: 'popularity.desc' })
      .then(rs => rs.forEach(r => { const c = add(r, 'movie', { upcoming: 1 }); if (c) mark(c.key, { person: `New from ${name}` }) })))
  }

  // Season premieres of shows they follow
  jobs.push((async () => {
    const ids = await followedShowIds(profile, user._id)
    await Promise.all(ids.map(async id => {
      const d = await cachedTmdb(`/tv/${id}`).catch(() => null)
      const next = d?.next_episode_to_air
      if (!next?.air_date || next.air_date < today || next.air_date > until) return
      const c = add({ ...d, genre_ids: (d.genres || []).map(g => g.id) }, 'tv', { upcoming: 1, followed: 1 })
      if (!c) return
      mark(c.key, next.episode_number === 1
        ? { premiere: `Season ${next.season_number} of ${d.name}`, date: next.air_date, season: next.season_number }
        : { premiere: null, date: next.air_date, nextEpisode: `S${next.season_number} · E${next.episode_number}`, season: next.season_number, episode: next.episode_number })
    }))
  })())

  const reminders = Reminder.find({ user: user._id, notified: false }).select('type tmdbId').lean().catch(() => [])
  await Promise.all(jobs)
  const reminded = new Set((await reminders).map(r => `${r.type}:${r.tmdbId}`))

  for (const k of profile.hiddenTitles || []) map.delete(k)
  const topGenre = engine.topOf(taste.genre, 1)[0]
  let list = [...map.values()].map(c => {
    const x = extra.get(c.key) || {}
    const date = x.date || (c.type === 'tv' ? c.first_air_date : c.release_date) || null
    return { ...scored(c, taste), x, date }
  })
    .filter(c => !c.date || c.date >= today || c.x.premiere || c.x.nextEpisode)
    // Titles nobody has heard of yet only make the list with a personal link (franchise, person, a show you follow)
    .filter(c => (c.popularity || 0) >= (kids ? 6 : 3) || c.x.franchise || c.x.person || c.x.premiere || c.x.nextEpisode)
  list = await rescoreHead(list, taste, 50)
  list = list.map(c => {
    const genreReason = topGenre && (c.genres || []).includes(Number(topGenre)) && GENRES[topGenre] ? `Because you like ${GENRES[topGenre]}` : null
    const u = disc.scoreUpcoming({ tasteScore: c.score, popularity: c.popularity, daysUntil: daysUntil(c.date), franchise: c.x.franchise,
      person: c.x.person, premiere: c.x.premiere, episode: c.x.nextEpisode ? `New episode of ${c.title} (${c.x.nextEpisode})` : null, reminded: reminded.has(c.key), genreReason })
    return { ...c, rank: u.score, reason: u.reason, why: u.kind }
  }).sort((a, b) => b.rank - a.rank)
  list = await rated(profile, list, 70)
  const picked = engine.diversify(list.map(c => ({ ...c, score: c.rank })), 40, 0.8)

  const items = picked.map(c => ({
    ...toCard(c, c.reason), date: c.date, daysUntil: daysUntil(c.date), why: c.why, reminded: reminded.has(c.key),
    season: c.x.season ?? null, episode: c.x.episode ?? null, nextEpisode: c.x.nextEpisode || null,
  }))
  return { items, summary: tasteSummary(ctx) }
}

/** Cached per profile for 30 minutes; Claude rewrites the reasons for the top few in the background */
async function upcomingFor(profile, user) {
  const k = String(profile._id)
  const hit = upcomingCache.get(k)
  if (hit && Date.now() - hit.at < 30 * 60 * 1000) return hit.data
  const data = await buildUpcoming(profile, user)
  upcomingCache.set(k, { at: Date.now(), data })
  if (upcomingCache.size > 300) upcomingCache.delete(upcomingCache.keys().next().value)
  if (ai.enabled()) {
    const head = data.items.filter(i => i.why === 'taste' || i.why === 'hype').slice(0, 8)
    aiWrite('upcoming', data.summary, head.map(i => ({ key: `${i.media_type}:${i.id}`, title: i.title || i.name, year: (i.date || '').slice(0, 4),
      type: i.media_type, genres: (i.genre_ids || []).map(g => GENRES[g]).filter(Boolean), overview: i.overview })), `up:${k}:${head.map(i => i.id).join(',')}`)
      .then(m => { for (const i of data.items) { const t = m.get(`${i.media_type}:${i.id}`); if (t) { i.reason = t; i.aiReason = true } } }).catch(() => {})
  }
  return data
}

// GET /api/profiles/:id/upcoming → { items: [card + date, daysUntil, reason, why, reminded…] } (best first)
exports.upcoming = async (req, res) => {
  const profile = await ownProfile(req)
  if (!profile) return res.status(404).json({ message: 'Profile not found' })
  const data = await upcomingFor(profile, req.user)
  res.json({ items: data.items })
}

// ════════════════════════════════════════════════════════════════════════════
// 3. The news feed — what's new for you, ranked
// ════════════════════════════════════════════════════════════════════════════

const feedCache = new Map() // profileId → { at, items }
const feedSeen = new Map()  // profileId → Map(key → { n, at }) — stories shown recently fade out

function seenFor(profileId) {
  const m = feedSeen.get(profileId) || new Map()
  const now = Date.now(), out = {}
  for (const [k, v] of m) { if (now - v.at > 3 * DAY) m.delete(k); else out[k] = v.n }
  feedSeen.set(profileId, m)
  return out
}
function markSeen(profileId, keys) {
  const m = feedSeen.get(profileId) || new Map()
  for (const k of keys) m.set(k, { n: (m.get(k)?.n || 0) + 1, at: Date.now() })
  if (m.size > 600) m.delete(m.keys().next().value)
  feedSeen.set(profileId, m)
}

async function buildFeed(profile, user) {
  const ctx = await tasteFor(profile, user)
  const { taste } = ctx
  const kids = !!profile.isKids
  const today = isoDay()
  const items = []
  const story = (c, kind, extra = {}) => {
    const s = scored(c, taste)
    items.push({ ...extra, key: key(c), kind, c, relevance: disc.relevance(s.score), quality: engine.quality(c.voteAverage, c.voteCount), date: extra.date || null })
  }
  const { add } = pool()
  const card = (r, type) => add(r, type) || null
  const watched = new Set((profile.watchHistory || []).filter(h => h.completed || (h.progress || 0) >= 90).map(h => `${h.type === 'movie' ? 'movie' : 'tv'}:${h.tmdbId}`))

  await Promise.all([
    // New episodes / premieres of followed shows
    (async () => {
      const ids = await followedShowIds(profile, user._id)
      await Promise.all(ids.map(async id => {
        const d = await cachedTmdb(`/tv/${id}`).catch(() => null)
        if (!d) return
        const c = card({ ...d, genre_ids: (d.genres || []).map(g => g.id) }, 'tv')
        if (!c) return
        const last = d.last_episode_to_air, next = d.next_episode_to_air
        if (last?.air_date && Date.now() - new Date(last.air_date + 'T12:00:00').getTime() <= 7 * DAY && last.air_date <= today) {
          story(c, 'new_episode', { date: last.air_date, headline: `New episode of ${d.name}`, detail: `S${last.season_number} · E${last.episode_number}${last.name ? ` — ${last.name}` : ''}`,
            season: last.season_number, episode: last.episode_number, relevanceBoost: 0.3 })
        }
        if (next?.episode_number === 1 && next.air_date >= today && daysUntil(next.air_date) <= 21) {
          story(c, 'premiere', { date: next.air_date, headline: `Season ${next.season_number} of ${d.name} is coming`, detail: daysUntil(next.air_date) === 0 ? 'Premieres today' : `Premieres in ${daysUntil(next.air_date)} days` })
        }
      }))
    })(),
    // Coming up for you (top of the personalised calendar)
    (async () => {
      const up = await upcomingFor(profile, user).catch(() => ({ items: [] }))
      for (const i of up.items.slice(0, 14)) {
        if (i.daysUntil == null || i.daysUntil > 60 || i.nextEpisode) continue
        const c = card({ ...i, genre_ids: i.genre_ids }, i.media_type)
        if (!c) continue
        const big = i.why === 'franchise' || i.why === 'premiere'
        const name = i.title || i.name
        const when = i.daysUntil <= 0 ? 'is out today' : i.daysUntil === 1 ? 'arrives tomorrow' : i.daysUntil <= 7 ? 'arrives this week'
          : `arrives ${new Date(i.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
        story(c, big && i.daysUntil <= 21 ? 'premiere' : 'coming_soon', { date: i.date, headline: `${name} ${when}`, detail: i.reason, reminded: i.reminded })
      }
    })(),
    // New on this server's library
    (async () => {
      const lib = await LibraryItem.find({ createdAt: { $gte: new Date(Date.now() - 21 * DAY) }, tmdbId: { $ne: null } })
        .select('tmdbId mediaType season episode title createdAt').sort({ createdAt: -1 }).limit(30).lean().catch(() => [])
      const seenShow = new Set()
      for (const l of lib) {
        const type = l.mediaType === 'tv' ? 'tv' : 'movie'
        if (seenShow.has(`${type}:${l.tmdbId}`)) continue
        seenShow.add(`${type}:${l.tmdbId}`)
        const f = await getFeatures(type, l.tmdbId).catch(() => null)
        if (!f) continue
        const c = card({ id: f.id, title: f.title, name: f.title, poster_path: f.poster_path, backdrop_path: f.backdrop_path, overview: f.overview,
          genre_ids: f.genres, original_language: f.lang, vote_average: f.voteAverage, vote_count: f.voteCount, popularity: f.popularity,
          release_date: f.release_date, first_air_date: f.first_air_date }, type)
        if (c) story(c, 'library', { date: l.createdAt, headline: `Now on Streamix: ${f.title}`, detail: type === 'tv' && l.episode != null ? `S${l.season} · E${l.episode} added` : 'Added to the library', season: l.season, episode: l.episode })
      }
    })(),
    // Trending, filtered by taste
    (async () => {
      if (kids) return
      const d = await cachedTmdb('/trending/all/day').catch(() => ({}))
      for (const r of (d.results || []).filter(r => r.media_type === 'movie' || r.media_type === 'tv')) {
        const c = card(r, r.media_type)
        if (c && !watched.has(c.key)) story(c, 'trending', { date: today, headline: `Trending: ${c.title}`, detail: 'Popular today' })
      }
    })(),
    // New releases people love
    (async () => {
      if (kids) return
      const rs = await discover('movie', { 'primary_release_date.gte': isoDay(Date.now() - 75 * DAY), 'primary_release_date.lte': today,
        'vote_average.gte': 7.1, 'vote_count.gte': 150, sort_by: 'popularity.desc' })
      for (const r of rs) {
        const c = card(r, 'movie')
        if (c && !watched.has(c.key)) story(c, 'fresh_hit', { date: r.release_date, headline: `${c.title} is a hit`, detail: `★ ${Number(r.vote_average).toFixed(1)} from ${r.vote_count} viewers` })
      }
    })(),
    // What viewers on this server finished this week
    (async () => {
      const rows = await Profile.aggregate([
        { $match: { _id: { $ne: profile._id }, isKids: kids } },
        { $unwind: '$watchHistory' },
        { $match: { 'watchHistory.watchedAt': { $gte: new Date(Date.now() - 10 * DAY) }, $or: [{ 'watchHistory.completed': true }, { 'watchHistory.progress': { $gte: 80 } }] } },
        { $group: { _id: { id: '$watchHistory.tmdbId', type: '$watchHistory.type' }, n: { $sum: 1 }, last: { $max: '$watchHistory.watchedAt' } } },
        { $sort: { n: -1, last: -1 } }, { $limit: 12 },
      ]).catch(() => [])
      const feats = await getMany(rows.map(r => ({ type: r._id.type === 'movie' ? 'movie' : 'tv', id: r._id.id })))
      for (const r of rows) {
        const t = r._id.type === 'movie' ? 'movie' : 'tv'
        const f = feats.get(`${t}:${r._id.id}`)
        if (!f) continue
        const c = card({ id: f.id, title: f.title, name: f.title, poster_path: f.poster_path, backdrop_path: f.backdrop_path, overview: f.overview,
          genre_ids: f.genres, original_language: f.lang, vote_average: f.voteAverage, vote_count: f.voteCount, popularity: f.popularity }, t)
        if (c && !watched.has(c.key)) story(c, 'community', { date: r.last, headline: `${r.n} viewer${r.n === 1 ? '' : 's'} here finished ${f.title}`, detail: 'This week on your server' })
      }
    })(),
  ])

  // Today's top pick from their recommendations (already built if they opened Home)
  const recs = rec.peek(profile._id)
  for (const card0 of recs?.sections?.[0]?.items?.slice(0, 2) || []) {
    const c = card({ ...card0, vote_count: 500 }, card0.media_type)
    if (c && !watched.has(c.key)) story(c, 'pick', { date: today, headline: `Picked for ${profile.name}: ${c.title}`, detail: card0.reason || 'Top pick for you' })
  }

  // Not for me / blocked, kids & maturity limits
  const hidden = new Set([...(profile.hiddenTitles || []), ...(profile.blockedTitles || [])])
  let pool0 = items.filter(i => !hidden.has(i.key)).map(i => ({ ...i, relevance: Math.min(1, i.relevance + (i.relevanceBoost || 0)) }))
  if (kids || (profile.prefs?.maturity && profile.prefs.maturity !== 'all')) {
    const ok = new Set((await rated(profile, [...new Map(pool0.map(i => [i.key, i.c])).values()], 80)).map(key))
    pool0 = pool0.filter(i => ok.has(i.key))
  }
  return { items: pool0, summary: tasteSummary(ctx) }
}

// GET /api/profiles/:id/feed?page=1 → { items: [{ kind, headline, detail, reason, date, trailerKey, item: card }], hasMore }
exports.feed = async (req, res) => {
  const profile = await ownProfile(req)
  if (!profile) return res.status(404).json({ message: 'Profile not found' })
  const pid = String(profile._id)
  const page = Math.max(1, Math.min(10, parseInt(req.query.page) || 1))
  const PER = 10

  let entry = feedCache.get(pid)
  if (!entry || Date.now() - entry.at > 5 * 60 * 1000 || (page === 1 && req.query.fresh === '1')) {
    const built = await buildFeed(profile, req.user)
    const ranked = disc.rankFeed(built.items, { seen: seenFor(pid) }).slice(0, 80)
    entry = { at: Date.now(), items: ranked, summary: built.summary }
    feedCache.set(pid, entry)
    if (feedCache.size > 300) feedCache.delete(feedCache.keys().next().value)
    // Claude rewrites the first headlines (in the background; next refresh shows them)
    if (ai.enabled()) {
      const head = ranked.slice(0, 10)
      aiWrite('feed', built.summary, head.map(i => ({ key: i.key, title: i.c.title, year: i.c.year, type: i.c.type,
        genres: (i.c.genres || []).map(g => GENRES[g]).filter(Boolean), overview: i.c.overview, hint: `${i.headline} — ${i.detail || ''}` })),
      `feed:${pid}:${head.map(i => i.key + i.kind).join(',')}`)
        .then(m => { for (const i of head) { const t = m.get(i.key); if (t) { i.headline = t; i.aiHeadline = true } } }).catch(() => {})
    }
  }

  const slice = entry.items.slice((page - 1) * PER, page * PER)
  markSeen(pid, slice.map(i => i.key))
  const keys = await Promise.all(slice.map(i => i.trailerKey !== undefined ? i.trailerKey : trailerKey(i.c.type, i.c.id).then(k => (i.trailerKey = k))))
  res.json({
    items: slice.map((i, n) => ({
      kind: i.kind, headline: i.headline, detail: i.detail || '', date: i.date, score: Math.round(i.score * 1000) / 1000,
      trailerKey: keys[n], season: i.season ?? null, episode: i.episode ?? null, reminded: !!i.reminded, ai: !!i.aiHeadline,
      item: toCard(i.c, i.c.reason),
    })),
    hasMore: entry.items.length > page * PER,
  })
}

// ════════════════════════════════════════════════════════════════════════════
// 4. Play something — one smart pick to start right now (utils/playEngine.js)
// ════════════════════════════════════════════════════════════════════════════

const play = require('../utils/playEngine')
const EpisodeProgress = require('../models/EpisodeProgress')
const suggested = new Map() // profileId → [{ key, arm, at }] — to learn which kinds of suggestion get watched

/** Called when a profile starts or records watching something: was it a recent suggestion? */
exports.noteActivity = (profileId, key) => {
  const pid = String(profileId)
  const list = suggested.get(pid)
  const hit = list?.find(x => x.key === key && Date.now() - x.at < 45 * 60 * 1000 && !x.done)
  if (!hit) return
  hit.done = true
  bumpShuffle(pid, hit.arm, 'accepted').catch(() => {})
}

async function bumpShuffle(profileId, arm, field) {
  const p = await Profile.findById(profileId).select('shuffleStats shuffleStatsAt')
  if (!p) return
  p.shuffleStats = play.updateStats(p.shuffleStats || {}, arm, field, Date.now(), p.shuffleStatsAt)
  p.shuffleStatsAt = new Date()
  p.markModified('shuffleStats')
  await p.save()
}

/** Everything "Play something" could start, with the facts the engine needs */
async function playCandidates(profile, user, ctx) {
  const now = Date.now()
  const age = (d) => (d ? Math.max(0, (now - new Date(d).getTime()) / DAY) : 0)
  const out = []
  const push = (c) => { if (c && !out.some(o => o.key === c.key)) out.push(c) }
  const hidden = new Set([...(profile.hiddenTitles || []), ...(profile.blockedTitles || [])])

  const [u, epRows, rows, lib] = await Promise.all([
    User.findById(user._id).select('continueWatching').lean(),
    EpisodeProgress.find({ profile: profile._id }).select('tmdbId season episode completed updatedAt').lean().catch(() => []),
    rec.getRows(profile, user).catch(() => null),
    LibraryItem.find({ createdAt: { $gte: new Date(now - 30 * DAY) }, tmdbId: { $ne: null } }).select('tmdbId mediaType season episode createdAt').sort({ createdAt: -1 }).limit(15).lean().catch(() => []),
  ])
  const doneEp = new Set(epRows.filter(e => e.completed).map(e => `${e.tmdbId}:${e.season}:${e.episode}`))
  const watchedKeys = new Set((profile.watchHistory || []).filter(h => h.completed || (h.progress || 0) >= 90).map(h => `${h.type === 'movie' ? 'movie' : 'tv'}:${h.tmdbId}`))

  // 1. Resume / next episode (Continue Watching is shared by the account: only this profile's own titles,
  //    and kids profiles never see another profile's)
  const mine = new Set((profile.watchHistory || []).map(h => `${h.type === 'movie' ? 'movie' : 'tv'}:${h.tmdbId}`))
  const ownOnly = profile.isKids || mine.size > 0
  await Promise.all((u?.continueWatching || []).slice(0, 15).map(async cw => {
    const type = cw.type === 'tv' ? 'tv' : 'movie'
    if (ownOnly && !mine.has(`${type}:${cw.movieId}`)) return
    const totalMin = cw.duration ? cw.duration / 60 : cw.durationMins || null
    if (cw.progress >= 3 && cw.progress < 92) {
      push({ key: `${type}:${cw.movieId}`, arm: 'resume', type, id: cw.movieId, title: cw.title, season: cw.season, episode: cw.episode,
        progress: cw.progress, minutesLeft: totalMin ? totalMin * (1 - cw.progress / 100) : null, runtime: totalMin, ageDays: age(cw.watchedAt), resumeAt: cw.timestamp })
    } else if (type === 'tv' && cw.progress >= 92 && cw.season != null && cw.episode != null) {
      // Finished that episode: is the next one out?
      const d = await cachedTmdb(`/tv/${cw.movieId}`).catch(() => null)
      if (!d) return
      const seasonInfo = (d.seasons || []).find(x => x.season_number === cw.season)
      let s = cw.season, e = cw.episode + 1
      if (seasonInfo && e > seasonInfo.episode_count) { s += 1; e = 1 }
      const last = d.last_episode_to_air
      const aired = last && (s < last.season_number || (s === last.season_number && e <= last.episode_number))
      if (aired && !doneEp.has(`${cw.movieId}:${s}:${e}`)) {
        push({ key: `tv:${cw.movieId}`, arm: 'next_episode', type: 'tv', id: cw.movieId, title: d.name, season: s, episode: e,
          runtime: (d.episode_run_time || [])[0] || 40, ageDays: age(cw.watchedAt), genres: (d.genres || []).map(g => g.id), voteAverage: d.vote_average, voteCount: d.vote_count })
      }
    }
  }))

  // 2. New episodes of shows they follow, not yet watched
  const ids = await followedShowIds(profile, user._id)
  await Promise.all(ids.slice(0, 30).map(async id => {
    const d = await cachedTmdb(`/tv/${id}`).catch(() => null)
    const last = d?.last_episode_to_air
    if (!last?.air_date || age(last.air_date) > 10 || last.air_date > isoDay()) return
    if (doneEp.has(`${id}:${last.season_number}:${last.episode_number}`)) return
    push({ key: `tv:${id}`, arm: 'new_episode', type: 'tv', id, title: d.name, season: last.season_number, episode: last.episode_number,
      runtime: last.runtime || (d.episode_run_time || [])[0] || 40, ageDays: age(last.air_date), genres: (d.genres || []).map(g => g.id), voteAverage: d.vote_average, voteCount: d.vote_count })
  }))

  // 3. Their top recommendations
  for (const card of (rows?.sections || []).flatMap(sec => sec.items.slice(0, 8)).slice(0, 30)) {
    const type = card.media_type === 'tv' ? 'tv' : 'movie'
    push({ key: `${type}:${card.id}`, arm: 'pick', type, id: card.id, title: card.title || card.name, why: card.reason,
      genres: card.genre_ids, voteAverage: card.vote_average, voteCount: 800, season: type === 'tv' ? 1 : null, episode: type === 'tv' ? 1 : null })
  }

  // 4. New on this server
  for (const l of lib) {
    const type = l.mediaType === 'tv' ? 'tv' : 'movie'
    push({ key: `${type}:${l.tmdbId}`, arm: 'library', type, id: l.tmdbId, season: l.season ?? (type === 'tv' ? 1 : null), episode: l.episode ?? (type === 'tv' ? 1 : null), ageDays: age(l.createdAt) })
  }

  // 5. Little history: acclaimed, widely loved titles
  if (out.length < 12) {
    const [m, t] = await Promise.all([
      discover('movie', { sort_by: 'vote_average.desc', 'vote_count.gte': 3000, page: 1 + Math.floor(Math.random() * 5), ...(profile.isKids ? { certification_country: 'US', 'certification.lte': 'PG' } : {}) }),
      profile.isKids ? [] : discover('tv', { sort_by: 'vote_average.desc', 'vote_count.gte': 1500, page: 1 + Math.floor(Math.random() * 3) }),
    ])
    for (const r of [...m.map(x => ({ ...x, media_type: 'movie' })), ...t.map(x => ({ ...x, media_type: 'tv' }))]) {
      push({ key: `${r.media_type}:${r.id}`, arm: 'classic', type: r.media_type, id: r.id, title: r.title || r.name, genres: r.genre_ids,
        voteAverage: r.vote_average, voteCount: r.vote_count, season: r.media_type === 'tv' ? 1 : null, episode: r.media_type === 'tv' ? 1 : null })
    }
  }

  // Facts for scoring: runtime, genres, quality → relevance with their taste
  const list = out.filter(c => !hidden.has(c.key) && !(c.arm === 'pick' || c.arm === 'classic' || c.arm === 'library' ? watchedKeys.has(c.key) : false))
  const feats = await getMany(list.map(c => ({ type: c.type, id: c.id })))
  for (const c of list) {
    const f = feats.get(c.key)
    if (f) {
      c.title ||= f.title; c.runtime ??= f.runtime || (c.type === 'tv' ? 40 : 110); c.genres ||= f.genres
      c.voteAverage ??= f.voteAverage; c.voteCount ??= f.voteCount; c.poster = f.poster_path; c.backdrop = f.backdrop_path; c.overview = f.overview
      c.keywords = f.keywords; c.people = f.people; c.lang = f.lang; c.year = f.year
    }
    const s = engine.scoreCandidate({ ...c, genres: c.genres || [] }, ctx.taste, { hour: new Date().getHours(), year: new Date().getFullYear() })
    c.relevance = disc.relevance(s.score)
    c.quality = engine.quality(c.voteAverage || 0, c.voteCount || 0)
  }
  // Kids / maturity limits
  const allowed = new Set((await rated(profile, list.map(c => ({ ...c, key: c.key })), 60)).map(c => c.key))
  return list.filter(c => allowed.has(c.key))
}

// POST /api/profiles/:id/play-something { hour, dow, skip: ["movie:1", …] } → { pick, alternatives }
exports.playSomething = async (req, res) => {
  const profile = await ownProfile(req)
  if (!profile) return res.status(404).json({ message: 'Profile not found' })
  const pid = String(profile._id)
  const now = new Date()
  const hour = Number.isInteger(req.body.hour) && req.body.hour >= 0 && req.body.hour < 24 ? req.body.hour : now.getHours()
  const dow = Number.isInteger(req.body.dow) && req.body.dow >= 0 && req.body.dow < 7 ? req.body.dow : now.getDay()
  const skip = (Array.isArray(req.body.skip) ? req.body.skip : []).map(String).filter(k => /^(movie|tv):\d+$/.test(k)).slice(0, 50)

  const ctx = await tasteFor(profile, req.user)
  const hist = (profile.watchHistory || []).filter(h => h.hour === hour)
  const hourHabit = { movie: hist.filter(h => h.type === 'movie').length, tv: hist.filter(h => h.type !== 'movie').length }
  const pctx = { hour, dow, budget: play.timeBudget(hour, dow), hourHabit }

  // Pressing again = the last suggestion wasn't wanted (a "miss" for its kind); it's also skipped server-side
  const recent = (suggested.get(pid) || []).filter(x => Date.now() - x.at < 2 * 3600 * 1000)
  for (const x of recent) if (skip.includes(x.key) && !x.done && !x.missed) x.missed = true
  const cands = await playCandidates(profile, req.user, ctx)
  // Kinds skipped in this session ("not a resume right now") count against that kind for the next press
  const skippedArms = {}
  for (const x of recent) if (x.missed && Date.now() - x.at < 20 * 60 * 1000) skippedArms[x.arm] = (skippedArms[x.arm] || 0) + 1
  const opts = { stats: profile.shuffleStats || {}, skippedArms }
  const out = play.decide(cands, pctx, { ...opts, skip: [...skip, ...recent.slice(-6).map(x => x.key)] })
    || play.decide(cands, pctx, { ...opts, skip })
  if (!out) return res.status(404).json({ message: 'Nothing to suggest yet — try again in a moment' })

  const shape = (c) => ({ type: c.type, id: c.id, title: c.title, season: c.season ?? null, episode: c.episode ?? null, resumeAt: c.resumeAt ?? null,
    kind: c.arm, reason: play.reasonFor(c, pctx), runtime: c.runtime ? Math.round(c.runtime) : null, minutesLeft: c.minutesLeft ? Math.round(c.minutesLeft) : null,
    poster_path: c.poster || null, backdrop_path: c.backdrop || null, overview: c.overview || '' })
  recent.push({ key: out.pick.key, arm: out.pick.arm, at: Date.now() })
  suggested.set(pid, recent.slice(-20))
  if (suggested.size > 500) suggested.delete(suggested.keys().next().value)
  bumpShuffle(pid, out.pick.arm, 'shown').catch(() => {})
  res.json({ pick: shape(out.pick), alternatives: out.alternatives.map(shape), budget: pctx.budget })
}

exports._test = { buildUpcoming, buildFeed, playCandidates }
