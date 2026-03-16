// In-memory IP blocklist (resets on server restart)
// For production, use Redis instead
const blockedIPs   = new Map() // ip -> { count, blockedAt, reason }
const suspectIPs   = new Map() // ip -> { count, firstSeen }

const MAX_SUSPICIOUS = 3    // block after 3 suspicious requests
const BLOCK_DURATION = 60 * 60 * 1000 // 1 hour

const ipBlocker = (req, res, next) => {
  const ip = req.ip

  // Check if blocked
  const block = blockedIPs.get(ip)
  if (block) {
    const elapsed = Date.now() - block.blockedAt
    if (elapsed < BLOCK_DURATION) {
      const minsLeft = Math.ceil((BLOCK_DURATION - elapsed) / 60000)
      return res.status(403).json({
        message: `Access temporarily blocked. Try again in ${minsLeft} minutes.`
      })
    } else {
      // Block expired
      blockedIPs.delete(ip)
      suspectIPs.delete(ip)
    }
  }
  next()
}

const recordSuspiciousIP = (ip, reason = '') => {
  const entry = suspectIPs.get(ip) || { count: 0, firstSeen: Date.now() }
  entry.count++
  suspectIPs.set(ip, entry)

  if (entry.count >= MAX_SUSPICIOUS) {
    blockedIPs.set(ip, { count: entry.count, blockedAt: Date.now(), reason })
    console.warn(`[SECURITY] IP blocked: ${ip} — reason: ${reason}`)
  }
}

const getBlockedIPs = () => {
  const result = []
  for (const [ip, data] of blockedIPs.entries()) {
    result.push({ ip, ...data, expiresIn: Math.ceil((BLOCK_DURATION - (Date.now() - data.blockedAt)) / 60000) + 'm' })
  }
  return result
}

const unblockIP = (ip) => {
  blockedIPs.delete(ip)
  suspectIPs.delete(ip)
}

module.exports = { ipBlocker, recordSuspiciousIP, getBlockedIPs, unblockIP }
