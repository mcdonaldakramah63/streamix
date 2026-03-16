const { log, ACTIONS } = require('../utils/auditLogger')

// Patterns that suggest injection / scanning / hacking attempts
const SUSPICIOUS_PATTERNS = [
  /<script/i,
  /javascript:/i,
  /on\w+\s*=/i,             // onclick=, onerror=, etc.
  /\$where/i,               // MongoDB JS injection
  /\$ne|\$gt|\$lt|\$in/i,   // NoSQL operators (should be caught by sanitizer too)
  /union.*select/i,         // SQL injection
  /exec\s*\(/i,
  /eval\s*\(/i,
  /base64_decode/i,
  /\.\.\//,                 // Path traversal
  /etc\/passwd/i,
  /cmd\.exe/i,
  /powershell/i,
  /wget\s+http/i,
  /curl\s+http/i,
]

const suspiciousDetector = (req, res, next) => {
  const toCheck = [
    JSON.stringify(req.body   || {}),
    JSON.stringify(req.query  || {}),
    JSON.stringify(req.params || {}),
  ].join(' ')

  const hit = SUSPICIOUS_PATTERNS.find(p => p.test(toCheck))
  if (hit) {
    log(ACTIONS.SUSPICIOUS_REQUEST, req, {
      severity: 'critical',
      details: { pattern: hit.toString(), path: req.path, method: req.method }
    })
    console.warn(`[SECURITY] Suspicious request from ${req.ip} — pattern: ${hit}`)
    // Don't reveal why it was blocked
    return res.status(400).json({ message: 'Invalid request' })
  }
  next()
}

module.exports = suspiciousDetector
