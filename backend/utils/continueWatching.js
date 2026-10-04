// utils/continueWatching.js — turns raw progress into a useful "Continue Watching" row:
//  • a finished episode becomes the next episode ("Up next"), or drops off when the show is done
//  • finished movies drop off
//  • things barely started and then ignored for months fade out
const { cachedTmdb } = require('../config/tmdb')

const DAY = 86400000
const today = () => new Date().toISOString().slice(0, 10)

/** The aired episode after (season, episode), or null */
async function nextEpisode(showId, season, episode) {
  const s = await cachedTmdb(`/tv/${showId}/season/${season}`).catch(() => null)
  const aired = (s?.episodes || []).filter(e => !e.air_date || e.air_date <= today())
  const same = aired.find(e => e.episode_number === episode + 1)
  if (same) return { season, episode: episode + 1, name: same.name || '' }

  const show = await cachedTmdb(`/tv/${showId}`).catch(() => null)
  const later = (show?.seasons || [])
    .filter(x => x.season_number > season && x.episode_count > 0)
    .sort((a, b) => a.season_number - b.season_number)[0]
  if (!later) return null
  const ns = await cachedTmdb(`/tv/${showId}/season/${later.season_number}`).catch(() => null)
  const first = (ns?.episodes || []).find(e => e.episode_number === 1)
  if (!first || (first.air_date && first.air_date > today())) return null
  return { season: later.season_number, episode: 1, name: first.name || '' }
}

/** items: raw continueWatching entries (newest first) → what the row should show */
async function smartRow(items) {
  const now = Date.now()
  const out = await Promise.all(items.map(async (raw) => {
    const it = typeof raw.toObject === 'function' ? raw.toObject() : { ...raw }
    const age = (now - new Date(it.watchedAt).getTime()) / DAY
    const p = Number(it.progress) || 0
    if (age > 120 && p < 5) return null

    if (it.type === 'movie') return p >= 95 ? null : it

    if (p < 95) return it
    const next = await nextEpisode(it.movieId, it.season || 1, it.episode || 1)
    if (!next) return null
    return {
      ...it, season: next.season, episode: next.episode, episodeName: next.name,
      progress: 0, timestamp: 0, duration: null, upNext: true,
    }
  }))
  return rankRow(out.filter(Boolean), now)
}

/**
 * Order by how likely you are to pick each one up now, not just by date:
 *   recency (4-day half-life) × engagement (mid-way > barely started; "up next" while bingeing is hot)
 */
function resumeScore(it, now = Date.now()) {
  const ageDays = Math.max(0, (now - new Date(it.watchedAt).getTime()) / DAY)
  const recency = Math.pow(0.5, ageDays / 4)
  const p = Number(it.progress) || 0
  let engagement
  if (it.upNext) engagement = ageDays <= 2 ? 1.15 : 0.85        // finished one recently → likely to continue the run
  else if (p >= 10 && p <= 90) engagement = 1.0                  // properly into it
  else if (p > 90) engagement = 0.6                              // basically done (credits)
  else if (p >= 3) engagement = 0.55                             // only sampled it
  else engagement = 0.3
  return recency * engagement + 0.02 * engagement               // tiny floor keeps old-but-engaged above old-and-abandoned
}

const rankRow = (items, now = Date.now()) => [...items].sort((a, b) => resumeScore(b, now) - resumeScore(a, now))

module.exports = { smartRow, nextEpisode, resumeScore, rankRow }
