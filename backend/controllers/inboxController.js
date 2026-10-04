// controllers/inboxController.js — the notification bell + "Remind me"
const Notification = require('../models/Notification')
const Reminder = require('../models/Reminder')
const User = require('../models/User')
const { cachedTmdb } = require('../config/tmdb')

// GET /api/inbox → { items, unread }
exports.list = async (req, res) => {
  const seenAt = req.user.notificationsSeenAt || new Date(0)
  const filter = { $or: [{ user: req.user._id }, { user: null, createdAt: { $gte: req.user.createdAt || new Date(0) } }] }
  const [items, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).limit(40).lean(),
    Notification.countDocuments({ ...filter, createdAt: { $gt: seenAt } }),
  ])
  res.json({ items: items.map(n => ({ ...n, unread: !n.openedAt && n.createdAt > seenAt, user: undefined, dedupeKeys: undefined })), unread })
}

// POST /api/inbox/seen → everything so far is read
exports.seen = async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { notificationsSeenAt: new Date() })
  res.json({ ok: true })
}

// POST /api/inbox/:id/open — they opened it (from the bell, a push, or the app). Teaches the engine what
// this person cares about; counted once per notification.
const openedShared = new Map() // `${user}:${id}` → time, for "everyone" items that can't hold per-person state
exports.open = async (req, res) => {
  const id = String(req.params.id || '')
  if (!/^[a-f0-9]{24}$/i.test(id)) return res.status(400).json({ message: 'Bad id' })
  const n = await Notification.findOneAndUpdate({ _id: id, user: req.user._id, openedAt: null }, { openedAt: new Date() }, { new: true }).select('kind').lean()
  let kind = n?.kind
  if (!n) {
    const shared = await Notification.findOne({ _id: id, user: null }).select('kind').lean()
    const k = `${req.user._id}:${id}`
    if (shared && !openedShared.has(k)) {
      openedShared.set(k, Date.now()); kind = shared.kind
      if (openedShared.size > 20000) openedShared.delete(openedShared.keys().next().value)
    }
  }
  // Learning counts opens of things we actually pushed to them (browsing the bell isn't an answer to a push)
  if (kind) {
    const Delivery = require('../models/Delivery')
    const pushed = await Delivery.exists({ notification: id, user: req.user._id, channel: 'push', status: 'sent' })
    if (pushed) await User.updateOne({ _id: req.user._id }, { $inc: { [`notifyStats.${kind}.opened`]: 1 } })
  }
  res.json({ ok: true })
}

// GET /api/inbox/prefs → this account's notification settings (all devices)
const engine = require('../utils/notifyEngine')
exports.getPrefs = async (req, res) => {
  const u = await User.findById(req.user._id).select('notifyPrefs tz notifyStats').lean()
  const learned = {}
  for (const k of Object.keys(engine.DEFAULT_PREFS.push)) {
    const st = u?.notifyStats?.[k]
    if ((st?.sent || 0) >= 3) learned[k] = Math.round(engine.openRate(u.notifyStats, k) * 100)
  }
  res.json({ prefs: engine.prefsOf(u?.notifyPrefs), tz: u?.tz || '', learned, emailConfigured: require('../utils/mailer').configured() })
}

// PUT /api/inbox/prefs { push?, email?, quiet?, maxPerDay?, tz? }
exports.setPrefs = async (req, res) => {
  const u = await User.findById(req.user._id).select('notifyPrefs').lean()
  const cur = engine.prefsOf(u?.notifyPrefs)
  const b = req.body || {}
  const next = engine.prefsOf({
    push: { ...cur.push, ...(b.push && typeof b.push === 'object' ? b.push : {}) },
    email: { ...cur.email, ...(b.email && typeof b.email === 'object' ? b.email : {}) },
    quiet: { ...cur.quiet, ...(b.quiet && typeof b.quiet === 'object' ? b.quiet : {}) },
    maxPerDay: b.maxPerDay ?? cur.maxPerDay,
  })
  const set = { notifyPrefs: next }
  if (b.tz !== undefined && engine.validTz(b.tz)) set.tz = b.tz
  await User.updateOne({ _id: req.user._id }, { $set: set })
  res.json({ prefs: next })
}

// GET /api/inbox/reminders → [{ type, tmdbId }]
exports.reminders = async (req, res) => {
  res.json(await Reminder.find({ user: req.user._id, notified: false }).select('type tmdbId title releaseDate -_id').lean())
}

// PUT /api/inbox/reminders { type, tmdbId, on }
exports.setReminder = async (req, res) => {
  const type = req.body.type === 'tv' ? 'tv' : 'movie'
  const tmdbId = Number(req.body.tmdbId)
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) return res.status(400).json({ message: 'Invalid title' })
  if (req.body.on === false) {
    await Reminder.deleteOne({ user: req.user._id, type, tmdbId })
    return res.json({ on: false })
  }
  if (await Reminder.countDocuments({ user: req.user._id, notified: false }) >= 200) return res.status(400).json({ message: 'You have too many reminders' })
  const d = await cachedTmdb(`/${type}/${tmdbId}`).catch(() => null)
  if (!d) return res.status(404).json({ message: 'Title not found' })
  const releaseDate = (type === 'tv' ? d.first_air_date : d.release_date) || ''
  await Reminder.updateOne({ user: req.user._id, type, tmdbId }, {
    $set: { title: type === 'tv' ? d.name : d.title, poster: d.poster_path ? `https://image.tmdb.org/t/p/w185${d.poster_path}` : '', releaseDate, notified: false },
  }, { upsert: true })
  res.json({ on: true, releaseDate })
}

// GET /api/inbox/pushes?since=ISO — the pushes the engine actually sent this person (newest last).
// The Android app's background check shows these instead of every inbox item, so quiet hours, daily limits and
// "3 updates" merging work there exactly like web push.
exports.pushes = async (req, res) => {
  const Delivery = require('../models/Delivery')
  const floor = Date.now() - 24 * 3600 * 1000
  const t = Date.parse(String(req.query.since || ''))
  const since = new Date(Number.isFinite(t) ? Math.max(t, floor) : floor)
  const rows = await Delivery.find({ user: req.user._id, channel: 'push', status: 'sent', merged: { $ne: true }, sent: { $exists: true }, sentAt: { $gt: since } })
    .sort({ sentAt: 1 }).limit(20).select('sent sentAt').lean()
  res.json({ items: rows.map(r => ({
    _id: String(r._id), kind: r.sent.kind || 'announcement', title: r.sent.title || '', body: r.sent.body || '',
    url: r.sent.url || '/', image: r.sent.icon || '', createdAt: r.sentAt, unread: true,
  })) })
}
