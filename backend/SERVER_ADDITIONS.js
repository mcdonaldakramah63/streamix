// ─────────────────────────────────────────────────────────────────────────────
// ADD TO backend/server.js
// ─────────────────────────────────────────────────────────────────────────────

// 1. Install cookie-parser:  npm install cookie-parser
//    Then add near the top:
const cookieParser = require('cookie-parser')
app.use(cookieParser())

// 2. Register new routes (add alongside existing routes):
app.use('/api/profiles', require('./routes/profiles'))

// 3. Add refresh + logout to auth routes in backend/routes/auth.js:
//    const { register, login, refresh, logout } = require('../controllers/authController')
//    router.post('/refresh', refresh)
//    router.post('/logout',  logout)

// 4. Add JWT_REFRESH_SECRET to Railway env vars:
//    JWT_REFRESH_SECRET = (any long random string, different from JWT_SECRET)
// ─────────────────────────────────────────────────────────────────────────────
