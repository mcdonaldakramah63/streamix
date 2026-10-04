const test = require('node:test')
const assert = require('node:assert')
const n = require('../utils/notifyEngine')
const sec = require('../utils/securityAlerts')._test

const at = (iso) => new Date(iso)
const zero = () => 0

test('local time and quiet hours follow the person’s own time zone', () => {
  assert.deepStrictEqual(n.localTime(at('2026-10-03T20:30:00Z'), 'Africa/Nairobi'), { h: 23, m: 30 })
  assert.ok(n.inQuiet(23, { enabled: true, start: 22, end: 8 }))
  assert.ok(n.inQuiet(3, { enabled: true, start: 22, end: 8 }))
  assert.ok(!n.inQuiet(8, { enabled: true, start: 22, end: 8 }))
  assert.ok(!n.inQuiet(23, { enabled: false, start: 22, end: 8 }))
  assert.ok(n.inQuiet(14, { enabled: true, start: 13, end: 15 }))
})

test('next local hour is DST-correct', () => {
  // Europe/London: clocks go back at 02:00 BST on 2026-10-25 → 08:00 local is 08:00Z that day
  const t = n.nextLocalHour(at('2026-10-24T23:00:00Z'), 'Europe/London', 8)
  assert.strictEqual(n.localTime(t, 'Europe/London').h, 8)
  assert.strictEqual(t.toISOString(), '2026-10-25T08:00:00.000Z')
})

test('critical alerts always go now; turned-off kinds never buzz', () => {
  const night = at('2026-10-03T21:00:00Z') // 00:00 in Nairobi
  assert.deepStrictEqual(n.decide({ kind: 'security', now: night, tz: 'Africa/Nairobi' }).push, true)
  assert.strictEqual(n.decide({ kind: 'security', now: night, tz: 'Africa/Nairobi' }).at, night)
  const off = n.decide({ kind: 'library', now: night, prefs: { push: { library: false } } })
  assert.deepStrictEqual([off.push, off.reason], [false, 'turned off'])
})

test('quiet hours push news to the morning (their morning)', () => {
  const night = at('2026-10-03T21:00:00Z') // 00:00 Nairobi
  const d = n.decide({ kind: 'episode', now: night, tz: 'Africa/Nairobi', rand: zero })
  assert.strictEqual(d.push, true)
  assert.strictEqual(n.localTime(d.at, 'Africa/Nairobi').h, 8)
  assert.strictEqual(d.reason, 'scheduled')
})

test('daily limit: ordinary news waits in the bell, high priority gets one extra slot', () => {
  const now = at('2026-10-03T12:00:00Z')
  const recent = [1, 2, 3, 4].map(h => new Date(now.getTime() - h * 3600_000))
  assert.deepStrictEqual(n.decide({ kind: 'library', now, recent, rand: zero }).reason, 'daily limit')
  const hi = n.decide({ kind: 'reminder', now, recent, rand: zero })
  assert.strictEqual(hi.push, true)
})

test('spacing: a push right after another waits; one already scheduled is joined', () => {
  const now = at('2026-10-03T12:00:00Z')
  const just = n.decide({ kind: 'library', now, recent: [new Date(now - 5 * 60_000)], rand: zero })
  assert.strictEqual(just.at.getTime(), now.getTime() + 15 * 60_000)
  const waiting = new Date(now.getTime() + 40 * 60_000)
  const join = n.decide({ kind: 'announcement', now, recent: [waiting], rand: zero })
  assert.strictEqual(join.at.getTime(), waiting.getTime())
  // high priority isn't held back by spacing
  assert.strictEqual(n.decide({ kind: 'episode', now, recent: [new Date(now - 60_000)], rand: zero }).at.getTime(), now.getTime())
})

test('learned: a kind someone never opens stops buzzing; one they open keeps going', () => {
  const now = at('2026-10-03T12:00:00Z')
  const ignored = n.decide({ kind: 'weekly', now, stats: { weekly: { sent: 12, opened: 0 } } })
  assert.deepStrictEqual([ignored.push, ignored.reason], [false, 'usually ignored'])
  assert.strictEqual(n.decide({ kind: 'weekly', now, stats: { weekly: { sent: 12, opened: 5 } }, rand: zero }).push, true)
  // too little evidence → keep sending
  assert.strictEqual(n.decide({ kind: 'weekly', now, stats: { weekly: { sent: 3, opened: 0 } }, rand: zero }).push, true)
  // high priority is never muted by habit
  assert.strictEqual(n.decide({ kind: 'reminder', now, stats: { reminder: { sent: 20, opened: 0 } } }).push, true)
})

test('open-rate posterior starts from a sensible prior and moves with evidence', () => {
  assert.ok(Math.abs(n.openRate({}, 'episode') - 3 / 8) < 1e-9)
  assert.ok(n.openRate({ episode: { sent: 20, opened: 18 } }, 'episode') >= 0.75)
  assert.ok(n.openRate({ episode: { sent: 20, opened: 0 } }, 'episode') < 0.15)
  const draws = Array.from({ length: 200 }, () => n.openRate({ episode: { sent: 10, opened: 5 } }, 'episode', Math.random))
  assert.ok(draws.every(x => x > 0 && x < 1))
})

test('low-priority news goes out at the hour they are usually around', () => {
  const hours = { 19: 6, 20: 10, 21: 4 } // evenings, Nairobi time
  const now = at('2026-10-03T07:00:00Z') // 10:00 Nairobi
  const d = n.decide({ kind: 'weekly', now, tz: 'Africa/Nairobi', hours, rand: zero })
  assert.strictEqual(n.localTime(d.at, 'Africa/Nairobi').h, 20)
  // not enough history → now
  assert.strictEqual(n.decide({ kind: 'weekly', now, tz: 'Africa/Nairobi', hours: { 20: 2 }, rand: zero }).at.getTime(), now.getTime())
})

test('prefs are clamped and merged over defaults', () => {
  const p = n.prefsOf({ maxPerDay: 99, quiet: { start: 25, end: 7 }, push: { weekly: false, bogus: true } })
  assert.strictEqual(p.maxPerDay, 12)
  assert.deepStrictEqual(p.quiet, { enabled: true, start: 22, end: 7 })
  assert.strictEqual(p.push.weekly, false)
  assert.strictEqual(p.push.bogus, undefined)
  assert.strictEqual(p.email.security, true)
})

test('collapsing and digests read naturally', () => {
  assert.strictEqual(n.collapsedTitle('episode', 'New episode: The Bear', 3), '3 new episodes: The Bear')
  assert.strictEqual(n.collapsedTitle('library', 'New on Streamix: Dune', 2), '2 new videos on Streamix')
  const d = n.digestOf([{ title: 'A' }, { title: 'B' }, { title: 'C' }, { title: 'D' }])
  assert.strictEqual(d.title, '4 updates from Streamix')
  assert.strictEqual(d.body, 'A · B · C · +1 more')
})

test('decay and backoff', () => {
  assert.deepStrictEqual(n.decayStats({ episode: { sent: 10, opened: 5 }, weekly: { sent: 0.01, opened: 0 } }), { episode: { sent: 9, opened: 4.5 } })
  const waits = [1, 2, 3, 4, 5, 9].map(a => n.backoff(a, () => 0.5))
  assert.deepStrictEqual(waits, [30_000, 120_000, 480_000, 1_800_000, 1_800_000, 1_800_000])
})

test('a sign-in alerts only when both device and network are new', () => {
  assert.strictEqual(sec.network('203.0.113.77'), '203.0.113')
  assert.strictEqual(sec.network('::ffff:198.51.100.4'), '198.51.100')
  const prev = [{ device: 'Chrome on Windows', network: '203.0.113' }]
  assert.ok(!sec.isNewPlace([], { device: 'x', network: 'y' }))                                   // first ever
  assert.ok(!sec.isNewPlace(prev, { device: 'Chrome on Windows', network: '198.51.100' }))        // same laptop, new Wi-Fi
  assert.ok(!sec.isNewPlace(prev, { device: 'Streamix app on Android', network: '203.0.113' }))   // new phone at home
  assert.ok(sec.isNewPlace(prev, { device: 'Firefox on Linux', network: '192.0.2' }))             // unknown device, elsewhere
})
