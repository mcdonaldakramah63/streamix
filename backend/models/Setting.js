// Small key/value store for app-wide settings (usage limits, push keys)
const mongoose = require('mongoose')

const settingSchema = new mongoose.Schema({
  key:   { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: true })

module.exports = mongoose.models.Setting || mongoose.model('Setting', settingSchema)
