const test = require('node:test')
const assert = require('node:assert')
const { rankRow } = require('../utils/continueWatching')

test('continue watching: what you are into comes first, not just what you opened last', () => {
  const now = Date.parse('2026-10-02T20:00:00Z')
  const items = [
    { movieId: 1, title: 'Opened a minute ago, 1%', progress: 1, watchedAt: new Date(now - 60e3) },
    { movieId: 2, title: 'Halfway, yesterday', progress: 50, watchedAt: new Date(now - 864e5) },
    { movieId: 3, title: 'Up next while bingeing', progress: 0, upNext: true, watchedAt: new Date(now - 3 * 3600e3) },
    { movieId: 4, title: 'Halfway, a month ago', progress: 45, watchedAt: new Date(now - 30 * 864e5) },
  ]
  const order = rankRow(items, now).map(i => i.movieId)
  assert.deepStrictEqual(order.slice(0, 2), [3, 2])
  assert.ok(order.indexOf(1) < order.indexOf(4) || order.indexOf(4) === 3)
  assert.strictEqual(order[order.length - 1], 4)
})
