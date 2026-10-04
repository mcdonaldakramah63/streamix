// utils/ai.js — the one place Streamix talks to Claude for recommendations, "Ask Streamix", upcoming and the feed.
// Every caller has a non-AI fallback: with no ANTHROPIC_API_KEY (or on any error) these return null and the
// algorithms carry on alone. Answers are forced into a JSON schema, so the server never has to guess at prose.
const sdk = require('@anthropic-ai/sdk')
const Anthropic = sdk.Anthropic || sdk.default || sdk

// Claude Opus 5.5 at low effort: quick, cheap answers for short ranking/writing jobs. RECS_AI_MODEL overrides it.
const MODEL = process.env.RECS_AI_MODEL || 'claude-opus-5-5'
const enabled = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)

let client = null
const getClient = () => (client ||= new Anthropic({ timeout: 30_000, maxRetries: 1 }))

// Small LRU of recent answers, so the same question (same profile, same inputs) isn't paid for twice
const memo = new Map()
const MEMO_MAX = 300

/**
 * Ask Claude for JSON matching `schema`. Returns the parsed object, or null (no key, refusal, error, timeout).
 * opts: { system, prompt, schema, maxTokens, effort, cacheKey, ttlMs }
 */
async function askJson({ system, prompt, schema, maxTokens = 4000, effort = 'low', cacheKey, ttlMs = 30 * 60 * 1000 }) {
  if (!enabled()) return null
  if (cacheKey) {
    const hit = memo.get(cacheKey)
    if (hit && Date.now() - hit.at < ttlMs) return hit.value
  }
  try {
    const res = await getClient().beta.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      // If a safety classifier declines, Anthropic re-runs the request on its recommended fallback model
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system,
      output_config: { effort, format: { type: 'json_schema', schema } },
      messages: [{ role: 'user', content: prompt }],
    })
    if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') return null
    const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('')
    const value = JSON.parse(text)
    if (cacheKey) {
      memo.set(cacheKey, { at: Date.now(), value })
      if (memo.size > MEMO_MAX) memo.delete(memo.keys().next().value)
    }
    return value
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) console.warn('[ai] rate limited — using the algorithm alone')
    else if (e instanceof Anthropic.AuthenticationError) console.warn('[ai] ANTHROPIC_API_KEY was rejected — using the algorithm alone')
    else if (e instanceof Anthropic.APIError) console.warn(`[ai] API error ${e.status}: ${e.message}`)
    else if (!(e instanceof SyntaxError)) console.warn('[ai] failed:', e.message)
    return null
  }
}

/** Per-user budget for interactive AI calls ("Ask Streamix"), so one account can't run up the bill */
const usage = new Map() // userId → [timestamps]
function allow(userId, perHour = Number(process.env.AI_ASKS_PER_HOUR) || 30) {
  const now = Date.now()
  const list = (usage.get(String(userId)) || []).filter(t => now - t < 3600_000)
  if (list.length >= perHour) return false
  list.push(now)
  usage.set(String(userId), list)
  return true
}

module.exports = { askJson, enabled, allow, MODEL }
