// controllers/collectionController.js — curated collections
const mongoose = require('mongoose')
const Collection = require('../models/Collection')
const LibraryItem = require('../models/LibraryItem')
const { cachedTmdb } = require('../config/tmdb')

const str = (v, n) => String(v ?? '').trim().slice(0, n)

/** Looks items up so the stored title/poster are real (never trusts the browser's copy) */
async function resolveItems(list) {
  const out = []
  for (const raw of (Array.isArray(list) ? list : []).slice(0, 100)) {
    const kind = ['movie', 'tv', 'library'].includes(raw?.kind) ? raw.kind : null
    if (!kind) continue
    if (kind === 'library') {
      if (!mongoose.isValidObjectId(raw.id)) continue
      const d = await LibraryItem.findById(raw.id).select('title year poster').lean()
      if (d) out.push({ kind, id: String(d._id), title: d.title, year: d.year || '', poster: d.poster || '' })
    } else {
      const id = Number(raw.id)
      if (!Number.isInteger(id) || id <= 0) continue
      const d = await cachedTmdb(`/${kind}/${id}`).catch(() => null)
      if (d) out.push({
        kind, id: String(id), title: kind === 'tv' ? d.name : d.title,
        year: ((kind === 'tv' ? d.first_air_date : d.release_date) || '').slice(0, 4),
        poster: d.poster_path ? `https://image.tmdb.org/t/p/w342${d.poster_path}` : '',
      })
    }
  }
  // No duplicates
  return out.filter((x, i) => out.findIndex(y => y.kind === x.kind && y.id === x.id) === i)
}

// GET /api/collections — rows for Home
exports.publicList = async (_req, res) => {
  const list = await Collection.find({ showOnHome: true, 'items.0': { $exists: true } }).sort({ order: 1, createdAt: -1 }).limit(20).lean()
  res.json(list)
}

// GET /api/admin/collections
exports.adminList = async (_req, res) => {
  res.json(await Collection.find().sort({ order: 1, createdAt: -1 }).lean())
}

// POST /api/admin/collections { title, description, emoji }
exports.create = async (req, res) => {
  const title = str(req.body.title, 80)
  if (!title) return res.status(400).json({ message: 'Give the collection a name' })
  const last = await Collection.findOne().sort({ order: -1 }).select('order').lean()
  const doc = await Collection.create({
    title, description: str(req.body.description, 300), emoji: str(req.body.emoji, 8) || '🎞️',
    order: (last?.order ?? 0) + 1, items: await resolveItems(req.body.items),
  })
  res.status(201).json(doc)
}

// PUT /api/admin/collections/:id { title?, description?, emoji?, showOnHome?, order?, items? }
exports.update = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Not found' })
  const doc = await Collection.findById(req.params.id)
  if (!doc) return res.status(404).json({ message: 'Not found' })
  if (req.body.title !== undefined) { const t = str(req.body.title, 80); if (!t) return res.status(400).json({ message: 'Name is required' }); doc.title = t }
  if (req.body.description !== undefined) doc.description = str(req.body.description, 300)
  if (req.body.emoji !== undefined) doc.emoji = str(req.body.emoji, 8) || '🎞️'
  if (typeof req.body.showOnHome === 'boolean') doc.showOnHome = req.body.showOnHome
  if (Number.isFinite(Number(req.body.order)) && req.body.order !== undefined) doc.order = Number(req.body.order)
  if (req.body.items !== undefined) doc.items = await resolveItems(req.body.items)
  await doc.save()
  res.json(doc)
}

// DELETE /api/admin/collections/:id
exports.remove = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Not found' })
  await Collection.findByIdAndDelete(req.params.id)
  res.json({ ok: true })
}
