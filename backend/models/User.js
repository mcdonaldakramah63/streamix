const mongoose = require('mongoose')
const bcrypt   = require('bcryptjs')

const userSchema = new mongoose.Schema({
  username: {
    type: String, required: true, unique: true, trim: true,
    minlength: 3, maxlength: 30,
    match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, underscores'],
  },
  email: {
    type: String, required: true, unique: true,
    lowercase: true, trim: true, maxlength: 100,
    match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
  },
  password: {
    type: String, required: true, minlength: 8,
    select: false, // Never return password in queries by default
  },
  avatar:   { type: String, default: '', maxlength: 500 },
  isAdmin:  { type: Boolean, default: false },
  watchlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Movie' }],
  continueWatching: [{
    movieId:   { type: Number, required: true },
    title:     { type: String, maxlength: 200 },
    poster:    { type: String, maxlength: 500 },
    progress:  { type: Number, min: 0, max: 100 },
    updatedAt: { type: Date, default: Date.now },
  }],
  recentlyViewed: [{
    movieId:  { type: Number, required: true },
    title:    { type: String, maxlength: 200 },
    poster:   { type: String, maxlength: 500 },
    viewedAt: { type: Date, default: Date.now },
  }],
  loginAttempts:  { type: Number, default: 0 },
  lockUntil:      { type: Date },
}, {
  timestamps: true,
  // Never return password or lockUntil in responses
  toJSON: {
    transform(doc, ret) {
      delete ret.password
      delete ret.loginAttempts
      delete ret.lockUntil
      return ret
    }
  }
})

// Hash password with cost factor 12 (good balance of security vs speed)
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next()
  this.password = await bcrypt.hash(this.password, 12)
  next()
})

// Compare passwords — returns false if account is locked
userSchema.methods.matchPassword = async function (entered) {
  // Check account lockout
  if (this.lockUntil && this.lockUntil > Date.now()) {
    return false
  }
  const isMatch = await bcrypt.compare(entered, this.password)
  return isMatch
}

// Indexes for fast lookups
userSchema.index({ email: 1 })
userSchema.index({ username: 1 })

module.exports = mongoose.model('User', userSchema)
