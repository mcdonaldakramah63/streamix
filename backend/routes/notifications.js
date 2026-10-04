const express = require('express')
const { protect } = require('../middleware/auth')
const c = require('../controllers/notificationController')

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
const router = express.Router()

router.get('/vapid', wrap(c.vapid))
router.use(protect)
router.get('/subscription', wrap(c.status))
router.put('/subscription', wrap(c.updateTopics))
router.post('/subscribe', wrap(c.subscribe))
router.delete('/subscribe', wrap(c.unsubscribe))
router.post('/test', wrap(c.test))

module.exports = router
