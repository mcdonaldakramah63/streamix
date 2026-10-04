const test = require('node:test')
const assert = require('node:assert')
const h = require('../utils/sourceHealth')

test('providers that work for viewers rise; one that is down sinks', () => {
  const now = Date.parse('2026-10-02T12:00:00Z')
  const stats = {
    vidsrc:   { ok: 2, fail: 14, at: '2026-10-02T10:00:00Z' },
    vidlink:  { ok: 30, fail: 2, at: '2026-10-02T10:00:00Z' },
    embedsu:  { probe: { up: false, ms: 10000, at: '2026-10-02T11:50:00Z' } },
  }
  const r = h.rank('movie', stats, { now })
  assert.strictEqual(r[0].id, 'vidlink')
  assert.strictEqual(r[r.length - 1].id, 'embedsu')
  assert.ok(r.find(x => x.id === 'vidsrc').score < r.find(x => x.id === 'vidsrc2').score)
  assert.ok(r.every(x => x.template.includes('{id}')))
})

test('old evidence fades', () => {
  const d = h.decay({ ok: 10, fail: 4, at: '2026-09-25T12:00:00Z' }, Date.parse('2026-10-02T12:00:00Z'), 7)
  assert.ok(Math.abs(d.ok - 5) < 0.01 && Math.abs(d.fail - 2) < 0.01)
})

test('player page detection', () => {
  assert.ok(h.looksPlayable(200, '<html>' + 'x'.repeat(400) + '<iframe src="https://p/x"></iframe></html>'))
  assert.ok(!h.looksPlayable(404, '<html><iframe></iframe></html>'))
  assert.ok(!h.looksPlayable(200, 'short'))
  assert.ok(!h.looksPlayable(200, '<html><title>This domain is for sale</title>' + 'x'.repeat(500) + '</html>'))
  assert.strictEqual(h.fill(h.PROVIDERS[0].tv, 1399, 2, 3), 'https://vidsrc.sh/embed/tv/1399/2/3')
})
