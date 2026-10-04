const test = require('node:test')
const assert = require('node:assert')
const p = require('../utils/playEngine')

function rng(seed = 1) { let s = seed; return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648) }

test('time budget follows the clock and the weekend', () => {
  assert.strictEqual(p.timeBudget(1, 3), 50)
  assert.ok(p.timeBudget(20, 5) > p.timeBudget(20, 2))
  assert.ok(p.timeBudget(10, 6) > p.timeBudget(10, 2))
})

test('late at night a half-finished episode beats a 3-hour epic', () => {
  const ctx = { hour: 23, dow: 2, budget: p.timeBudget(23, 2) }
  const resume = { key: 'tv:1', arm: 'resume', type: 'tv', minutesLeft: 25, relevance: 0.6, quality: 7.8, ageDays: 1, progress: 40 }
  const epic = { key: 'movie:2', arm: 'classic', type: 'movie', runtime: 180, relevance: 0.6, quality: 8.4, ageDays: 0 }
  assert.ok(p.utility(resume, ctx) > p.utility(epic, ctx))
})

test('long-abandoned barely-started titles sink', () => {
  const ctx = { hour: 20, dow: 2, budget: 130 }
  const abandoned = { key: 'movie:3', arm: 'resume', type: 'movie', minutesLeft: 110, progress: 3, ageDays: 30, relevance: 0.5, quality: 7 }
  const pick = { key: 'movie:4', arm: 'pick', type: 'movie', runtime: 105, relevance: 0.8, quality: 7.6, ageDays: 0 }
  assert.ok(p.utility(pick, ctx) > p.utility(abandoned, ctx))
})

test('pressing again never repeats a skipped pick and alternatives differ', () => {
  const ctx = { hour: 20, dow: 6, budget: 150 }
  const cands = Array.from({ length: 10 }, (_, i) => ({ key: `movie:${i}`, arm: 'pick', type: 'movie', runtime: 100, relevance: 0.5 + i / 30, quality: 7, ageDays: 0 }))
  const first = p.decide(cands, ctx, { rand: rng(5) })
  const second = p.decide(cands, ctx, { skip: [first.pick.key], rand: rng(6) })
  assert.notStrictEqual(first.pick.key, second.pick.key)
  assert.ok(!first.alternatives.some(a => a.key === first.pick.key))
})

test('an arm the viewer keeps accepting gets boosted', () => {
  const r = rng(9)
  let liked = 0, ignored = 0
  for (let i = 0; i < 300; i++) {
    liked += p.armBoost({ library: { shown: 20, accepted: 15 } }, 'library', r)
    ignored += p.armBoost({ library: { shown: 20, accepted: 1 } }, 'library', r)
  }
  assert.ok(liked / 300 > ignored / 300 + 0.25)
})

test('stats decay and update', () => {
  const now = Date.parse('2026-10-31')
  const s = p.updateStats({ pick: { shown: 10, accepted: 4 } }, 'pick', 'shown', now, '2026-10-01')
  assert.ok(Math.abs(s.pick.shown - 6) < 0.05 && Math.abs(s.pick.accepted - 2) < 0.05)
})

test('skipping a kind twice moves the next pick to another kind', () => {
  const ctx = { hour: 20, dow: 6, budget: 150 }
  const cands = [
    ...Array.from({ length: 5 }, (_, i) => ({ key: `movie:${i}`, arm: 'resume', type: 'movie', minutesLeft: 60, progress: 40, relevance: 0.6, quality: 7, ageDays: 1 })),
    ...Array.from({ length: 5 }, (_, i) => ({ key: `movie:${10 + i}`, arm: 'pick', type: 'movie', runtime: 100, relevance: 0.6, quality: 7, ageDays: 0 })),
  ]
  let resumes = 0
  const r = rng(11)
  for (let i = 0; i < 100; i++) if (p.decide(cands, ctx, { skippedArms: { resume: 2 }, rand: r }).pick.arm === 'resume') resumes++
  assert.ok(resumes < 20, `resume still chosen ${resumes}/100`)
})
