// backend/server.js — FULL REPLACEMENT
// FIXES: adds /api/profiles and /api/polls routes (were missing → 404)
//        WebSocket attached to http.Server (not app.listen)
const express          = require('express')
const cors             = require('cors')
const dotenv           = require('dotenv')
const helmet           = require('helmet')
const morgan           = require('morgan')
const mongoSanitize    = require('express-mongo-sanitize')
const xssClean         = require('xss-clean')
const hpp              = require('hpp')
const rateLimit        = require('express-rate-limit')
const cookieParser     = require('cookie-parser')
const http             = require('http')
const connectDB        = require('./config/db')
const streamRoutes     = require('./routes/stream')

dotenv.config()

// ── Startup checks ──────────────────────────────────────────────────────────
const REQUIRED = ['MONGO_URI', 'JWT_SECRET', 'TMDB_API_KEY']
REQUIRED.forEach(k => {
  if (!process.env[k]) { console.error(`FATAL: Missing ${k}`); process.exit(1) }
})

connectDB()
const app = express()

app.set('trust proxy', 1)

// ── Security headers ─────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }))
app.use(helmet.referrerPolicy({ policy: 'strict-origin-when-cross-origin' }))

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:5173']

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true)
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error(`CORS blocked: ${origin}`))
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))
app.options('*', cors())

// ── Body / cookie parsers ────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }))
app.use(express.urlencoded({ extended: true, limit: '10kb' }))
app.use(cookieParser())

// ── Data sanitization ────────────────────────────────────────────────────────
app.use(mongoSanitize())
app.use(xssClean())
app.use(hpp())

// ── Logging ───────────────────────────────────────────────────────────────────
app.use(morgan(process.env.NODE_ENV === 'development' ? 'dev' : 'combined'))

// ── Optional middleware (gracefully skip if files missing) ───────────────────
try { const { ipBlocker } = require('./middleware/ipBlocker'); app.use(ipBlocker) } catch {}
try { const sd = require('./middleware/suspiciousDetector');   app.use(sd)         } catch {}

// ── Rate limiters ─────────────────────────────────────────────────────────────
app.use('/api/',        rateLimit({ windowMs:15*60*1000, max:300, standardHeaders:true, legacyHeaders:false }))
app.use('/api/auth',    rateLimit({ windowMs:15*60*1000, max:20,  skipSuccessfulRequests:true }))
app.use('/api/movies',  rateLimit({ windowMs:60*1000,    max:120 }))
app.use('/api/stream',  rateLimit({ windowMs:60*1000,    max:120 }))

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',      require('./routes/auth'))
app.use('/api/users',     require('./routes/users'))
app.use('/api/movies',    require('./routes/movies'))
app.use('/api/watchlist', require('./routes/watchlist'))
app.use('/api/admin',     require('./routes/admin'))
app.use('/api/download',  require('./routes/download'))
app.use('/api/anime',     require('./routes/anime'))
app.use('/api/stream',    streamRoutes)
app.use('/api/ratings',   require('./routes/ratings'))
app.use('/api/profiles',  require('./routes/profiles'))   // ← WAS MISSING

// Polls (may not exist yet — gracefully skip)
try { app.use('/api/polls', require('./routes/polls')) } catch (e) {
  console.warn('[server] /api/polls route not found — skipping')
}

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', time: Date.now() }))
app.get('/',       (_req, res) => res.json({ message:'Streamix API', env:process.env.NODE_ENV }))

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ message: `Not found: ${req.path}` }))

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  const isDev = process.env.NODE_ENV === 'development'
  console.error('[ERROR]', err.message)
  if (err.name === 'ValidationError')   return res.status(400).json({ message: err.message })
  if (err.name === 'JsonWebTokenError') return res.status(401).json({ message: 'Invalid token' })
  if (err.name === 'TokenExpiredError') return res.status(401).json({ message: 'Session expired' })
  if (err.code  === 11000)              return res.status(400).json({ message: 'Already exists' })
  res.status(err.status || 500).json({ message: isDev ? err.message : 'Something went wrong' })
})

// ── HTTP Server + WebSocket ───────────────────────────────────────────────────
const server = http.createServer(app)

try {
  const { setupWebSocket } = require('./websocket')
  setupWebSocket(server)
  console.log('[server] WebSocket enabled')
} catch {
  console.warn('[server] websocket.js not found — WebSocket disabled')
}

const PORT = process.env.PORT || 5000
server.listen(PORT, () => console.log(`[Streamix] Listening on port ${PORT} [${process.env.NODE_ENV || 'development'}]`))
