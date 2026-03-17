// backend/server.js — ADD THESE LINES
// Find where you register routes (usually around line 50-80)
// and make sure users routes is registered like this:

const userRoutes = require('./routes/users')
app.use('/api/users', userRoutes)

// ─── VERIFY IT WORKS ──────────────────────────────────────────────────
// After deploying backend, test these URLs in your browser:
//
//   GET  https://streamix-usak.onrender.com/api/users/continue-watching
//   → Should return 401 Unauthorized (good — auth is working)
//
//   POST https://streamix-usak.onrender.com/api/users/continue-watching
//   → Should return 401 Unauthorized (good)
//
// If you get 404 it means the route is not registered in server.js
