// Returns express-validator errors as a 400 — without echoing submitted values (they can be passwords)
const { validationResult } = require('express-validator')

module.exports = (req, res, next) => {
  const errors = validationResult(req)
  if (errors.isEmpty()) return next()
  const list = errors.array().map(e => ({ field: e.path, msg: e.msg }))
  res.status(400).json({ message: list[0].msg, errors: list })
}
