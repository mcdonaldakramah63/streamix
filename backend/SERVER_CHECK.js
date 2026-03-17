// ─────────────────────────────────────────────────────────────────────────────
// OPEN backend/server.js and verify these lines exist exactly like this.
// If users route is already registered, make sure the path is '/api/users'
// ─────────────────────────────────────────────────────────────────────────────

// At the top of server.js with your other requires:
const userRoutes = require('./routes/users')

// In the routes section (after middleware):
app.use('/api/users', userRoutes)

// ─────────────────────────────────────────────────────────────────────────────
// VERIFY it works — open this URL in your browser after deploying backend:
//
//   https://streamix-usak.onrender.com/api/users/continue-watching
//
// You should get:   {"message":"Not authorized, no token"}
// If you get 404 →  the route is NOT registered in server.js
// If you get 401 →  route is working correctly ✓
// ─────────────────────────────────────────────────────────────────────────────
