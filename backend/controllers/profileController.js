// backend/controllers/profileController.js
const bcrypt   = require('bcryptjs')
const mongoose = require('mongoose')
const Profile  = require('../models/Profile')
const { cachedTmdb } = require('../config/tmdb')
const { saveDataUrl, removeStored, cleanConfig } = require('../utils/avatarStore')

const PIN_RE = /^\d{4}$/
const isHash = (s) => typeof s === 'string' && s.startsWith('$2')
const { parentPinOk } = require('./kidsControlsController')

/** Checks a profile's PIN (bcrypt, or a legacy plain one) */
async function pinMatches(profile, given) {
  const pin = String(given || '')
  if (!PIN_RE.test(pin) || !profile.pin) return false
  return isHash(profile.pin) ? bcrypt.compare(pin, profile.pin) : pin === profile.pin
}

// Strip the PIN hash + history before sending a profile to the browser
function toClient(p) {
  const o = typeof p.toObject === 'function' ? p.toObject() : { ...p }
  o.hasPin = !!o.pin
  delete o.pin
  delete o.watchHistory
  return o
}

async function findOwn(req, extraSelect = '') {
  if (!mongoose.isValidObjectId(req.params.id)) return null
  return Profile.findOne({ _id: req.params.id, user: req.user._id }).select(extraSelect)
}

// GET /api/profiles
const getProfiles = async (req, res) => {
  try {
    const profiles = await Profile.find({ user: req.user._id })
      .select('+pin -watchHistory')
      .sort({ createdAt: 1 })
      .lean()
    res.json(profiles.map(toClient))
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
}

// POST /api/profiles
const createProfile = async (req, res) => {
  try {
    const count = await Profile.countDocuments({ user: req.user._id })
    const { maxProfiles } = await require('../utils/settings').limits()
    if (count >= maxProfiles) return res.status(400).json({ message: `Maximum ${maxProfiles} profiles per account` })

    const { name, avatar, color, isKids = false, pin } = req.body
    if (!name?.trim()) return res.status(400).json({ message: 'Profile name is required' })
    const kids = Boolean(isKids)

    if (!kids && pin) {
      if (!PIN_RE.test(String(pin))) return res.status(400).json({ message: 'PIN must be exactly 4 digits' })
    }

    const profile = await Profile.create({
      user: req.user._id,
      name: String(name).trim(),
      ...(avatar ? { avatar } : {}),
      ...(color  ? { color }  : {}),
      avatarConfig: cleanConfig(req.body.avatarConfig),
      isKids: kids,
      maturityLevel: kids ? 'kids' : 'all',
      pin: !kids && pin ? await bcrypt.hash(String(pin), 10) : null,
    })

    res.status(201).json(toClient(profile))
  } catch (e) {
    const status = e.name === 'ValidationError' ? 400 : 500
    res.status(status).json({ message: e.message })
  }
}

// PUT /api/profiles/:id
// pin: undefined → unchanged, null/'' → removed, '1234' → set
const updateProfile = async (req, res) => {
  try {
    const profile = await findOwn(req, '+pin')
    if (!profile) return res.status(404).json({ message: 'Profile not found' })

    const { name, avatar, color, isKids, pin } = req.body

    // Sensitive changes need a PIN: the profile's own PIN to change/remove it or make it a kids
    // profile, and a parent PIN to turn a kids profile into a grown-up one
    const pinChange = pin !== undefined && !profile.isKids
    const kidsChange = isKids !== undefined && Boolean(isKids) !== profile.isKids
    if ((pinChange || kidsChange) && profile.pin && !(await pinMatches(profile, req.body.currentPin))) {
      return res.status(403).json({ message: "Enter this profile's current PIN", needsPin: 'profile' })
    }
    if (kidsChange && profile.isKids && !(await parentPinOk(req.user._id, req.body.parentPin))) {
      return res.status(403).json({ message: 'Enter a parent profile PIN', needsPin: 'parent' })
    }

    // Viewing preferences. Allowing more mature titles needs a parent PIN (when one exists)
    if (req.body.prefs && typeof req.body.prefs === 'object') {
      const p = req.body.prefs
      const ORDER = ['7', '13', '16', 'all']
      if (typeof p.maturity === 'string' && ORDER.includes(p.maturity) && p.maturity !== (profile.prefs?.maturity || 'all')) {
        const loosening = ORDER.indexOf(p.maturity) > ORDER.indexOf(profile.prefs?.maturity || 'all')
        if (loosening && !(await parentPinOk(req.user._id, req.body.parentPin))) {
          return res.status(403).json({ message: 'Enter a parent profile PIN', needsPin: 'parent' })
        }
        profile.prefs.maturity = p.maturity
      }
      if (typeof p.autoplayNext === 'boolean') profile.prefs.autoplayNext = p.autoplayNext
      if (typeof p.autoplayPreviews === 'boolean') profile.prefs.autoplayPreviews = p.autoplayPreviews
      if (typeof p.subtitleLang === 'string' && /^[a-z]{0,3}$/.test(p.subtitleLang)) profile.prefs.subtitleLang = p.subtitleLang
      if (['auto', 'saver', 'high'].includes(p.quality)) profile.prefs.quality = p.quality
    }

    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ message: 'Profile name is required' })
      profile.name = String(name).trim()
    }
    if (avatar !== undefined) profile.avatar = avatar
    if (color  !== undefined) profile.color  = color
    if (req.body.theme !== undefined && ['scarlet', 'ocean', 'violet', 'emerald', 'sunset', 'rose'].includes(req.body.theme)) profile.theme = req.body.theme
    if (req.body.avatarConfig !== undefined) {
      profile.avatarConfig = cleanConfig(req.body.avatarConfig)
      profile.markModified('avatarConfig')
    }
    if (req.body.clearImage === true && profile.avatarImage) {
      removeStored(profile.avatarImage)
      profile.avatarImage = ''
    }
    if (isKids !== undefined) {
      profile.isKids = Boolean(isKids)
      profile.maturityLevel = profile.isKids ? 'kids' : 'all'
      if (profile.isKids) profile.pin = null
    }
    if (pin !== undefined && !profile.isKids) {
      if (pin === null || pin === '') {
        profile.pin = null
      } else if (PIN_RE.test(String(pin))) {
        profile.pin = await bcrypt.hash(String(pin), 10)
      } else {
        return res.status(400).json({ message: 'PIN must be exactly 4 digits' })
      }
    }

    await profile.save()
    res.json(toClient(profile))
  } catch (e) {
    const status = e.name === 'ValidationError' ? 400 : 500
    res.status(status).json({ message: e.message })
  }
}

// DELETE /api/profiles/:id
const deleteProfile = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Profile not found' })
    const target = await Profile.findOne({ _id: req.params.id, user: req.user._id }).select('+pin')
    if (!target) return res.status(404).json({ message: 'Profile not found' })
    // Deleting needs the profile's own PIN, or a parent PIN for a kids profile
    if (target.pin && !(await pinMatches(target, req.body?.currentPin))) {
      return res.status(403).json({ message: "Enter this profile's PIN to delete it", needsPin: 'profile' })
    }
    if (target.isKids && !(await parentPinOk(req.user._id, req.body?.parentPin))) {
      return res.status(403).json({ message: 'Enter a parent profile PIN', needsPin: 'parent' })
    }
    const result = await Profile.findOneAndDelete({ _id: target._id, user: req.user._id })
    if (!result) return res.status(404).json({ message: 'Profile not found' })
    removeStored(result.avatarImage)
    require('../models/EpisodeProgress').deleteMany({ profile: result._id }).catch(() => {})
    res.json({ message: 'Profile deleted' })
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
}

// POST /api/profiles/:id/watch
const recordWatch = async (req, res) => {
  try {
    const profile = await findOwn(req)
    if (!profile) return res.status(404).json({ message: 'Profile not found' })

    const { tmdbId, title, type, genres = [], language = 'en', progress = 0, completed = false } = req.body
    if (!Number.isFinite(Number(tmdbId))) return res.status(400).json({ message: 'tmdbId required' })

    const prev = profile.watchHistory.find(h => h.tmdbId === Number(tmdbId))
    const hour = Number(req.body.hour)
    profile.watchHistory = profile.watchHistory.filter(h => h.tmdbId !== Number(tmdbId))
    profile.watchHistory.unshift({
      tmdbId: Number(tmdbId),
      title: String(title || prev?.title || '').slice(0, 300),
      type: ['movie', 'tv', 'anime'].includes(type) ? type : prev?.type || 'movie',
      genres: (Array.isArray(genres) ? genres : []).map(Number).filter(Number.isFinite).slice(0, 10),
      language: String(language).slice(0, 8),
      // Never go backwards (rewatching the opening shouldn't erase "finished")
      progress: Math.max(prev?.progress || 0, Math.min(Math.max(Number(progress) || 0, 0), 100)),
      completed: Boolean(completed) || !!prev?.completed,
      watchedAt: new Date(),
      watchSeconds: (prev?.watchSeconds || 0) + Math.min(Math.max(Number(req.body.seconds) || 0, 0), 4 * 3600),
      hour: Number.isInteger(hour) && hour >= 0 && hour < 24 ? hour : prev?.hour ?? null,
    })
    profile.watchHistory = profile.watchHistory.slice(0, 300)
    require('./discoveryController').noteActivity(profile._id, `${type === 'tv' || type === 'anime' ? 'tv' : 'movie'}:${Number(tmdbId)}`)

    await profile.save()
    require('./recommendController').invalidate(profile._id)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
}

const KIDS_MOVIE_FILTER = { certification_country: 'US', 'certification.lte': 'PG', include_adult: false }

// GET /api/profiles/:id/kids-content
const getKidSafeContent = async (req, res) => {
  try {
    const profile = await findOwn(req)
    if (!profile || !profile.isKids) return res.status(403).json({ message: 'Access only for kids profiles' })

    const [family, animation] = await Promise.all([
      cachedTmdb('/discover/movie', { ...KIDS_MOVIE_FILTER, with_genres: '10751', sort_by: 'popularity.desc' }),
      cachedTmdb('/discover/movie', { ...KIDS_MOVIE_FILTER, with_genres: '16', sort_by: 'popularity.desc' }),
    ])
    res.json({
      success: true,
      rows: [
        { title: 'Popular for Kids',     items: (family.results    || []).slice(0, 20) },
        { title: 'Cartoons & Animation', items: (animation.results || []).slice(0, 20) },
      ],
    })
  } catch (e) {
    console.error('[KidSafe] Error:', e.message)
    res.status(500).json({ success: false, message: 'Failed to load kids content' })
  }
}

// GET /api/profiles/:id/recommendations → { sections: [{ title, items }] }
// ── Viewing activity & "Not for me" ─────────────────────────────────────────
const KEY_RE = /^(movie|tv):\d{1,9}$/

// GET /api/profiles/:id/history → the profile's viewing activity
const getHistory = async (req, res) => {
  const p = await findOwn(req, 'watchHistory hiddenTitles')
  if (!p) return res.status(404).json({ message: 'Profile not found' })
  res.json({
    history: (p.watchHistory || []).map(h => ({ tmdbId: h.tmdbId, title: h.title, type: h.type, progress: h.progress, completed: h.completed, watchedAt: h.watchedAt })),
    hidden: p.hiddenTitles || [],
  })
}

// DELETE /api/profiles/:id/history/:tmdbId  (or "all") — also stops it shaping recommendations
const removeHistory = async (req, res) => {
  const p = await findOwn(req, 'watchHistory')
  if (!p) return res.status(404).json({ message: 'Profile not found' })
  if (req.params.tmdbId === 'all') p.watchHistory = []
  else {
    const id = Number(req.params.tmdbId)
    if (!Number.isInteger(id)) return res.status(400).json({ message: 'Invalid id' })
    p.watchHistory = p.watchHistory.filter(h => h.tmdbId !== id)
  }
  await p.save()
  require('./recommendController').invalidate(p._id)
  res.json({ ok: true })
}

// PUT /api/profiles/:id/hidden { key: "movie:123", hidden: true }
const setHidden = async (req, res) => {
  const p = await findOwn(req, 'hiddenTitles')
  if (!p) return res.status(404).json({ message: 'Profile not found' })
  const key = String(req.body.key || '')
  if (!KEY_RE.test(key)) return res.status(400).json({ message: 'Invalid title' })
  const set = new Set(p.hiddenTitles || [])
  if (req.body.hidden === false) set.delete(key); else set.add(key)
  p.hiddenTitles = [...set].slice(-2000)
  await p.save()
  require('./recommendController').invalidate(p._id)
  res.json({ hiddenTitles: p.hiddenTitles })
}

// POST /api/profiles/parent-pin { pin } → is this a grown-up's PIN? (unlocks a restricted title)
const checkParentPin = async (req, res) => {
  const adults = await Profile.countDocuments({ user: req.user._id, isKids: false, pin: { $ne: null } })
  if (!adults) return res.json({ ok: true, noPin: true })
  if (!(await parentPinOk(req.user._id, req.body.pin))) return res.status(403).json({ message: 'Wrong PIN' })
  res.json({ ok: true })
}

// POST /api/profiles/:id/verify-pin { pin }
const verifyPin = async (req, res) => {
  try {
    const profile = await findOwn(req, '+pin')
    if (!profile) return res.status(404).json({ message: 'Profile not found' })
    if (profile.isKids || !profile.pin) return res.json({ success: true })

    const pin = String(req.body.pin || '')
    let ok = false
    if (isHash(profile.pin)) {
      ok = await bcrypt.compare(pin, profile.pin)
    } else {
      // Legacy plain-text PIN — compare, then upgrade to a hash
      ok = pin === profile.pin
      if (ok) { profile.pin = await bcrypt.hash(pin, 10); await profile.save() }
    }

    if (!ok) return res.status(401).json({ message: 'Incorrect PIN' })
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
}

// PUT /api/profiles/:id/avatar { image: "data:image/webp;base64,..." }
const uploadAvatar = async (req, res) => {
  try {
    const profile = await findOwn(req)
    if (!profile) return res.status(404).json({ message: 'Profile not found' })
    const url = saveDataUrl(req.body.image)
    removeStored(profile.avatarImage)
    profile.avatarImage = url
    await profile.save()
    res.json(toClient(profile))
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message })
  }
}

// DELETE /api/profiles/:id/avatar — back to the built avatar / emoji
const deleteAvatar = async (req, res) => {
  try {
    const profile = await findOwn(req)
    if (!profile) return res.status(404).json({ message: 'Profile not found' })
    removeStored(profile.avatarImage)
    profile.avatarImage = ''
    await profile.save()
    res.json(toClient(profile))
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
}

module.exports = {
  uploadAvatar, deleteAvatar,
  getProfiles, createProfile, updateProfile, deleteProfile,
  recordWatch, getKidSafeContent, verifyPin, getHistory, removeHistory, setHidden, checkParentPin,
}
