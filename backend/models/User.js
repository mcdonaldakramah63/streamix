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
    suspended:        { type: Boolean, default: false },
    suspendedReason:  { type: String,  default: '' },
    lastActiveAt:     { type: Date,    default: null },
    // Bumped to sign out every device (password change, "sign out everywhere", suspension)
    tokenVersion:     { type: Number,  default: 0 },
    // Everything in the notification inbox newer than this is unread
    notificationsSeenAt: { type: Date, default: () => new Date() },
    // ── Email ownership ──
    // Accounts from before verification existed count as verified (the default); new sign-ups start false
    emailVerified:    { type: Boolean, default: true },
    emailCanonical:   { type: String,  default: undefined, index: true }, // "j.o.e+x@gmail.com" → "joe@gmail.com"
    pendingEmail:     { type: String,  default: null },                   // new address waiting for its code
    emailCode: {                                                          // the current one-time code (hashed)
      hash:        { type: String, select: false },
      purpose:     { type: String, select: false },
      expires:     { type: Date,   select: false },
      attempts:    { type: Number, select: false },
      sentAt:      { type: Date,   select: false },
      sends:       { type: Number, select: false },
      windowStart: { type: Date,   select: false },
    },
    // ── Notifications ──
    tz:          { type: String, default: '' },                         // IANA zone from the browser/app ("Africa/Nairobi")
    notifyPrefs: { type: mongoose.Schema.Types.Mixed, default: undefined }, // see utils/notifyEngine DEFAULT_PREFS
    notifyStats: { type: mongoose.Schema.Types.Mixed, default: undefined }, // { kind: { sent, opened } }, decayed weekly
    activeHours: { type: mongoose.Schema.Types.Mixed, default: undefined }, // { "0".."23": weight } in the user's own time
    // Two-factor sign-in (authenticator app). Secrets and backup codes never leave the server.
    twoFactor: {
      enabled:       { type: Boolean, default: false },
      secret:        { type: String,  default: null, select: false },
      pendingSecret: { type: String,  default: null, select: false },
      recovery:      { type: [String], default: [], select: false },   // sha256 of unused backup codes
      lastStep:      { type: Number,  default: -1, select: false },    // stops a code being reused
    },
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

const User = mongoose.models.User || mongoose.model('User', userSchema);
module.exports = User;
