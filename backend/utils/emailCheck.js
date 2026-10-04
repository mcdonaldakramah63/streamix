// utils/emailCheck.js — is this an address a real person can receive mail at?
//
// Checks run cheapest-first and each one explains itself, so the sign-up form can say exactly what's wrong:
//  1. Shape: RFC 5321/5322 limits (64-char local part, 253-char domain, real labels, alphabetic TLD).
//  2. No-reply style mailboxes nobody reads.
//  3. Disposable / throwaway providers: a curated list (+ subdomains) and name patterns, extendable with
//     DISPOSABLE_DOMAINS in .env. ALLOWED_EMAIL_DOMAINS overrides everything for a household whitelist.
//  4. Typos of big providers ("gmial.com", "hotmial.com", "gmail.con") → "Did you mean …?" by edit distance.
//     Typo domains are often registered by squatters with working MX records, so they're stopped until
//     the person confirms.
//  5. DNS: the domain must accept mail — MX records, or an A/AAAA record (RFC 5321 implicit MX), and not
//     a "null MX" (RFC 7505). Timeouts / server failures don't block anyone (the emailed code is the proof).
//  6. A canonical form (Gmail ignores dots and +tags…) so one inbox can't open many accounts.
//
// Passing these says the address *can* exist. Ownership is proven separately with an emailed code.
const dnsPromises = require('dns').promises
const { editDistance } = require('./searchEngine')

// ── Disposable providers ────────────────────────────────────────────────────
const DISPOSABLE = new Set(`
mailinator.com mailinator.net mailinator.org mailinator2.com mailinater.com notmailinator.com reallymymail.com
guerrillamail.com guerrillamail.net guerrillamail.org guerrillamail.biz guerrillamail.de guerrillamail.info
guerrillamailblock.com sharklasers.com grr.la pokemail.net spam4.me
10minutemail.com 10minutemail.net 10minutemail.co.uk 10minutemail.org 10mail.org 20minutemail.com minuteinbox.com
temp-mail.org temp-mail.io tempmail.com tempmail.net tempmailo.com tempmail.dev tempmail.plus tempail.com tempr.email
tempinbox.com tmpmail.org tmpmail.net tmpbox.net tmpeml.com tmail.ws mytemp.email mail-temp.com mailtemp.info emltmp.com
throwawaymail.com throwam.com yopmail.com yopmail.fr yopmail.net cool.fr.nf jetable.fr.nf nospam.ze.tc nomail.xl.cx
mega.zik.dj speed.1s.fr courriel.fr.nf moncourrier.fr.nf monemail.fr.nf monmail.fr.nf jetable.org
trashmail.com trashmail.de trashmail.net trashmail.me trashmail.at trashmail.ws trash-mail.com trash-mail.at
getnada.com nada.email dispostable.com maildrop.cc mailnesia.com mintemail.com mohmal.com mailcatch.com
fakeinbox.com fakemail.net fakemailgenerator.com emailondeck.com moakt.com burnermail.io spamgourmet.com
mailpoof.com inboxkitten.com harakirimail.com discard.email discardmail.com discardmail.de spambog.com
luxusmail.org emailfake.com email-fake.com generator.email crazymailing.com linshiyouxiang.net
1secmail.com 1secmail.org 1secmail.net esiix.com wwjmp.com xojxe.com yoggm.com kzccv.com qiott.com dcctb.com
rteet.com vjuum.com laafd.com txcct.com dropmail.me emlhub.com emlpro.com spymail.one mailsac.com inboxbear.com
mvrht.net byom.de wegwerfmail.de wegwerfmail.net wegwerfmail.org wegwerfadresse.de einrot.com trbvm.com cuvox.de
armyspy.com dayrep.com fleckens.hu gustr.com jourrapide.com rhyta.com superrito.com teleworm.us
mailforspam.com spamfree24.org sogetthis.com mailmetrash.com thankyou2010.com kurzepost.de objectmail.com
proxymail.eu rcpt.at spamex.com getairmail.com mailexpire.com incognitomail.org mailnull.com spamhole.com
filzmail.com binkmail.com bobmail.info chammy.info devnullmail.com letthemeatspam.com reconmail.com
safetymail.info sendspamhere.com spamherelots.com spamhereplease.com spamthisplease.com streetwisemail.com
suremail.info thisisnotmyrealemail.com tradermail.info veryrealemail.com zippymail.info mailtothis.com
anonbox.net anonymbox.com boximail.com correotemporal.org deadaddress.com despam.it dodgeit.com
e4ward.com emailtemporanea.com emailtemporanea.net ephemail.net fastacura.com haltospam.com
hidemail.de ipoo.org irish2me.com jetable.com kasmail.com klzlk.com lroid.com mailblocks.com
mailmoat.com mailshell.com mailzilla.com nobulk.com noclickemail.com nospamfor.us nowmymail.com
pookmail.com quickinbox.com rmqkr.net shieldemail.com shortmail.net slopsbox.com spamcero.com
spamday.com spamfree.eu spaml.de tempemail.net tempomail.fr temporarioemail.com.br tempymail.com
trashymail.com wh4f.org whyspam.me xagloo.com yuurok.com zoemail.org mailhazard.com mailhz.me
`.split(/\s+/).filter(Boolean))

// Names that only throwaway services use
const DISPOSABLE_PATTERN = /(temp-?mail|throw-?away|disposable|trash-?mail|fake-?mail|\d+-?minute|minute-?(?:mail|inbox)|guerrilla|mailinator|yopmail|burner-?mail|spam-?(?:box|mail|gourmet|bog|hole))/

const fromEnv = (name) => new Set(String(process.env[name] || '').toLowerCase().split(/[\s,]+/).filter(Boolean))

/** Domain or any parent domain on the list ("x.yopmail.com" counts) */
function isDisposable(domain) {
  const extra = fromEnv('DISPOSABLE_DOMAINS')
  const parts = domain.split('.')
  for (let i = 0; i < parts.length - 1; i++) {
    const d = parts.slice(i).join('.')
    if (DISPOSABLE.has(d) || extra.has(d)) return true
  }
  return DISPOSABLE_PATTERN.test(domain)
}

// ── Typos of big providers ──────────────────────────────────────────────────
// Most used first: ties go to the more likely one
const POPULAR = `gmail.com yahoo.com hotmail.com outlook.com icloud.com live.com aol.com msn.com googlemail.com
ymail.com me.com mac.com protonmail.com proton.me gmx.com gmx.de gmx.net yandex.com yandex.ru mail.ru mail.com zoho.com
yahoo.co.uk hotmail.co.uk live.co.uk outlook.fr hotmail.fr yahoo.fr orange.fr free.fr laposte.net libero.it
web.de t-online.de comcast.net verizon.net att.net btinternet.com rocketmail.com qq.com 163.com fastmail.com
`.split(/\s+/).filter(Boolean)
const POPULAR_SET = new Set(POPULAR)
const TLD_FIX = { con: 'com', cmo: 'com', ocm: 'com', vom: 'com', xom: 'com', cpm: 'com', comm: 'com', coom: 'com', om: 'com', cm: 'com', nte: 'net', ner: 'net', ogr: 'org', orh: 'org' }

/** "gmial.com" → "gmail.com"; null when the domain looks intended */
function suggestDomain(domain) {
  if (POPULAR_SET.has(domain)) return null
  const labels = domain.split('.')
  const tld = labels[labels.length - 1]
  // Obvious TLD slips ("gmail.con", "example.cmo")
  if (TLD_FIX[tld]) {
    const fixed = [...labels.slice(0, -1), TLD_FIX[tld]].join('.')
    return fixed
  }
  let best = null, bestD = 3
  for (const p of POPULAR) {
    const d = editDistance(domain, p, 2)
    if (d < bestD) { best = p; bestD = d }
  }
  if (!best) return null
  // One slip anywhere, or two in a long name ("hotmial.co" → "hotmail.com" is 2)
  if (bestD === 1 || (bestD === 2 && domain.length >= 9)) return best
  // Same provider, wrong/missing TLD ("gmail.co", "outlook.cm")
  const sld = labels.slice(0, -1).join('.')
  const sameName = POPULAR.find(p => p.split('.')[0] === sld && p !== domain)
  return sameName && ['co', 'cm', 'om', 'c', 'cim', 'comm'].includes(tld) ? sameName : null
}

// ── Canonical form ──────────────────────────────────────────────────────────
// Providers that ignore "+anything" (and Gmail also ignores dots)
const PLUS_TAGS = new Set(['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'icloud.com', 'me.com',
  'mac.com', 'protonmail.com', 'proton.me', 'pm.me', 'fastmail.com', 'yandex.com', 'yandex.ru', 'zoho.com'])

function canonical(email) {
  const [rawLocal, rawDomain] = String(email).trim().toLowerCase().split('@')
  if (!rawLocal || !rawDomain) return String(email).trim().toLowerCase()
  let local = rawLocal, domain = rawDomain
  if (domain === 'googlemail.com') domain = 'gmail.com'
  if (PLUS_TAGS.has(rawDomain)) local = local.split('+')[0]
  if (domain === 'gmail.com') local = local.replace(/\./g, '')
  return `${local}@${domain}`
}

// ── Shape ───────────────────────────────────────────────────────────────────
const LOCAL_RE = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i
const LABEL_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/i
const NOREPLY_RE = /^(no-?reply|do-?not-?reply|donotreply|mailer-?daemon|bounces?)([+._-].*)?$/i

/** → null when fine, or a { reason, message } */
function shapeProblem(email) {
  const s = String(email || '').trim()
  if (!s) return { reason: 'empty', message: 'Enter your email address' }
  if (s.length > 254) return { reason: 'syntax', message: 'That email address is too long' }
  const at = s.lastIndexOf('@')
  if (at < 1 || at === s.length - 1 || s.indexOf('@') !== at) return { reason: 'syntax', message: 'That doesn’t look like an email address' }
  const local = s.slice(0, at), domain = s.slice(at + 1).toLowerCase()
  if (local.length > 64 || !LOCAL_RE.test(local)) return { reason: 'syntax', message: 'Check the part before the @ — it has characters email addresses can’t use' }
  const labels = domain.split('.')
  if (domain.length > 253 || labels.length < 2 || !labels.every(l => LABEL_RE.test(l))) {
    return { reason: 'syntax', message: 'Check the part after the @ — it should look like example.com' }
  }
  if (!/^[a-z]{2,24}$/.test(labels[labels.length - 1]) && !/^xn--[a-z0-9-]{1,59}$/.test(labels[labels.length - 1])) {
    return { reason: 'syntax', message: 'That email address ends in something that isn’t a real domain' }
  }
  if (NOREPLY_RE.test(local)) return { reason: 'noreply', message: 'Use an address you can read — no-reply addresses can’t receive our code' }
  return null
}

// ── DNS ─────────────────────────────────────────────────────────────────────
const dnsCache = new Map() // domain → { at, status }
const DNS_TTL = 6 * 3600 * 1000
const NO_DOMAIN = new Set(['ENOTFOUND', 'ENODATA', 'ENONAME', 'NXDOMAIN', 'ENOTIMP'])

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })), ms).unref?.())])

/**
 * 'ok' (accepts mail) | 'none' (definitely can't) | 'unknown' (DNS trouble — don't block on it)
 * resolver is injectable for tests.
 */
async function mailStatus(domain, resolver = dnsPromises, timeoutMs = 4000) {
  const hit = dnsCache.get(domain)
  if (hit && Date.now() - hit.at < DNS_TTL) return hit.status
  const remember = (status) => { if (status !== 'unknown') { dnsCache.set(domain, { at: Date.now(), status }); if (dnsCache.size > 5000) dnsCache.delete(dnsCache.keys().next().value) } return status }
  try {
    const mx = await withTimeout(resolver.resolveMx(domain), timeoutMs)
    const real = (mx || []).filter(r => r.exchange && r.exchange !== '.')
    if (real.length) return remember('ok')
    if ((mx || []).length) return remember('none') // RFC 7505 null MX: "this domain takes no mail"
  } catch (e) {
    if (!NO_DOMAIN.has(e.code)) return 'unknown'
    if (e.code === 'ENOTFOUND' || e.code === 'NXDOMAIN') return remember('none') // the domain doesn't exist
  }
  // No MX records: mail goes to the domain's own address, if it has one (RFC 5321 §5.1)
  for (const fn of ['resolve4', 'resolve6']) {
    try {
      const a = await withTimeout(resolver[fn](domain), timeoutMs)
      if (a?.length) return remember('ok')
    } catch (e) {
      if (!NO_DOMAIN.has(e.code)) return 'unknown'
    }
  }
  return remember('none')
}

/**
 * Full check. → { ok, email, domain, canonical, reason?, message?, suggestion? }
 * opts.confirmTypo: the person said "no, I really meant gmial.com"
 */
async function check(email, opts = {}) {
  const shape = shapeProblem(email)
  if (shape) return { ok: false, ...shape }
  const clean = String(email).trim()
  const domain = clean.slice(clean.lastIndexOf('@') + 1).toLowerCase()
  const local = clean.slice(0, clean.lastIndexOf('@'))
  const out = { email: clean, domain, canonical: canonical(clean) }

  const allowed = fromEnv('ALLOWED_EMAIL_DOMAINS')
  if (allowed.size) {
    return allowed.has(domain) ? { ok: true, ...out } : { ok: false, ...out, reason: 'not_allowed', message: 'Sign-ups on this server are limited to approved email domains' }
  }
  if (isDisposable(domain)) {
    return { ok: false, ...out, reason: 'disposable', message: 'Temporary / throwaway email addresses can’t be used — please use your regular email' }
  }
  const suggestion = suggestDomain(domain)
  if (suggestion && !opts.confirmTypo) {
    return { ok: false, ...out, reason: 'typo', suggestion: `${local}@${suggestion}`, message: `Did you mean ${local}@${suggestion}?` }
  }
  const status = await mailStatus(domain, opts.resolver)
  if (status === 'none') {
    return { ok: false, ...out, reason: 'no_mail', suggestion: suggestion ? `${local}@${suggestion}` : undefined,
      message: `${domain} can’t receive email — check the address for typos` }
  }
  return { ok: true, ...out, dns: status }
}

/** "jo•••@gmail.com" for showing where a code went */
function mask(email) {
  const [l, d] = String(email).split('@')
  if (!d) return email
  return `${l.slice(0, Math.min(2, Math.max(1, l.length - 2)))}${'•'.repeat(Math.max(2, Math.min(5, l.length - 2)))}@${d}`
}

module.exports = { check, shapeProblem, isDisposable, suggestDomain, canonical, mailStatus, mask, _cache: dnsCache }
