// utils/mediaMatcher.js — works out which TMDB movie or series episode a video file is.
//
// 1. parseName() reads the file name and any hints the admin typed: title, year, season/episode
//    in many spellings, TMDB / IMDb ids, and drops release-group, language and quality junk.
// 2. Candidates come from explicit ids, learned aliases, and TMDB searches (movie + series,
//    several title variants, alternative/original titles).
// 3. A small scoring model turns features (name similarity, year, movie-vs-series fit, whether the
//    season/episode exists, popularity, learned aliases) into a 0–1 confidence.
// 4. Confident, unambiguous matches link automatically; the rest are kept as suggestions.
// 5. Optional: with ANTHROPIC_API_KEY set, unclear cases are double-checked by Claude.
const axios = require('axios')
const { cachedTmdb } = require('../config/tmdb')
const MatchAlias = require('../models/MatchAlias')

const AUTO_LINK    = 0.80  // confidence needed to link without asking
const MIN_MARGIN   = 1.0   // …and this far ahead of the runner-up (in log-odds, ≈ 2.7× as likely)
const SUGGEST_MIN  = 0.25

const img = (p, size) => (p ? `https://image.tmdb.org/t/p/${size}${p}` : '')
// Unicode-aware so Chinese/Japanese/Korean titles (诛仙) compare too
const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'and').replace(/[^\p{L}\p{N}]/gu, '')
const words = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ')
  .split(/[^\p{L}\p{N}]+/u).filter(w => w && !STOP.has(w))
const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'in', 'on', 'to', 'la', 'le', 'el', 'der', 'die', 'das'])

// ── 1. Parsing ───────────────────────────────────────────────────────────────

const JUNK = /\b(480p|540p|576p|720p|1080p|1440p|2160p|4k|8k|uhd|hdr10?|dv|sdr|x264|x265|h\.?264|h\.?265|hevc|avc|av1|aac\d?(?:\.\d)?|ac3|eac3|ddp?\d?(?:\.\d)?|dts|atmos|flac|opus|mp3|10bit|8bit|web[- ]?dl|webrip|web|bluray|blu[- ]?ray|brrip|bdrip|bdremux|remux|hdrip|dvdrip|dvdscr|hdtv|hdcam|camrip|cam|ts|hc|512kb|mpeg4|xvid|divx|proper|repack|extended|uncut|unrated|remastered|internal|limited|complete|eng|english|engsub|esub|subbed|subs?|softsub|hardsub|dubbed|dub|dual(?:[- ]audio)?|multi|raw|hindi|tamil|telugu|korean|chinese|japanese|mandarin|vostfr|vosub|vost|vf|vo|vostr|legendado|subtitulado|latino|castellano|multi[- ]?subs?|eng[- ]?sub|english[- ]?sub|w\/subtitles|uncensored|batch|amzn|nf|dsnp|hmax|atvp|hulu|cr|iqiyi|wetv|youku|bilibili|full|hd|sd|fhd|end|final|new|latest|official|free|download|watch|online|mkv|mp4|avi)\b/gi

/**
 * "AX+jade+dynasty+s4+ep+9+eng"            → { title: "jade dynasty", season: 4, episode: 9 }
 * "Movie.Name.2019.1080p.WEB-DL.x264-GRP"  → { title: "Movie Name", year: "2019" }
 * "jade dynasty tv: 206484 s4e9"           → { ids: { tmdb: 206484, type: 'tv' }, … }
 * "Nosferatu tt0013442"                    → { ids: { imdb: 'tt0013442' }, … }
 */
function parseName(raw) {
  let s = String(raw || '')
  try { s = decodeURIComponent(s.replace(/\+/g, ' ')) } catch { s = s.replace(/\+/g, ' ') }
  s = s.replace(/\.(mp4|m4v|mkv|webm|avi|mov|ogv|m3u8|ts)$/i, '')

  const out = { title: '', year: '', season: null, episode: null, ids: {}, typeHint: null }

  // Ids anywhere: "tv: 206484", "movie 653", "tmdb-653", "{tmdb-653}", "[tmdbid=653]", themoviedb URLs, "tt0013442"
  let m = s.match(/themoviedb\.org\/(movie|tv)\/(\d+)[^\s/]*(?:\/season\/(\d+)(?:\/episode\/(\d+))?)?/i)
  if (m) {
    out.ids = { tmdb: Number(m[2]), type: m[1].toLowerCase() }
    if (m[3]) out.season = Number(m[3])
    if (m[4]) out.episode = Number(m[4])
    s = s.replace(m[0], ' ')
  }
  m = !out.ids.tmdb && s.match(/(?:^|[\s[{(|,])(movie|film|tv|series|show|tmdb|tmdbid|id)\s*[:=#-]?\s*(\d{2,8})\b[\]})]?/i)
  if (m) {
    const kind = m[1].toLowerCase()
    out.ids = { tmdb: Number(m[2]), type: kind === 'movie' || kind === 'film' ? 'movie' : ['tv', 'series', 'show'].includes(kind) ? 'tv' : null }
    s = s.replace(m[0], ' ')
  }
  m = s.match(/\b(tt\d{6,9})\b/i)
  if (m) { out.ids.imdb = m[1].toLowerCase(); s = s.replace(m[0], ' ') }

  // Release groups in brackets and a trailing "-GROUP"
  s = s.replace(/\[[^\]]*\]|\{[^}]*\}/g, ' ').replace(/-[A-Za-z0-9]{2,12}$/, ' ')
  s = s.replace(/[._]+/g, ' ')

  // Season / episode in the usual spellings
  const SE = [
    /\bs(\d{1,2})\s*[-.]?\s*e(?:p(?:isode)?)?\s*(\d{1,4})\b/i,            // S04E09, s4 ep 9, S04 - E09
    /\bseason\s*(\d{1,2})\s*[-,.]?\s*(?:episode|ep|e)\s*(\d{1,4})\b/i,    // season 4 episode 9
    /\b(\d{1,2})x(\d{1,3})\b/i,                                          // 4x09
  ]
  for (const re of SE) {
    m = s.match(re)
    if (m) {
      out.season = Number(m[1]); out.episode = Number(m[2]); s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length)
      // "Show - Episode 02 (S1E02)": the spelled-out number is the same episode, not part of the title
      s = s.replace(new RegExp(`(?:\\s[-–]\\s*)?\\b(?:episode|ep)\\.?\\s*0*${out.episode}\\b`, 'i'), ' ')
      break
    }
  }
  if (out.episode == null) {
    m = s.match(/\b(?:episode|ep|e)\.?\s*(\d{1,4})\b/i) || s.match(/第\s*(\d{1,4})\s*[集话話]/) || s.match(/\s-\s(\d{1,4})(?:v\d)?(?=\s|$)/)
      || s.match(/(?:^|\s)#\s?(\d{1,4})(?=\s|$|\()/)                                       // "Gundam … #5"
    if (m) { out.episode = Number(m[1]); s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length) }
  }
  if (out.episode == null) {
    // Anime release style: "Dandadan 03 VOSTFR", "Bleach 366" — a number after the title with a leading zero or
    // 3+ digits (not a year). "Apollo 13" / "Ocean's 11" stay titles, and because "Fahrenheit 451" looks the same
    // as "Bleach 366", the other reading is kept too (`bare`) and the matcher tries both.
    const t = s.replace(JUNK, ' ').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
    m = t.match(/^(.*[\p{L}].*?)\s(0\d{1,3}|[1-9]\d{2,3})(?:v\d)?$/u)
    if (m && !/^(19|20)\d{2}$/.test(m[2]) && m[1].split(' ').length <= 8) {
      out.bare = { title: `${m[1]} ${m[2]}`, number: Number(m[2]) }
      out.episode = Number(m[2]); s = `${m[1]} ${(s.match(/\([^)]*\)/g) || []).join(' ')}` // keep "(1966)" for the year
    }
  }
  if (out.season == null) {
    // "S2", "Season 2" — but not the "'s 11" of "Ocean's 11"
    m = s.match(/(?<!['’])\bs(\d{1,2})\b/i) || s.match(/\b(?:season|series)\s*(\d{1,2})\b/i) || s.match(/\b(\d{1,2})(?:st|nd|rd|th)\s+season\b/i) || s.match(/第\s*(\d{1,2})\s*季/)
    if (m) { out.season = Number(m[1]); s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length) }
  }
  if (out.episode != null || out.season != null) out.typeHint = 'tv'
  // "… (movie)", "… movie" at the end, or "[film]" mark it as a film — "Movie.Name.2019" doesn't
  m = s.match(/[\s(]+(movie|film)\)?\s*$/i)
  if (m) { out.typeHint = out.typeHint || 'movie'; s = s.slice(0, m.index) }
  else if (/\bthe movie\b/i.test(s)) out.typeHint = out.typeHint || 'movie'

  // Year: the last plausible one (titles like "2001 A Space Odyssey 1968" keep the first)
  const years = [...s.matchAll(/(?:^|[\s(\-])((?:19[0-9]|20[0-4])\d)(?=[\s)\-]|$)/g)]
  if (years.length) {
    const y = years[years.length - 1]
    if (y.index > 0 || years.length > 1) { out.year = y[1]; s = s.slice(0, y.index) + ' ' + s.slice(y.index + y[0].length) }
  }

  s = s.replace(JUNK, ' ').replace(/[()]/g, ' ')
  // A short ALL-CAPS tag in front of a lower/mixed-case name is a release group ("AX jade dynasty")
  m = s.trim().match(/^([A-Z0-9]{2,5})\s+(.*[a-z].*)$/)
  if (m && m[1] !== m[1].toLowerCase() && !/^\d+$/.test(m[1])) s = m[2]
  out.title = s.replace(/\s+[-–:]\s*$/, '').replace(/^\s*[-–:]\s+/, '').replace(/\s+/g, ' ').trim()
  return out
}

/** Merges what the admin typed after the URL over what the file name says */
function parseInput(fileName, hintText) {
  const f = parseName(fileName)
  if (!hintText || !hintText.trim()) return { ...f, titleFromAdmin: false }
  const h = parseName(hintText)
  const plainYear = /^\s*(19|20)\d{2}\s*$/.test(hintText)
  return {
    title: !plainYear && h.title ? h.title : f.title,
    titleFromAdmin: !plainYear && !!h.title,
    year: h.year || (plainYear ? hintText.trim() : '') || f.year,
    season: h.season ?? f.season,
    episode: h.episode ?? f.episode,
    ids: { ...f.ids, ...h.ids },
    typeHint: h.ids.type || h.typeHint || f.ids.type || f.typeHint,
  }
}

const aliasKey = title => norm(title).slice(0, 80)

// ── 2. Candidates ────────────────────────────────────────────────────────────

function titleVariants(title) {
  const out = new Set([title])
  const parts = title.split(/\s+[-–:|]\s+/).map(t => t.trim()).filter(Boolean)
  parts.forEach(p => out.add(p))
  for (const t of [title, ...parts]) {
    const m = t.match(/^[A-Z0-9]{1,5}\s+(.+)$/i)
    if (m && m[1].split(' ').length >= 1) out.add(m[1])
  }
  // Drop trailing words one at a time for long names ("renegade immortal slaying the blood progenitor")
  const w = title.split(' ')
  for (let n = w.length - 1; n >= 2 && out.size < 7; n--) out.add(w.slice(0, n).join(' '))
  return [...out].filter(t => t.length > 1).slice(0, 7)
}

async function details(type, id) {
  const d = await cachedTmdb(`/${type}/${id}`, { append_to_response: 'alternative_titles' }).catch(() => null)
  if (!d || d.success === false) return null
  const alt = (type === 'tv' ? d.alternative_titles?.results : d.alternative_titles?.titles) || []
  return {
    mediaType: type, tmdbId: d.id,
    title: type === 'tv' ? d.name : d.title,
    original: type === 'tv' ? d.original_name : d.original_title,
    alt: alt.map(a => a.title).filter(Boolean).slice(0, 25),
    year: ((type === 'tv' ? d.first_air_date : d.release_date) || '').slice(0, 4),
    popularity: d.popularity || 0,
    seasons: type === 'tv' ? (d.seasons || []).map(s => ({ n: s.season_number, eps: s.episode_count })) : null,
    poster: img(d.poster_path, 'w500'), backdrop: img(d.backdrop_path, 'w1280'), overview: d.overview || '',
    genres: (d.genres || []).map(g => g.id), language: d.original_language,
  }
}

// ── AniList: romaji ↔ English ↔ Japanese titles for anime ─────────────────────
// Fansub names use romaji ("Sousou no Frieren") while TMDB lists "Frieren: Beyond Journey's End". AniList's
// public API knows every name a show goes by; those become extra TMDB searches and extra names to compare.
const anilistCache = new Map() // query → { at, titles }
async function anilistTitles(query) {
  const key = norm(query)
  if (!key || key.length < 3) return []
  const hit = anilistCache.get(key)
  if (hit && Date.now() - hit.at < 24 * 3600 * 1000) return hit.titles
  let titles = []
  try {
    const { data } = await axios.post('https://graphql.anilist.co', {
      query: 'query($q:String){Page(perPage:3){media(search:$q,type:ANIME){title{romaji english native}synonyms}}}',
      variables: { q: String(query).slice(0, 100) },
    }, { timeout: 5000, headers: { 'Content-Type': 'application/json', Accept: 'application/json' } })
    for (const m of data?.data?.Page?.media || []) {
      const names = [m.title?.english, m.title?.romaji, m.title?.native, ...(m.synonyms || [])].filter(Boolean)
      // Only shows that really answer to this name (AniList search is fuzzy)
      if (nameSimilarity(query, names) >= 0.8) titles.push(...names)
    }
    titles = [...new Set(titles)].slice(0, 12)
  } catch { /* AniList down or rate-limited: plain TMDB search still runs */ }
  anilistCache.set(key, { at: Date.now(), titles })
  if (anilistCache.size > 2000) anilistCache.delete(anilistCache.keys().next().value)
  return titles
}

async function gatherCandidates(p) {
  const found = new Map() // "type:id" → { type, id, viaId, viaAlias, searchRank }
  const add = (type, id, extra = {}) => {
    const k = `${type}:${id}`
    found.set(k, { ...(found.get(k) || { type, id, searchRank: 99 }), ...extra })
  }

  if (p.ids.tmdb) {
    if (p.ids.type) add(p.ids.type, p.ids.tmdb, { viaId: true })
    else { add('movie', p.ids.tmdb, { viaId: true }); add('tv', p.ids.tmdb, { viaId: true }) }
  }
  if (p.ids.imdb) {
    const f = await cachedTmdb(`/find/${p.ids.imdb}`, { external_source: 'imdb_id' }).catch(() => null)
    for (const r of f?.movie_results || []) add('movie', r.id, { viaId: true })
    for (const r of f?.tv_results || []) add('tv', r.id, { viaId: true })
    for (const r of f?.tv_episode_results || []) {
      add('tv', r.show_id, { viaId: true })
      if (p.season == null) p.season = r.season_number
      if (p.episode == null) p.episode = r.episode_number
    }
  }

  // A typed id with a known type is enough — no need to search by name
  if ((p.ids.tmdb && p.ids.type) || (p.ids.imdb && found.size)) return [...found.values()]

  if (p.title) {
    const alias = await MatchAlias.findOne({ key: aliasKey(p.title) }).lean().catch(() => null)
    if (alias) add(alias.mediaType, alias.tmdbId, { viaAlias: true })

    // Anime-looking names (episodes / fansub style / Japanese words) also try their other names
    if (p.typeHint !== 'movie' || /\b(no|wa|ga|wo|to|ni|de|kun|chan|san|sama|senpai|monogatari|shoujo|shounen|kyojin|yaiba)\b/i.test(p.title)) {
      p.aliases = await anilistTitles(p.title)
    }
    const queries = [...titleVariants(p.title), ...(p.aliases || []).filter(a => /[a-z]/i.test(a)).slice(0, 3), ...(p.aliases || []).filter(a => !/[a-z]/i.test(a)).slice(0, 1)]
    for (const v of [...new Set(queries)]) {
      const [movies, shows] = await Promise.all([
        cachedTmdb('/search/movie', { query: v, include_adult: false }).catch(() => null),
        cachedTmdb('/search/tv',    { query: v, include_adult: false }).catch(() => null),
      ])
      ;(movies?.results || []).slice(0, 6).forEach((r, i) => add('movie', r.id, { searchRank: Math.min(found.get(`movie:${r.id}`)?.searchRank ?? 99, i) }))
      ;(shows?.results  || []).slice(0, 6).forEach((r, i) => add('tv', r.id, { searchRank: Math.min(found.get(`tv:${r.id}`)?.searchRank ?? 99, i) }))
      if (found.size >= 24) break
    }
  }

  // Keep the most promising ones for the detailed (more expensive) look
  return [...found.values()]
    .sort((a, b) => (b.viaId - a.viaId) || (b.viaAlias - a.viaAlias) || a.searchRank - b.searchRank)
    .slice(0, 12)
}

// ── 3. Scoring ───────────────────────────────────────────────────────────────

function bigrams(s) { const out = new Map(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); out.set(g, (out.get(g) || 0) + 1) } return out }
function dice(a, b) {
  if (!a || !b) return 0
  if (a === b) return 1
  const A = bigrams(a), B = bigrams(b)
  let inter = 0
  for (const [g, n] of A) inter += Math.min(n, B.get(g) || 0)
  return (2 * inter) / (Math.max(1, a.length - 1) + Math.max(1, b.length - 1))
}

/** 0–1: how well a file title fits one of a candidate's names */
function nameSimilarity(query, names) {
  const q = norm(query), qw = words(query)
  let best = 0
  for (const name of names) {
    const n = norm(name)
    if (!n) continue
    if (n === q) return 1
    const nw = words(name)
    const common = qw.filter(w => nw.includes(w)).length
    const covName  = nw.length ? common / nw.length : 0   // how much of the real title is in the file name
    const covQuery = qw.length ? common / qw.length : 0   // how much of the file name is explained
    // Both must be high: "Dynasty" explains only half of "jade dynasty"
    const overlap = covName + covQuery ? (2 * covName * covQuery) / (covName + covQuery) : 0
    const [short, long] = q.length < n.length ? [q, n] : [n, q]
    const prefix = short.length >= 5 && long.startsWith(short) ? 0.55 + 0.4 * (short.length / long.length) : 0
    const score = Math.max(dice(q, n) * 0.95, overlap * 0.97, prefix)
    best = Math.max(best, score)
  }
  return Math.min(best, 0.99)
}

const sigmoid = z => 1 / (1 + Math.exp(-z))

/**
 * Where an episode sits in a series. Anime is often numbered straight through ("One Piece - 1105")
 * while TMDB splits it into seasons, so an episode past season 1's end is counted across seasons.
 */
function placeEpisode(seasons, season, episode) {
  if (!seasons?.length) return null
  const regular = seasons.filter(x => x.n > 0).sort((a, b) => a.n - b.n)
  const absolute = () => {
    let left = episode
    for (const s of regular) {
      if (left <= s.eps) return { season: s.n, episode: left }
      left -= s.eps
    }
    return null
  }
  if (season != null) {
    const s = seasons.find(x => x.n === season)
    if (s && episode >= 1 && episode <= s.eps) return { season, episode }
    // Fansubs often keep counting across seasons: "Shingeki no Kyojin S3 - 49" is season 3's 12th episode.
    // Only accept it when the running count actually lands in (or after) the season they named.
    const abs = absolute()
    return abs && abs.season >= season ? abs : null
  }
  return absolute()
}

/** Feature weights (hand-tuned on real file names; see the tests in __tests__) */
const W = { bias: -6.5, name: 8.5, year: 1.4, yearOff: -1.5, type: 1.2, typeOff: -2.5, epOk: 1.0, epBad: -2.0, pop: 0.9, alias: 4, id: 9, idNameOff: -3 }

function score(p, c, meta) {
  const f = {}
  const names = [c.title, c.original, ...c.alt]
  f.name = p.title ? nameSimilarity(p.title, names) : 0
  // Long light-novel style titles: "Magic Repo Man: Dumped by My Party, I'll …" is called "Magic Repo Man".
  // The main part counts a little less than the full name, so an exact full title still wins.
  const mains = names.filter(Boolean).map(n => n.split(/\s*[:：]\s+|\s+[-–]\s+/)[0]).filter((m, i, all) => m.split(/\s+/).length >= 2 && all.indexOf(m) === i)
  if (p.title && mains.length) f.name = Math.max(f.name, 0.93 * nameSimilarity(p.title, mains))
  // Another name of the same anime (from AniList) matching TMDB's name counts almost as much
  for (const a of p.aliases || []) f.name = Math.max(f.name, 0.97 * nameSimilarity(a, names))
  let z = W.bias + W.name * f.name

  if (p.year && c.year) {
    const dy = Math.abs(Number(p.year) - Number(c.year))
    // A series' later seasons air years after its first-air date
    if (dy === 0) z += W.year
    else if (dy === 1) z += W.year / 2
    else if (!(c.mediaType === 'tv' && Number(p.year) > Number(c.year))) z += W.yearOff
  }

  const wantsTv = p.episode != null || p.season != null || p.typeHint === 'tv'
  const wantsMovie = p.typeHint === 'movie' || (p.episode == null && p.season == null && /\s[-–:]\s/.test(p.rawTitle || ''))
  if (wantsTv)    z += c.mediaType === 'tv' ? W.type : W.typeOff
  if (wantsMovie) z += c.mediaType === 'movie' ? W.type * 0.6 : W.typeOff * 0.6

  let se = null
  if (c.mediaType === 'tv' && p.episode != null) {
    se = placeEpisode(c.seasons, p.season, p.episode)
    z += se ? W.epOk : c.seasons?.length ? W.epBad : W.epBad * 0.6
  }

  z += W.pop * Math.min(1, Math.log10((c.popularity || 0) + 1) / 2.5)
  if (meta.viaAlias) z += W.alias
  // An id the admin typed is trusted; a bare number that could be a movie or a series needs the name to agree
  if (meta.viaId) z += W.id + (!p.ids.type && !p.ids.imdb && p.title && f.name < 0.35 ? W.idNameOff : 0)
  return { z, confidence: sigmoid(z), features: f, se }
}

// ── 4/5. Decide (with optional Claude double-check) ─────────────────────────

async function askClaude(fileName, p, ranked) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key || !ranked.length) return null
  const list = ranked.slice(0, 6).map((c, i) =>
    `${i + 1}. [${c.mediaType}] ${c.title}${c.original && c.original !== c.title ? ` / ${c.original}` : ''} (${c.year || '?'})` +
    (c.seasons ? ` seasons: ${c.seasons.filter(s => s.n > 0).map(s => `S${s.n}=${s.eps}eps`).join(', ')}` : '')).join('\n')
  try {
    const { data } = await axios.post('https://api.anthropic.com/v1/messages', {
      model: process.env.MATCH_AI_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      messages: [{ role: 'user', content:
        `A video file needs to be matched to the right TMDB title.\nFile: "${fileName}"\n` +
        `Parsed: title="${p.title}" year=${p.year || '?'} season=${p.season ?? '?'} episode=${p.episode ?? '?'}\n` +
        `Candidates:\n${list}\n\nReply with only JSON: {"pick": <number or 0 if none fit>, "season": <number|null>, "episode": <number|null>}` }],
    }, { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, timeout: 15_000 })
    const m = String(data?.content?.[0]?.text || '').match(/\{[\s\S]*\}/)
    if (!m) return null
    const r = JSON.parse(m[0])
    const pick = ranked[Number(r.pick) - 1]
    return pick ? { pick, season: Number.isInteger(r.season) ? r.season : null, episode: Number.isInteger(r.episode) ? r.episode : null } : { none: true }
  } catch { return null }
}

/**
 * Main entry. Returns { parsed, best (or null), suggestions[], decidedBy }
 * best/suggestions items: { mediaType, tmdbId, title, year, poster, backdrop, overview, season, episode, confidence }
 */
async function identify(fileName, hintText = '') {
  const first = parseInput(fileName, hintText)
  first.rawTitle = first.title
  // "Bleach 366" (episode 366) or "Fahrenheit 451" (a title)? Score both readings, keep the better one per candidate.
  const readings = [first]
  if (first.bare && !hintText) readings.push({ ...first, title: first.bare.title, rawTitle: first.bare.title, episode: null, season: null, typeHint: null, bare: undefined })
  const byKey = new Map()
  for (const p of readings) {
    const metas = await gatherCandidates(p)
    await Promise.all(metas.map(async m => {
      const d = await details(m.type, m.id)
      if (!d) return
      const c = { ...d, ...score(p, d, m), viaIdHit: !!m.viaId && !!(p.ids.type || p.ids.imdb), reading: p }
      const k = `${d.mediaType}:${d.tmdbId}`
      if (!byKey.has(k) || byKey.get(k).z < c.z) byKey.set(k, c)
    }))
  }
  const cands = [...byKey.values()].sort((a, b) => b.confidence - a.confidence)
  const p = cands[0]?.reading || first

  const shape = c => ({
    mediaType: c.mediaType, tmdbId: c.tmdbId, title: c.title, year: c.year, poster: c.poster,
    backdrop: c.backdrop, overview: c.overview,
    season: c.mediaType === 'tv' ? (c.se?.season ?? c.reading.season ?? (c.reading.episode != null ? 1 : null)) : null,
    episode: c.mediaType === 'tv' ? (c.se?.episode ?? c.reading.episode) : null,
    confidence: Math.round(c.confidence * 100) / 100,
  })
  const suggestions = cands.filter(c => c.confidence >= SUGGEST_MIN).slice(0, 5).map(shape)
  const [top, second] = cands
  let best = null, decidedBy = 'none'

  if (top && top.confidence >= AUTO_LINK && (!second || top.z - second.z >= MIN_MARGIN || top.viaIdHit)) {
    best = shape(top); decidedBy = 'model'
  } else if (top && top.confidence >= 0.4) {
    const ai = await askClaude(fileName, p, cands)
    if (ai?.pick) {
      best = shape(ai.pick)
      if (best.mediaType === 'tv') { best.season = ai.season ?? best.season; best.episode = ai.episode ?? best.episode }
      decidedBy = 'claude'
    }
  }
  return { parsed: { title: p.title, year: p.year, season: p.season, episode: p.episode, ids: p.ids, titleFromAdmin: p.titleFromAdmin }, best, suggestions, decidedBy }
}

/** Remember an admin's decision so similar file names link by themselves next time */
async function learn(fileTitle, link) {
  const key = aliasKey(fileTitle)
  if (!key || key.length < 3 || !link?.tmdbId) return
  await MatchAlias.findOneAndUpdate(
    { key },
    { $set: { mediaType: link.mediaType, tmdbId: link.tmdbId, title: link.title || '' }, $inc: { hits: 1 } },
    { upsert: true },
  ).catch(() => {})
}

module.exports = { identify, learn, parseName, parseInput, nameSimilarity, aliasKey, placeEpisode, anilistTitles, AUTO_LINK }
