// utils/settings.js — app-wide settings with a short in-memory cache
const Setting = require('../models/Setting')

/**
 * Usage limits. 0 means unlimited. Everything is unlimited while Streamix is free —
 * admins can tighten these later (Admin → Settings) without code changes.
 */
const DEFAULT_LIMITS = {
  maxProfiles:       5,   // per account (hard cap 10)
  maxStreams:        0,   // videos playing at once per account
  downloadsPerMonth: 0,   // library file downloads per account per month
  partyMaxMembers:   20,  // people in one watch party
}

const cache = new Map() // key → { value, at }
const TTL = 30_000

async function get(key, fallback = null) {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.value ?? fallback
  const doc = await Setting.findOne({ key }).lean().catch(() => null)
  cache.set(key, { value: doc?.value ?? null, at: Date.now() })
  return doc?.value ?? fallback
}

async function set(key, value) {
  await Setting.findOneAndUpdate({ key }, { value }, { upsert: true })
  cache.set(key, { value, at: Date.now() })
  return value
}

async function limits() {
  return { ...DEFAULT_LIMITS, ...((await get('limits')) || {}) }
}

/** Accepts only known keys, as whole numbers in a sane range */
function cleanLimits(input = {}) {
  const out = {}
  const RANGES = { maxProfiles: [1, 10], maxStreams: [0, 20], downloadsPerMonth: [0, 10000], partyMaxMembers: [2, 100] }
  for (const [k, [lo, hi]] of Object.entries(RANGES)) {
    if (input[k] === undefined) continue
    const n = Math.round(Number(input[k]))
    if (Number.isFinite(n)) out[k] = Math.min(hi, Math.max(lo, n))
  }
  return out
}

module.exports = { get, set, limits, cleanLimits, DEFAULT_LIMITS }
