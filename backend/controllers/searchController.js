// controllers/searchController.js — search that forgives typos and ranks results for the viewer
const mongoose = require('mongoose')
const Profile = require('../models/Profile')
const { cachedTmdb } = require('../config/tmdb')
const { nameSimilarity } = require('../utils/mediaMatcher')
const engine = require('../utils/tasteEngine')

// A few thousand well-known titles to suggest corrections from ("intersteller" → "Interstellar")
let corpus = { at: 0, items: [] }
async function getCorpus() {
  if (Date.now() - corpus.at < 12 * 3600 * 1000 && corpus.items.length) return corpus.items
  const pages = (path, n) => Array.from({ length: n }, (_, i) => cachedTmdb(path, { page: i + 1 }).then(d => d.results || []).catch(() => []))
  const lists = await Promise.all([
    ...pages('/movie/popular', 12), ...pages('/movie/top_rated', 8), ...pages('/tv/popular', 8), ...pages('/tv/top_rated', 5), ...pages('/trending/all/week', 3),
  ])
  const seen = new Set(), items = []
  for (const r of lists.flat()) {
    const title = r.title || r.name
    if (!title || seen.has(title.toLowerCase())) continue
    seen.add(title.toLowerCase())
    const type = r.media_type === 'tv' || (!r.title && r.name) ? 'tv' : 'movie'
    items.push({ title, pop: r.popularity || 0, id: r.id, type, year: (r.release_date || r.first_air_date || '').slice(0, 4), poster: r.poster_path })
  }
  // Word frequencies for word-by-word spelling fixes ("rngs" → "rings")
  const vocab = new Map()
  for (const it of items) for (const w of it.title.toLowerCase().split(/[^\p{L}\p{N}']+/u)) if (w.length >= 2) vocab.set(w, (vocab.get(w) || 0) + 1)
  corpus = { at: Date.now(), items, vocab }
  return items
}

/** Edit distance where an adjacent swap ("thigns") counts as one edit; stops early past `max` */
function editDistance(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev2 = null
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      if (prev2 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev2[j - 2] + 1)
      rowMin = Math.min(rowMin, cur[j])
    }
    if (rowMin > max) return max + 1
    prev2 = prev
    prev = cur
  }
  return prev[b.length]
}

/** Fix each unknown word against words from known titles */
function correctWords(query) {
  const vocab = corpus.vocab
  if (!vocab) return null
  let changed = false
  const out = query.toLowerCase().split(/\s+/).map(w => {
    if (w.length < 3 || vocab.has(w) || /\d/.test(w)) return w
    const max = w.length <= 5 ? 1 : 2
    let best = null
    for (const [cand, freq] of vocab) {
      if (cand[0] !== w[0] && max === 1) continue
      const d = editDistance(w, cand, max)
      if (d <= max && (!best || d < best.d || (d === best.d && freq > best.freq))) best = { w: cand, d, freq }
    }
    if (best) { changed = true; return best.w }
    return w
  })
  return changed ? out.join(' ') : null
}

/** Best close-but-different title for a query that found little */
async function suggest(query) {
  const q = query.trim()
  if (q.length < 3) return null
  await getCorpus()
  const fixed = correctWords(q)
  if (fixed) return fixed.replace(/\b\w/g, c => c.toUpperCase())
  let best = null
  for (const it of await getCorpus()) {
    const sim = nameSimilarity(q, [it.title])
    const score = sim + Math.min(0.08, Math.log10(it.pop + 1) / 40)
    if (sim >= 0.55 && (!best || score > best.score)) best = { title: it.title, score, sim }
  }
  return best && best.title.toLowerCase() !== q.toLowerCase() ? best.title : null
}

/** Quick genre taste from watch history (no extra requests) */
async function quickTaste(req) {
  const id = req.query.profile
  if (!id || !mongoose.isValidObjectId(id)) return null
  const p = await Profile.findOne({ _id: id, user: req.user?._id }).select('watchHistory hiddenTitles').lean()
  if (!p) return null
  const genre = {}
  for (const h of p.watchHistory || []) {
    const w = engine.watchWeight(h)
    for (const g of h.genres || []) genre[g] = (genre[g] || 0) + w
  }
  const max = Math.max(0, ...Object.values(genre).map(Math.abs)) || 1
  for (const k of Object.keys(genre)) genre[k] /= max
  return { genre, hidden: new Set(p.hiddenTitles || []) }
}

async function tmdbSearch(query, type, page) {
  const d = await cachedTmdb(`/search/${type}`, { query, page, include_adult: false }).catch(() => ({ results: [], total_pages: 0 }))
  return {
    results: (d.results || []).filter(r => r.media_type !== 'person').map(r => ({ ...r, media_type: r.media_type || type })),
    totalPages: d.total_pages || 0, total: d.total_results || 0,
  }
}

// ── The search engine (utils/searchEngine.js) ───────────────────────────────
const se = require('../utils/searchEngine')
const SearchStat = require('../models/SearchStat')
const LibraryItem = require('../models/LibraryItem')
const DAY = 86400000

/** Document frequency of each word across known titles (rare words weigh more) */
let dfCache = { at: 0, df: {} }
async function getDf() {
  if (Date.now() - dfCache.at < 12 * 3600 * 1000 && Object.keys(dfCache.df).length) return dfCache.df
  const df = {}
  for (const it of await getCorpus()) for (const w of new Set(se.tokens(it.title))) df[w] = (df[w] || 0) + 1
  dfCache = { at: Date.now(), df }
  return df
}

/** Learned: what people opened after this exact (normalised) query, decayed */
async function clicksFor(q) {
  const rows = await SearchStat.find({ q }).sort({ n: -1 }).limit(20).lean().catch(() => [])
  const out = new Map()
  for (const r of rows) out.set(r.key, r.n * Math.pow(0.5, (Date.now() - new Date(r.at).getTime()) / (30 * DAY)))
  return out
}

/** Someone searching a person's name: their best-known work */
async function personResults(text) {
  const d = await cachedTmdb('/search/person', { query: text, include_adult: false }).catch(() => null)
  const p = (d?.results || [])[0]
  if (!p || (p.popularity || 0) < 2 || nameSimilarity(text, [p.name]) < 0.85) return { person: null, results: [] }
  const credits = await cachedTmdb(`/person/${p.id}/combined_credits`).catch(() => null)
  const seen = new Set()
  // Real roles only: no one-off TV guest spots or tiny film parts
  const realRole = (c) => c.media_type === 'tv' ? (c.episode_count || 0) >= 3 : c.order == null || c.order <= 15
  const work = [...(credits?.cast || []).filter(realRole), ...(credits?.crew || []).filter(c => ['Director', 'Writer', 'Screenplay', 'Creator'].includes(c.job))]
    .filter(c => (c.media_type === 'movie' || c.media_type === 'tv') && c.poster_path && !(c.genre_ids || []).some(g => [10763, 10767].includes(g)))
    .filter(c => { const k = `${c.media_type}:${c.id}`; if (seen.has(k)) return false; seen.add(k); return true })
    .sort((a, b) => (b.popularity || 0) * Math.log10((b.vote_count || 0) + 10) - (a.popularity || 0) * Math.log10((a.vote_count || 0) + 10))
    .slice(0, 20)
  return { person: { id: p.id, name: p.name, profile_path: p.profile_path, known_for: p.known_for_department, popularity: p.popularity, exact: se.normalize(p.name) === se.normalize(text) },
    results: work.map(c => ({ ...c, via: 'person' })) }
}

/** "harry potter" → every film in the franchise */
async function collectionResults(text) {
  if (text.split(' ').length > 5) return []
  const d = await cachedTmdb('/search/collection', { query: text }).catch(() => null)
  const c = (d?.results || [])[0]
  if (!c || nameSimilarity(text, [c.name.replace(/ collection$/i, '')]) < 0.75) return []
  const col = await cachedTmdb(`/collection/${c.id}`).catch(() => null)
  return (col?.parts || []).filter(p => p.poster_path).map(p => ({ ...p, media_type: 'movie', via: 'collection' }))
}

/** Titles this server can play from its own library (marked "On Streamix") */
async function libraryKeys(text) {
  const rows = await LibraryItem.find({ $text: { $search: text } }).select('tmdbId mediaType').limit(30).lean().catch(() => [])
  return new Set(rows.filter(r => r.tmdbId).map(r => `${r.mediaType === 'tv' ? 'tv' : 'movie'}:${r.tmdbId}`))
}

// GET /api/movies/smart-search?query=&type=multi|movie|tv&page=&profile=
exports.smartSearch = async (req, res) => {
  const query = String(req.query.query || '').replace(/\s+/g, ' ').trim().slice(0, 100)
  if (!query) return res.status(400).json({ message: 'Query required' })
  const type = ['movie', 'tv'].includes(req.query.type) ? req.query.type : 'multi'
  const page = Math.min(20, Math.max(1, Number(req.query.page) || 1))
  const parsed = se.parseQuery(query)
  const text = parsed.text || query
  const searchType = type !== 'multi' ? type : parsed.type || 'multi'

  // Retrieve from every angle at once; any one failing just contributes nothing
  const [main, withYear, taste, df, clicks, lib, people, collection] = await Promise.all([
    tmdbSearch(text, searchType, page),
    parsed.year && searchType !== 'tv' && page === 1 ? cachedTmdb('/search/movie', { query: text, year: parsed.year, include_adult: false })
      .then(d => (d.results || []).map(r => ({ ...r, media_type: 'movie' }))).catch(() => []) : [],
    quickTaste(req), getDf(), clicksFor(se.normalize(query)), libraryKeys(text),
    page === 1 && !parsed.type && text.split(' ').length <= 4 ? personResults(text) : { person: null, results: [] },
    page === 1 && searchType !== 'tv' ? collectionResults(text) : [],
  ])
  let results = [...withYear, ...main.results, ...collection, ...people.results]
  let didYouMean = null

  // Few or poor matches → try the closest well-known title / spelling
  const bestText = Math.max(0, ...results.slice(0, 8).map(r => se.textScore(text, r.title || r.name || '', df)))
  if (page === 1 && (results.length < 3 || bestText < 0.55)) {
    const alt = await suggest(text).catch(() => null)
    if (alt && se.normalize(alt) !== se.normalize(text)) {
      const extra = await tmdbSearch(alt, searchType, 1)
      if (extra.results.length) { didYouMean = alt; results = [...extra.results, ...results] }
    }
  }
  if (taste) results = results.filter(r => !taste.hidden.has(`${r.media_type}:${r.id}`))
  results = results.map(r => {
    const k = `${r.media_type}:${r.id}`
    return { ...r, clicks: clicks.get(k) || 0, onStreamix: lib.has(k) }
  })

  // A person search is when the person result is a strong match and the text barely matches any title
  // …or the query IS a well-known person's full name (titles "about" them shouldn't win over their work)
  const personQuery = !!people.person && (bestText < 0.8 || (people.person.exact && (people.person.popularity || 0) >= 8))
  const ranked = se.rank(results, { parsed: didYouMean ? se.parseQuery(didYouMean) : parsed, df, taste, quality: engine.quality, personQuery })
    .map(({ _score, _text, clicks: c, ...r }) => r)

  res.json({
    results: ranked, page, total_pages: main.totalPages, total_results: main.total, didYouMean,
    person: personQuery ? people.person : null,
    understood: { year: parsed.year, type: parsed.type, season: parsed.season, episode: parsed.episode },
  })
}

// GET /api/movies/suggest?q= → instant suggestions while typing (known titles + what people searched)
exports.suggestions = async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 60)
  if (q.length < 2) return res.json({ items: [] })
  const [items, df] = await Promise.all([getCorpus(), getDf()])
  const out = se.suggestions(q, items, df, 8).map(c => ({ id: c.id, media_type: c.type, title: c.title, year: c.year, poster_path: c.poster }))
  res.json({ items: out })
}

// POST /api/movies/search-click { q, type, id, title?, poster?, year? } → learn what people open for a query
const clickLimit = new Map() // ip → [timestamps]
exports.searchClick = async (req, res) => {
  const q = se.normalize(String(req.body.q || '').slice(0, 100))
  const type = req.body.type === 'tv' ? 'tv' : 'movie'
  const id = Number(req.body.id)
  if (!q || q.length < 2 || !Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid click' })
  const ip = req.ip || 'x', now = Date.now()
  const recent = (clickLimit.get(ip) || []).filter(t => now - t < 3600_000)
  if (recent.length >= 120) return res.status(429).json({ message: 'Too many' })
  recent.push(now); clickLimit.set(ip, recent)
  if (clickLimit.size > 5000) clickLimit.delete(clickLimit.keys().next().value)
  const key = `${type}:${id}`
  const prev = await SearchStat.findOne({ q, key }).lean().catch(() => null)
  const decayed = prev ? prev.n * Math.pow(0.5, (now - new Date(prev.at).getTime()) / (30 * DAY)) : 0
  await SearchStat.updateOne({ q, key }, { $set: { n: decayed + 1, at: new Date(now), title: String(req.body.title || '').slice(0, 200),
    poster: String(req.body.poster || '').slice(0, 200), year: String(req.body.year || '').slice(0, 4) } }, { upsert: true }).catch(() => {})
  res.json({ ok: true })
}

exports._test = { suggest, editDistance, correctWords }
