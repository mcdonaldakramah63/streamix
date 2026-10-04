// utils/titleFeatures.js — what a title is "made of" (genres, keywords, cast, director, language, year),
// fetched from TMDB once and kept for a day. The taste engine compares these.
const { cachedTmdb } = require('../config/tmdb')

const TTL = 24 * 3600 * 1000
const MAX = 6000
const cache = new Map() // "movie:123" → { at, f }

function trim() {
  if (cache.size <= MAX) return
  // Drop the oldest ~10%
  const drop = [...cache.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, Math.ceil(MAX / 10))
  for (const [k] of drop) cache.delete(k)
}

/** From a TMDB list item (search/discover/recommendations) — cheap, no extra request */
function fromListItem(r, type) {
  const t = type || r.media_type || (r.title ? 'movie' : 'tv')
  const date = (t === 'tv' ? r.first_air_date : r.release_date) || ''
  return {
    key: `${t === 'tv' ? 'tv' : 'movie'}:${r.id}`, type: t === 'tv' ? 'tv' : 'movie', id: r.id,
    title: t === 'tv' ? r.name : r.title,
    genres: r.genre_ids || (r.genres || []).map(g => g.id),
    lang: r.original_language, year: Number(date.slice(0, 4)) || null,
    voteAverage: r.vote_average || 0, voteCount: r.vote_count || 0, popularity: r.popularity || 0,
    poster_path: r.poster_path, backdrop_path: r.backdrop_path, overview: r.overview, adult: !!r.adult,
    release_date: r.release_date, first_air_date: r.first_air_date, vote_average: r.vote_average,
  }
}

/** Full features (adds keywords, main cast, director/creator) — one cached TMDB request */
async function getFeatures(type, id) {
  const t = type === 'tv' ? 'tv' : 'movie'
  const key = `${t}:${id}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.f
  const d = await cachedTmdb(`/${t}/${id}`, { append_to_response: 'keywords,credits' }).catch(() => null)
  if (!d) return null
  const kw = t === 'tv' ? d.keywords?.results : d.keywords?.keywords
  const crew = (d.credits?.crew || []).filter(c => c.job === 'Director' || c.job === 'Screenplay' || c.job === 'Writer').slice(0, 3)
  const f = {
    ...fromListItem({ ...d, genre_ids: (d.genres || []).map(g => g.id), media_type: t }, t),
    keywords: (kw || []).map(k => k.id).slice(0, 20),
    people: [
      ...(d.credits?.cast || []).slice(0, 6).map(c => c.id),
      ...(t === 'tv' ? (d.created_by || []).map(c => c.id) : crew.map(c => c.id)),
    ],
    peopleNames: Object.fromEntries([
      ...(d.credits?.cast || []).slice(0, 6).map(c => [c.id, c.name]),
      ...(t === 'tv' ? (d.created_by || []) : crew).map(c => [c.id, c.name]),
    ]),
    runtime: t === 'tv' ? (d.episode_run_time || [])[0] || null : d.runtime || null,
    // Franchise (movies): lets "Coming up for you" spot the next film in a series you watched
    collection: t === 'movie' && d.belongs_to_collection ? { id: d.belongs_to_collection.id, name: d.belongs_to_collection.name } : null,
  }
  cache.set(key, { at: Date.now(), f })
  trim()
  return f
}

/** Fetch many with limited concurrency */
async function getMany(list, concurrency = 12) {
  const out = new Map()
  let i = 0
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, async () => {
    while (i < list.length) {
      const { type, id } = list[i++]
      const f = await getFeatures(type, id)
      if (f) out.set(`${type}:${id}`, f)
    }
  }))
  return out
}

module.exports = { getFeatures, getMany, fromListItem }
