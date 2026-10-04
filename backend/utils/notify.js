// utils/notify.js — one call files a notification in the inbox (the bell) and plans how to interrupt each person.
//
// notify(userIds | null, { kind, title, body, url, image, tag, dedupeKey?, priority?, email? })
//
//  1. Inbox: always. dedupeKey makes it idempotent (a job that re-runs after a crash can't notify twice), and an
//     unread item with the same tag is updated instead of stacking ("3 new episodes: The Bear").
//  2. Push: utils/notifyEngine decides per person — now, later (quiet hours / their usual hour / spacing), or
//     not at all (daily limit, a kind they always ignore, turned off). Planned pushes go to the Delivery outbox,
//     and services/notifyWorker sends them (web push + the app's live socket), with retries.
//  3. Email: security alerts (and anything with email: true) to verified addresses, through the same outbox.
const mongoose = require('mongoose')
const Notification = require('../models/Notification')
const engine = require('./notifyEngine')

const COLLAPSE = new Set(['episode', 'library'])
const DAY = 24 * 3600_000
const oid = (u) => new mongoose.Types.ObjectId(String(u))

function clean(msg) {
  const kind = engine.KINDS[msg.kind] ? msg.kind : 'announcement'
  return {
    kind,
    priority: engine.PRI[msg.priority] !== undefined ? msg.priority : engine.KINDS[kind].priority,
    title: String(msg.title || '').slice(0, 120),
    body: String(msg.body || '').slice(0, 300),
    url: typeof msg.url === 'string' && msg.url.startsWith('/') && !msg.url.startsWith('//') ? msg.url.slice(0, 300) : '/',
    image: typeof msg.image === 'string' && /^https:\/\/image\.tmdb\.org\//.test(msg.image) ? msg.image : '',
    tag: String(msg.tag || '').slice(0, 80),
  }
}

/** Adds ?n=<id> so opening the notification can be counted (it teaches the engine what each person cares about) */
function withRef(url, id) {
  return `${url}${url.includes('?') ? '&' : '?'}n=${id}`
}

/**
 * Files one person's copy. → { n, collapsed } or null if this event already reached them.
 */
async function fileFor(user, doc, dedupeKey, now) {
  if (dedupeKey && await Notification.exists({ user, dedupeKeys: dedupeKey })) return null
  if (doc.tag && COLLAPSE.has(doc.kind)) {
    // Merge into their unread item for the same thing (atomic: the key guard stops double counting)
    const prev = await Notification.findOne({ user, tag: doc.tag, openedAt: null, createdAt: { $gte: new Date(now - DAY) } }).sort({ createdAt: -1 }).lean()
    if (prev) {
      const count = (prev.count || 1) + 1
      const n = await Notification.findOneAndUpdate(
        { _id: prev._id, ...(dedupeKey ? { dedupeKeys: { $ne: dedupeKey } } : {}) },
        {
          $set: { title: engine.collapsedTitle(doc.kind, doc.title, count), body: doc.body, url: doc.url, image: doc.image || prev.image, createdAt: now, count },
          ...(dedupeKey ? { $addToSet: { dedupeKeys: dedupeKey } } : {}),
        },
        { new: true },
      ).lean()
      if (n) return { n, collapsed: true }
      if (dedupeKey) return null
    }
  }
  try {
    const n = await Notification.create({ ...doc, user, createdAt: now, ...(dedupeKey ? { dedupeKeys: [dedupeKey] } : {}) })
    return { n: n.toObject(), collapsed: false }
  } catch (e) {
    if (e.code === 11000) return null // the same event, filed by a parallel run
    throw e
  }
}

/**
 * Ordinary pushes already sent or scheduled for these people in the last/next day: userId → [{ at, nid }].
 * Security alerts don't use up anyone's daily allowance.
 */
async function recentPushes(userIds, now) {
  const Delivery = require('../models/Delivery')
  const rows = await Delivery.find({
    user: { $in: userIds }, channel: 'push', status: { $in: ['pending', 'sending', 'sent'] }, priority: { $ne: 'critical' },
    sendAt: { $gte: new Date(now - DAY), $lte: new Date(now.getTime() + DAY) },
  }).select('user sendAt sentAt notification').lean()
  const map = new Map()
  for (const r of rows) {
    const k = String(r.user)
    if (!map.has(k)) map.set(k, [])
    map.get(k).push({ at: r.sentAt || r.sendAt, nid: String(r.notification || '') })
  }
  return map
}

/** Who a broadcast is for: people active in the last 60 days, or with a device signed up for pushes */
async function everyone() {
  const User = require('../models/User')
  const PushSubscription = require('../models/PushSubscription')
  const [active, subscribed] = await Promise.all([
    User.distinct('_id', { lastActiveAt: { $gte: new Date(Date.now() - 60 * DAY) }, suspended: { $ne: true } }),
    PushSubscription.distinct('user'),
  ])
  return [...new Set([...active, ...subscribed].map(String))]
}

/**
 * → number of people it was filed for (pushes go out through the outbox).
 * opts.now and opts.rand are for tests.
 */
async function notify(userIds, msg, opts = {}) {
  const User = require('../models/User')
  const Delivery = require('../models/Delivery')
  const doc = clean(msg)
  if (!doc.title) return 0
  const now = opts.now || new Date()
  const dedupeKey = msg.dedupeKey ? String(msg.dedupeKey).slice(0, 120) : null

  // 1. Inbox
  const filed = [] // { user, n, collapsed }
  if (userIds === null) {
    if (dedupeKey && await Notification.exists({ user: null, dedupeKeys: dedupeKey })) return 0
    const n = (await Notification.create({ ...doc, user: null, createdAt: now, ...(dedupeKey ? { dedupeKeys: [dedupeKey] } : {}) })).toObject()
    for (const u of await everyone()) filed.push({ user: u, n, collapsed: false })
  } else {
    for (const u of [...new Set(userIds.map(String))]) {
      const r = await fileFor(oid(u), doc, dedupeKey, now).catch(e => { console.warn('[notify] inbox:', e.message); return null })
      if (r) filed.push({ user: u, ...r })
    }
  }
  if (!filed.length) return 0

  // 2. Plan the interruption for each person
  const ids = filed.map(f => oid(f.user))
  const [people, recent] = await Promise.all([
    User.find({ _id: { $in: ids } }).select('tz notifyPrefs notifyStats activeHours email emailVerified username suspended').lean(),
    recentPushes(ids, now),
  ])
  const byId = new Map(people.map(p => [String(p._id), p]))
  const mailer = require('./mailer')
  let due = false
  for (const f of filed) {
    const p = byId.get(String(f.user))
    if (!p || p.suspended) continue
    const prefs = engine.prefsOf(p.notifyPrefs)
    const plan = engine.decide({
      kind: doc.kind, priority: doc.priority, now, tz: p.tz, prefs, stats: p.notifyStats, hours: p.activeHours,
      // a merged item's own earlier push isn't "another" push — it gets replaced
      recent: (recent.get(String(f.user)) || []).filter(r => r.nid !== String(f.n._id)).map(r => r.at), rand: opts.rand,
    })
    const nid = String(f.n._id)
    // A merged item replaces its earlier push that hasn't gone out yet (re-planned below, or dropped)
    if (f.collapsed) await Delivery.deleteMany({ notification: f.n._id, user: f.user, channel: 'push', status: 'pending' })
    if (plan.push) {
      const payload = { title: f.n.title, body: f.n.body, url: withRef(f.n.url, nid), icon: f.n.image || undefined, tag: f.n.tag || doc.kind, nid }
      await Delivery.create({
        user: f.user, notification: f.n._id, channel: 'push', kind: doc.kind, priority: doc.priority, payload, sendAt: plan.at,
        key: `push:${nid}:${f.user}:${f.collapsed ? f.n.count : 1}`,
      }).catch(e => { if (e.code !== 11000) throw e })
      if (plan.at.getTime() <= Date.now() + 5000) due = true
    }
    const wantsEmail = msg.email === false ? false : doc.kind === 'security' ? prefs.email.security : msg.email === true
    if (wantsEmail && p.email && p.emailVerified !== false) {
      const base = mailer.appUrl()
      await Delivery.create({
        user: f.user, notification: f.n._id, channel: 'email', kind: doc.kind, priority: doc.priority, sendAt: now,
        payload: { template: doc.kind === 'security' ? 'security' : 'digest', to: p.email,
          data: doc.kind === 'security'
            ? { title: doc.title, body: doc.body, when: msg.when, link: base ? `${base}${doc.url}` : '' }
            : { name: p.username, items: [{ title: doc.title, body: doc.body, link: base ? `${base}${doc.url}` : '' }], link: base } },
        key: `email:${nid}:${f.user}`,
      }).catch(e => { if (e.code !== 11000) throw e })
      due = true
    }
  }
  if (due) { try { require('../services/notifyWorker').kick() } catch { /* worker not running (tests, scripts) */ } }
  return filed.length
}

module.exports = { notify, _test: { clean, withRef, fileFor } }
