const test = require('node:test')
const assert = require('node:assert')
const s = require('../utils/searchEngine')

test('normalising: accents, &, roman numerals, punctuation', () => {
  assert.strictEqual(s.normalize('Amélie'), 'amelie')
  assert.strictEqual(s.normalize('Law & Order: SVU'), 'law and order svu')
  assert.strictEqual(s.normalize('Rocky II'), 'rocky 2')
  assert.strictEqual(s.normalize("Schindler's List"), 'schindlers list')
  assert.strictEqual(s.normalize('I, Robot'), 'i robot') // a lone "I" stays a word
})

test('query understanding', () => {
  assert.deepStrictEqual(pick(s.parseQuery('The Dark Knight 2008')), { text: 'the dark knight', year: 2008, type: null, season: null })
  assert.deepStrictEqual(pick(s.parseQuery('breaking bad season 2')), { text: 'breaking bad', year: null, type: 'tv', season: 2 })
  assert.deepStrictEqual(pick(s.parseQuery('the office s03e07')), { text: 'the office', year: null, type: 'tv', season: 3 })
  assert.deepStrictEqual(pick(s.parseQuery('dune movie')), { text: 'dune', year: null, type: 'movie', season: null })
  assert.strictEqual(s.parseQuery('1917').year, null) // a title, not a year
  function pick(p) { return { text: p.text, year: p.year, type: p.type, season: p.season } }
})

test('text matching forgives typos and half-typed words but prefers precise titles', () => {
  assert.strictEqual(s.textScore('interstellar', 'Interstellar'), 1)
  assert.ok(s.textScore('intersteller', 'Interstellar') > 0.7)
  assert.ok(s.textScore('star wa', 'Star Wars') > 0.85)
  assert.ok(s.textScore('up', 'Up') > s.textScore('up', 'Upgrade'))
  assert.ok(s.textScore('rocky ii', 'Rocky II') > s.textScore('rocky ii', 'Rocky'))
  assert.ok(s.textScore('dark knight', 'The Dark Knight') > 0.9)
  assert.ok(s.textScore('lord rings', 'The Lord of the Rings: The Fellowship of the Ring') > 0.6)
  assert.ok(s.textScore('love', 'The Notebook') === 0)
})

test('ranking: year and type agree, people searches return their work, clicks and library help', () => {
  const quality = (a, c) => (c * a + 300 * 6.6) / (c + 300)
  const results = [
    { id: 1, media_type: 'movie', title: 'Dune', release_date: '1984-12-14', popularity: 40, vote_average: 6.3, vote_count: 3000, poster_path: '/a' },
    { id: 2, media_type: 'movie', title: 'Dune', release_date: '2021-09-15', popularity: 120, vote_average: 7.8, vote_count: 12000, poster_path: '/b' },
    { id: 3, media_type: 'tv', title: undefined, name: 'Dune: Prophecy', first_air_date: '2024-11-17', popularity: 90, vote_average: 7, vote_count: 500, poster_path: '/c' },
  ]
  const r1984 = s.rank(results, { parsed: s.parseQuery('dune 1984'), quality })
  assert.strictEqual(r1984[0].id, 1)
  const plain = s.rank(results, { parsed: s.parseQuery('dune'), quality })
  assert.strictEqual(plain[0].id, 2)
  const show = s.rank(results, { parsed: s.parseQuery('dune series'), quality })
  assert.strictEqual(show[0].id, 3)
  const learned = s.rank(results.map(r => (r.id === 1 ? { ...r, clicks: 40 } : r)), { parsed: s.parseQuery('dune'), quality })
  assert.strictEqual(learned[0].id, 1)
})

test('suggestions while typing', () => {
  const corpus = [{ title: 'Interstellar', pop: 100 }, { title: 'Inception', pop: 120 }, { title: 'Interview with the Vampire', pop: 30 }, { title: 'Up', pop: 50 }]
  const out = s.suggestions('inter', corpus).map(c => c.title)
  assert.deepStrictEqual(out.slice(0, 2).sort(), ['Interstellar', 'Interview with the Vampire'])
  assert.ok(!out.includes('Up'))
})

test('prefixes prefer the closest title, and a dropped "the" counts a little less', () => {
  assert.ok(s.textScore('star wa', 'Star Wars') > s.textScore('star wa', 'Star Wars: The Clone Wars'))
  assert.ok(s.textScore('the dar', 'The Dark Knight') > s.textScore('the dar', 'Dark Nuns'))
})

test('a person search shows their work, not documentaries about them', () => {
  const r = s.rank([
    { id: 1, media_type: 'movie', title: 'Tom Hanks: The Nomad', popularity: 3, vote_average: 6, vote_count: 10, poster_path: '/a' },
    { id: 2, media_type: 'movie', title: 'Forrest Gump', popularity: 60, vote_average: 8.5, vote_count: 28000, poster_path: '/b', via: 'person' },
  ], { parsed: s.parseQuery('tom hanks'), personQuery: true, quality: (a, c) => (c * a + 300 * 6.6) / (c + 300) })
  assert.strictEqual(r[0].id, 2)
})
