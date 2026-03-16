// Minimal security headers — no CSP that could break the app
const adBlockCSP = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  next()
}
module.exports = adBlockCSP
