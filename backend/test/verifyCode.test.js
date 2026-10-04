const test = require('node:test')
const assert = require('node:assert')
const c = require('../utils/verifyCode')

test('codes are 6 digits and only match their own user and purpose', () => {
  const code = c.newCode()
  assert.match(code, /^\d{6}$/)
  const h = c.hash(code, 'u1', 'signup')
  assert.ok(c.matches(h, code, 'u1', 'signup'))
  assert.ok(c.matches(h, ` ${code.slice(0, 3)} ${code.slice(3)} `, 'u1', 'signup')) // spaces from copy-paste
  assert.ok(!c.matches(h, code, 'u2', 'signup'))
  assert.ok(!c.matches(h, code, 'u1', 'change'))
  assert.ok(!c.matches(h, '12345', 'u1', 'signup'))
  assert.ok(!h.includes(code))
})

test('sending is paced: growing waits, at most 6 an hour', () => {
  let st = {}
  let now = Date.parse('2026-10-03T10:00:00Z')
  const r1 = c.canSend(st, now); assert.ok(r1.ok); st = r1.next
  assert.strictEqual(c.canSend(st, now + 10_000).ok, false)        // 30 s wait after the first
  assert.strictEqual(c.canSend(st, now + 10_000).wait, 20)
  now += 31_000
  const r2 = c.canSend(st, now); assert.ok(r2.ok); st = r2.next
  assert.strictEqual(c.canSend(st, now + 45_000).ok, false)        // then 60 s
  let sends = 2
  while (sends < 6) { now += 11 * 60_000; const r = c.canSend(st, now); assert.ok(r.ok, `send ${sends + 1}`); st = r.next; sends++ }
  const blocked = c.canSend(st, now + 11 * 60_000)
  assert.strictEqual(blocked.ok, false)                              // 6 in this hour already
  assert.ok(blocked.wait > 0)
  assert.ok(c.canSend(st, Date.parse('2026-10-03T11:01:00Z')).ok)    // a new hour, a new allowance
})

test('expired or exhausted codes are refused', () => {
  const now = Date.now()
  assert.strictEqual(c.unusable({ hash: 'x', expires: new Date(now + 60_000), attempts: 0 }, now), null)
  assert.ok(c.unusable({ hash: 'x', expires: new Date(now - 1), attempts: 0 }, now).expired)
  assert.strictEqual(c.unusable({ hash: 'x', expires: new Date(now + 60_000), attempts: 5 }, now).status, 429)
  assert.strictEqual(c.unusable({}, now).status, 400)
})
