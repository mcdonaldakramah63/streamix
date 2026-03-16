const express = require('express');
const { protect } = require('../middleware/auth');
const { getWatchlist, addToWatchlist, removeFromWatchlist, checkWatchlist } = require('../controllers/watchlistController');
const r = express.Router();
r.get('/',                        protect, getWatchlist);
r.post('/add',                    protect, addToWatchlist);
r.delete('/remove/:movieId',      protect, removeFromWatchlist);
r.get('/check/:movieId',          protect, checkWatchlist);
module.exports = r;
