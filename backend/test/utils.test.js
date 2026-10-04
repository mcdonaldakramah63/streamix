// Security-critical helpers and parsers
const test = require('node:test')
const assert = require('node:assert/strict')
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-unit-tests-only'

test('TOTP matches the RFC 6238 test vector', () => {
  const t = require('../utils/totp')._test
  const secret = t.base32Encode(Buffer.from('12345678901234567890'))
  assert.equal(t.codeAt(secret, 1), '287082')
  assert.equal(t.codeAt(secret, Math.floor(1111111109 / 30)), '081804')
})

test('TOTP rejects reuse of an already-used step', () => {
  const totp = require('../utils/totp')
  const secret = totp.newSecret()
  const code = totp._test.codeAt(secret, Math.floor(Date.now() / 30000))
  const step = totp.verify(secret, code)
  assert.ok(step !== null)
  assert.equal(totp.verify(secret, code, step), null)
})

test('private / local addresses are refused', () => {
  const { isPrivateHost, isPrivateIP, publicUrl } = require('../utils/netGuard')
  for (const h of ['localhost', '127.0.0.1', '10.0.0.5', '192.168.1.1', '169.254.169.254', '::1', '::ffff:127.0.0.1', 'router.local']) assert.ok(isPrivateHost(h), h)
  assert.ok(!isPrivateIP('8.8.8.8'))
  assert.throws(() => publicUrl('http://user:pass@example.com/'))
  assert.throws(() => publicUrl('file:///etc/passwd'))
  assert.equal(publicUrl('https://example.com/a').hostname, 'example.com')
})

test('stream proxy links only verify with the right signature', () => {
  const { signedProxyUrl, verifyProxySig } = require('../utils/proxySign')
  const url = 'https://cdn.example.com/a.m3u8'
  const sig = new URL('http://x' + signedProxyUrl(url)).searchParams.get('sig')
  assert.ok(verifyProxySig(url, sig))
  assert.ok(!verifyProxySig(url + '?x', sig))
  assert.ok(!verifyProxySig(url, 'A'.repeat(24)))
})

test('file names parse into title / season / episode / ids', () => {
  const { parseName } = require('../utils/mediaMatcher')
  assert.deepEqual(
    (({ title, season, episode }) => ({ title, season, episode }))(parseName('AX+jade+dynasty+s4+ep+9+eng.mp4')),
    { title: 'jade dynasty', season: 4, episode: 9 })
  assert.equal(parseName('The_General_1926_720p.mp4').year, '1926')
  assert.equal(parseName('clip tv: 206484').ids.tmdb, 206484)
  assert.equal(parseName('[SubsPlease] One Piece - 1105 (1080p).mkv').episode, 1105)
})

test('search spelling distance treats a swap as one edit', () => {
  const { editDistance } = require('../controllers/searchController')._test
  assert.equal(editDistance('thigns', 'things'), 1)
  assert.equal(editDistance('rngs', 'rings'), 1)
  assert.ok(editDistance('abc', 'xyz') > 2)
})

test('every route module loads (catches missing handlers)', () => {
  const fs = require('fs'), path = require('path')
  for (const f of fs.readdirSync(path.join(__dirname, '..', 'routes')).filter(f => f.endsWith('.js') && !/HOW_TO|_check/i.test(f))) {
    assert.doesNotThrow(() => require(path.join(__dirname, '..', 'routes', f)), f)
  }
})
