// Behaviour tests for the recommendation model (utils/tasteEngine.js)
const test = require('node:test')
const assert = require('node:assert/strict')
const E = require('../utils/tasteEngine')

const NOW = Date.UTC(2026, 9, 1)
const daysAgo = d => new Date(NOW - d * 86400000)

test('finishing a title counts more than sampling it; bailing early counts against it', () => {
  const done = E.watchWeight({ progress: 100, completed: true, watchedAt: daysAgo(1) }, NOW)
  const half = E.watchWeight({ progress: 50, watchedAt: daysAgo(1) }, NOW)
  const quit = E.watchWeight({ progress: 5, watchedAt: daysAgo(20) }, NOW)
  const justStarted = E.watchWeight({ progress: 5, watchedAt: daysAgo(1) }, NOW)
  assert.ok(done > half && half > 0)
  assert.ok(quit < 0, 'abandoned long ago is a soft no')
  assert.ok(justStarted > 0, 'just started is not held against it yet')
})

test('old viewing fades but never disappears', () => {
  const recent = E.watchWeight({ completed: true, watchedAt: daysAgo(1) }, NOW)
  const old = E.watchWeight({ completed: true, watchedAt: daysAgo(400) }, NOW)
  assert.ok(old < recent && old > 0)
})

test('signals merge per title; "Not for me" and low ratings are negative', () => {
  const seeds = E.buildSeeds({
    history: [{ tmdbId: 1, type: 'movie', completed: true, watchedAt: daysAgo(2), title: 'A' }],
    ratings: [{ tmdbId: 1, type: 'movie', rating: 5, updatedAt: daysAgo(2) }, { tmdbId: 3, type: 'movie', rating: 1, updatedAt: daysAgo(2) }],
    hidden: ['tv:2'],
  }, NOW)
  assert.ok(seeds.get('movie:1').weight > 2, 'watched + 5 stars stack')
  assert.ok(seeds.get('tv:2').weight < 0)
  assert.ok(seeds.get('movie:3').weight < 0)
})

test('browsing alone is capped well below watching', () => {
  const events = Array.from({ length: 30 }, () => ({ kind: 'detail', mediaType: 'movie', tmdbId: 9, at: daysAgo(0) }))
  const seeds = E.buildSeeds({ events }, NOW)
  assert.ok(seeds.get('movie:9').weight <= 0.45)
})

function sampleTaste() {
  const seeds = E.buildSeeds({ history: [
    { tmdbId: 1, type: 'movie', completed: true, watchedAt: daysAgo(1) },
    { tmdbId: 2, type: 'movie', completed: true, watchedAt: daysAgo(3) },
    { tmdbId: 3, type: 'movie', progress: 4, watchedAt: daysAgo(30) },
  ] }, NOW)
  const features = new Map([
    ['movie:1', { genres: [878, 12], keywords: [100, 101], people: [7], lang: 'en', year: 2014 }],
    ['movie:2', { genres: [878, 53], keywords: [100], people: [7], lang: 'en', year: 2010 }],
    ['movie:3', { genres: [10749, 35], keywords: [200], people: [8], lang: 'en', year: 2004 }],
  ])
  return E.buildTaste(seeds, features)
}

test('taste learns liked and disliked genres', () => {
  const t = sampleTaste()
  assert.ok(t.genre[878] > 0.9, 'sci-fi loved')
  assert.ok(t.genre[10749] < 0, 'romance abandoned')
  assert.ok(t.person[7] > 0)
})

test('candidates matching the taste outscore ones that don\'t', () => {
  const t = sampleTaste()
  const base = { type: 'movie', lang: 'en', year: 2015, voteAverage: 7.5, voteCount: 5000, popularity: 50, sources: {} }
  const scifi = E.scoreCandidate({ ...base, id: 10, genres: [878, 12], keywords: [100], people: [7] }, t, { year: 2026 }).score
  const romcom = E.scoreCandidate({ ...base, id: 11, genres: [10749, 35], keywords: [200], people: [8] }, t, { year: 2026 }).score
  assert.ok(scifi > romcom + 1)
})

test('bayesian quality distrusts tiny vote counts', () => {
  assert.ok(E.quality(9.8, 3) < E.quality(8.4, 20000))
})

test('diversify mixes genres instead of stacking near-duplicates', () => {
  const items = [
    ...Array.from({ length: 6 }, (_, i) => ({ key: `a${i}`, score: 10 - i * 0.01, genres: [878], keywords: [1], type: 'movie' })),
    { key: 'b', score: 9.5, genres: [35], keywords: [2], type: 'movie' },
    { key: 'c', score: 9.4, genres: [18], keywords: [3], type: 'tv' },
  ]
  const top4 = E.diversify(items, 4).map(i => i.key)
  assert.ok(top4.includes('b') && top4.includes('c'), `got ${top4}`)
  assert.equal(E.diversify(items, 1)[0].key, 'a0', 'the best item still leads')
})

test('reasons explain picks', () => {
  assert.match(E.explain({ sources: { seed: 0.8, seedTitle: 'Inception' } }, {}), /Because you watched Inception/)
  assert.match(E.explain({ sources: { cf: 0.7 } }, {}), /viewers like you/i)
})
