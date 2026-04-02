const mongoose = require('mongoose')

const auditSchema = new mongoose.Schema({
  action:     { type: String, required: true },        // e.g. LOGIN_SUCCESS, LOGIN_FAIL, ADMIN_DELETE_USER
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  email:      { type: String },
  ip:         { type: String },
  userAgent:  { type: String },
  details:    { type: mongoose.Schema.Types.Mixed },   // extra info
  severity:   { type: String, enum: ['info','warn','critical'], default: 'info' },
  createdAt:  { type: Date, default: Date.now, expires: '90d' }, // auto-delete after 90 days
})

auditSchema.index({ userId: 1 })
auditSchema.index({ action: 1 })
auditSchema.index({ createdAt: -1 })
auditSchema.index({ ip: 1 })

const ModelName = mongoose.models.ModelName || mongoose.model('ModelName', schema);
module.exports = ModelName;
