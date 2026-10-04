// utils/notifyEngine.js — decides whether, when and how to interrupt someone. Pure functions, unit-tested.
//
// Every notification always lands in the in-app inbox (the bell). What this decides is the *interruption*:
// a push to the phone / browser, and for security events an email too.
//
//  • Priority by kind — security (critical) > reminders, next-episode-ready (high) > new videos,
//    announcements (normal) > weekly picks, digests (low).
//  • Learned interest — per person and kind, a Beta posterior of "opened / sent" (decayed weekly, so it follows
//    changing habits). Kinds someone keeps ignoring stop buzzing their phone (they stay in the bell); new kinds
//    start from a sensible prior instead of zero data.
//  • Fatigue — a daily cap (their setting, default 4), and at least 20 minutes between ordinary pushes; anything
//    held back is merged into a single "3 updates" push when it goes out.
//  • Quiet hours in the person's own time zone (DST-correct), default 22:00–08:00; critical alerts ignore them.
//  • Timing — low-priority news waits for the hour this person is usually on Streamix (a decayed histogram of
//    their activity), if that's within the next 18 hours.
//  • Collapsing — several new episodes of one show become "3 new episodes: Show", not three buzzes.

const KINDS = {
  security:     { priority: 'critical', prior: [9, 1] },
  reminder:     { priority: 'high',     prior: [4, 4] },
  episode:      { priority: 'high',     prior: [3, 5] },
  library:      { priority: 'normal',   prior: [2, 6] },
  announcement: { priority: 'normal',   prior: [1.5, 8.5] },
  weekly:       { priority: 'low',      prior: [1.5, 8.5] },
  digest:       { priority: 'low',      prior: [1.5, 8.5] },
}
const PRI = { low: 0, normal: 1, high: 2, critical: 3 }
const HOUR = 3600_000, DAY = 24 * HOUR
const GAP = 20 * 60_000           // minimum spacing between ordinary pushes
const IGNORE_AFTER = 8            // pushes of a kind before "never opened" can mute it
const IGNORE_RATE = 0.08          // …and the open-rate below which it does (≈10 ignored in a row)

const DEFAULT_PREFS = {
  push:  { episode: true, reminder: true, library: true, weekly: true, announcement: true },
  email: { security: true, digest: false },
  quiet: { enabled: true, start: 22, end: 8 },
  maxPerDay: 4,
}

const bool = (v, d) => (typeof v === 'boolean' ? v : d)
const hour = (v, d) => (Number.isInteger(v) && v >= 0 && v <= 23 ? v : d)

/** Stored prefs merged over the defaults, clamped */
function prefsOf(stored) {
  const s = stored || {}
  const out = { push: {}, email: {}, quiet: {}, maxPerDay: DEFAULT_PREFS.maxPerDay }
  for (const k of Object.keys(DEFAULT_PREFS.push)) out.push[k] = bool(s.push?.[k], DEFAULT_PREFS.push[k])
  out.email.security = bool(s.email?.security, true)
  out.email.digest = bool(s.email?.digest, false)
  out.quiet.enabled = bool(s.quiet?.enabled, true)
  out.quiet.start = hour(s.quiet?.start, 22)
  out.quiet.end = hour(s.quiet?.end, 8)
  const m = Number(s.maxPerDay)
  out.maxPerDay = Number.isFinite(m) ? Math.max(1, Math.min(12, Math.round(m))) : DEFAULT_PREFS.maxPerDay
  return out
}

/** Accept only real IANA zones */
function validTz(tz) {
  if (!tz || typeof tz !== 'string' || tz.length > 64) return false
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true } catch { return false }
}

const fmtCache = new Map()
/** { h, m } of an instant in a zone */
function localTime(date, tz) {
  const zone = validTz(tz) ? tz : 'UTC'
  let f = fmtCache.get(zone)
  if (!f) { f = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }); fmtCache.set(zone, f) }
  const parts = f.formatToParts(date)
  return { h: Number(parts.find(p => p.type === 'hour').value) % 24, m: Number(parts.find(p => p.type === 'minute').value) }
}

/** Is hour h inside [start, end) (wrapping past midnight)? */
function inQuiet(h, quiet) {
  if (!quiet?.enabled || quiet.start === quiet.end) return false
  return quiet.start < quiet.end ? h >= quiet.start && h < quiet.end : h >= quiet.start || h < quiet.end
}

/** The next instant after `from` when the local clock reads hh:00 (handles DST shifts) */
function nextLocalHour(from, tz, hh) {
  const { h, m } = localTime(from, tz)
  let delta = ((hh - h + 24) % 24) * HOUR - m * 60_000
  if (delta <= 0) delta += DAY
  let t = new Date(from.getTime() + delta)
  for (let i = 0; i < 2; i++) {               // a DST change in between moves the wall clock by an hour
    const lh = localTime(t, tz).h
    if (lh === hh) break
    t = new Date(t.getTime() + (((hh - lh + 24) % 24) <= 12 ? HOUR : -HOUR))
  }
  return t
}

/** Beta(α, β) draw (Marsaglia–Tsang gammas) for exploration */
function gamma(k, rand) {
  if (k < 1) return gamma(k + 1, rand) * Math.pow(rand(), 1 / k)
  const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d)
  for (;;) {
    let x, v
    do { const u1 = rand(), u2 = rand(); x = Math.sqrt(-2 * Math.log(u1 || 1e-12)) * Math.cos(2 * Math.PI * u2); v = 1 + c * x } while (v <= 0)
    v = v * v * v
    const u = rand()
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v
  }
}
const betaSample = (a, b, rand = Math.random) => { const x = gamma(a, rand); return x / (x + gamma(b, rand)) }

/** Chance this person opens a push of this kind: posterior mean, or a Thompson draw when rand is given */
function openRate(stats, kind, rand) {
  const s = stats?.[kind] || {}
  const [a0, b0] = (KINDS[kind] || KINDS.announcement).prior
  const sent = Math.max(0, s.sent || 0), opened = Math.max(0, Math.min(sent, s.opened || 0))
  const a = a0 + opened, b = b0 + sent - opened
  return rand ? betaSample(a, b, rand) : a / (a + b)
}

/** Weekly decay of learned numbers (recent behaviour counts more) */
function decayStats(stats, f = 0.9) {
  const out = {}
  for (const [k, v] of Object.entries(stats || {})) {
    const sent = (v.sent || 0) * f, opened = (v.opened || 0) * f
    if (sent >= 0.05) out[k] = { sent: +sent.toFixed(3), opened: +opened.toFixed(3) }
  }
  return out
}
function decayHours(hours, f = 0.85) {
  const out = {}
  for (const [h, w] of Object.entries(hours || {})) if (w * f >= 0.05) out[h] = +(w * f).toFixed(3)
  return out
}

/**
 * The hour this person is most often around, as the next such instant after `from` — or null when we don't
 * know them well enough yet (or their usual hour is quiet hours).
 */
function bestTime(hours, from, tz, quiet) {
  const w = Array.from({ length: 24 }, (_, h) => Number(hours?.[h] || 0))
  const total = w.reduce((a, b) => a + b, 0)
  if (total < 6) return null
  // smooth over neighbours so one odd session doesn't decide
  const s = w.map((_, h) => 0.25 * w[(h + 23) % 24] + 0.5 * w[h] + 0.25 * w[(h + 1) % 24])
  const now = localTime(from, tz).h
  if (!inQuiet(now, quiet) && s[now] >= 0.7 * Math.max(...s)) return from          // they're usually on now
  let best = -1, bestW = 0
  for (let i = 1; i <= 23; i++) {
    const h = (now + i) % 24
    if (inQuiet(h, quiet)) continue
    if (s[h] > bestW) { bestW = s[h]; best = h }
  }
  return best < 0 ? null : nextLocalHour(from, tz, best)
}

/**
 * Should this notification interrupt this person, and when?
 * ctx: { kind, priority?, now: Date, tz, prefs (raw or merged), stats, hours, recent: Date[] (pushes sent or
 *        scheduled in the last ~day), rand? }
 * → { push: boolean, at?: Date, reason }
 */
function decide(ctx) {
  const now = ctx.now || new Date()
  const kind = KINDS[ctx.kind] ? ctx.kind : 'announcement'
  const pri = PRI[ctx.priority || KINDS[kind].priority]
  const prefs = ctx.prefs?.push && ctx.prefs?.quiet ? ctx.prefs : prefsOf(ctx.prefs)

  if (pri === PRI.critical) return { push: true, at: now, reason: 'critical' }
  if (prefs.push[kind] === false) return { push: false, reason: 'turned off' }

  // Learned: a kind they never open stops buzzing them (still in the bell). High priority is exempt.
  const st = ctx.stats?.[kind]
  if (pri < PRI.high && (st?.sent || 0) >= IGNORE_AFTER && openRate(ctx.stats, kind) < IGNORE_RATE) {
    return { push: false, reason: 'usually ignored' }
  }

  const recent = (ctx.recent || []).map(d => new Date(d).getTime()).filter(t => now - t < DAY && t - now < DAY).sort((a, b) => a - b)
  const inLastDay = recent.filter(t => t <= now.getTime())
  let at = now.getTime()

  // Daily cap: ordinary news waits for tomorrow's digest-in-the-bell; high priority may use one extra slot
  const cap = prefs.maxPerDay + (pri >= PRI.high ? 1 : 0)
  if (recent.length >= cap) {
    if (pri < PRI.high) return { push: false, reason: 'daily limit' }
    at = Math.max(at, recent[recent.length - cap] + DAY)
  }
  // Spacing between ordinary pushes. One already waiting to go out → ride along with it (they're sent as a
  // single "2 updates" push); one that just went out → wait until GAP has passed.
  if (pri < PRI.high) {
    const waiting = recent.find(t => t > now.getTime() && t - at < 6 * HOUR)
    const lastSent = inLastDay.length ? inLastDay[inLastDay.length - 1] : null
    if (waiting) at = Math.max(at, waiting)
    else if (lastSent && at - lastSent < GAP) at = lastSent + GAP
  }

  // Quiet hours (their own clock)
  let when = new Date(at)
  if (inQuiet(localTime(when, ctx.tz).h, prefs.quiet)) {
    when = nextLocalHour(when, ctx.tz, prefs.quiet.end)
    when = new Date(when.getTime() + Math.floor((ctx.rand || Math.random)() * 20 * 60_000)) // don't wake every phone at 08:00:00
  }
  // Timing: low priority goes out when they're usually around
  if (pri === PRI.low) {
    const best = bestTime(ctx.hours, when, ctx.tz, prefs.quiet)
    if (best && best.getTime() - when.getTime() < 18 * HOUR) when = best
  }
  return { push: true, at: when, reason: when.getTime() > now.getTime() + 60_000 ? 'scheduled' : 'now' }
}

/** Title for a collapsed group ("3 new episodes: The Bear") */
function collapsedTitle(kind, title, count) {
  if (count <= 1) return title
  if (kind === 'episode') return title.replace(/^New episode:\s*/i, `${count} new episodes: `).replace(/^Your next episode is ready:\s*/i, `${count} new episodes: `)
  if (kind === 'library') return /^New on Streamix/i.test(title) ? `${count} new videos on Streamix` : `${title} (+${count - 1} more)`
  return `${title} (+${count - 1} more)`
}

/** One push standing in for several held-back ones */
function digestOf(items) {
  if (items.length === 1) return items[0]
  const titles = items.map(i => i.title)
  return {
    title: `${items.length} updates from Streamix`,
    body: titles.slice(0, 3).join(' · ') + (titles.length > 3 ? ` · +${titles.length - 3} more` : ''),
    url: '/?inbox=1', tag: 'digest',
  }
}

/** Retry schedule for failed deliveries: 30 s, 2 min, 8 min, 30 min (±20%) */
function backoff(attempt, rand = Math.random) {
  const base = Math.min(30 * 60_000, 30_000 * 4 ** Math.max(0, attempt - 1))
  return Math.round(base * (0.8 + 0.4 * rand()))
}

module.exports = {
  KINDS, PRI, DEFAULT_PREFS, prefsOf, validTz, localTime, inQuiet, nextLocalHour, openRate, decayStats, decayHours,
  bestTime, decide, collapsedTitle, digestOf, backoff, betaSample,
}
