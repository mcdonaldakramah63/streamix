const test = require('node:test')
const assert = require('node:assert')
const t = require('../utils/trendEngine')

const H = 3600 * 1000
const now = Date.parse('2026-10-02T18:00:00Z')

test('picks the snapshot nearest a day ago, never a too-recent one', () => {
  const snaps = [{ at: new Date(now - 2 * H) }, { at: new Date(now - 20 * H) }, { at: new Date(now - 30 * H) }]
  assert.strictEqual(t.snapshotAround(snaps, now, 24).at.getTime(), now - 20 * H)
  assert.strictEqual(t.snapshotAround([{ at: new Date(now - 2 * H) }], now, 24), null)
})

test('momentum rewards growth and rank climbs; new entries get a bump', () => {
  const cur = { items: { 'movie:1': { pop: 300, rank: 3 }, 'movie:2': { pop: 300, rank: 4 }, 'movie:3': { pop: 50, rank: 18 } } }
  const old = { items: { 'movie:1': { pop: 60, rank: 25 }, 'movie:2': { pop: 310, rank: 2 } } }
  const m = t.momentum(cur, old, 24)
  assert.ok(m['movie:1'] > 1 && m['movie:2'] < 0 && m['movie:3'] > 0)
})

test('local heat fades over a day', () => {
  const h = t.localHeat([{ key: 'tv:1', kind: 'play', at: new Date(now - 24 * H) }, { key: 'tv:2', kind: 'play', at: new Date(now) }], now)
  assert.ok(Math.abs(h['tv:1'] - 1.5) < 0.01 && Math.abs(h['tv:2'] - 3) < 0.01)
})

test('a title racing up the charts and watched here beats a slightly bigger stale one', () => {
  const titles = [
    { key: 'movie:1', type: 'movie', pop: 400, rank: 5, voteAverage: 7, voteCount: 2000, date: '2025-01-01' },
    { key: 'movie:2', type: 'movie', pop: 300, rank: 8, voteAverage: 7.4, voteCount: 900, date: '2026-09-25' },
  ]
  const s = t.scoreAll(titles, { mom: { 'movie:1': -0.1, 'movie:2': 0.9 }, heat: { 'movie:2': 6 }, now })
  const l = t.lists(s, { now })
  assert.strictEqual(l.everyone[0].key, 'movie:2')
  assert.strictEqual(l.rising[0].key, 'movie:2')
  assert.ok(l.justReleased.some(x => x.key === 'movie:2') && !l.justReleased.some(x => x.key === 'movie:1'))
  assert.match(t.reason(l.everyone[0], 'everyone'), /server/)
})

test('a few-vote 9.8 does not top the chart; version changes with the lists', () => {
  const titles = [
    { key: 'tv:1', type: 'tv', pop: 200, voteAverage: 9.8, voteCount: 5 },
    { key: 'tv:2', type: 'tv', pop: 200, voteAverage: 7.9, voteCount: 4000 },
  ]
  const s = t.scoreAll(titles, { now })
  assert.ok(s[1].quality > s[0].quality)
  const v1 = t.version(t.lists(s, { now }))
  const v2 = t.version(t.lists(t.scoreAll([...titles, { key: 'tv:3', type: 'tv', pop: 900, voteAverage: 8, voteCount: 900 }], { now }), { now }))
  assert.notStrictEqual(v1, v2)
})
