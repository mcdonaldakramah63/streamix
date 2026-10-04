// Outbox: one push or email waiting to go out, being sent, or done.
// Sending is a state machine (pending → sending → sent | failed | dropped) with a lease, so a crash or a
// second server process never sends the same thing twice, and failures retry with backoff.
const mongoose = require('mongoose')

const deliverySchema = new mongoose.Schema({
  user:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  notification: { type: mongoose.Schema.Types.ObjectId, ref: 'Notification', default: null },
  channel:      { type: String, enum: ['push', 'email'], required: true },
  kind:         { type: String, default: 'announcement' },
  priority:     { type: String, default: 'normal' },
  payload:      { type: mongoose.Schema.Types.Mixed, default: {} }, // push: { title, body, url, icon, tag } · email: { template, to, data }
  sendAt:       { type: Date, required: true },
  status:       { type: String, enum: ['pending', 'sending', 'sent', 'failed', 'dropped'], default: 'pending' },
  attempts:     { type: Number, default: 0 },
  leaseUntil:   { type: Date, default: null },
  sentAt:       { type: Date, default: null },
  result:       { type: String, default: '' },  // "2 devices", "merged into digest", "no devices", error text…
  key:          { type: String },               // idempotency key — the same delivery is never queued twice
  sent:         { type: mongoose.Schema.Types.Mixed, default: undefined }, // what actually went out (digest text for a merged push)
  merged:       { type: Boolean, default: undefined },                      // went out inside another delivery's digest
  createdAt:    { type: Date, default: Date.now, expires: '30d' },
})
deliverySchema.index({ status: 1, sendAt: 1 })
deliverySchema.index({ user: 1, channel: 1, sendAt: -1 })
deliverySchema.index({ key: 1 }, { unique: true, partialFilterExpression: { key: { $type: 'string' } } })

module.exports = mongoose.models.Delivery || mongoose.model('Delivery', deliverySchema)
