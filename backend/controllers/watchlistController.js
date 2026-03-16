const Watchlist = require('../models/Watchlist');

const getWatchlist = async (req, res) => {
  try {
    const items = await Watchlist.find({ user: req.user._id }).sort({ addedAt: -1 });
    res.json(items);
  } catch (e) { res.status(500).json({ message: e.message }); }
};

const addToWatchlist = async (req, res) => {
  const { movieId, title, poster, backdrop, rating, year } = req.body;
  try {
    const item = await Watchlist.create({ user: req.user._id, movieId, title, poster, backdrop, rating, year });
    res.status(201).json(item);
  } catch (e) {
    if (e.code === 11000) return res.status(400).json({ message: 'Already in watchlist' });
    res.status(500).json({ message: e.message });
  }
};

const removeFromWatchlist = async (req, res) => {
  try {
    await Watchlist.findOneAndDelete({ user: req.user._id, movieId: req.params.movieId });
    res.json({ message: 'Removed from watchlist' });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

const checkWatchlist = async (req, res) => {
  try {
    const item = await Watchlist.findOne({ user: req.user._id, movieId: req.params.movieId });
    res.json({ inWatchlist: !!item });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

module.exports = { getWatchlist, addToWatchlist, removeFromWatchlist, checkWatchlist };
