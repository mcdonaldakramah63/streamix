const { cachedTmdb } = require('../config/tmdb');

const trending   = async (req, res) => { try { const d = await cachedTmdb('/trending/movie/week'); res.json(d); } catch (e) { res.status(500).json({ message: e.message }); } };
const popular    = async (req, res) => { try { const d = await cachedTmdb('/movie/popular', { page: req.query.page || 1 }); res.json(d); } catch (e) { res.status(500).json({ message: e.message }); } };
const topRated   = async (req, res) => { try { const d = await cachedTmdb('/movie/top_rated', { page: req.query.page || 1 }); res.json(d); } catch (e) { res.status(500).json({ message: e.message }); } };
const upcoming   = async (req, res) => { try { const d = await cachedTmdb('/movie/upcoming'); res.json(d); } catch (e) { res.status(500).json({ message: e.message }); } };
const tvShows    = async (req, res) => { try { const d = await cachedTmdb('/tv/popular', { page: req.query.page || 1 }); res.json(d); } catch (e) { res.status(500).json({ message: e.message }); } };
const trendingTV = async (req, res) => { try { const d = await cachedTmdb('/trending/tv/week'); res.json(d); } catch (e) { res.status(500).json({ message: e.message }); } };
const genres     = async (req, res) => { try { const d = await cachedTmdb('/genre/movie/list'); res.json(d); } catch (e) { res.status(500).json({ message: e.message }); } };

const details = async (req, res) => {
  try {
    const d = await cachedTmdb(`/movie/${req.params.id}`, {
      append_to_response: 'credits,recommendations,videos,external_ids,similar',
    });
    res.json(d);
  } catch (e) { res.status(500).json({ message: e.message }); }
};

const tvDetails = async (req, res) => {
  try {
    const d = await cachedTmdb(`/tv/${req.params.id}`, {
      append_to_response: 'credits,recommendations,videos,external_ids,season/1',
    });
    res.json(d);
  } catch (e) { res.status(500).json({ message: e.message }); }
};

const season = async (req, res) => {
  try {
    const d = await cachedTmdb(`/tv/${req.params.id}/season/${req.params.season}`);
    res.json(d);
  } catch (e) { res.status(500).json({ message: e.message }); }
};

const search = async (req, res) => {
  const { query, page = 1, type = 'multi' } = req.query;
  if (!query) return res.status(400).json({ message: 'Query required' });
  try {
    const d = await cachedTmdb(`/search/${type}`, { query, page });
    res.json(d);
  } catch (e) { res.status(500).json({ message: e.message }); }
};

module.exports = { trending, popular, topRated, upcoming, tvShows, trendingTV, genres, details, tvDetails, season, search };
