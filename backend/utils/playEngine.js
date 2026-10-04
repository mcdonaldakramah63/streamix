// utils/playEngine.js — "Play something": choose one thing to start right now. Pure functions, unit-tested.
//
// Candidates come from different "arms": resume (half-watched), next_episode (finished one, next is out),
// new_episode (a show you follow just aired), pick (your top recommendations), library (new on this server),
// classic (acclaimed fallback when there's little history).
// Utility = arm value × freshness + quality + how well its length fits the time you probably have
//         + your habits at this hour (series vs film) — then a learned per-arm multiplier
//           (Thompson sampling on how often you actually watch what each arm suggests).
// The pick is drawn from the best few with a softmax, so pressing again gives a different good answer.

const { betaSample } = require('./discoveryEngine')
const DAY = 86400000

/** Roughly how many minutes someone has at this hour/day (dow 0 = Sunday) */
function timeBudget(hour, dow) {
  const weekend = dow === 0 || dow === 6
  const friSat = dow === 5 || dow === 6
  if (hour >= 23 || hour < 5) return 50                       // late night: an episode
  if (hour < 12) return weekend ? 110 : 45                     // morning
  if (hour < 18) return weekend ? 150 : 60                     // afternoon
  return friSat ? 180 : weekend ? 150 : 130                    // evening
}

const ARM_VALUE = { resume: 2.3, next_episode: 2.1, new_episode: 1.9, pick: 1.25, library: 1.05, classic: 0.7 }
const HALF_LIFE = { resume: 6, next_episode: 10, new_episode: 4, pick: 30, library: 10, classic: 365 }

/**
 * c: { key, arm, type, runtime (min), minutesLeft?, relevance (0..1), quality (0..10), ageDays, progress? }
 * ctx: { hour, dow, budget, hourHabit?: { movie, tv } }
 */
function utility(c, ctx) {
  const base = ARM_VALUE[c.arm] ?? 0.8
  const fresh = Math.max(0.25, Math.pow(0.5, Math.max(0, c.ageDays ?? 0) / (HALF_LIFE[c.arm] || 14)))
  let u = base * fresh
  u += 0.9 * ((c.relevance ?? 0.5) - 0.5)
  u += 0.25 * Math.max(-1, Math.min(1, ((c.quality ?? 6.5) - 6.5) / 1.5))
  // Length: what's left to watch must fit the time you probably have
  const minutes = c.minutesLeft ?? c.runtime
  if (minutes) {
    const over = minutes - ctx.budget
    u += over <= 0 ? 0.35 : -Math.min(1.3, over / 50)
  }
  // Habit: what this profile usually watches at this hour
  const h = ctx.hourHabit
  if (h && h.movie + h.tv >= 3) u += 0.4 * ((c.type === 'movie' ? h.movie : h.tv) / (h.movie + h.tv) - 0.5)
  // Barely started long ago = probably abandoned
  if (c.arm === 'resume' && (c.progress ?? 0) < 8 && (c.ageDays ?? 0) > 10) u -= 0.9
  return u
}

/** Learned multiplier per arm: Thompson draw around the arm's acceptance rate vs a 35% baseline */
function armBoost(stats = {}, arm, rand = Math.random) {
  const s = stats[arm] || {}
  const acc = s.accepted || 0, shown = Math.max(acc, s.shown || 0)
  const draw = betaSample(acc + 1.4, shown - acc + 2.6, rand) // prior ≈ 35%
  return 0.7 + draw * 0.85 // 35% ≈ 1.0
}

/** Softmax draw among the best `topN` (temperature t; lower = greedier) */
function choose(scored, { t = 0.35, topN = 8, rand = Math.random } = {}) {
  const top = [...scored].sort((a, b) => b.u - a.u).slice(0, topN)
  if (!top.length) return null
  const m = top[0].u
  const w = top.map(c => Math.exp((c.u - m) / t))
  let r = rand() * w.reduce((a, b) => a + b, 0)
  for (let i = 0; i < top.length; i++) { r -= w[i]; if (r <= 0) return top[i] }
  return top[top.length - 1]
}

/** Score, apply learned arm boosts, drop skipped, pick one + a few alternatives */
function decide(cands, ctx, { stats = {}, skip = [], skippedArms = {}, rand = Math.random } = {}) {
  const skipSet = new Set(skip)
  const boosts = {}
  const scored = cands.filter(c => !skipSet.has(c.key)).map(c => {
    boosts[c.arm] ??= armBoost(stats, c.arm, rand)
    // Each skip of this kind in the current session: "not that kind right now"
    return { ...c, u: utility(c, ctx) * boosts[c.arm] - 0.7 * (ARM_VALUE[c.arm] ?? 1) * (skippedArms[c.arm] || 0) }
  })
  const pick = choose(scored, { rand })
  if (!pick) return null
  const alternatives = scored.filter(c => c.key !== pick.key).sort((a, b) => b.u - a.u).slice(0, 3)
  return { pick, alternatives }
}

/** Short reason shown with the pick */
function reasonFor(c, ctx) {
  const mins = c.minutesLeft ?? c.runtime
  const fits = mins && mins <= ctx.budget ? (ctx.hour >= 23 || ctx.hour < 5 ? ' — a good fit for tonight' : '') : ''
  switch (c.arm) {
    case 'resume': return `Pick up where you left off${mins ? ` — ${Math.max(1, Math.round(mins))} min left` : ''}`
    case 'next_episode': return `Next up: S${c.season} · E${c.episode}`
    case 'new_episode': return `New episode: S${c.season} · E${c.episode}`
    case 'library': return `New on Streamix${fits}`
    case 'pick': return (c.why || 'Top pick for you') + fits
    default: return `${c.runtime ? `${c.runtime} min · ` : ''}Loved by viewers${fits}`
  }
}

/** Fold an outcome into per-arm stats (decaying old evidence, 30-day half-life) */
function updateStats(stats = {}, arm, field, now = Date.now(), lastAt = null) {
  const f = lastAt ? Math.pow(0.5, Math.max(0, now - new Date(lastAt).getTime()) / (30 * DAY)) : 1
  const out = {}
  for (const [k, v] of Object.entries(stats)) out[k] = { shown: (v.shown || 0) * f, accepted: (v.accepted || 0) * f }
  out[arm] = out[arm] || { shown: 0, accepted: 0 }
  out[arm][field] += 1
  return out
}

module.exports = { timeBudget, utility, armBoost, choose, decide, reasonFor, updateStats, ARM_VALUE }
