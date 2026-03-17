// ─────────────────────────────────────────────────────────────────────────────
// ADD TO backend/server.js
//
// 1. Add this require near the other route requires:
const streamRoutes = require('./routes/stream')

// 2. Add this line with the other app.use() route registrations:
app.use('/api/stream', streamRoutes)
//
// 3. Add CONSUMET_URL to your Render environment variables:
//    Key:   CONSUMET_URL
//    Value: https://your-consumet-app.onrender.com   (set up in next step)
// ─────────────────────────────────────────────────────────────────────────────
