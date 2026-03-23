// ADD TO backend/server.js
// (alongside your other app.use() route registrations)

app.use('/api/ratings', require('./routes/ratings'))
