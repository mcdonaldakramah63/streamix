// backend/server.js — local server entry point
// Runs the API on http://localhost:5000 and, when frontend/dist exists,
// also serves the built frontend so the whole app runs from one local port.
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '.env') })

const express       = require('express')
const fs            = require('fs')
const cors          = require('cors')
const helmet        = require('helmet')
const morgan        = require('morgan')
const mongoSanitize = require('express-mongo-sanitize')
const xssClean      = require('xss-clean')
const hpp           = require('hpp')
const rateLimit     = require('express-rate-limit')
const http          = require('http')
const connectDB     = require('./config/db')

// ── Startup checks ────────────────────────────────────────────────────────────
const REQUIRED = ['MONGO_URI', 'JWT_SECRET', 'TMDB_API_KEY']
REQUIRED.forEach(k => {
  if (!process.env[k]) { console.error(`FATAL: Missing ${k} in backend/.env`); process.exit(1) }
})

connectDB()
const app = express()
// Only trust X-Forwarded-For from a local reverse proxy (e.g. the Vite dev server)
app.set('trust proxy', 'loopback')

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false, crossOriginResourcePolicy: false }))
app.use(helmet.referrerPolicy({ policy: 'strict-origin-when-cross-origin' }))

// ── CORS ──────────────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT) || 5000
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : [
      'http://localhost:5173', 'http://127.0.0.1:5173',
      `http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`,
    ]

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true)
    callback(null, allowedOrigins.includes('*') || allowedOrigins.includes(origin))
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Timezone'],
}
app.use(cors(corsOptions))
app.options('*', cors(corsOptions))

// ── Parsers ───────────────────────────────────────────────────────────────────
// Bulk library imports carry up to 200 URLs; everything else stays tightly limited
const LARGE_BODY = ['/api/admin/library/import']
const jsonSmall = express.json({ limit: '10kb' })
const jsonLarge = express.json({ limit: '1mb' })
const AVATAR_UPLOAD = /^\/api\/profiles\/[a-f0-9]{24}\/avatar$/
app.use((req, res, next) => (LARGE_BODY.includes(req.path) || AVATAR_UPLOAD.test(req.path) ? jsonLarge : jsonSmall)(req, res, next))
app.use(express.urlencoded({ extended: true, limit: '10kb' }))

// ── Data sanitization ─────────────────────────────────────────────────────────
// allowDots keeps TMDB filter params like `vote_count.gte` intact
app.use(mongoSanitize({ allowDots: true }))
app.use(xssClean())
app.use(hpp())

// ── Logging ───────────────────────────────────────────────────────────────────
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', {
  // HLS segment traffic is extremely noisy — don't log it
  skip: (req) => req.path.startsWith('/api/stream/proxy'),
}))

// ── Security middleware ───────────────────────────────────────────────────────
const { ipBlocker } = require('./middleware/ipBlocker')
app.use(ipBlocker)
app.use('/api', require('./middleware/suspiciousDetector'))

// ── Rate limiters (sized for a local, single-household server) ────────────────
app.use('/api/',       rateLimit({ windowMs: 15 * 60 * 1000, max: 3000, standardHeaders: true, legacyHeaders: false,
  skip: (req) => req.path.startsWith('/stream/proxy') }))
app.use('/api/auth',   rateLimit({ windowMs: 15 * 60 * 1000, max: 30, skipSuccessfulRequests: true, standardHeaders: true, legacyHeaders: false }))

// ── Never send internal error details to the browser ──────────────────────────
// Logs the real message server-side and replaces it with a generic one on any 5xx.
app.use('/api', (req, res, next) => {
  const json = res.json.bind(res)
  res.json = (body) => {
    if (res.statusCode >= 500 && body && typeof body === 'object' && !Array.isArray(body)) {
      if (body.message || body.error) console.error(`[${res.statusCode}] ${req.method} ${req.path}:`, body.error || body.message)
      body = { ...body, error: undefined }
      if (res.statusCode === 500) body.message = 'Something went wrong — please try again'
    }
    return json(body)
  }
  next()
})

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',      require('./routes/auth'))
app.use('/api/users',     require('./routes/users'))
app.use('/api/movies',    require('./routes/movies'))
app.use('/api/watchlist', require('./routes/watchlist'))
app.use('/api/admin',     require('./routes/admin'))
app.use('/api/download',  require('./routes/download'))
app.use('/api/anime',     require('./routes/anime'))
app.use('/api/stream',    require('./routes/stream'))
app.use('/api/ratings',   require('./routes/ratings'))
app.use('/api/profiles',  require('./routes/profiles'))
app.use('/api/polls',     require('./routes/polls'))
app.use('/api/library',   require('./routes/library').publicRouter)
app.use('/api/notifications', require('./routes/notifications'))
app.use('/api/inbox', (() => {
  const r = require('express').Router()
  const c = require('./controllers/inboxController')
  const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
  r.use(require('./middleware/auth').protect)
  r.get('/', wrap(c.list)); r.post('/seen', wrap(c.seen))
  r.get('/prefs', wrap(c.getPrefs)); r.put('/prefs', wrap(c.setPrefs))
  r.get('/pushes', wrap(c.pushes))
  r.post('/:id/open', wrap(c.open))
  r.get('/reminders', wrap(c.reminders)); r.put('/reminders', wrap(c.setReminder))
  return r
})())
app.post('/api/reports', require('./middleware/auth').protect, (req, res, next) => require('./controllers/reportController').create(req, res).catch(next))
app.get('/api/collections', (req, res, next) => require('./controllers/collectionController').publicList(req, res).catch(next))
// Limits the app shows to users (e.g. "Add profile (2/5)")
app.get('/api/settings/public', (_req, res, next) => require('./utils/settings').limits()
  .then(l => res.json({ maxProfiles: l.maxProfiles, partyMaxMembers: l.partyMaxMembers })).catch(next))
app.get('/api/announcements', (req, res, next) => require('./controllers/adminExtrasController').publicAnnouncements(req, res).catch(next))

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', time: Date.now() }))
app.use('/api', (req, res) => res.status(404).json({ message: `Not found: ${req.originalUrl}` }))

// ── Uploaded profile photos (random file names, images only) ─────────────────
app.use('/uploads/avatars', express.static(require('./utils/avatarStore').DIR, {
  maxAge: '30d', immutable: true, index: false, dotfiles: 'deny', fallthrough: false,
  setHeaders: (res) => { res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Content-Security-Policy', "default-src 'none'") },
}))

// ── Built frontend (npm run build in /frontend) ───────────────────────────────
const DIST = path.join(__dirname, '..', 'frontend', 'dist')
// Only this site's own scripts may run; video embeds, TMDB images and Google Fonts are allowed
const APP_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https: http:",
  "media-src 'self' blob: https: http:",
  "connect-src 'self' ws: wss: https: http:",
  "frame-src https: http:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ')
if (fs.existsSync(path.join(DIST, 'index.html'))) {
  app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', APP_CSP)
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=(), payment=()')
    next()
  })
  app.use(express.static(DIST, { index: false, maxAge: '1h' }))
  app.get('*', (_req, res) => res.sendFile(path.join(DIST, 'index.html')))
  console.log('[server] Serving frontend from frontend/dist')
} else {
  app.get('/', (_req, res) => res.json({ message: 'Streamix API — run the frontend with `npm run dev` in /frontend' }))
}

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ message: `Not found: ${req.path}` }))

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.message)
  if (err.name === 'ValidationError')   return res.status(400).json({ message: err.message })
  if (err.name === 'CastError')         return res.status(400).json({ message: 'Invalid id' })
  if (err.name === 'JsonWebTokenError') return res.status(401).json({ message: 'Invalid token' })
  if (err.name === 'TokenExpiredError') return res.status(401).json({ message: 'Session expired' })
  if (err.code  === 11000)              return res.status(400).json({ message: 'Already exists' })
  if (err.type === 'entity.too.large')  return res.status(413).json({ message: 'Request is too large' })
  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid JSON' })
  // Only messages we created on purpose (with a 4xx status) are shown to users
  const status = err.status || err.statusCode || 500
  res.status(status).json({ message: status < 500 && err.expose !== false ? err.message : 'Something went wrong' })
})

// ── HTTP + WebSocket ──────────────────────────────────────────────────────────
const server = http.createServer(app)
require('./websocket').setupWebSocket(server)
require('./utils/jobs').start()
require('./services/notifyWorker').start()
require('./services/officialAnime').start()
require('./services/sourceTracker').start()
require('./services/trendTracker').start()

server.listen(PORT, () =>
  console.log(`[Streamix] Listening on http://localhost:${PORT} [${process.env.NODE_ENV || 'development'}]`)
)
