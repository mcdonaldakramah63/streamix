const test = require('node:test')
const assert = require('node:assert')
const { _test } = require('../config/tmdb')

test('freshness depends on the kind of request', () => {
  assert.ok(_test.freshFor('/trending/movie/day') < _test.freshFor('/search/multi'))
  assert.ok(_test.freshFor('/search/multi') < _test.freshFor('/movie/550'))
  assert.strictEqual(_test.freshFor('/movie/550/recommendations'), 6 * 3600 * 1000)
})

test('the limiter never runs more than 8 at once and runs everything', async () => {
  let running = 0, peak = 0
  const jobs = Array.from({ length: 30 }, (_, i) => _test.limit(async () => {
    running++; peak = Math.max(peak, running)
    await new Promise(r => setTimeout(r, 5))
    running--
    return i
  }))
  const out = await Promise.all(jobs)
  assert.strictEqual(out.length, 30)
  assert.ok(peak <= 8, `peak ${peak}`)
})
