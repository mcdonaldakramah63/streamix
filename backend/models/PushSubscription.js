// A browser that agreed to receive push notifications
const mongoose = require('mongoose')

const pushSubscriptionSchema = new mongoose.Schema({
  user:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  endpoint: { type: String, required: true, unique: true },
  keys:     { p256dh: { type: String, required: true }, auth: { type: String, required: true } },
  // What this browser wants to hear about
  topics:   { newEpisodes: { type: Boolean, default: true }, library: { type: Boolean, default: true }, weekly: { type: Boolean, default: true } },
  userAgent: { type: String, default: '' },
  failures: { type: Number, default: 0 },
}, { timestamps: true })

module.exports = mongoose.models.PushSubscription || mongoose.model('PushSubscription', pushSubscriptionSchema)
