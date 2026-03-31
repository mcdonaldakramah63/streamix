// backend/SERVER_JS_CHECKLIST.js
// This is NOT a replacement for server.js
// Check your server.js has ALL of these lines in the right order:

/*

// 1. After your app.use(cors(...)) block, ensure these routes are registered:

app.use('/api/auth',      require('./routes/auth'))
app.use('/api/users',     require('./routes/users'))
app.use('/api/movies',    require('./routes/movies'))
app.use('/api/watchlist', require('./routes/watchlist'))
app.use('/api/admin',     require('./routes/admin'))
app.use('/api/download',  require('./routes/download'))
app.use('/api/anime',     require('./routes/anime'))
app.use('/api/stream',    require('./routes/stream'))
app.use('/api/ratings',   require('./routes/ratings'))
app.use('/api/profiles',  require('./routes/profiles'))   // ← ADD THIS if missing
app.use('/api/polls',     require('./routes/polls'))       // ← ADD THIS if missing

// 2. Health check (keep this):
app.get('/health', (req, res) => res.json({ status: 'ok', time: Date.now() }))

*/

// ─────────────────────────────────────────────────────────────────────────────
// HOW TO CHECK IF PROFILES IS MISSING:
//
//   grep -n "profiles" backend/server.js
//
// If it returns nothing, add:
//   app.use('/api/profiles', require('./routes/profiles'))
//
// ─────────────────────────────────────────────────────────────────────────────
