// controllers/reportController.js — viewers report broken videos; admins work through the list
const mongoose = require('mongoose')
const Report = require('../models/Report')
const { REASONS } = require('../models/Report')

const str = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n) : '')

// POST /api/reports { type, tmdbId, season, episode, title, source, reason, note }
exports.create = async (req, res) => {
  const type = req.body.type === 'tv' ? 'tv' : 'movie'
  const tmdbId = Number(req.body.tmdbId)
  const reason = REASONS.includes(req.body.reason) ? req.body.reason : null
  if (!Number.isInteger(tmdbId) || tmdbId <= 0 || !reason) return res.status(400).json({ message: 'Pick what went wrong' })
  const season = type === 'tv' ? Math.max(0, Math.round(Number(req.body.season) || 0)) : null
  const episode = type === 'tv' ? Math.max(0, Math.round(Number(req.body.episode) || 0)) : null

  // Keep it reasonable: 20 reports per person per day
  const since = new Date(Date.now() - 86400000)
  if (await Report.countDocuments({ user: req.user._id, createdAt: { $gte: since } }) >= 20) {
    return res.status(429).json({ message: "Thanks — you've sent a lot of reports today. Try again tomorrow." })
  }

  // "Won't play" / "keeps buffering" on an embed provider counts against it in the source ranking
  if (['not-playing', 'buffering', 'wrong-video'].includes(reason)) {
    const sources = require('../services/sourceTracker')
    const id = sources.idForLabel(req.body.source)
    if (id) sources.record(id, type, false).catch(() => {})
  }

  // Same open problem for the same video → bump the existing report instead of duplicating it
  const existing = await Report.findOne({ status: 'open', type, tmdbId, season, episode, reason, source: str(req.body.source, 60) })
  if (existing) {
    existing.count += 1
    if (req.body.note) existing.note = str(req.body.note, 500)
    await existing.save()
    return res.status(201).json({ ok: true })
  }
  await Report.create({
    user: req.user._id, username: req.user.username, type, tmdbId, season, episode,
    title: str(req.body.title, 200), source: str(req.body.source, 60), reason, note: str(req.body.note, 500),
  })
  res.status(201).json({ ok: true })
}

// GET /api/admin/reports?status=open
exports.adminList = async (req, res) => {
  const status = req.query.status === 'resolved' ? 'resolved' : 'open'
  const [items, open] = await Promise.all([
    Report.find({ status }).sort({ updatedAt: -1 }).limit(200).lean(),
    Report.countDocuments({ status: 'open' }),
  ])
  res.json({ items, open })
}

// PUT /api/admin/reports/:id { status }
exports.setStatus = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Not found' })
  const status = req.body.status === 'open' ? 'open' : 'resolved'
  const doc = await Report.findByIdAndUpdate(req.params.id, { status }, { new: true })
  if (!doc) return res.status(404).json({ message: 'Not found' })
  res.json(doc)
}

// DELETE /api/admin/reports/:id
exports.remove = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Not found' })
  await Report.findByIdAndDelete(req.params.id)
  res.json({ ok: true })
}
