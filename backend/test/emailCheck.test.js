const test = require('node:test')
const assert = require('node:assert')
const e = require('../utils/emailCheck')

// A fake DNS: domain → { mx, a, aaaa, err }
function resolver(table) {
  const fail = (code) => Promise.reject(Object.assign(new Error(code), { code }))
  const look = (d, k) => {
    const r = table[d]
    if (!r) return fail('ENOTFOUND')
    if (r.err) return fail(r.err)
    return r[k] ? Promise.resolve(r[k]) : fail('ENODATA')
  }
  return { resolveMx: d => look(d, 'mx'), resolve4: d => look(d, 'a'), resolve6: d => look(d, 'aaaa') }
}

test('shape: obvious mistakes are explained', () => {
  assert.strictEqual(e.shapeProblem('jane@example.com'), null)
  assert.strictEqual(e.shapeProblem('jane.doe+films@sub.example.co.uk'), null)
  assert.strictEqual(e.shapeProblem('jane@example').reason, 'syntax')
  assert.strictEqual(e.shapeProblem('jane@@example.com').reason, 'syntax')
  assert.strictEqual(e.shapeProblem('jane..doe@example.com').reason, 'syntax')
  assert.strictEqual(e.shapeProblem('jane@-example.com').reason, 'syntax')
  assert.strictEqual(e.shapeProblem('jane@example.c0m').reason, 'syntax')
  assert.strictEqual(e.shapeProblem('a'.repeat(65) + '@example.com').reason, 'syntax')
  assert.strictEqual(e.shapeProblem('noreply@example.com').reason, 'noreply')
  assert.strictEqual(e.shapeProblem('no-reply+x@example.com').reason, 'noreply')
})

test('disposable providers, their subdomains and lookalike names are caught', () => {
  assert.ok(e.isDisposable('mailinator.com'))
  assert.ok(e.isDisposable('inbox.yopmail.com'))
  assert.ok(e.isDisposable('my-tempmail-box.xyz'))
  assert.ok(e.isDisposable('10minutemail.net'))
  assert.ok(!e.isDisposable('gmail.com'))
  assert.ok(!e.isDisposable('company.co.ke'))
})

test('typos of big providers get a suggestion; real domains do not', () => {
  assert.strictEqual(e.suggestDomain('gmial.com'), 'gmail.com')
  assert.strictEqual(e.suggestDomain('gmail.con'), 'gmail.com')
  assert.strictEqual(e.suggestDomain('hotmial.com'), 'hotmail.com')
  assert.strictEqual(e.suggestDomain('yahooo.com'), 'yahoo.com')
  assert.strictEqual(e.suggestDomain('outlok.com'), 'outlook.com')
  assert.strictEqual(e.suggestDomain('gmail.co'), 'gmail.com')
  assert.strictEqual(e.suggestDomain('gmail.com'), null)
  assert.strictEqual(e.suggestDomain('mail.com'), null)     // a real provider, not a typo of gmail
  assert.strictEqual(e.suggestDomain('safaricom.co.ke'), null)
  assert.strictEqual(e.suggestDomain('example.org'), null)
})

test('one inbox, one canonical address', () => {
  assert.strictEqual(e.canonical('J.O.E+movies@Gmail.com'), 'joe@gmail.com')
  assert.strictEqual(e.canonical('joe@googlemail.com'), 'joe@gmail.com')
  assert.strictEqual(e.canonical('joe+x@outlook.com'), 'joe@outlook.com')
  assert.strictEqual(e.canonical('j.o.e+x@example.com'), 'j.o.e+x@example.com') // unknown providers: as typed
})

test('DNS: MX, implicit MX (A record), null MX, missing domain, and DNS trouble', async () => {
  e._cache.clear()
  const r = resolver({
    'mx.test': { mx: [{ exchange: 'mail.mx.test', priority: 10 }] },
    'aonly.test': { a: ['192.0.2.1'] },
    'nullmx.test': { mx: [{ exchange: '', priority: 0 }] },
    'broken.test': { err: 'ETIMEOUT' },
  })
  assert.strictEqual(await e.mailStatus('mx.test', r), 'ok')
  assert.strictEqual(await e.mailStatus('aonly.test', r), 'ok')
  assert.strictEqual(await e.mailStatus('nullmx.test', r), 'none')
  assert.strictEqual(await e.mailStatus('nowhere.test', r), 'none')
  assert.strictEqual(await e.mailStatus('broken.test', r), 'unknown') // don't block on DNS hiccups
})

test('full check: typo needs confirming, dead domains are refused, DNS trouble is let through', async () => {
  e._cache.clear()
  const r = resolver({
    'gmail.com': { mx: [{ exchange: 'gmail-smtp-in.l.google.com' }] },
    'gmial.com': { mx: [{ exchange: 'squatter.example' }] },
    'flaky.test': { err: 'ESERVFAIL' },
  })
  assert.deepStrictEqual((await e.check('ann@gmail.com', { resolver: r })).ok, true)
  const typo = await e.check('ann@gmial.com', { resolver: r })
  assert.strictEqual(typo.ok, false)
  assert.strictEqual(typo.reason, 'typo')
  assert.strictEqual(typo.suggestion, 'ann@gmail.com')
  assert.strictEqual((await e.check('ann@gmial.com', { resolver: r, confirmTypo: true })).ok, true)
  const dead = await e.check('ann@no-such-domain.test', { resolver: r })
  assert.strictEqual(dead.reason, 'no_mail')
  assert.strictEqual((await e.check('ann@mailinator.com', { resolver: r })).reason, 'disposable')
  assert.strictEqual((await e.check('ann@flaky.test', { resolver: r })).ok, true)
})

test('allow-list in .env limits sign-ups to approved domains', async () => {
  process.env.ALLOWED_EMAIL_DOMAINS = 'family.example'
  try {
    assert.strictEqual((await e.check('kid@family.example')).ok, true)
    assert.strictEqual((await e.check('kid@gmail.com')).reason, 'not_allowed')
  } finally { delete process.env.ALLOWED_EMAIL_DOMAINS }
})

test('masking shows enough to recognise the address', () => {
  assert.strictEqual(e.mask('jonathan@gmail.com'), 'jo•••••@gmail.com')
  assert.strictEqual(e.mask('al@x.io'), 'a••@x.io')
})
