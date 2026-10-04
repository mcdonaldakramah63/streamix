// In-app notification inbox (the bell). user = null means "for everyone".
const mongoose = require('mongoose')

const notificationSchema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  kind:      { type: String, enum: ['episode', 'reminder', 'library', 'weekly', 'announcement', 'security', 'digest'], default: 'announcement' },
  priority:  { type: String, enum: ['low', 'normal', 'high', 'critical'], default: 'normal' },
  title:     { type: String, required: true, maxlength: 120 },
  body:      { type: String, default: '', maxlength: 300 },
  url:       { type: String, default: '/', maxlength: 300 },
  image:     { type: String, default: '', maxlength: 300 },
  tag:       { type: String, default: '', maxlength: 80 },     // same tag + unread → merged ("3 new episodes")
  count:     { type: Number, default: 1 },
  // Idempotency: each event key can only ever reach a person once, even if a job re-runs after a crash
  dedupeKeys: { type: [String], default: undefined },
  openedAt:  { type: Date, default: null },
  createdAt: { type: Date, default: Date.now, expires: '60d' },
})
notificationSchema.index({ user: 1, createdAt: -1 })
notificationSchema.index({ user: 1, tag: 1, createdAt: -1 })
notificationSchema.index({ user: 1, dedupeKeys: 1 }, { unique: true, partialFilterExpression: { dedupeKeys: { $exists: true } } })

module.exports = mongoose.models.Notification || mongoose.model('Notification', notificationSchema)
