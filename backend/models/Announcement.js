// Site-wide banner messages managed from the admin console
const mongoose = require('mongoose')

const announcementSchema = new mongoose.Schema({
  message:   { type: String, required: true, trim: true, maxlength: 500 },
  tone:      { type: String, enum: ['info', 'warning', 'success'], default: 'info' },
  active:    { type: Boolean, default: true },
  expiresAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true })

announcementSchema.index({ active: 1, createdAt: -1 })

module.exports = mongoose.models.Announcement || mongoose.model('Announcement', announcementSchema)
