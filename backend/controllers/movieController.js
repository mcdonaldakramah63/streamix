const { cachedTmdb } = require('../config/tmdb');

const trending   = async (req, res) => { try { const d = await cachedTmdb('/trending/movie/week', { page: req.query.page || 1 }); res.json(d); } catch (e) { res.status(500).json({ message: e.message }); } };
const popular    = async (req, res) => { try { const d = await cachedTmdb('/movie/popular', { page: req.query.page || 1 }); res.json(d); } catch (e) { res.status(500).json({ message: e.message }); } };
const topRated   = async (req, res) => { try { const d = await cachedTmdb('/movie/top_rated', { page: req.query.page || 1 }); res.json(d); } catch (e) { res.status(500).json({ message: e.message }); } };
const upcoming   = async (req, res) => { try { const d = await cachedTmdb('/movie/upcoming', { page: req.query.page || 1 }); res.json(d); } catch (e) { res.status(500).json({ message: e.message }); } };
const tvShows    = async (req, res) => { try { const d = await cachedTmdb('/tv/popular', { page: req.query.page || 1 }); res.json(d); } catch (e) { res.status(500).json({ message: e.message }); } };
const trendingTV = async (req, res) => { try { const d = await cachedTmdb('/trending/tv/week', { page: req.query.page || 1 }); res.json(d); } catch (e) { res.status(500).json({ message: e.message }); } };
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
  const { query, page = 1 } = req.query;
  const type = ['multi', 'movie', 'tv', 'person'].includes(req.query.type) ? req.query.type : 'multi';
  if (!query) return res.status(400).json({ message: 'Query required' });

  try {
    const d = await cachedTmdb(`/search/${type}`, { query, page, include_adult: false });
    res.json(d);
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// ── Kids ─────────────────────────────────────────────────────────────────────
// Everything for kids profiles is filtered here on the server: US ratings up to PG / TV-PG,
// and never the mature genres. Anime is included when its rating is kid-safe (Pokémon, Doraemon…).
const KID_BLOCKED = new Set([27, 53, 80, 10752, 10768, 9648, 10766, 10767, 10763, 10764, 10749])
const KID_BLOCKED_STR = [...KID_BLOCKED].join(',')
const KID_MOVIE_OK = new Set(['G', 'PG'])
const KID_TV_OK = new Set(['TV-Y', 'TV-Y7', 'TV-Y7-FV', 'TV-G', 'TV-PG'])

const kidGenreMovie = (m) => {
  const g = m.genre_ids || []
  return g.includes(10751) || (g.includes(16) && m.original_language !== 'ja')
}
const kidGenreTv = (m) => (m.genre_ids || []).some(id => id === 10762 || id === 10751)
const blocked = (m) => (m.genre_ids || []).some(id => KID_BLOCKED.has(id))

/** The strictest US age rating TMDB lists for a title, or null when there isn't one */
async function usRating(type, id) {
  try {
    if (type === 'tv') {
      const d = await cachedTmdb(`/tv/${id}/content_ratings`)
      // Shows can list several US ratings (King of the Hill: TV-PG and TV-14) — the strictest counts
      const order = ['TV-Y', 'TV-Y7', 'TV-Y7-FV', 'TV-G', 'TV-PG', 'TV-14', 'TV-MA']
      const us = (d.results || []).filter(r => r.iso_3166_1 === 'US' && order.includes(r.rating)).map(r => r.rating)
      return us.length ? us.sort((a, b) => order.indexOf(b) - order.indexOf(a))[0] : null
    }
    const d = await cachedTmdb(`/movie/${id}/release_dates`)
    const us = (d.results || []).find(r => r.iso_3166_1 === 'US')
    // Re-releases can carry different ratings (Akira: R and PG-13) — the strictest one counts
    const order = ['G', 'PG', 'PG-13', 'R', 'NC-17']
    const certs = (us?.release_dates || []).map(x => x.certification).filter(c => order.includes(c))
    return certs.length ? certs.sort((a, b) => order.indexOf(b) - order.indexOf(a))[0] : null
  } catch { return null }
}

/** true = fine for kids, false = not, null = no rating to go on */
async function kidRatingOk(type, id) {
  const r = await usRating(type, id)
  if (!r) return null
  return type === 'tv' ? KID_TV_OK.has(r) : KID_MOVIE_OK.has(r)
}

/**
 * Final say on one title. Needs a kid-safe rating, or (when unrated) a kids/family genre.
 * Grown-up cartoons (King of the Hill, The Simpsons) are TV-PG comedies without a kids/family
 * genre — those need TV-G or lower.
 */
async function kidSafe(m) {
  if (m.adult || blocked(m)) return false
  const type = m.media_type
  const genreOk = type === 'tv' ? kidGenreTv(m) : kidGenreMovie(m)
  const r = await usRating(type, m.id)
  if (!r) return genreOk
  if (type === 'movie') return KID_MOVIE_OK.has(r)
  if (!KID_TV_OK.has(r)) return false
  const g = m.genre_ids || []
  if (r === 'TV-PG' && !genreOk && g.includes(35) && m.original_language !== 'ja') return false
  return true
}

// GET /api/movies/kids-search?query=&page= — family-friendly movies + shows only
const kidsSearch = async (req, res) => {
  const query = String(req.query.query || '').trim().slice(0, 100)
  const page  = Number(req.query.page) || 1
  if (!query) return res.status(400).json({ message: 'Query required' });
  try {
    const [movies, tv] = await Promise.all([
      cachedTmdb('/search/movie', { query, page, include_adult: false }),
      cachedTmdb('/search/tv',    { query, page, include_adult: false }),
    ])
    const all = [
      ...(movies.results || []).map(m => ({ ...m, media_type: 'movie' })),
      ...(tv.results     || []).map(m => ({ ...m, media_type: 'tv' })),
    ].filter(m => !m.adult && m.poster_path && !blocked(m))

    // Genre says kid-friendly → keep; animation/other → check the age rating (catches kid anime like Pokémon)
    const results = (await Promise.all(all.slice(0, 30).map(async m => ((await kidSafe(m)) ? m : null))))
      .filter(Boolean).sort((a, b) => (b.popularity || 0) - (a.popularity || 0))

    res.json({ page, results, total_pages: Math.max(movies.total_pages || 1, tv.total_pages || 1) })
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// GET /api/movies/kids-browse?section=&page= — the rows on the kids home page
const KID_SECTIONS = {
  shows:            { type: 'tv',    params: { with_genres: '10762' } },
  cartoons:         { type: 'tv',    params: { with_genres: '16', without_original_language: 'ja' } },
  anime:            { type: 'tv',    params: { with_genres: '16', with_original_language: 'ja' } },
  'anime-movies':   { type: 'movie', params: { with_genres: '16', with_original_language: 'ja' } },
  'animated-movies':{ type: 'movie', params: { with_genres: '16' } },
  family:           { type: 'movie', params: { with_genres: '10751' } },
  adventure:        { type: 'movie', params: { with_genres: '12' } },
  comedy:           { type: 'movie', params: { with_genres: '35' } },
  fantasy:          { type: 'movie', params: { with_genres: '14' } },
  'family-shows':   { type: 'tv',    params: { with_genres: '10751' } },
}
const kidsBrowse = async (req, res) => {
  const sec = KID_SECTIONS[req.query.section]
  if (!sec) return res.status(400).json({ message: 'Unknown section' })
  const page = Math.min(50, Math.max(1, Number(req.query.page) || 1))
  const params = {
    ...sec.params, page, include_adult: false, sort_by: 'popularity.desc', 'vote_count.gte': 10,
    without_genres: KID_BLOCKED_STR, certification_country: 'US',
    ...(sec.type === 'movie' ? { 'certification.lte': 'PG' } : { certification: [...KID_TV_OK].join('|') }),
  }
  if (params.without_original_language) {
    // TMDB has no "not this language" filter — drop those results below instead
    delete params.without_original_language
  }
  try {
    const d = await cachedTmdb(`/discover/${sec.type}`, params)
    let results = (d.results || []).filter(m => m.poster_path).map(m => ({ ...m, media_type: sec.type }))
    if (sec.params.without_original_language) results = results.filter(m => m.original_language !== sec.params.without_original_language)
    const ok = await Promise.all(results.map(kidSafe))
    results = results.filter((_, i) => ok[i])
    res.json({ page, results, total_pages: Math.min(d.total_pages || 1, 50) })
  } catch (e) { res.status(500).json({ message: e.message }) }
}

// ── Age ratings, Top 10, coming soon ─────────────────────────────────────────
// US ratings grouped like the maturity levels profiles can choose
const LEVEL = { G: '7', PG: '7', 'TV-Y': '7', 'TV-Y7': '7', 'TV-Y7-FV': '7', 'TV-G': '7', 'TV-PG': '7',
  'PG-13': '13', 'TV-14': '16', R: 'all', 'NC-17': 'all', 'TV-MA': 'all' }

// GET /api/movies/rating/:type/:id → { rating: "PG-13", level: "13" } (rating null when TMDB has none)
const rating = async (req, res) => {
  const type = req.params.type === 'tv' ? 'tv' : req.params.type === 'movie' ? 'movie' : null
  if (!type) return res.status(400).json({ message: 'Invalid type' })
  const r = await usRating(type, Number(req.params.id))
  res.json({ rating: r, level: r ? LEVEL[r] || 'all' : null })
}

// GET /api/movies/top10 → today's 10 most-watched movies and shows
const top10 = async (_req, res) => {
  try {
    const [m, t] = await Promise.all([cachedTmdb('/trending/movie/day'), cachedTmdb('/trending/tv/day')])
    res.json({
      movies: (m.results || []).filter(x => x.poster_path).slice(0, 10).map(x => ({ ...x, media_type: 'movie' })),
      tv: (t.results || []).filter(x => x.poster_path).slice(0, 10).map(x => ({ ...x, media_type: 'tv' })),
    })
  } catch (e) { res.status(500).json({ message: e.message }) }
}

// GET /api/movies/coming-soon → movies and new shows coming out in the next ~2 months
const comingSoon = async (_req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const until = new Date(Date.now() + 75 * 86400000).toISOString().slice(0, 10)
    const [m1, m2, tv] = await Promise.all([
      cachedTmdb('/discover/movie', { 'primary_release_date.gte': today, 'primary_release_date.lte': until, sort_by: 'popularity.desc', region: 'US', with_release_type: '2|3', include_adult: false }),
      cachedTmdb('/discover/movie', { 'primary_release_date.gte': today, 'primary_release_date.lte': until, sort_by: 'popularity.desc', region: 'US', with_release_type: '2|3', include_adult: false, page: 2 }),
      cachedTmdb('/discover/tv', { 'first_air_date.gte': today, 'first_air_date.lte': until, sort_by: 'popularity.desc', include_adult: false }),
    ])
    const items = [
      ...[...(m1.results || []), ...(m2.results || [])].map(x => ({ ...x, media_type: 'movie', date: x.release_date })),
      ...(tv.results || []).map(x => ({ ...x, media_type: 'tv', date: x.first_air_date })),
    ].filter(x => x.date && x.date >= today && (x.backdrop_path || x.poster_path))
    const seen = new Set()
    res.json(items.filter(x => { const k = `${x.media_type}:${x.id}`; if (seen.has(k)) return false; seen.add(k); return true })
      .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 60))
  } catch (e) { res.status(500).json({ message: e.message }) }
}

/** Maturity level ("7" | "13" | "16" | "all") for a title, or null when unrated */
const levelFor = async (type, id) => { const r = await usRating(type, Number(id)); return r ? LEVEL[r] || 'all' : null }

module.exports = { levelFor, rating, top10, comingSoon, kidsSearch, kidsBrowse, trending, popular, topRated, upcoming, tvShows, trendingTV, genres, details, tvDetails, season, search };
