const test = require('node:test')
const assert = require('node:assert')
const d = require('../utils/discoveryEngine')

// Deterministic random numbers for repeatable sampling tests
function rng(seed = 42) { let s = seed; return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648) }

test('beta samples stay in 0..1 and follow their mean', () => {
  const r = rng(7)
  let sum = 0
  for (let i = 0; i < 4000; i++) { const x = d.betaSample(8, 2, r); assert.ok(x > 0 && x < 1); sum += x }
  assert.ok(Math.abs(sum / 4000 - 0.8) < 0.03, `mean ${sum / 4000}`)
})

test('rows that get opened move up; Top picks stays first', () => {
  const sections = ['top', 'because', 'cf', 'genre', 'gems', 'weekly'].map(kind => ({ kind, title: kind, items: [] }))
  const stats = { gems: { shown: 40, clicked: 22 }, because: { shown: 40, clicked: 1 }, cf: { shown: 40, clicked: 1 } }
  let gemsFirst = 0
  const r = rng(3)
  for (let i = 0; i < 200; i++) {
    const out = d.orderRows(sections, stats, r)
    assert.strictEqual(out[0].kind, 'top')
    assert.strictEqual(out.length, sections.length)
    if (out[1].kind === 'gems') gemsFirst++
  }
  assert.ok(gemsFirst > 170, `gems led ${gemsFirst}/200 times`)
})

test('old row evidence decays', () => {
  const now = Date.parse('2026-10-02')
  const out = d.decayStats({ gems: { shown: 20, clicked: 10 } }, '2026-09-11', now, 21)
  assert.ok(Math.abs(out.gems.shown - 10) < 0.01 && Math.abs(out.gems.clicked - 5) < 0.01)
})

test('upcoming: a sequel or season premiere beats generic hype', () => {
  const hype = d.scoreUpcoming({ tasteScore: 0.2, popularity: 400, daysUntil: 20 })
  const sequel = d.scoreUpcoming({ tasteScore: 0.4, popularity: 30, daysUntil: 80, franchise: 'Next in Dune Collection' })
  const premiere = d.scoreUpcoming({ tasteScore: 0.4, popularity: 20, daysUntil: 10, premiere: 'Season 3 of Severance' })
  assert.ok(sequel.score > hype.score && premiere.score > hype.score)
  assert.strictEqual(sequel.kind, 'franchise')
  assert.strictEqual(hype.reason, 'Most anticipated')
})

test('feed: fresh, relevant stories win; seen ones fade; kinds are spread out', () => {
  const now = Date.parse('2026-10-02T12:00:00Z')
  const items = [
    { key: 'tv:1', kind: 'new_episode', relevance: 0.9, date: '2026-10-01' },
    { key: 'movie:2', kind: 'trending', relevance: 0.3, date: '2026-10-02' },
    { key: 'movie:3', kind: 'trending', relevance: 0.35, date: '2026-10-02' },
    { key: 'movie:4', kind: 'trending', relevance: 0.32, date: '2026-10-02' },
    { key: 'movie:5', kind: 'fresh_hit', relevance: 0.5, date: '2026-09-20', quality: 8 },
    { key: 'tv:1', kind: 'trending', relevance: 0.9, date: '2026-10-02' }, // same title, weaker kind → merged
  ]
  const out = d.rankFeed(items, { now })
  assert.strictEqual(out[0].key, 'tv:1')
  assert.strictEqual(out.filter(i => i.key === 'tv:1').length, 1)
  for (let i = 2; i < out.length; i++) {
    const triple = out[i].kind === out[i - 1].kind && out[i].kind === out[i - 2].kind
    assert.ok(!triple || out.slice(i).every(x => x.kind === out[i].kind), 'three in a row only when nothing else is left')
  }
  const seen = d.rankFeed(items, { now, seen: { 'tv:1': 3 } })
  assert.notStrictEqual(seen[0].key, 'tv:1')
})

test('ask without AI: words become filters', () => {
  const p = d.planFromText('Something funny and short from the 90s, not horror, like Groundhog Day')
  assert.ok(p.genres.includes(35))
  assert.ok(p.avoidGenres.includes(27) && !p.genres.includes(27))
  assert.strictEqual(p.yearFrom, 1990); assert.strictEqual(p.yearTo, 1999)
  assert.strictEqual(p.maxRuntime, 100)
  assert.deepStrictEqual(p.similarTo, ['Groundhog Day'])
  assert.strictEqual(d.planFromText('a korean thriller series to binge').type, 'tv')
  assert.strictEqual(d.planFromText('a korean thriller series to binge').language, 'ko')

  const fits = d.planFit({ type: 'movie', genres: [35], year: 1993, lang: 'en', voteAverage: 8, voteCount: 5000 }, p)
  const misses = d.planFit({ type: 'movie', genres: [27, 35], year: 2015, lang: 'en', voteAverage: 7, voteCount: 900 }, p)
  assert.ok(fits > misses)
})

test('ask fallback: TV genres, "short" prefers films, moods', () => {
  const korean = d.planFromText('a korean thriller series to binge')
  // TV has no Thriller genre: Crime/Mystery series count as a match
  assert.ok(d.planFit({ type: 'tv', genres: [80, 18], lang: 'ko' }, korean) > d.planFit({ type: 'tv', genres: [35], lang: 'ko' }, korean))
  const short = d.planFromText('something short and funny')
  assert.ok(d.planFit({ type: 'movie', genres: [35] }, short) > d.planFit({ type: 'tv', genres: [35] }, short))
  const light = d.planFromText('like Interstellar but less sad')
  assert.strictEqual(light.mood, 'light')
  assert.ok(d.planFit({ type: 'movie', genres: [878, 12] }, light) > d.planFit({ type: 'movie', genres: [10752, 18] }, light))
  assert.strictEqual(d.scoreUpcoming({ tasteScore: 0, popularity: 5 }).reason, 'New release')
})
