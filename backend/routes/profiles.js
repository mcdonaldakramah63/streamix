// backend/routes/profiles.js — NEW FILE
const express = require('express')
const router  = express.Router()
const { protect } = require('../middleware/auth')
const {
  getAll,
  create,
  update,
  remove,
  recordWatch,
  getRecommendations,
} = require('../controllers/profileController')

router.get('/',                              protect, getAll)
router.post('/',                             protect, create)
router.put('/:id',                           protect, update)
router.delete('/:id',                        protect, remove)
router.post('/:id/watch',                    protect, recordWatch)
router.get('/:id/recommendations',           protect, getRecommendations)

module.exports = router
