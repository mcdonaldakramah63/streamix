// utils/jobs.js — background notification jobs and housekeeping.
//
// Every notification carries a dedupeKey, so a job that re-runs (restart, two processes, a retry) can never tell
// someone the same thing twice. utils/notify + utils/notifyEngine then decide per person whether it buzzes their
// phone now, later, or just sits in the bell.
//
//  • New episodes (every 3 h): priority follows how engaged each person is with the show —
//      just watched the episode before it → "Your next episode is ready" (high)
//      watched the show in the last 45 days → "New episode" (normal)
//      only saved it / stopped long ago → bell only, low priority (no buzz at a bad time)
//  • Weekly pick: the top of each person's own recommendations (the same engine as Home), with its reason.
//  • Email digest (opt-in): unread highlights from the week, once a week.
//  • Reminders, new library videos.
//  • Housekeeping: never-confirmed accounts are removed after 7 days; learned notification habits decay weekly.
const mongoose = require('mongoose')
const { cachedTmdb } = require('../config/tmdb')
const settings = require('./settings')
const { notify } = require('./notify')

const DAY = 24 * 3600 * 1000
const today = () => new Date().toISOString().slice(0, 10)
/** "2026-W40" */
function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const y = t.getUTCFullYear()
  const w = Math.ceil(((t - Date.UTC(y, 0, 1)) / DAY + 1) / 7)
  return `${y}-W${String(w).padStart(2, '0')}`
}

/** Has `key` run within `ms`? If not, mark it as running now. */
async function due(key, ms) {
  const last = await settings.get(key)
  if (last && Date.now() - new Date(last).getTime() < ms) return false
  await settings.set(key, new Date().toISOString())
  return true
}

/** Recently active users following each show: watchlist, continue watching, or episodes watched */
async function followersByShow() {
  const Watchlist = require('../models/Watchlist')
  const User = require('../models/User')
  const EpisodeProgress = require('../models/EpisodeProgress')
  const userIds = await User.distinct('_id', { lastActiveAt: { $gte: new Date(Date.now() - 60 * DAY) }, emailVerified: { $ne: false } })
  if (!userIds.length) return new Map()
  const map = new Map() // showId → Set<userId>
  const add = (show, user) => { if (!map.has(show)) map.set(show, new Set()); map.get(show).add(String(user)) }
  for (const w of await Watchlist.find({ user: { $in: userIds }, type: 'tv' }).select('user movieId').lean()) add(w.movieId, w.user)
  for (const u of await User.find({ _id: { $in: userIds } }).select('continueWatching.movieId continueWatching.type').lean()) {
    for (const c of u.continueWatching || []) if (c.type === 'tv') add(c.movieId, u._id)
  }
  const recent = await EpisodeProgress.aggregate([
    { $match: { user: { $in: userIds }, updatedAt: { $gte: new Date(Date.now() - 90 * DAY) } } },
    { $group: { _id: { u: '$user', s: '$tmdbId' } } },
  ])
  for (const r of recent) add(r._id.s, r._id.u)
  return map
}

/**
 * How engaged is each follower with this show, for the episode that just aired?
 * → Map<userId, 'next' | 'watching' | 'saved'>
 */
async function engagement(showId, users, ep, prevSeasonLast) {
  const EpisodeProgress = require('../models/EpisodeProgress')
  const rows = await EpisodeProgress.find({ user: { $in: [...users] }, tmdbId: showId })
    .select('user season episode progress completed updatedAt').lean()
  const out = new Map([...users].map(u => [u, 'saved']))
  for (const r of rows) {
    const u = String(r.user)
    const done = r.completed || r.progress >= 85
    const isPrev = (r.season === ep.season_number && r.episode === ep.episode_number - 1)
      || (ep.episode_number === 1 && r.season === ep.season_number - 1 && prevSeasonLast && r.episode === prevSeasonLast)
    if (done && isPrev) out.set(u, 'next')
    else if (out.get(u) !== 'next' && Date.now() - new Date(r.updatedAt).getTime() < 45 * DAY) out.set(u, 'watching')
  }
  return out
}

/** Every 3 hours: episodes that aired in the last ~day → tell their followers, by engagement */
async function newEpisodes() {
  if (!(await due('job.newEpisodes.at', 3 * 3600 * 1000))) return
  const followers = await followersByShow()
  let filed = 0
  for (const [showId, users] of [...followers.entries()].slice(0, 500)) {
    const d = await cachedTmdb(`/tv/${showId}`).catch(() => null)
    const ep = d?.last_episode_to_air
    if (!ep?.air_date || Date.now() - new Date(ep.air_date).getTime() > 1.5 * DAY || new Date(ep.air_date) > new Date()) continue
    const prevSeasonLast = ep.episode_number === 1 ? d.seasons?.find(s => s.season_number === ep.season_number - 1)?.episode_count : null
    const levels = await engagement(showId, users, ep, prevSeasonLast).catch(() => new Map([...users].map(u => [u, 'saved'])))
    const code = `S${ep.season_number}E${ep.episode_number}`
    const base = {
      kind: 'episode',
      url: `/player/tv/${showId}?season=${ep.season_number}&episode=${ep.episode_number}`,
      image: d.poster_path ? `https://image.tmdb.org/t/p/w185${d.poster_path}` : '',
      tag: `ep-${showId}`, dedupeKey: `ep:${showId}:${code}`,
    }
    const group = (lvl) => [...levels.entries()].filter(([, l]) => l === lvl).map(([u]) => u)
    const next = group('next'), watching = group('watching'), saved = group('saved')
    if (next.length) filed += await notify(next, { ...base, priority: 'high', title: `Your next episode is ready: ${d.name}`, body: `${code}${ep.name ? ` · ${ep.name}` : ''} — pick up where you left off` })
    if (watching.length) filed += await notify(watching, { ...base, priority: 'normal', title: `New episode: ${d.name}`, body: `${code}${ep.name ? ` · ${ep.name}` : ''} is out now` })
    if (saved.length) filed += await notify(saved, { ...base, priority: 'low', title: `New episode: ${d.name}`, body: `${code}${ep.name ? ` · ${ep.name}` : ''} is out now` })
  }
  if (filed) console.log(`[jobs] new-episode notifications filed: ${filed}`)
}

/** Once a week: the top of each person's own recommendations, with the engine's reason */
async function weeklyPicks() {
  if (!(await due('job.weekly', 7 * DAY - 3600 * 1000))) return
  const User = require('../models/User')
  const Profile = require('../models/Profile')
  const rec = require('../controllers/recommendController')
  const week = isoWeek()
  const users = await User.find({ lastActiveAt: { $gte: new Date(Date.now() - 30 * DAY) }, suspended: { $ne: true }, emailVerified: { $ne: false } }).limit(500)
  for (const user of users) {
    try {
      const profile = await Profile.findOne({ user: user._id, isKids: { $ne: true } }).sort({ updatedAt: -1 })
      if (!profile) continue
      const watched = new Set((profile.watchHistory || []).map(h => h.tmdbId))
      const data = await rec.getRows(profile, user)
      const rows = data?.sections || []
      const pick = [...(rows.find(r => r.kind === 'top')?.items || []), ...rows.flatMap(r => r.items || [])]
        .find(c => c && !watched.has(c.id) && c.poster_path)
      if (!pick) continue
      const title = pick.title || pick.name
      const year = (pick.release_date || pick.first_air_date || '').slice(0, 4)
      await notify([user._id], {
        kind: 'weekly',
        title: `Your pick this week, ${profile.name}: ${title}`,
        body: pick.reason ? String(pick.reason).slice(0, 200) : `${year}${pick.vote_average ? ` · ★ ${Number(pick.vote_average).toFixed(1)}` : ''}`,
        url: pick.media_type === 'tv' ? `/tv/${pick.id}` : `/movie/${pick.id}`,
        image: `https://image.tmdb.org/t/p/w185${pick.poster_path}`,
        tag: 'weekly', dedupeKey: `weekly:${week}`,
      })
    } catch (e) {
      console.warn('[jobs] weekly pick:', e.message)
    }
  }
}

/** Opt-in weekly email: what they haven't seen in the bell this week */
async function emailDigest() {
  if (!(await due('job.emailDigest', 7 * DAY - 3600 * 1000))) return
  const User = require('../models/User')
  const Notification = require('../models/Notification')
  const Delivery = require('../models/Delivery')
  const mailer = require('./mailer')
  const week = isoWeek()
  const users = await User.find({ 'notifyPrefs.email.digest': true, emailVerified: { $ne: false }, suspended: { $ne: true } })
    .select('email username notificationsSeenAt createdAt').limit(2000).lean()
  const base = mailer.appUrl()
  for (const u of users) {
    const since = new Date(Math.max(Date.now() - 7 * DAY, new Date(u.notificationsSeenAt || 0).getTime()))
    const items = await Notification.find({
      $or: [{ user: u._id }, { user: null, createdAt: { $gte: u.createdAt } }],
      createdAt: { $gt: since }, openedAt: null, kind: { $nin: ['security', 'digest'] },
    }).sort({ createdAt: -1 }).limit(6).lean()
    if (!items.length) continue
    await Delivery.create({
      user: u._id, channel: 'email', kind: 'digest', priority: 'low', sendAt: new Date(),
      payload: { template: 'digest', to: u.email, data: { name: u.username, link: base, items: items.map(i => ({ title: i.title, body: i.body, link: base ? `${base}${i.url}` : '' })) } },
      key: `digest:${u._id}:${week}`,
    }).catch(e => { if (e.code !== 11000) throw e })
  }
  try { require('../services/notifyWorker').kick() } catch { /* not running */ }
}

/** A new library video linked to a show → tell that show's followers */
async function libraryAdded(items) {
  const shows = new Map()
  for (const it of items) if (it.mediaType === 'tv' && it.tmdbId && it.episode != null) shows.set(it.tmdbId, it)
  const followers = shows.size ? await followersByShow() : new Map()
  for (const [showId, it] of shows) {
    const users = followers.get(showId)
    if (!users) continue
    await notify([...users], {
      kind: 'library',
      title: `${it.tmdbTitle || it.title} is on Streamix`,
      body: `Season ${it.season || 1}, episode ${it.episode} was just added`,
      url: `/player/tv/${showId}?season=${it.season || 1}&episode=${it.episode}`,
      tag: `lib-${showId}`, dedupeKey: `lib:${it._id || `${showId}:${it.season || 1}:${it.episode}`}`,
    })
  }
  const movies = items.filter(i => i.mediaType !== 'tv')
  if (movies.length) {
    await notify(null, {
      kind: 'library',
      title: movies.length === 1 ? `New on Streamix: ${movies[0].title}` : `${movies.length} new movies on Streamix`,
      body: movies.slice(0, 3).map(m => m.title).join(' · '),
      url: movies.length === 1 && movies[0].tmdbId ? `/movie/${movies[0].tmdbId}` : '/',
      tag: 'library', dedupeKey: `lib:${movies.map(m => m._id || m.title).join(',').slice(0, 100)}`,
    })
  }
}

/** "Remind me": tell people when a movie/show they asked about comes out */
async function reminders() {
  const Reminder = require('../models/Reminder')
  const ready = await Reminder.find({ notified: false, releaseDate: { $ne: '', $lte: today() } }).limit(500).lean()
  for (const r of ready) {
    await notify([r.user], {
      kind: 'reminder',
      title: `${r.title} is out now`,
      body: r.type === 'tv' ? 'The show you asked about has started' : 'The movie you asked about has been released',
      url: r.type === 'tv' ? `/tv/${r.tmdbId}` : `/movie/${r.tmdbId}`,
      image: r.poster, tag: `rem-${r.type}-${r.tmdbId}`, dedupeKey: `rem:${r._id}`,
    }).catch(() => {})
    await Reminder.updateOne({ _id: r._id }, { notified: true })
  }
}

/** Accounts whose email was never confirmed don't keep their name and address forever */
async function cleanupUnverified() {
  if (!(await due('job.cleanupUnverified', DAY))) return
  const User = require('../models/User')
  const Profile = require('../models/Profile')
  const old = await User.find({ emailVerified: false, createdAt: { $lt: new Date(Date.now() - 7 * DAY) } }).select('_id').limit(1000).lean()
  if (!old.length) return
  const ids = old.map(u => u._id)
  await Profile.deleteMany({ user: { $in: ids } })
  const r = await User.deleteMany({ _id: { $in: ids }, emailVerified: false })
  console.log(`[jobs] removed ${r.deletedCount} account(s) that never confirmed their email`)
}

/** Weekly: older habits count less (people's routines and tastes change) */
async function decayLearning() {
  if (!(await due('job.decayLearning', 7 * DAY))) return
  const User = require('../models/User')
  const engine = require('./notifyEngine')
  const cursor = User.find({ $or: [{ notifyStats: { $exists: true } }, { activeHours: { $exists: true } }] }).select('notifyStats activeHours').lean().cursor()
  for await (const u of cursor) {
    await User.updateOne({ _id: u._id }, { $set: { notifyStats: engine.decayStats(u.notifyStats), activeHours: engine.decayHours(u.activeHours) } }).catch(() => {})
  }
}

function start() {
  const run = async () => {
    if (mongoose.connection.readyState !== 1) return
    for (const [name, fn] of [['new episodes', newEpisodes], ['weekly picks', weeklyPicks], ['reminders', reminders],
      ['email digest', emailDigest], ['cleanup', cleanupUnverified], ['decay', decayLearning]]) {
      try { await fn() } catch (e) { console.warn(`[jobs] ${name}:`, e.message) }
    }
  }
  setTimeout(run, 60_000)
  setInterval(run, 3600_000).unref()
}

module.exports = { start, libraryAdded, newEpisodes, weeklyPicks, reminders, emailDigest, cleanupUnverified, decayLearning, _test: { isoWeek, engagement } }
