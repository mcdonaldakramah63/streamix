const axios = require('axios');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 300 }); // 5 min cache

const tmdb = axios.create({
  baseURL: 'https://api.themoviedb.org/3',
  params: { api_key: process.env.TMDB_API_KEY },
});

const cachedTmdb = async (url, params = {}) => {
  const key = url + JSON.stringify(params);
  const cached = cache.get(key);
  if (cached) return cached;
  const { data } = await tmdb.get(url, { params });
  cache.set(key, data);
  return data;
};

module.exports = { tmdb, cachedTmdb };
