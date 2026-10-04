// controllers/kidsControlsController.js — screen time, bedtime, allowed/blocked titles for kids profiles
const bcrypt   = require('bcryptjs')
const mongoose = require('mongoose')
const Profile  = require('../models/Profile')

const DAY_RE  = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const KEY_RE  = /^(movie|tv):\d{1,9}$/

async function ownProfile(req, select = '') {
  if (!mongoose.isValidObjectId(req.params.id)) return null
  return Profile.findOne({ _id: req.params.id, user: req.user._id }).select(select)
}

const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
/** Is "now" (HH:MM, the device's local time) inside the bedtime window? Handles windows past midnight. */
function inBedtime(now, start, end) {
  if (!start || !end || !TIME_RE.test(now)) return false
  const n = toMin(now), s = toMin(start), e = toMin(end)
  return s <= e ? n >= s && n < e : n >= s || n < e
}

function status(profile, day, time) {
  const c = profile.kidsControls || {}
  const used = (profile.usage || []).find(u => u.day === day)?.minutes || 0
  const limit = c.dailyLimitMin || 0
  const minutesLeft = limit ? Math.max(0, limit - used) : null
  let reason = null
  if (inBedtime(time, c.bedtimeStart, c.bedtimeEnd)) reason = 'bedtime'
  else if (limit && used >= limit) reason = 'limit'
  return {
    allowed: !reason, reason, usedToday: used, minutesLeft,
    dailyLimitMin: limit, bedtimeStart: c.bedtimeStart || '', bedtimeEnd: c.bedtimeEnd || '',
    // So the kids home can hide blocked titles / show only allowed ones
    blockedTitles: profile.blockedTitles || [],
    allowedOnly: !!c.allowedOnly, allowedTitles: c.allowedOnly ? c.allowedTitles || [] : [],
  }
}

// GET /api/profiles/:id/kids-status?day=YYYY-MM-DD&time=HH:MM (the device's local date/time)
exports.kidsStatus = async (req, res) => {
  const p = await ownProfile(req, 'isKids kidsControls usage blockedTitles')
  if (!p) return res.status(404).json({ message: 'Profile not found' })
  if (!p.isKids) return res.json({ allowed: true, reason: null })
  const day = DAY_RE.test(req.query.day) ? req.query.day : new Date().toISOString().slice(0, 10)
  res.json(status(p, day, String(req.query.time || '')))
}

// POST /api/profiles/:id/usage { day, time, minutes } — the kids app reports watch time each minute
exports.addUsage = async (req, res) => {
  const p = await ownProfile(req, 'isKids kidsControls usage blockedTitles')
  if (!p) return res.status(404).json({ message: 'Profile not found' })
  if (!p.isKids) return res.json({ allowed: true })
  const day = DAY_RE.test(req.body.day) ? req.body.day : new Date().toISOString().slice(0, 10)
  const minutes = Math.min(5, Math.max(0, Number(req.body.minutes) || 1))
  const entry = p.usage.find(u => u.day === day)
  if (entry) entry.minutes += minutes
  else p.usage.push({ day, minutes })
  p.usage = p.usage.sort((a, b) => (a.day < b.day ? 1 : -1)).slice(0, 30)
  await p.save()
  res.json(status(p, day, String(req.body.time || '')))
}

// GET /api/profiles/:id/kids-check?type=movie&tmdbId=123 — may this kids profile open this title?
exports.kidsCheck = async (req, res) => {
  const p = await ownProfile(req, 'isKids kidsControls blockedTitles')
  if (!p) return res.status(404).json({ message: 'Profile not found' })
  const key = `${req.query.type === 'tv' ? 'tv' : 'movie'}:${Number(req.query.tmdbId) || 0}`
  if ((p.blockedTitles || []).includes(key)) return res.json({ allowed: false, reason: 'blocked' })
  if (p.isKids && p.kidsControls?.allowedOnly && !(p.kidsControls.allowedTitles || []).includes(key)) {
    return res.json({ allowed: false, reason: 'not-allowed' })
  }
  res.json({ allowed: true })
}

/**
 * Changing controls needs a grown-up: if any adult profile on the account has a PIN,
 * one of those PINs must be given.
 */
async function parentOk(req) {
  return parentPinOk(req.user._id, req.body?.parentPin || req.query?.parentPin)
}

async function parentPinOk(userId, given) {
  const adults = await Profile.find({ user: userId, isKids: false, pin: { $ne: null } }).select('+pin').lean()
  if (!adults.length) return true
  const pin = String(given || '')
  if (!/^\d{4}$/.test(pin)) return false
  for (const a of adults) if (a.pin && (a.pin.startsWith('$2') ? await bcrypt.compare(pin, a.pin) : a.pin === pin)) return true
  return false
}

// GET /api/profiles/:id/kids-controls → settings + 7-day report (needs a parent PIN when one exists)
exports.getControls = async (req, res) => {
  const p = await ownProfile(req, 'name isKids kidsControls blockedTitles usage watchHistory')
  if (!p) return res.status(404).json({ message: 'Profile not found' })
  if (!p.isKids) return res.status(400).json({ message: 'Parental controls are for kids profiles' })
  if (!(await parentOk(req))) return res.status(403).json({ message: 'Enter a parent profile PIN', needsPin: true })

  const days = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
    days.push({ day: d, minutes: p.usage.find(u => u.day === d)?.minutes || 0 })
  }
  res.json({
    controls: {
      dailyLimitMin: p.kidsControls?.dailyLimitMin || 0,
      bedtimeStart: p.kidsControls?.bedtimeStart || '', bedtimeEnd: p.kidsControls?.bedtimeEnd || '',
      allowedOnly: !!p.kidsControls?.allowedOnly, allowedTitles: p.kidsControls?.allowedTitles || [],
      blockedTitles: p.blockedTitles || [],
    },
    report: {
      days,
      recent: (p.watchHistory || []).slice(0, 25).map(h => ({ tmdbId: h.tmdbId, title: h.title, type: h.type, progress: h.progress, completed: h.completed, watchedAt: h.watchedAt })),
    },
  })
}

// PUT /api/profiles/:id/kids-controls { parentPin, dailyLimitMin, bedtimeStart, bedtimeEnd, allowedOnly, allowedTitles, blockedTitles }
exports.updateControls = async (req, res) => {
  const p = await ownProfile(req, 'isKids kidsControls blockedTitles')
  if (!p) return res.status(404).json({ message: 'Profile not found' })
  if (!p.isKids) return res.status(400).json({ message: 'Parental controls are for kids profiles' })
  if (!(await parentOk(req))) return res.status(403).json({ message: 'Incorrect parent PIN', needsPin: true })

  const b = req.body
  const c = p.kidsControls || {}
  if (b.dailyLimitMin !== undefined) c.dailyLimitMin = Math.min(1440, Math.max(0, Math.round(Number(b.dailyLimitMin) || 0)))
  for (const k of ['bedtimeStart', 'bedtimeEnd']) {
    if (b[k] !== undefined) {
      if (b[k] !== '' && !TIME_RE.test(b[k])) return res.status(400).json({ message: 'Bedtime must look like 20:30' })
      c[k] = b[k]
    }
  }
  if ((c.bedtimeStart && !c.bedtimeEnd) || (!c.bedtimeStart && c.bedtimeEnd)) return res.status(400).json({ message: 'Set both bedtime start and end, or neither' })
  if (typeof b.allowedOnly === 'boolean') c.allowedOnly = b.allowedOnly
  const keys = v => [...new Set((Array.isArray(v) ? v : []).map(String).filter(k => KEY_RE.test(k)))].slice(0, 500)
  if (b.allowedTitles !== undefined) c.allowedTitles = keys(b.allowedTitles)
  if (b.blockedTitles !== undefined) p.blockedTitles = keys(b.blockedTitles)
  p.kidsControls = c
  await p.save()
  res.json({ ok: true })
}

module.exports._test = { inBedtime }
module.exports.parentPinOk = parentPinOk
