const express         = require('express')
const cors            = require('cors')
const dotenv          = require('dotenv')
const helmet          = require('helmet')
const morgan          = require('morgan')
const mongoSanitize   = require('express-mongo-sanitize')
const xssClean        = require('xss-clean')
const hpp             = require('hpp')
const rateLimit       = require('express-rate-limit')
const connectDB       = require('./config/db')
const suspiciousDetector = require('./middleware/suspiciousDetector')
const { ipBlocker }   = require('./middleware/ipBlocker')
const streamRoutes = require('./routes/stream')

dotenv.config()

// ── Startup security checks ───────────────────────────────────────
const REQUIRED = ['MONGO_URI', 'JWT_SECRET', 'TMDB_API_KEY']
REQUIRED.forEach(k => {
  if (!process.env[k]) { console.error(`FATAL: Missing ${k}`); process.exit(1) }
})
if (process.env.JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET must be 32+ characters'); process.exit(1)
}

connectDB()
const app = express()

// ── Trust proxy (needed for correct IP behind Render/Railway) ────
app.set('trust proxy', 1)

// ── Security headers ─────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }))
app.use(helmet.referrerPolicy({ policy: 'strict-origin-when-cross-origin' }))

// ── CORS ─────────────────────────────────────────────────────────
const allowed = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',').map(o => o.trim())
app.use(cors({ origin: '*', credentials: false }))

// ── Body parser (10kb limit prevents payload attacks) ────────────
app.use(express.json({ limit: '10kb' }))
app.use(express.urlencoded({ extended: true, limit: '10kb' }))

// ── Data sanitization ────────────────────────────────────────────
app.use(mongoSanitize())   // NoSQL injection
app.use(xssClean())        // XSS
app.use(hpp())             // HTTP parameter pollution

// ── Request logging ──────────────────────────────────────────────
app.use(morgan(process.env.NODE_ENV === 'development' ? 'dev' : 'combined'))

// ── IP blocker (runs before rate limiter) ────────────────────────
app.use(ipBlocker)

// ── Suspicious request detector ──────────────────────────────────
app.use(suspiciousDetector)

// ── Rate limiters ────────────────────────────────────────────────
app.use('/api/', rateLimit({ windowMs: 15*60*1000, max: 300, standardHeaders: true, legacyHeaders: false }))
app.use('/api/auth', rateLimit({ windowMs: 15*60*1000, max: 10, skipSuccessfulRequests: true,
  message: { message: 'Too many attempts, wait 15 minutes.' } }))
app.use('/api/movies', rateLimit({ windowMs: 60*1000, max: 60 }))
app.use('/api/anime',  rateLimit({ windowMs: 60*1000, max: 60 }))

// ── Routes ───────────────────────────────────────────────────────
app.use('/api/auth',      require('./routes/auth'))
app.use('/api/users',     require('./routes/users'))
app.use('/api/movies',    require('./routes/movies'))
app.use('/api/watchlist', require('./routes/watchlist'))
app.use('/api/admin',     require('./routes/admin'))
app.use('/api/download',  require('./routes/download'))
app.use('/api/anime',     require('./routes/anime'))
app.use('/api/stream', streamRoutes)

app.get('/', (req, res) => res.json({ message: 'Streamix API', env: process.env.NODE_ENV }))

// ── 404 ──────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ message: 'Not found' }))

// ── Global error handler ─────────────────────────────────────────
app.use((err, req, res, next) => {
  const isDev = process.env.NODE_ENV === 'development'
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message)
  if (err.name === 'ValidationError')   return res.status(400).json({ message: err.message })
  if (err.name === 'JsonWebTokenError') return res.status(401).json({ message: 'Invalid token' })
  if (err.name === 'TokenExpiredError') return res.status(401).json({ message: 'Session expired' })
  if (err.code === 11000)               return res.status(400).json({ message: 'Already exists' })
  res.status(err.status || 500).json({ message: isDev ? err.message : 'Something went wrong' })
})

const PORT = process.env.PORT || 5000
app.listen(PORT, () => console.log(`[Streamix] Server on port ${PORT} [${process.env.NODE_ENV}]`))
