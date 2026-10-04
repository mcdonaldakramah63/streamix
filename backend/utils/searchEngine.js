// utils/searchEngine.js — understanding a search and ranking what comes back. Pure functions, unit-tested.
//
//  1. Understand the query: "the dark knight 2008", "breaking bad season 2", "rocky ii", "amélie movie",
//     "office (us) show" → { text, year, type, season, episode }.
//  2. Text match per result, robust to how people type: accents, "&"/"and", roman numerals, leading "the",
//     typos (1 edit per 5 letters), and the half-typed last word while typing. Rare words count more (IDF), and
//     titles with lots of extra words lose a little (precision), so "Up" finds Up before "Upgrade".
//  3. Rank = text match + year/type agreement + popularity + quality + your taste + what people who typed the
//     same thing went on to open (learned, decaying) + "On Streamix" (playable from this server's library).

const ROMAN = { i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10' }

/** Lower-case, no accents, "&" → "and", roman numerals → digits, punctuation → spaces */
function normalize(s) {
  return String(s || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .map((w, i, all) => (ROMAN[w] && (i > 0 || all.length === 1) && w !== 'i' ? ROMAN[w] : w))
    .join(' ')
}

const tokens = (s) => normalize(s).split(' ').filter(Boolean)
const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'in', 'on', 'to'])

/** What the query asks for */
function parseQuery(raw) {
  let q = ` ${normalize(raw)} `
  const out = { raw: String(raw || ''), year: null, type: null, season: null, episode: null }
  let m = q.match(/ s(\d{1,2}) ?e(\d{1,3}) /)
  if (m) { out.season = Number(m[1]); out.episode = Number(m[2]); out.type = 'tv'; q = q.replace(m[0], ' ') }
  m = q.match(/ season (\d{1,2})(?: episode (\d{1,3}))? /)
  if (m) { out.season = Number(m[1]); if (m[2]) out.episode = Number(m[2]); out.type = 'tv'; q = q.replace(m[0], ' ') }
  m = q.match(/ (tv series|tv show|series|show|tv|anime series) $/)
  if (m && q.trim().split(' ').length > 1) { out.type = 'tv'; q = q.replace(m[0], ' ') }
  m = q.match(/ (movie|film) $/)
  if (m && q.trim().split(' ').length > 1) { out.type = 'movie'; q = q.replace(m[0], ' ') }
  // A year only when there's a title too ("1917" alone is a film called 1917)
  m = q.match(/ ((?:19|20)\d{2}) /)
  if (m && q.trim().split(' ').length > 1) { out.year = Number(m[1]); q = q.replace(m[0], ' ') }
  out.text = q.replace(/\s+/g, ' ').trim()
  return out
}

/** Edit distance with adjacent swaps, giving up past `max` */
function editDistance(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev2 = null, prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      if (prev2 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev2[j - 2] + 1)
      rowMin = Math.min(rowMin, cur[j])
    }
    if (rowMin > max) return max + 1
    prev2 = prev; prev = cur
  }
  return prev[b.length]
}

/** How well one query word matches one title word (1 exact, ~0.9 prefix of the last word, ~0.75 typo) */
function wordMatch(q, t, isLast) {
  if (q === t) return 1
  if (isLast && q.length >= 2 && t.startsWith(q)) return 0.75 + 0.2 * (q.length / t.length)
  if (q.length >= 4 && t.length >= 4) {
    const allowed = q.length >= 8 ? 2 : 1
    if (editDistance(q, t, allowed) <= allowed) return 0.78
  }
  return 0
}

/** IDF-style weight: rare words (in the corpus of known titles) say more than "the" or "love" */
const idf = (w, df = {}, n = 2000) => (STOP.has(w) ? 0.25 : Math.log(1 + n / (1 + (df[w] || 0))) / Math.log(1 + n))

/**
 * Text score 0..1 of a query against one title.
 * Coverage (how much of the query is in the title, IDF-weighted) × precision (how much of the title is the query).
 */
function textScore(query, title, df) {
  const qn = normalize(query), tn = normalize(title)
  if (!qn || !tn) return 0
  if (qn === tn) return 1
  const strip = (s) => s.replace(/^the /, '')
  if (strip(qn) === strip(tn)) return 0.98
  const qt = qn.split(' '), tt = tn.split(' ')
  let got = 0, total = 0
  const used = new Set()
  qt.forEach((q, i) => {
    const w = idf(q, df)
    total += w
    let best = 0, bestJ = -1
    tt.forEach((t, j) => { if (used.has(j)) return; const s = wordMatch(q, t, i === qt.length - 1); if (s > best) { best = s; bestJ = j } })
    if (bestJ >= 0) used.add(bestJ)
    got += w * best
  })
  const coverage = total ? got / total : 0
  const meaningful = tt.filter(t => !STOP.has(t)).length || tt.length
  const precision = Math.min(1, used.size / meaningful)
  let s = coverage * (0.62 + 0.38 * precision)
  // The whole query is the start of the title ("star wa" → "Star Wars"); the closer to the full title, the better.
  // Matching only after dropping a leading "the" counts a little less ("the dar" → The Dark Knight before Dark Nuns)
  if (tn.startsWith(qn)) s = Math.max(s, 0.78 + 0.19 * (qn.length / tn.length))
  else if (strip(tn).startsWith(strip(qn))) s = Math.max(s, 0.7 + 0.19 * (strip(qn).length / strip(tn).length))
  return Math.min(0.97, s)
}

const yearOf = (r) => Number(String(r.release_date || r.first_air_date || '').slice(0, 4)) || null

/**
 * Rank search results.
 * r: TMDB result (+ via: 'person' | 'collection' | 'title', onStreamix, clicks)
 * ctx: { parsed, df, taste: { genre }, quality(avg, count) }
 */
function rank(results, ctx) {
  const { parsed } = ctx
  const target = parsed.text || parsed.raw
  const seen = new Set()
  return results.filter(r => {
    const k = `${r.media_type}:${r.id}`
    if (seen.has(k) || r.adult) return false
    seen.add(k); return true
  }).map(r => {
    const names = [r.title, r.name, r.original_title, r.original_name].filter(Boolean)
    const text = Math.max(0, ...names.map(n => textScore(target, n, ctx.df)))
    const y = yearOf(r)
    // Searching a person: titles that merely contain the name (documentaries about them) count much less
    let s = 3.2 * text * (ctx.personQuery && r.via !== 'person' ? 0.3 : 1)
    if (parsed.year && y) s += y === parsed.year ? 0.9 : Math.abs(y - parsed.year) === 1 ? 0.35 : -0.5
    if (parsed.type) s += r.media_type === parsed.type ? 0.55 : -0.7
    s += 0.32 * Math.log10((r.popularity || 0) + 1)
    if (ctx.quality) s += 0.28 * Math.max(-1, Math.min(1, (ctx.quality(r.vote_average, r.vote_count) - 6.5) / 2))
    if (ctx.taste) s += 0.5 * Math.max(-1, Math.min(1, (r.genre_ids || []).reduce((a, g) => a + (ctx.taste.genre[g] || 0), 0) / Math.sqrt((r.genre_ids || []).length || 1)))
    if (r.clicks) s += 0.55 * Math.log1p(r.clicks)                       // others who typed this opened it
    if (r.onStreamix) s += 0.3
    if (r.via === 'person') s += ctx.personQuery ? 1.5 : -0.4                // searching a name → their work
    if (r.via === 'collection') s += 0.25
    if (!r.poster_path) s -= 0.9
    return { ...r, _score: s, _text: text }
  }).sort((a, b) => b._score - a._score)
}

/** Fast suggestions while typing, from a list of known titles [{ title, pop, … }] */
function suggestions(prefix, corpus, df, n = 8) {
  const q = normalize(prefix)
  if (q.length < 2) return []
  return corpus
    .map(c => ({ c, s: textScore(prefix, c.title, df) + 0.06 * Math.log10((c.pop || 0) + 1) + (c.clicks ? 0.1 * Math.log1p(c.clicks) : 0) }))
    .filter(x => x.s >= 0.55)
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map(x => x.c)
}

module.exports = { normalize, tokens, parseQuery, editDistance, wordMatch, idf, textScore, rank, suggestions }
