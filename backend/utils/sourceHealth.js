// utils/sourceHealth.js — which embed provider should play first, learned instead of hard-coded.
//
// Providers come and go (embed.su vanished; vidsrc.to/.me moved to vidsrc.sh). Two kinds of evidence:
//   1. Health checks every 20 minutes: does the provider's player page answer, and how fast?
//   2. What actually happened for viewers: watched 3+ minutes (good), switched away within a minute,
//      the page failed to load, or "Report a problem" (bad). Counts fade with a 7-day half-life.
// Each provider's chance of working = Beta posterior mean; a provider that failed its last check sinks.
// Clients get the list in order and start on the first one.

const DAY = 86400000

/** One place for every provider's URL pattern (the apps used to keep their own copies) */
const PROVIDERS = [
  { id: 'vidsrc',     label: 'VidSrc',     movie: 'https://vidsrc.sh/embed/movie/{id}',              tv: 'https://vidsrc.sh/embed/tv/{id}/{s}/{e}' },
  { id: 'vidsrc2',    label: 'VidSrc 2',   movie: 'https://vidsrc.sh/embed/movie?tmdb={id}',         tv: 'https://vidsrc.sh/embed/tv?tmdb={id}&season={s}&episode={e}' },
  { id: 'vidlink',    label: 'VidLink',    movie: 'https://vidlink.pro/movie/{id}',                  tv: 'https://vidlink.pro/tv/{id}/{s}/{e}' },
  { id: 'autoembed',  label: 'AutoEmbed',  movie: 'https://autoembed.co/movie/tmdb/{id}',            tv: 'https://autoembed.co/tv/tmdb/{id}-{s}-{e}' },
  { id: '2embed',     label: '2Embed',     movie: 'https://www.2embed.cc/embed/{id}',                tv: 'https://www.2embed.cc/embedtv/{id}&s={s}&e={e}' },
  { id: 'multiembed', label: 'Multiembed', movie: 'https://multiembed.mov/?video_id={id}&tmdb=1',    tv: 'https://multiembed.mov/?video_id={id}&tmdb=1&s={s}&e={e}' },
  { id: 'videasy',    label: 'Videasy',    movie: 'https://player.videasy.net/movie/{id}',           tv: 'https://player.videasy.net/tv/{id}/{s}/{e}' },
  { id: 'embedsu',    label: 'Embed.su',   movie: 'https://embed.su/embed/movie/{id}',               tv: 'https://embed.su/embed/tv/{id}/{s}/{e}' },
]
// Hand-tuned starting order: used as a weak prior until there is evidence
const PRIOR_RANK = Object.fromEntries(PROVIDERS.map((p, i) => [p.id, i]))

const fill = (tpl, id, s = 1, e = 1) => tpl.replace('{id}', id).replace('{s}', s).replace('{e}', e)

/** Fade counts: half every `halfLifeDays` since `at` */
function decay(stat, now = Date.now(), halfLifeDays = 7) {
  const f = stat?.at ? Math.pow(0.5, Math.max(0, now - new Date(stat.at).getTime()) / (halfLifeDays * DAY)) : 1
  return { ok: (stat?.ok || 0) * f, fail: (stat?.fail || 0) * f }
}

/**
 * Probability-like score for one provider.
 * stat: { ok, fail, at, probe: { up, ms, at } } (may be empty)
 */
function score(id, stat = {}, now = Date.now()) {
  const { ok, fail } = decay(stat, now)
  // Prior: 2 successes, 1 failure, slightly better for providers higher in the hand-tuned list
  const prior = 2 + Math.max(0, 3 - (PRIOR_RANK[id] ?? 9)) * 0.15
  let p = (ok + prior) / (ok + fail + prior + 1)
  const pr = stat.probe
  if (pr?.at && now - new Date(pr.at).getTime() < 2 * 3600 * 1000) {
    if (pr.up === false) p *= 0.08                          // down right now: last resort only
    else if (pr.ms) p *= 1 - Math.min(0.25, pr.ms / 24000)  // slow pages lose a little
  }
  return p
}

/** Providers best-first for a media type. stats: { [id]: stat }. explore: sample instead of using the mean. */
function rank(type, stats = {}, { now = Date.now(), explore = false, rand = Math.random } = {}) {
  return PROVIDERS.map(p => {
    const st = stats[p.id] || {}
    let s = score(p.id, st, now)
    // Occasionally try a lower-ranked provider so recovered ones get a chance to prove themselves
    if (explore) s *= 0.75 + 0.5 * rand()
    return { id: p.id, label: p.label, template: p[type === 'tv' ? 'tv' : 'movie'], score: Math.round(s * 1000) / 1000, up: st.probe?.up !== false }
  }).sort((a, b) => b.score - a.score)
}

/** Does a fetched player page look like a working player? */
function looksPlayable(status, body = '') {
  if (status >= 400) return false
  // Whole page: some players put their code deep inside large pages
  const html = String(body).toLowerCase()
  if (html.length < 300) return false
  if (/(not found|404|no results|domain (is )?for sale|suspended|parked)/.test(html.slice(0, 3000)) && !/<iframe|<video|jwplayer|plyr|hls/.test(html)) return false
  return /<iframe|<video|jwplayer|plyr|hls|player/.test(html)
}

module.exports = { PROVIDERS, fill, decay, score, rank, looksPlayable }
