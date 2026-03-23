// ADD THESE TWO LINES to backend/routes/movies.js
// (alongside your existing routes like /trending, /popular etc.)

// const { discover, nowPlaying, ...existing } = require('../controllers/movieController')

router.get('/discover',    discover)
router.get('/now-playing', nowPlaying)
