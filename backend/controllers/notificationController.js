// controllers/notificationController.js — push notification sign-up + sending
const PushSubscription = require('../models/PushSubscription')
const webPush = require('../utils/webPush')
const { log } = require('../utils/auditLogger')

// GET /api/notifications/vapid → the key browsers need to subscribe
exports.vapid = async (_req, res) => {
  const { publicKey } = await webPush.getVapid()
  res.json({ publicKey })
}

const cleanTopics = (t = {}) => {
  const out = {}
  for (const k of ['newEpisodes', 'library', 'weekly']) if (typeof t[k] === 'boolean') out[k] = t[k]
  return out
}

// POST /api/notifications/subscribe { subscription: { endpoint, keys }, topics }
exports.subscribe = async (req, res) => {
  const sub = req.body.subscription || {}
  let url
  try { url = new URL(String(sub.endpoint)) } catch { return res.status(400).json({ message: 'Invalid subscription' }) }
  if (!webPush.isPushService(url.toString()) || !sub.keys?.p256dh || !sub.keys?.auth) return res.status(400).json({ message: 'Invalid subscription' })
  // A user can't have an unlimited number of devices
  if (await PushSubscription.countDocuments({ user: req.user._id }) >= 20 && !(await PushSubscription.exists({ endpoint: url.toString() }))) {
    return res.status(400).json({ message: 'Too many devices — turn notifications off on an old device first' })
  }
  const doc = await PushSubscription.findOneAndUpdate(
    { endpoint: url.toString() },
    {
      user: req.user._id, endpoint: url.toString(),
      keys: { p256dh: String(sub.keys.p256dh).slice(0, 200), auth: String(sub.keys.auth).slice(0, 100) },
      userAgent: String(req.headers['user-agent'] || '').slice(0, 200), failures: 0,
      ...Object.fromEntries(Object.entries(cleanTopics(req.body.topics)).map(([k, v]) => [`topics.${k}`, v])),
    },
    { upsert: true, new: true },
  )
  res.json({ topics: doc.topics })
}

// GET /api/notifications/subscription?endpoint= → this browser's topics
exports.status = async (req, res) => {
  const doc = await PushSubscription.findOne({ user: req.user._id, endpoint: String(req.query.endpoint || '') }).lean()
  res.json({ subscribed: !!doc, topics: doc?.topics || null })
}

// PUT /api/notifications/subscription { endpoint, topics }
exports.updateTopics = async (req, res) => {
  const set = Object.fromEntries(Object.entries(cleanTopics(req.body.topics)).map(([k, v]) => [`topics.${k}`, v]))
  const doc = await PushSubscription.findOneAndUpdate({ user: req.user._id, endpoint: String(req.body.endpoint || '') }, { $set: set }, { new: true })
  if (!doc) return res.status(404).json({ message: 'Not subscribed' })
  res.json({ topics: doc.topics })
}

// DELETE /api/notifications/subscribe { endpoint }
exports.unsubscribe = async (req, res) => {
  await PushSubscription.deleteOne({ user: req.user._id, endpoint: String(req.body.endpoint || '') })
  res.json({ ok: true })
}

// POST /api/notifications/test
exports.test = async (req, res) => {
  const sent = await webPush.sendToUsers([req.user._id], {
    title: 'Notifications are on 🎬', body: "We'll tell you when new episodes and videos arrive.", url: '/', tag: 'test',
  })
  res.json({ sent })
}

// POST /api/admin/notify { title, body, url } — admin broadcast to everyone subscribed
exports.broadcast = async (req, res) => {
  const title = String(req.body.title || '').trim().slice(0, 80)
  const body = String(req.body.body || '').trim().slice(0, 200)
  const url = String(req.body.url || '/').trim()
  if (!title) return res.status(400).json({ message: 'Title is required' })
  if (!url.startsWith('/') || url.startsWith('//')) return res.status(400).json({ message: 'Link must be a page on this site, e.g. /movie/653' })
  const sent = await require('../utils/notify').notify(null, { kind: 'announcement', title, body, url, tag: 'announcement' })
  log('ADMIN_PUSH_BROADCAST', req, { severity: 'warn', details: { title, sent } })
  res.json({ sent })
}
