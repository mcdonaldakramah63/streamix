// services/notifyWorker.js — sends what the outbox (models/Delivery) says is due.
//
//  • Claims work atomically with a 2-minute lease (findOneAndUpdate), so a crash mid-send just means the lease
//    runs out and it's picked up again — and two server processes never send the same push.
//  • Pushes that come due together for one person go out as ONE push ("3 updates from Streamix").
//  • A held-back push is dropped if the person already opened that notification in the app meanwhile.
//  • Failures retry with backoff (30 s, 2 min, 8 min, 30 min); after 5 tries it's marked failed.
//  • Every push sent is counted per kind, so utils/notifyEngine learns what each person opens.
const mongoose = require('mongoose')
const Delivery = require('../models/Delivery')
const engine = require('../utils/notifyEngine')

const LEASE = 2 * 60_000
const MAX_ATTEMPTS = 5
const MERGE_WINDOW = 2 * 60_000
let timer = null, running = false, again = false

/** Claim the next due delivery (or one whose sender died) */
function claim(now) {
  return Delivery.findOneAndUpdate(
    { $or: [{ status: 'pending', sendAt: { $lte: now } }, { status: 'sending', leaseUntil: { $lt: now } }] },
    { $set: { status: 'sending', leaseUntil: new Date(now.getTime() + LEASE) }, $inc: { attempts: 1 } },
    { sort: { sendAt: 1 }, new: true },
  ).lean()
}

async function finish(ids, status, result, at = new Date()) {
  await Delivery.updateMany({ _id: { $in: ids } }, { $set: { status, result: String(result).slice(0, 200), sentAt: status === 'sent' ? at : null, leaseUntil: null } })
}

async function retryLater(d, err) {
  if (d.attempts >= MAX_ATTEMPTS) return finish([d._id], 'failed', err?.message || err)
  await Delivery.updateOne({ _id: d._id }, { $set: { status: 'pending', sendAt: new Date(Date.now() + engine.backoff(d.attempts)), leaseUntil: null, result: String(err?.message || err).slice(0, 200) } })
}

async function countSent(userId, kinds) {
  const inc = {}
  for (const k of kinds) inc[`notifyStats.${k}.sent`] = (inc[`notifyStats.${k}.sent`] || 0) + 1
  await require('../models/User').updateOne({ _id: userId }, { $inc: inc }).catch(() => {})
}

async function sendPush(d) {
  const Notification = require('../models/Notification')
  const now = new Date()
  // Others for the same person due now (or within a couple of minutes) ride along in one push
  const extra = d.priority === 'critical' ? [] : await Delivery.find({
    _id: { $ne: d._id }, user: d.user, channel: 'push', status: 'pending', priority: { $ne: 'critical' },
    sendAt: { $lte: new Date(now.getTime() + MERGE_WINDOW) },
  }).sort({ sendAt: 1 }).limit(20).lean()
  let group = [d]
  if (extra.length) {
    const r = await Delivery.updateMany({ _id: { $in: extra.map(e => e._id) }, status: 'pending' },
      { $set: { status: 'sending', leaseUntil: new Date(now.getTime() + LEASE) } })
    if (r.modifiedCount) group = [d, ...await Delivery.find({ _id: { $in: extra.map(e => e._id) }, status: 'sending' }).lean()]
  }
  // Already opened in the app while it waited? Then it's not news any more.
  const opened = new Set((await Notification.find({ _id: { $in: group.map(g => g.notification).filter(Boolean) }, openedAt: { $ne: null } }).select('_id').lean()).map(n => String(n._id)))
  const stale = group.filter(g => g.notification && opened.has(String(g.notification)) && g.priority !== 'critical')
  if (stale.length) await finish(stale.map(s => s._id), 'dropped', 'already opened')
  group = group.filter(g => !stale.includes(g))
  if (!group.length) return

  // Use the notification as it is NOW (a merged item may have become "3 new episodes" since this was queued)
  const current = new Map((await Notification.find({ _id: { $in: group.map(g => g.notification).filter(Boolean) } }).select('title body').lean()).map(n => [String(n._id), n]))
  for (const g of group) {
    const n = current.get(String(g.notification))
    if (n) g.payload = { ...g.payload, title: n.title, body: n.body }
  }
  const payload = engine.digestOf(group.map(g => g.payload))
  // Phones running the Android app hear it on their live connection; browsers through Web Push.
  // One timestamp for both, so the app's catch-up check recognises a push it already showed.
  const at = new Date()
  try {
    const item = { _id: group[0].payload.nid || `live-${at.getTime()}`, kind: group.length > 1 ? 'digest' : group[0].kind, title: payload.title, body: payload.body,
      url: payload.url, image: payload.icon || '', createdAt: at.toISOString(), unread: true }
    require('../websocket').pushNotification([d.user], item)
  } catch { /* no socket server */ }
  const topic = { episode: 'newEpisodes', reminder: 'newEpisodes', library: 'library', weekly: 'weekly' }[group[0].kind]
  const sent = await require('../utils/webPush').sendToUsers([d.user], payload, group.length > 1 ? undefined : topic)
  await finish(group.map(g => g._id), 'sent', group.length > 1 ? `digest of ${group.length} · ${sent} device(s)` : `${sent} device(s)`, at)
  // Remember exactly what went out once, so the Android app's catch-up check shows the same single push
  await Delivery.updateOne({ _id: group[0]._id }, { $set: { sent: { ...payload, kind: group.length > 1 ? 'digest' : group[0].kind, nid: group[0].payload.nid } } })
  if (group.length > 1) await Delivery.updateMany({ _id: { $in: group.slice(1).map(g => g._id) } }, { $set: { merged: true } })
  await countSent(d.user, group.map(g => g.kind))
}

async function sendEmail(d) {
  const p = d.payload || {}
  const r = await require('../utils/mailer').sendTemplate(p.template, p.to, p.data, 1)
  if (r.ok) return finish([d._id], 'sent', r.dev ? 'printed to log (no SMTP)' : 'emailed')
  if (r.permanent) return finish([d._id], 'failed', r.error)
  throw new Error(r.error)
}

async function tick() {
  if (running) { again = true; return }
  if (mongoose.connection.readyState !== 1) return
  running = true
  try {
    for (let i = 0; i < 200; i++) {
      const d = await claim(new Date())
      if (!d) break
      try {
        if (d.channel === 'push') await sendPush(d)
        else await sendEmail(d)
      } catch (e) {
        console.warn(`[notify] ${d.channel} delivery failed (try ${d.attempts}):`, e.message)
        await retryLater(d, e).catch(() => {})
      }
    }
  } catch (e) {
    console.warn('[notify] worker:', e.message)
  } finally {
    running = false
    if (again) { again = false; setImmediate(tick) }
  }
}

/** Something is due right now — don't wait for the next tick */
function kick() { setImmediate(() => tick().catch(() => {})) }

function start() {
  if (timer) return
  timer = setInterval(() => tick().catch(() => {}), 20_000)
  timer.unref()
  setTimeout(kick, 5_000).unref()
}

module.exports = { start, kick, tick, _test: { claim } }
