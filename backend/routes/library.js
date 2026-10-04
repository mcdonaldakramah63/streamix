const express = require('express')
const c = require('../controllers/libraryController')
const { protect } = require('../middleware/auth')

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

// Public: browse + play
const publicRouter = express.Router()
publicRouter.get('/',    wrap(c.list))
publicRouter.get('/for/:type/:tmdbId', wrap(c.forTitle))
publicRouter.get('/:id', wrap(c.get))
publicRouter.post('/:id/download', protect, wrap(c.downloadLink))
publicRouter.get('/:id/file', wrap(c.file))
publicRouter.get('/:id/subtitles/:n', wrap(c.subtitle))

// Admin: mounted under /api/admin (already behind protect + adminOnly)
const adminRouter = express.Router()
adminRouter.post('/library/import', wrap(c.importUrls))
adminRouter.get('/library',         wrap(c.adminList))
adminRouter.post('/library/rematch', wrap(c.rematch))
adminRouter.get('/library/tmdb-search', wrap(c.tmdbSearch))
adminRouter.get('/library/tmdb-seasons/:id', wrap(c.tmdbSeasons))
adminRouter.get('/library/:id/suggest', wrap(c.suggest))
adminRouter.put('/library/:id',     wrap(c.update))
adminRouter.delete('/library/:id',  wrap(c.remove))

module.exports = { publicRouter, adminRouter }
