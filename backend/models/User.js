// backend/models/User.js — FULL REPLACEMENT
const mongoose = require('mongoose')
const bcrypt   = require('bcryptjs')

const continueWatchingSchema = new mongoose.Schema(
  {
    movieId:      { type: Number, required: true },
    title:        { type: String, required: true },
    poster:       { type: String,  default: '' },
    backdrop:     { type: String,  default: '' },
    type:         { type: String,  enum: ['movie', 'tv'], default: 'movie' },
    season:       { type: Number,  default: null },
    episode:      { type: Number,  default: null },
    episodeName:  { type: String,  default: '' },
    progress:     { type: Number,  default: 0, min: 0, max: 100 },
    timestamp:    { type: Number,  default: 0 },    // exact second paused at
    duration:     { type: Number,  default: null },  // total seconds
    durationMins: { type: Number,  default: null },
    watchedAt:    { type: Date,    default: Date.now },
  },
  { _id: false }
)

const watchlistSchema = new mongoose.Schema(
  {
    movieId:  { type: Number, required: true },
    title:    { type: String, required: true },
    poster:   { type: String, default: '' },
    backdrop: { type: String, default: '' },
    rating:   { type: Number, default: 0 },
    year:     { type: String, default: '' },
    addedAt:  { type: Date,   default: Date.now },
  },
  { _id: false }
)

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 30 },
    email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 8, select: false },
    isAdmin:          { type: Boolean, default: false },
    avatar:           { type: String,  default: '' },
    continueWatching: { type: [continueWatchingSchema], default: [] },
    watchlist:        { type: [watchlistSchema],        default: [] },
    recentlyViewed:   { type: [mongoose.Schema.Types.Mixed], default: [] },
    loginAttempts:    { type: Number, default: 0 },
    lockUntil:        { type: Date,   default: null },
  },
  { timestamps: true }
)

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next()
  this.password = await bcrypt.hash(this.password, 12)
  next()
})

userSchema.methods.matchPassword = async function (entered) {
  return bcrypt.compare(entered, this.password)
}

module.exports = mongoose.model('User', userSchema)
